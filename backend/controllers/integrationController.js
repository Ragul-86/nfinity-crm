const crypto = require('crypto');
const https  = require('https');
const Integration    = require('../models/Integration');
const Pipeline       = require('../models/Pipeline');
const PipelineMapping = require('../models/PipelineMapping');
const { logAction }    = require('../utils/auditLogger');
const { encrypt, decrypt, encryptFields, decryptFields, maskSecret } = require('../utils/encryption');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

// ── Inline error helper (no AppError class needed) ───────────────────────────
const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ── Sensitive credential keys per provider (always encrypted at rest) ────────
const SENSITIVE_FIELDS = {
  meta_ads:    ['accessToken', 'refreshToken', 'appSecret'],
  whatsapp:    ['accessToken', 'webhookVerifyToken'],
  google:      ['accessToken', 'refreshToken', 'clientSecret'],
  razorpay:    ['keySecret', 'webhookSecret'],
  stripe:      ['secretKey', 'webhookSecret'],
  paypal:      ['clientSecret', 'webhookSecret'],
  openai:      ['apiKey'],
  claude:      ['apiKey'],
  gemini:      ['apiKey'],
  webhook:     ['webhookSecret', 'authToken'],
  google_sheet:  ['webhookSecret'],
  google_sheets: ['accessToken', 'refreshToken'],
};

// ── Simple HTTPS GET (no external deps) ─────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timed out')) });
  });
}

// ── Simple HTTPS POST (token exchange) ───────────────────────────────────────
function httpPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const options = {
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')) });
    req.write(bodyStr);
    req.end();
  });
}

// ── Encrypt credential fields for a given provider ───────────────────────────
function encryptCreds(provider, raw) {
  if (!raw || !Object.keys(raw).length) return {};
  return encryptFields(raw, SENSITIVE_FIELDS[provider] || []);
}

// ── Decrypt credential fields for a given provider ───────────────────────────
function decryptCreds(provider, stored) {
  if (!stored || !Object.keys(stored).length) return {};
  return decryptFields(stored, SENSITIVE_FIELDS[provider] || []);
}

// ── Mask stored credentials for client response ──────────────────────────────
function maskCreds(provider, stored) {
  if (!stored) return {};
  const sensitiveKeys = new Set(SENSITIVE_FIELDS[provider] || []);
  const out = {};
  for (const [key, val] of Object.entries(stored)) {
    if (sensitiveKeys.has(key)) {
      // val is an encrypted object { iv, encrypted, tag } — show mask string
      out[key] = val ? maskSecret('present') : null;
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ── Prepare integration for client (strip secrets) ───────────────────────────
function toClient(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.credentials = maskCreds(obj.provider, obj.credentials);
  if (obj.webhookSecret) obj.webhookSecret = maskSecret('present');
  delete obj.oauthState;
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations
// List all integrations for current tenant (credentials masked)
// ─────────────────────────────────────────────────────────────────────────────
exports.getIntegrations = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const filter = { ...tf };
    if (req.query.category) filter.category = req.query.category;

    const list = await Integration.find(filter)
      .populate('connectedBy', 'name email')
      .lean();

    const sanitized = list.map((int) => {
      int.credentials = maskCreds(int.provider, int.credentials);
      if (int.webhookSecret) int.webhookSecret = maskSecret('present');
      delete int.oauthState;
      return int;
    });

    res.json({ success: true, data: sanitized });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/:provider
// ─────────────────────────────────────────────────────────────────────────────
exports.getIntegration = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const doc = await Integration.findOne({ ...tf, provider: req.params.provider })
      .populate('connectedBy', 'name email');
    res.json({ success: true, data: doc ? toClient(doc) : null });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/google_sheet/setup
// (Matched via the generic  POST /:provider/setup  route in integrations.js)
//
// One-click onboarding for the Google Sheets lead-sync integration.
// Generates a fresh HMAC webhook secret, stores it encrypted, and returns the
// complete Script Properties block the admin should paste into their Apps Script.
//
// Security model:
//   • Each workspace gets its own randomly generated secret (32 random bytes).
//   • The secret is stored AES-256-GCM encrypted in Integration.credentials.
//   • The plaintext secret is returned ONLY in this response — never again.
//     Regenerating (calling this endpoint again) issues a NEW secret and
//     immediately invalidates the old one.
//   • The Apps Script must present a valid HMAC for every request; HMAC is
//     computed using this secret, so other tenants cannot forge requests.
//   • An optional spreadsheetId stored in config.spreadsheetId is checked
//     against the x-spreadsheet-id header on incoming webhook calls, binding
//     the secret to a specific spreadsheet.
//
// Body (all optional): { spreadsheetId, selectedTabs: string[], industry: string }
// ─────────────────────────────────────────────────────────────────────────────
exports.setupGoogleSheet = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context', 403));

    const { spreadsheetId, selectedTabs, industry } = req.body || {};

    // Generate a cryptographically random 32-byte hex webhook secret
    const plaintextSecret = crypto.randomBytes(32).toString('hex');
    const encryptedSecret = encrypt(plaintextSecret);

    // Build the config to store (non-sensitive, plain JSON in Integration.config)
    const configUpdate = {};
    if (spreadsheetId)              configUpdate.spreadsheetId = String(spreadsheetId).trim();
    if (Array.isArray(selectedTabs)) configUpdate.selectedTabs  = selectedTabs.map(s => String(s).trim()).filter(Boolean);

    // Upsert the google_sheet integration record for this tenant
    const existing = await Integration.findOne({ tenantId, provider: 'google_sheet' }).lean();
    const isNew = !existing;

    await Integration.findOneAndUpdate(
      { tenantId, provider: 'google_sheet' },
      {
        $set: {
          tenantId,
          category:       'google',
          provider:       'google_sheet',
          name:           'Google Sheets Lead Sync',
          status:         'connected',
          credentials:    { webhookSecret: encryptedSecret },  // replaces old secret
          config:         { ...(existing?.config || {}), ...configUpdate },
          connectedBy:    req.user._id,
          connectedAt:    new Date(),
          disconnectedAt: null,
          'syncSettings.autoSync': true,
          'syncSettings.intervalMinutes': 5,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // Build the webhook URL base (used in the Script Properties block)
    const apiBase  = (process.env.API_BASE_URL || 'https://nfinity-crm.onrender.com').replace(/\/$/, '');
    const webhookUrl = `${apiBase}/api/gsheet-webhook`;

    // The Script Properties block to copy-paste into Apps Script
    const scriptProperties = {
      WEBHOOK_URL:    webhookUrl,
      TENANT_ID:      String(tenantId),
      WEBHOOK_SECRET: plaintextSecret,
      SHEETS_TO_SYNC: (configUpdate.selectedTabs || existing?.config?.selectedTabs || []).join(','),
    };

    // ── Auto-create default pipelines if industry is provided and no pipelines exist yet ──
    let pipelinesCreated = [];
    if (isNew && industry) {
      try {
        const { createDefaultPipelinesForTenant } = require('../utils/industryTemplates');
        pipelinesCreated = await createDefaultPipelinesForTenant(tenantId, industry, req.user._id);
      } catch (pipelineErr) {
        console.error('setupGoogleSheet: pipeline creation failed (non-fatal):', pipelineErr.message);
      }
    }

    await logAction({
      action:       isNew ? 'integration_connected' : 'integration_updated',
      module:       'integrations',
      performedBy:  req.user._id,
      tenantId,
      resourceId:   'google_sheet',
      resourceType: 'integration',
      details:      { provider: 'google_sheet', regenerated: !isNew, spreadsheetId, industry, pipelinesCreated: pipelinesCreated.length },
      req,
    });

    return res.json({
      success: true,
      message: isNew
        ? 'Google Sheets integration created. Copy the scriptProperties block into your Apps Script.'
        : 'Webhook secret regenerated. Update WEBHOOK_SECRET in your Apps Script Script Properties.',
      warning: !isNew
        ? 'The previous webhook secret has been invalidated. Update your Apps Script Script Properties immediately.'
        : null,
      scriptProperties,
      instructions: [
        '1. Open your Google Sheet → Extensions → Apps Script.',
        '2. Paste the universal Code.gs from your CRM admin panel.',
        '3. Go to Project Settings → Script Properties.',
        '4. Add each key from scriptProperties above.',
        '5. Run showCurrentConfig() to verify, then testSync(), then setupTrigger().',
      ],
    });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/:provider
// Create or update (upsert) an integration for the current tenant
// Body: { category, name, credentials, config, syncSettings }
// ─────────────────────────────────────────────────────────────────────────────
exports.connectIntegration = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context', 403));

    const { provider } = req.params;
    const { category, name, credentials = {}, config = {}, syncSettings = {} } = req.body;

    if (!category || !name) return next(err('category and name are required'));

    const encryptedCreds = encryptCreds(provider, credentials);
    const isNew = !(await Integration.exists({ tenantId, provider }));

    const setSyncSettings = {};
    if (syncSettings.autoSync !== undefined) {
      setSyncSettings['syncSettings.autoSync'] = Boolean(syncSettings.autoSync);
    }
    if (syncSettings.intervalMinutes !== undefined) {
      setSyncSettings['syncSettings.intervalMinutes'] = Math.max(1, parseInt(syncSettings.intervalMinutes) || 60);
    }

    // Only update credential fields that were actually sent (non-empty)
    // Merge with existing encrypted creds so blank fields don't overwrite
    const existing = await Integration.findOne({ tenantId, provider }).lean();
    const mergedCreds = { ...(existing?.credentials || {}), ...encryptedCreds };
    // Remove keys that were sent as empty string (user cleared a field intentionally)
    for (const [key, val] of Object.entries(credentials)) {
      if (val === '' || val === null) delete mergedCreds[key];
    }

    const doc = await Integration.findOneAndUpdate(
      { tenantId, provider },
      {
        $set: {
          category,
          name,
          credentials: mergedCreds,
          config: { ...(existing?.config || {}), ...config },
          status: 'connected',
          connectedBy: req.user._id,
          connectedAt: new Date(),
          disconnectedAt: null,
          ...setSyncSettings,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logAction({
      action: isNew ? 'integration_connected' : 'integration_updated',
      module: 'integrations',
      performedBy: req.user._id,
      tenantId,
      resourceId: provider,
      resourceType: 'integration',
      details: { provider, category, name },
      req,
    });

    res.json({ success: true, data: toClient(doc), message: `${name} connected successfully` });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/:provider/test
// Verify credentials with a lightweight live API call
// ─────────────────────────────────────────────────────────────────────────────
exports.testConnection = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { provider } = req.params;

    const doc = await Integration.findOne({ ...tf, provider });
    if (!doc) return next(err('Integration not found', 404));

    const creds = decryptCreds(provider, doc.credentials);
    let result = { passed: false, message: 'Provider not supported for live test' };

    try {
      switch (provider) {
        case 'openai': {
          if (!creds.apiKey) throw new Error('API key not configured');
          const r = await httpGet('https://api.openai.com/v1/models', {
            Authorization: `Bearer ${creds.apiKey}`,
          });
          result = r.status === 200
            ? { passed: true, message: 'OpenAI API key is valid' }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'claude': {
          if (!creds.apiKey) throw new Error('API key not configured');
          const r = await httpGet('https://api.anthropic.com/v1/models', {
            'x-api-key': creds.apiKey,
            'anthropic-version': '2023-06-01',
          });
          result = r.status === 200
            ? { passed: true, message: 'Anthropic API key is valid' }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'gemini': {
          if (!creds.apiKey) throw new Error('API key not configured');
          const r = await httpGet(
            `https://generativelanguage.googleapis.com/v1/models?key=${creds.apiKey}`
          );
          result = r.status === 200
            ? { passed: true, message: 'Gemini API key is valid' }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'meta_ads': {
          if (!creds.accessToken) throw new Error('Access token not configured');
          const r = await httpGet(
            `https://graph.facebook.com/v18.0/me?access_token=${creds.accessToken}`
          );
          result = r.status === 200
            ? { passed: true, message: `Connected as: ${r.body?.name || 'Meta User'}` }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'whatsapp': {
          if (!creds.accessToken) throw new Error('Access token not configured');
          const phoneNumberId = doc.config?.phoneNumberId;
          if (!phoneNumberId) throw new Error('Phone Number ID not configured');
          const r = await httpGet(
            `https://graph.facebook.com/v18.0/${phoneNumberId}?access_token=${creds.accessToken}`
          );
          result = r.status === 200
            ? { passed: true, message: 'WhatsApp Business connection verified' }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'stripe': {
          if (!creds.secretKey) throw new Error('Secret key not configured');
          const r = await httpGet('https://api.stripe.com/v1/account', {
            Authorization: `Bearer ${creds.secretKey}`,
          });
          result = r.status === 200
            ? { passed: true, message: `Stripe: ${r.body?.display_name || r.body?.id || 'Account verified'}` }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'razorpay': {
          if (!creds.keySecret) throw new Error('Key Secret not configured');
          const keyId = doc.config?.keyId;
          if (!keyId) throw new Error('Key ID not configured');
          const auth = Buffer.from(`${keyId}:${creds.keySecret}`).toString('base64');
          const r = await httpGet('https://api.razorpay.com/v1/customers?count=1', {
            Authorization: `Basic ${auth}`,
          });
          result = r.status === 200
            ? { passed: true, message: 'Razorpay credentials are valid' }
            : { passed: false, message: r.body?.error?.description || `HTTP ${r.status}` };
          break;
        }
        case 'google': {
          if (!creds.accessToken) throw new Error('Access token not configured');
          const r = await httpGet('https://www.googleapis.com/oauth2/v2/userinfo', {
            Authorization: `Bearer ${creds.accessToken}`,
          });
          result = r.status === 200
            ? { passed: true, message: `Google: connected as ${r.body?.email || 'account verified'}` }
            : { passed: false, message: r.body?.error?.message || `HTTP ${r.status}` };
          break;
        }
        case 'google_sheets': {
          if (!creds.accessToken) throw new Error('Not connected — access token missing');
          const r = await httpGet('https://www.googleapis.com/oauth2/v2/userinfo', {
            Authorization: `Bearer ${creds.accessToken}`,
          });
          if (r.status === 200) {
            const email = r.body?.email || 'account verified';
            const { spreadsheetId, selectedFileName } = doc.config || {};
            const sheetInfo = selectedFileName ? ` · ${selectedFileName}` : spreadsheetId ? ` · Sheet configured` : ' · No sheet selected yet';
            result = { passed: true, message: `Google Sheets: ${email}${sheetInfo}` };
          } else {
            result = { passed: false, message: r.body?.error?.message || `HTTP ${r.status} — token may be expired` };
          }
          break;
        }
        case 'webhook': {
          const webhookUrl = doc.config?.webhookUrl || doc.config?.outgoingUrl;
          result = webhookUrl
            ? { passed: true, message: 'Webhook URL is configured' }
            : { passed: false, message: 'No webhook URL configured' };
          break;
        }
        default: {
          const hasCreds = Object.keys(creds).some((k) => creds[k]);
          result = hasCreds
            ? { passed: true, message: 'Credentials are configured' }
            : { passed: false, message: 'No credentials found — please connect first' };
        }
      }
    } catch (testErr) {
      result = { passed: false, message: testErr.message };
    }

    // Persist test result
    await Integration.findOneAndUpdate(
      { ...tf, provider },
      {
        $set: {
          lastTestedAt: new Date(),
          lastTestResult: result.passed ? 'passed' : 'failed',
          lastTestError: result.passed ? null : result.message,
        },
      }
    );

    await logAction({
      action: 'integration_tested',
      module: 'integrations',
      performedBy: req.user._id,
      tenantId: tf.tenantId,
      resourceId: provider,
      resourceType: 'integration',
      details: { provider, passed: result.passed },
      req,
    });

    res.json({ success: true, ...result });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/:provider/sync
// Trigger manual sync (updates lastSync / nextSync timestamps)
// ─────────────────────────────────────────────────────────────────────────────
exports.syncIntegration = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { provider } = req.params;

    const doc = await Integration.findOne({ ...tf, provider });
    if (!doc) return next(err('Integration not found', 404));
    if (doc.status !== 'connected') return next(err('Integration is not connected. Please connect first.'));

    const now     = new Date();
    const intervalMs = (doc.syncSettings?.intervalMinutes || 60) * 60 * 1000;
    const nextSync   = new Date(now.getTime() + intervalMs);

    await Integration.findOneAndUpdate(
      { ...tf, provider },
      {
        $set: {
          'syncSettings.lastSync':        now,
          'syncSettings.nextSync':        nextSync,
          'syncSettings.lastSyncStatus':  'success',
          'syncSettings.lastSyncError':   null,
        },
      }
    );

    await logAction({
      action: 'integration_synced',
      module: 'integrations',
      performedBy: req.user._id,
      tenantId: tf.tenantId,
      resourceId: provider,
      resourceType: 'integration',
      details: { provider, name: doc.name },
      req,
    });

    res.json({ success: true, message: `${doc.name} synced successfully`, lastSync: now, nextSync });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/integrations/:provider
// Disconnect — removes all tokens, resets status
// ─────────────────────────────────────────────────────────────────────────────
exports.disconnectIntegration = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { provider } = req.params;

    const doc = await Integration.findOne({ ...tf, provider });
    if (!doc) return next(err('Integration not found', 404));

    await Integration.findOneAndUpdate(
      { ...tf, provider },
      {
        $set: {
          status:         'disconnected',
          credentials:    {},
          webhookSecret:  null,
          oauthState:     null,
          config:         {},
          connectedAt:    null,
          disconnectedAt: new Date(),
          'syncSettings.lastSync':        null,
          'syncSettings.nextSync':        null,
          'syncSettings.lastSyncStatus':  null,
          'syncSettings.lastSyncError':   null,
          lastTestResult: null,
          lastTestError:  null,
        },
      }
    );

    await logAction({
      action: 'integration_disconnected',
      module: 'integrations',
      performedBy: req.user._id,
      tenantId: tf.tenantId,
      resourceId: provider,
      resourceType: 'integration',
      details: { provider, name: doc.name },
      req,
    });

    res.json({ success: true, message: `${doc.name} disconnected successfully` });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/integrations/:provider/sync-settings
// Update auto-sync schedule
// ─────────────────────────────────────────────────────────────────────────────
exports.updateSyncSettings = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { provider } = req.params;
    const { autoSync, intervalMinutes } = req.body;

    const update = {};
    if (autoSync !== undefined)       update['syncSettings.autoSync']        = Boolean(autoSync);
    if (intervalMinutes !== undefined) update['syncSettings.intervalMinutes'] = Math.max(1, parseInt(intervalMinutes) || 60);
    if (autoSync && intervalMinutes) {
      update['syncSettings.nextSync'] = new Date(Date.now() + parseInt(intervalMinutes) * 60 * 1000);
    }

    const doc = await Integration.findOneAndUpdate({ ...tf, provider }, { $set: update }, { new: true });
    if (!doc) return next(err('Integration not found', 404));

    await logAction({
      action: 'integration_sync_settings_updated',
      module: 'integrations',
      performedBy: req.user._id,
      tenantId: tf.tenantId,
      resourceId: provider,
      resourceType: 'integration',
      details: { provider, autoSync, intervalMinutes },
      req,
    });

    res.json({ success: true, data: toClient(doc) });
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets private helpers
// ─────────────────────────────────────────────────────────────────────────────

// Column header → Lead field mapping (normalized lower-case header → field name)
const GSHEET_HEADER_MAP = {
  'name': 'name', 'contact name': 'name', 'full name': 'name', 'lead name': 'name',
  'phone': 'phone', 'mobile': 'phone', 'phone number': 'phone',
  'email': 'email', 'email address': 'email',
  'company': 'company', 'company name': 'company', 'organization': 'company',
  'city': 'city', 'state': 'state', 'country': 'country',
  'industry': 'industry',
  'budget': 'budget',
  'service': 'serviceRequired', 'services': 'serviceRequired', 'service required': 'serviceRequired',
  'website': 'website',
  'brand': 'brandName', 'brand name': 'brandName',
  // Meta Ads sheet columns
  'platform': 'source',  // platform column → source (normalised via normaliseSrcGS)
};
const GSHEET_ID_HEADERS = new Set(['id', 'lead id', 'lead_id', 'external id', 'external_id']);
const normalizeHeader = (h) => String(h).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

// Source normalisation — mirrors gsheetWebhookController (keep in sync)
const _VALID_SOURCES_GS = new Set([
  'website', 'referral', 'social_media', 'cold_call', 'email', 'event',
  'meta_ads', 'lead_form', 'facebook_ads', 'instagram_ads', 'whatsapp',
  'google_ads', 'landing_page', 'import', 'api', 'webhook', 'manual', 'other',
]);
const _SOURCE_ALIASES_GS = {
  facebook: 'facebook_ads', instagram: 'instagram_ads', google: 'google_ads',
  fb: 'facebook_ads', ig: 'instagram_ads', sheet: 'import', spreadsheet: 'import', gsheet: 'import',
};
function normaliseSrcGS(raw) {
  if (!raw) return 'import';
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (_VALID_SOURCES_GS.has(s)) return s;
  if (_SOURCE_ALIASES_GS[s])    return _SOURCE_ALIASES_GS[s];
  return 'other';
}

// Pipeline resolution for native Google Sheets sync — mirrors gsheetWebhookController
async function resolvePipelineGS(tenantId, { adId, metaFormId, sheetName, source }) {
  try {
    const tiers = [
      adId       ? { adId }       : null,
      metaFormId ? { metaFormId } : null,
      sheetName  ? { sheetName }  : null,
      source     ? { source }     : null,
    ].filter(Boolean);

    let pipeline = null, stageOverride = null;
    for (const criterion of tiers) {
      const mapping = await PipelineMapping.findOne({ tenantId, isActive: true, ...criterion }).populate('pipelineId').lean();
      if (mapping && mapping.pipelineId && mapping.pipelineId.isActive) {
        pipeline      = mapping.pipelineId;
        stageOverride = mapping.stageId ? String(mapping.stageId) : null;
        break;
      }
    }
    if (!pipeline) pipeline = await Pipeline.findOne({ tenantId, isDefault: true, isActive: true }).lean();
    if (!pipeline) pipeline = await Pipeline.findOne({ tenantId, isActive: true }).sort({ createdAt: 1 }).lean();
    if (!pipeline) return { pipelineId: null, stageId: null };

    const sortedStages = [...(pipeline.stages || [])].sort((a, b) => a.order - b.order);
    let stage = stageOverride ? sortedStages.find(s => String(s._id) === stageOverride) : null;
    if (!stage) stage = sortedStages.find(s => s.type === 'open') || sortedStages[0];
    return { pipelineId: pipeline._id, stageId: stage?._id || null };
  } catch (e) {
    console.error('[GSheets Sync] pipeline resolution error:', e.message);
    return { pipelineId: null, stageId: null };
  }
}

// Use refresh_token to get a new access_token from Google
async function refreshGoogleToken(refreshToken) {
  const res = await httpPost('oauth2.googleapis.com', '/token', {
    grant_type:    'refresh_token',
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  return res.body; // { access_token, expires_in, token_type } or { error }
}

// Call the Google Sheets API with an Authorization bearer token
async function callSheetsApi(accessToken, path) {
  return httpGet(`https://sheets.googleapis.com/v4${path}`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

// Decrypt token, auto-refresh if within 60s of expiry, re-save if refreshed.
// Returns a valid access_token string or throws.
async function getOrRefreshToken(doc, tf) {
  const creds = decryptCreds('google_sheets', doc.credentials);
  if (!creds.accessToken) throw new Error('Not connected — access token missing. Please reconnect Google Sheets.');

  const expiresAt = doc.config?.tokenExpiresAt || 0;
  // Token is still valid
  if (Date.now() < expiresAt - 60_000) return creds.accessToken;

  // Token expired or expiry unknown — attempt refresh
  if (!creds.refreshToken) throw new Error('Session expired. Please reconnect Google Sheets.');

  const refreshed = await refreshGoogleToken(creds.refreshToken);
  if (!refreshed.access_token) {
    const reason = refreshed.error_description || refreshed.error || 'Token refresh failed';
    throw new Error(`Session expired: ${reason}. Please reconnect Google Sheets.`);
  }

  const newToken  = refreshed.access_token;
  const newExpiry = Date.now() + (refreshed.expires_in || 3600) * 1000;

  const newCreds = encryptCreds('google_sheets', { ...creds, accessToken: newToken });
  await Integration.findOneAndUpdate(
    { ...tf, provider: 'google_sheets' },
    { $set: { credentials: newCreds, 'config.tokenExpiresAt': newExpiry } }
  );

  return newToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/google_sheets/picker-config
// Return { accessToken, clientId, apiKey } for the frontend Google Picker.
// The access_token carries spreadsheets.readonly scope (+ openid email profile).
// NEVER returns GOOGLE_CLIENT_SECRET.
// ─────────────────────────────────────────────────────────────────────────────
exports.getGoogleSheetsPickerConfig = async (req, res, next) => {
  try {
    const tf  = getTenantFilter(req);
    const doc = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    console.log('[GSheets PickerConfig] doc found:', !!doc, '| status:', doc?.status, '| provider:', doc?.provider, '| tenantId:', doc?.tenantId);
    if (!doc)                      return next(err('Google Sheets is not connected', 404));
    if (doc.status !== 'connected') {
      console.log('[GSheets PickerConfig] → 400: doc.status is', doc.status, '(not connected)');
      return next(err('Google Sheets is not connected', 400));
    }

    const apiKey = process.env.GOOGLE_PICKER_API_KEY;
    if (!apiKey) return next(err('GOOGLE_PICKER_API_KEY is not configured on the server', 500));

    let accessToken;
    try {
      accessToken = await getOrRefreshToken(doc, tf);
    } catch (tokenErr) {
      await Integration.findOneAndUpdate(
        { ...tf, provider: 'google_sheets' },
        { $set: { status: 'expired' } }
      ).catch(() => {});
      return next(Object.assign(new Error(tokenErr.message), { statusCode: 401 }));
    }

    res.json({
      success: true,
      accessToken,
      clientId: process.env.GOOGLE_CLIENT_ID,
      apiKey,
    });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/google_sheets/config/verify
// Verify a spreadsheetId is accessible and return the list of sheet tab names.
// Called after the Picker returns a file, before the user confirms the tab.
// Body: { spreadsheetId, fileName? }   ← fileName is the Picker-provided display name
// ─────────────────────────────────────────────────────────────────────────────
exports.verifySheetAccess = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { spreadsheetId, fileName: pickerFileName } = req.body || {};

    if (!spreadsheetId) return next(err('spreadsheetId is required'));

    const integration = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    console.log('[GSheets Verify] integration found:', !!integration, '| status:', integration?.status);

    if (!integration) {
      console.log('[GSheets Verify] → 404: not in DB. tenantId:', req.user?.tenantId);
      return next(err('Google Sheets is not connected', 404));
    }

    // Log token + scope state (no token values — booleans/expiry/scope only)
    const expiresAt = integration.config?.tokenExpiresAt || 0;
    const secsLeft  = Math.round((expiresAt - Date.now()) / 1000);
    console.log('[GSheets Verify] token state: hasAccessToken=', !!(integration.credentials?.accessToken),
      '| hasRefreshToken=', !!(integration.credentials?.refreshToken),
      '| secsUntilExpiry=', secsLeft, '| willRefresh=', secsLeft < 60);
    console.log('[GSheets Verify] grantedScope:', integration.config?.grantedScope || '(not stored — reconnect to populate)');

    let accessToken;
    try {
      accessToken = await getOrRefreshToken(integration, tf);
      console.log('[GSheets Verify] token obtained:', !!accessToken);
    } catch (tokenErr) {
      console.error('[GSheets Verify] token error:', tokenErr.message);
      return next(Object.assign(new Error(tokenErr.message), { statusCode: 401 }));
    }

    // ── Sheets API v4 — spreadsheets.get ─────────────────────────────────────
    // With spreadsheets.readonly scope (replacing drive.file), Drive API is NOT usable.
    // The Sheets API returns BOTH the spreadsheet title (properties.title) and all tab
    // names (sheets[].properties.title) in a single request — no Drive API call needed.
    const sheetsPath = `/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`;
    console.log('[GSheets Verify] Sheets API → GET /v4/spreadsheets/' + spreadsheetId + '?fields=properties.title,sheets.properties.title');
    console.log('[GSheets Verify] hasAccessToken:', !!accessToken);

    const sheetsRes = await callSheetsApi(accessToken, sheetsPath);
    console.log('[GSheets Verify] Sheets API status:', sheetsRes.status, '| body:', JSON.stringify(sheetsRes.body).slice(0, 600));

    if (sheetsRes.status === 401) {
      const reason = sheetsRes.body?.error?.message || 'Unauthorized';
      console.log('[GSheets Verify] Sheets API 401:', reason);
      return next(Object.assign(new Error('Authorization expired. Please reconnect Google Sheets.'), { statusCode: 401 }));
    }
    if (sheetsRes.status === 403) {
      const reason = sheetsRes.body?.error?.message || 'Forbidden';
      console.log('[GSheets Verify] Sheets API 403:', reason);
      return next(err('Sheets API access denied: ' + reason + '. Please reconnect Google Sheets.', 403));
    }
    if (sheetsRes.status === 404) {
      const reason = sheetsRes.body?.error?.message || 'Spreadsheet not found';
      console.log('[GSheets Verify] Sheets API 404:', reason);
      return next(err('Spreadsheet not found or inaccessible: ' + reason, 404));
    }
    if (sheetsRes.status !== 200) {
      const reason = sheetsRes.body?.error?.message || 'HTTP ' + sheetsRes.status;
      console.log('[GSheets Verify] Sheets API error:', sheetsRes.status, reason);
      return next(err('Sheets API error: ' + reason, 502));
    }

    // Use the authoritative title from Google — fall back to Picker-provided name
    const fileName        = sheetsRes.body.properties?.title || pickerFileName || 'Untitled Spreadsheet';
    const availableSheets = (sheetsRes.body.sheets || []).map(s => s.properties?.title).filter(Boolean);

    if (!availableSheets.length) return next(err('No sheet tabs found in the spreadsheet.', 422));

    console.log('[GSheets Verify] → 200 success. fileName:', fileName, '| sheets:', availableSheets);
    res.json({ success: true, spreadsheetId, fileName, availableSheets });
  } catch (e) {
    console.error('[GSheets Verify] unexpected error:', e.message, e.stack?.split('\n')[1]);
    next(e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/google_sheets/config
// Save the spreadsheetId + syncMode (+ sheetName if syncMode='single') chosen by the user.
// Body: { spreadsheetId, syncMode, sheetName, selectedFileName }
// ─────────────────────────────────────────────────────────────────────────────
exports.saveSheetConfig = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { spreadsheetId, sheetName, selectedFileName, syncMode: rawSyncMode } = req.body || {};
    const syncMode = rawSyncMode === 'all' ? 'all' : 'single'; // default 'single'

    if (!spreadsheetId) return next(err('spreadsheetId is required'));
    if (syncMode === 'single' && !sheetName) return next(err('sheetName is required when syncMode is "single"'));

    const doc = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    if (!doc) return next(err('Google Sheets is not connected', 404));

    // ── Multi-sheet: upsert this sheet into config.spreadsheets array ──────
    //
    // Bootstrap strategy:
    //   1. If config.spreadsheets already exists → use it (multi-sheet already set up).
    //   2. If config.spreadsheets is missing/empty but config.spreadsheetId exists →
    //      the integration was saved with old single-sheet code.  Reconstruct the
    //      first entry from the legacy fields so we don't silently drop it when a
    //      second sheet is connected.
    //   3. Otherwise → start with an empty array (fresh connection).
    const existingSheets =
      Array.isArray(doc.config?.spreadsheets) && doc.config.spreadsheets.length > 0
        ? [...doc.config.spreadsheets]
        : doc.config?.spreadsheetId
          ? [{
              spreadsheetId: String(doc.config.spreadsheetId),
              displayName:   doc.config.selectedFileName || String(doc.config.spreadsheetId),
              syncMode:      doc.config.syncMode  || 'single',
              sheetName:     doc.config.sheetName || '',
              updatedAt:     doc.updatedAt        || new Date(),
            }]
          : [];
    const newEntry = {
      spreadsheetId: String(spreadsheetId).trim(),
      displayName:   selectedFileName ? String(selectedFileName).trim() : String(spreadsheetId).trim(),
      syncMode,
      sheetName:     syncMode === 'single' ? String(sheetName).trim() : '',
      updatedAt:     new Date(),
    };
    const existingIdx = existingSheets.findIndex(s => s.spreadsheetId === newEntry.spreadsheetId);
    if (existingIdx >= 0) existingSheets[existingIdx] = newEntry;
    else                  existingSheets.push(newEntry);

    const updated = await Integration.findOneAndUpdate(
      { ...tf, provider: 'google_sheets' },
      {
        $set: {
          // Legacy single-sheet fields — kept for backward compat; always reflects last connected
          'config.spreadsheetId':    newEntry.spreadsheetId,
          'config.syncMode':         syncMode,
          'config.sheetName':        newEntry.sheetName,
          'config.selectedFileName': newEntry.displayName,
          // Multi-sheet array — canonical source of truth
          'config.spreadsheets':     existingSheets,
        },
      },
      { new: true }
    );

    await logAction({
      action:      'integration_updated',
      module:      'integrations',
      performedBy: req.user._id,
      tenantId:    tf.tenantId,
      resourceId:  'google_sheets',
      resourceType:'integration',
      details:     { spreadsheetId, syncMode, sheetName: syncMode === 'single' ? sheetName : '(all tabs)', selectedFileName },
      req,
    });

    res.json({ success: true, data: toClient(updated), message: 'Sheet configuration saved' });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/integrations/google_sheets/config/:spreadsheetId
// Remove ONE spreadsheet from config.spreadsheets without disconnecting the
// integration or touching any other configured spreadsheet.
// ─────────────────────────────────────────────────────────────────────────────
exports.removeSheetConfig = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { spreadsheetId } = req.params;
    if (!spreadsheetId) return next(err('spreadsheetId is required', 400));

    const doc = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    if (!doc) return next(err('Google Sheets is not connected', 404));

    const existing = Array.isArray(doc.config?.spreadsheets) ? doc.config.spreadsheets : [];
    const filtered = existing.filter(s => s.spreadsheetId !== String(spreadsheetId));

    if (filtered.length === existing.length) {
      return next(err('Spreadsheet not found in configuration', 404));
    }

    // Promote the first remaining sheet to be the legacy primary (backward compat)
    const newPrimary = filtered[0] || null;

    await Integration.findOneAndUpdate(
      { ...tf, provider: 'google_sheets' },
      {
        $set: {
          'config.spreadsheets':     filtered,
          'config.spreadsheetId':    newPrimary?.spreadsheetId    || '',
          'config.selectedFileName': newPrimary?.displayName      || '',
          'config.syncMode':         newPrimary?.syncMode         || 'single',
          'config.sheetName':        newPrimary?.sheetName        || '',
        },
      },
      { new: true }
    );

    await logAction({
      action: 'integration_updated', module: 'integrations',
      performedBy: req.user._id, tenantId: tf.tenantId,
      resourceId: 'google_sheets', resourceType: 'integration',
      details: { removed: spreadsheetId, remaining: filtered.length },
      req,
    });

    res.json({ success: true, message: 'Spreadsheet removed', remaining: filtered.length });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/google_sheets/sync
// Read all rows from the configured sheet and upsert as Leads.
//
// Deduplication — four ordered steps (deterministic, no broad OR upsert):
//   1. Exact sourceKey match  → skip (never overwrite CRM data)
//   2. Phone match (separate) → link only if lead has no existing externalLeadId
//   3. Email match (separate) → link only if lead has no existing externalLeadId
//   4. No match               → create new Lead
//
// Returns { created, skipped, linked, errors[] }
// ─────────────────────────────────────────────────────────────────────────────
exports.syncGoogleSheet = async (req, res, next) => {
  // ── DISABLED: Google Sheets lead sync is temporarily turned off ───────────────
  // No Lead documents will be created. To re-enable, remove the early return below.
  return res.status(503).json({
    success: false,
    message: 'Google Sheets lead sync is currently disabled',
  });
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const tf  = getTenantFilter(req);
    const doc = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    if (!doc)                      return next(err('Google Sheets is not connected', 404));
    if (doc.status !== 'connected' && doc.status !== 'sync_error')
      return next(err('Google Sheets is not connected. Please connect first.', 400));

    // Multi-sheet support: read primary sheet from config.spreadsheets if available,
    // otherwise fall back to legacy single config.spreadsheetId fields.
    let spreadsheetId, sheetName, syncMode;
    const configSheets = Array.isArray(doc.config?.spreadsheets) && doc.config.spreadsheets.length > 0
      ? doc.config.spreadsheets
      : null;
    if (configSheets) {
      // If caller passes targetSpreadsheetId, sync that specific sheet; otherwise sync primary.
      const targetId = req.body?.targetSpreadsheetId || null;
      const primary  = targetId
        ? configSheets.find(s => s.spreadsheetId === targetId)
        : (configSheets.find(s => s.spreadsheetId === doc.config?.spreadsheetId) || configSheets[0]);
      if (!primary) return next(err(
        targetId ? `Spreadsheet not found in config: ${targetId}` : 'No spreadsheet configured', 400
      ));
      spreadsheetId = primary.spreadsheetId;
      sheetName     = primary.sheetName;
      syncMode      = primary.syncMode === 'all' ? 'all' : 'single';
    } else {
      const cfg = doc.config || {};
      spreadsheetId = cfg.spreadsheetId;
      sheetName     = cfg.sheetName;
      syncMode      = cfg.syncMode === 'all' ? 'all' : 'single';
    }

    if (!spreadsheetId) return next(err('No spreadsheet configured. Please select a Google Sheet first.', 400));
    if (syncMode === 'single' && !sheetName) return next(err('No sheet tab configured. Please select a sheet tab first.', 400));

    // Get a valid access token (auto-refresh if expired)
    let accessToken;
    try {
      accessToken = await getOrRefreshToken(doc, tf);
    } catch (tokenErr) {
      await Integration.findOneAndUpdate(
        { ...tf, provider: 'google_sheets' },
        { $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': tokenErr.message } }
      );
      return next(Object.assign(new Error(tokenErr.message), { statusCode: 401 }));
    }

    // ── Determine which tabs to sync ─────────────────────────────────────────
    let tabsToSync = [];
    if (syncMode === 'all') {
      // Fetch spreadsheet metadata to get all tab names
      const metaRes = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
      if (metaRes.status === 401) {
        await Integration.findOneAndUpdate(
          { ...tf, provider: 'google_sheets' },
          { $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': 'Authorization expired' } }
        );
        return next(err('Google authorization expired. Please reconnect.', 401));
      }
      if (metaRes.status !== 200) {
        const errMsg = metaRes.body?.error?.message || `Sheets API error (HTTP ${metaRes.status})`;
        await Integration.findOneAndUpdate(
          { ...tf, provider: 'google_sheets' },
          { $set: { status: 'sync_error', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': errMsg } }
        );
        return next(err(errMsg, 502));
      }
      tabsToSync = (metaRes.body.sheets || []).map(s => s.properties?.title).filter(Boolean);
      if (!tabsToSync.length) {
        await Integration.findOneAndUpdate(
          { ...tf, provider: 'google_sheets' },
          { $set: { 'syncSettings.lastSync': new Date(), 'syncSettings.lastSyncStatus': 'success', 'syncSettings.lastSyncError': null } }
        );
        return res.json({ success: true, created: 0, skipped: 0, linked: 0, errors: [], message: 'No tabs found in the spreadsheet.' });
      }
    } else {
      tabsToSync = [sheetName];
    }

    const Lead = require('../models/Lead');
    let created = 0, skipped = 0, linked = 0;
    const errors = [];

    // ── Process each tab (one iteration for 'single', all tabs for 'all') ───
    for (const tabName of tabsToSync) {
      // Fetch up to 1000 rows for this tab
      const range     = encodeURIComponent(`${tabName}!A1:Z1000`);
      const sheetsRes = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}/values/${range}`);

      if (sheetsRes.status === 401) {
        // Auth expired — stop all syncing, mark integration expired
        await Integration.findOneAndUpdate(
          { ...tf, provider: 'google_sheets' },
          { $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': 'Authorization expired' } }
        );
        return next(err('Google authorization expired. Please reconnect.', 401));
      }
      if (sheetsRes.status !== 200) {
        // Non-fatal per-tab error — record and continue to next tab
        const errMsg = sheetsRes.body?.error?.message || `Sheets API error (HTTP ${sheetsRes.status})`;
        errors.push({ tab: tabName, reason: errMsg });
        continue;
      }

      const rows = sheetsRes.body.values || [];
      if (rows.length < 2) continue; // empty or header-only tab — skip

      // Parse headers for this tab
      const originalHeaders = rows[0]; // raw sheet headers (preserve underscores for customFields keys)
      const headers         = rows[0].map(normalizeHeader);
      const fieldMap        = {};
      let idColIndex        = -1;

      for (let c = 0; c < headers.length; c++) {
        const h = headers[c];
        if (GSHEET_ID_HEADERS.has(h)) {
          if (idColIndex === -1) idColIndex = c;
        } else if (GSHEET_HEADER_MAP[h] && fieldMap[GSHEET_HEADER_MAP[h]] === undefined) {
          fieldMap[GSHEET_HEADER_MAP[h]] = c;
        }
      }

      if (fieldMap.name === undefined) {
        // Tab has no Name column — skip with a note
        errors.push({ tab: tabName, reason: 'No "Name" column found — tab skipped' });
        continue;
      }

      // ── Row loop ─────────────────────────────────────────────────────────
      for (let i = 1; i < rows.length; i++) {
        const row      = rows[i];
        const rowIndex = i + 1; // 1-based; row 1 = header

        try {
          const getVal = (field) => {
            const idx = fieldMap[field];
            return idx !== undefined ? String(row[idx] || '').trim() : '';
          };

          const name = getVal('name');
          if (!name) continue; // Skip rows without a name

          const phone           = getVal('phone');
          const email           = getVal('email');
          const company         = getVal('company');
          const city            = getVal('city');
          const state           = getVal('state');
          const country         = getVal('country');
          const industry        = getVal('industry');
          const website         = getVal('website');
          const brandName       = getVal('brandName');
          const serviceRequired = getVal('serviceRequired');
          const budgetRaw       = getVal('budget');
          const budget          = budgetRaw ? (parseFloat(budgetRaw.replace(/[^0-9.]/g, '')) || 0) : 0;

          // Unmapped columns → customFields using ORIGINAL header keys (underscores preserved)
          const mappedColIndices = new Set([idColIndex, ...Object.values(fieldMap)].filter(n => n !== -1));
          const customFields = {};
          for (let c = 0; c < headers.length; c++) {
            if (!mappedColIndices.has(c) && originalHeaders[c] && row[c]) {
              const origKey = String(originalHeaders[c]).trim().toLowerCase();
              customFields[origKey] = String(row[c]).trim();
            }
          }

          // ── Attribution: promote Meta Ads columns to top-level fields ────
          const _str = (v) => (v !== undefined && v !== null ? String(v).trim() : null) || null;
          const attribution = {
            adId:         _str(customFields.ad_id),
            adName:       _str(customFields.ad_name),
            adSetId:      _str(customFields.adset_id),
            adSetName:    _str(customFields.adset_name),
            campaignId:   _str(customFields.campaign_id),
            campaignName: _str(customFields.campaign_name),
            metaFormId:   _str(customFields.form_id),
            metaFormName: _str(customFields.form_name),
            sheetName:     tabName,      // actual tab name for this row
            spreadsheetId: spreadsheetId, // stable Google spreadsheet ID
          };

          // ── Deterministic external key — raw id matches Apps Script format ─
          const idColVal       = idColIndex !== -1 ? String(row[idColIndex] || '').trim() : '';
          const externalLeadId = idColVal || `gsheets:${tabName}:R${rowIndex}`;
          const externalSource = 'google_sheets';

          // ── Source: normalise platform column value ───────────────────────
          const source = normaliseSrcGS(getVal('source')); // 'platform' → 'source' via GSHEET_HEADER_MAP

          // Step 1 — Primary: exact external key match → skip
          const byKey = await Lead.findOne({ tenantId: tf.tenantId, externalLeadId, externalSource });
          if (byKey) { skipped++; continue; }

          // Step 2 — Secondary: phone match
          if (phone) {
            const byPhone = await Lead.findOne({ tenantId: tf.tenantId, phone });
            if (byPhone) {
              // Only link if no existing external key (preserve Apps Script leads)
              if (!byPhone.externalLeadId) {
                await Lead.updateOne({ _id: byPhone._id }, { $set: { externalLeadId, externalSource } });
              }
              linked++; continue;
            }
          }

          // Step 3 — Tertiary: email match
          if (email) {
            const byEmail = await Lead.findOne({ tenantId: tf.tenantId, email });
            if (byEmail) {
              if (!byEmail.externalLeadId) {
                await Lead.updateOne({ _id: byEmail._id }, { $set: { externalLeadId, externalSource } });
              }
              linked++; continue;
            }
          }

          // Step 4 — Pipeline resolution
          const { pipelineId, stageId } = await resolvePipelineGS(tf.tenantId, {
            adId:       attribution.adId,
            metaFormId: attribution.metaFormId,
            sheetName:  tabName,
            source,
          });

          // Step 5 — Create new lead
          const campaignTag = attribution.campaignName || '';
          await Lead.create({
            name, phone, email, company, city, state, country, industry,
            website, brandName, serviceRequired, budget,
            customFields,
            externalLeadId,
            externalSource,
            source,
            sheetName:     tabName,
            spreadsheetId: spreadsheetId,  // stable Google spreadsheet ID for cross-sheet filtering
            tags: campaignTag ? [`campaign:${campaignTag}`] : [],
            tenantId:  tf.tenantId,
            createdBy: req.user._id,
            ...attribution,
            ...(pipelineId ? { pipelineId, stageId } : {}),
          });
          created++;

        } catch (rowErr) {
          errors.push({ tab: tabName, row: rowIndex, reason: rowErr.message });
        }
      }
      // ── end row loop for tabName ──────────────────────────────────────────
    }
    // ── end tab loop ─────────────────────────────────────────────────────────

    // Persist sync result
    const now = new Date();
    const syncErrMsg = errors.length ? `${errors.length} item(s) failed — check errors` : null;
    await Integration.findOneAndUpdate(
      { ...tf, provider: 'google_sheets' },
      {
        $set: {
          status:                          'connected',
          'syncSettings.lastSync':         now,
          'syncSettings.lastSyncStatus':   errors.length && !created && !linked ? 'failed' : 'success',
          'syncSettings.lastSyncError':    syncErrMsg,
        },
      }
    );

    await logAction({
      action:      'integration_synced',
      module:      'integrations',
      performedBy: req.user._id,
      tenantId:    tf.tenantId,
      resourceId:  'google_sheets',
      resourceType:'integration',
      details:     { spreadsheetId, syncMode, tabs: tabsToSync, created, skipped, linked, errors: errors.length },
      req,
    });

    const message = `Sync complete — ${created} new, ${skipped} skipped, ${linked} linked` +
      (errors.length ? `, ${errors.length} error(s)` : '');

    res.json({ success: true, created, skipped, linked, errors, message });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/google_sheets/contexts
// Returns all available Google Sheet contexts (spreadsheet + tab combinations)
// that a user can select for the Leads Dashboard selector.
// Combines:
//   1. The currently connected integration's config (spreadsheetId, tabs)
//   2. Distinct (spreadsheetId, sheetName) pairs from actual lead documents
// No credentials are exposed. tenantId always comes from JWT.
// ─────────────────────────────────────────────────────────────────────────────
exports.getGoogleSheetsContexts = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const Lead = require('../models/Lead');

    // ── 1. Current integration config ──────────────────────────────────────
    const integration = await Integration.findOne({ ...tf, provider: 'google_sheets' }).lean();
    const config      = integration?.config || {};
    const isConnected = integration?.status === 'connected';

    // Canonical list of configured spreadsheets.
    // Supports both new config.spreadsheets array (multi-sheet) and legacy
    // config.spreadsheetId single-sheet — always backward compatible.
    const configSpreadsheets =
      Array.isArray(config.spreadsheets) && config.spreadsheets.length > 0
        ? config.spreadsheets
        : config.spreadsheetId
          ? [{
              spreadsheetId: config.spreadsheetId,
              displayName:   config.selectedFileName || config.spreadsheetId,
              syncMode:      config.syncMode || 'single',
              sheetName:     config.sheetName || '',
            }]
          : [];

    // ── 2. Aggregate leads by (spreadsheetId, sheetName) ──────────────────
    const leadContexts = await Lead.aggregate([
      {
        $match: {
          ...tf,
          externalSource: { $in: ['google_sheets', 'google_sheet'] },
          sheetName:      { $ne: null, $exists: true },
        },
      },
      {
        $group: {
          _id:   { spreadsheetId: '$spreadsheetId', sheetName: '$sheetName' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id:        '$_id.spreadsheetId',
          tabs:       { $push: { sheetName: '$_id.sheetName', count: '$count' } },
          totalLeads: { $sum: '$count' },
        },
      },
      { $sort: { totalLeads: -1 } },
    ]);

    // Build lookup: spreadsheetId → { tabs, totalLeads }
    // Leads synced before the spreadsheetId field was added have spreadsheetId: null
    // → keyed as '__no_spreadsheet_id__'
    const leadMap = {};
    for (const item of leadContexts) {
      leadMap[item._id ?? '__no_spreadsheet_id__'] = item;
    }

    // ── 3. Merge config + lead data into selector-ready contexts ────────────
    const spreadsheets = [];

    // First: all configured spreadsheets (from Integration config)
    for (const cfgSS of configSpreadsheets) {
      const sid = cfgSS.spreadsheetId;

      // Fall back to legacy leads (spreadsheetId: null) for spreadsheets connected before
      // the spreadsheetId field was added to the Lead model.  Associating legacy counts
      // with the configured spreadsheet makes the dashboard show correct totals.
      const leadEntry = leadMap[sid] || leadMap['__no_spreadsheet_id__'];
      if (leadEntry && leadEntry === leadMap['__no_spreadsheet_id__']) {
        // Consumed the legacy bucket — remove it so it doesn't appear as an orphan entry
        delete leadMap['__no_spreadsheet_id__'];
      }

      const tabs     = leadEntry?.tabs || [];
      const syncMode = cfgSS.syncMode || 'single';
      const cfgTab   = syncMode === 'single' ? (cfgSS.sheetName || '') : '';

      let tabsForSelector;
      if (syncMode === 'all') {
        // All-tabs mode: show a synthetic "All Tabs" entry + each individual tab
        tabsForSelector = [
          { sheetName: null, label: 'All Tabs', count: leadEntry?.totalLeads || 0, isAllTabs: true },
          ...tabs.map(t => ({ sheetName: t.sheetName, label: t.sheetName, count: t.count })),
        ];
      } else if (cfgTab) {
        // Single-tab mode: show only the configured tab (with fallback count from any tab)
        const tabCount = tabs.find(t => t.sheetName === cfgTab)?.count || 0;
        tabsForSelector = [{ sheetName: cfgTab, label: cfgTab, count: tabCount }];
      } else {
        // No specific tab configured — show all known tabs from lead data
        tabsForSelector = tabs.map(t => ({ sheetName: t.sheetName, label: t.sheetName, count: t.count }));
      }

      spreadsheets.push({
        spreadsheetId: sid,
        displayName:   cfgSS.displayName || sid,
        isConnected,
        syncMode,
        tabs:          tabsForSelector,
        totalLeads:    leadEntry?.totalLeads || 0,
      });

      delete leadMap[sid]; // mark as processed
    }

    // Second: any OTHER spreadsheets found in lead data but no longer in config
    // (previously connected spreadsheets — shown as read-only historical context)
    for (const [sid, item] of Object.entries(leadMap)) {
      if (sid === '__no_spreadsheet_id__') continue;
      spreadsheets.push({
        spreadsheetId: sid,
        displayName:   sid,         // no display name available for historical entries
        isConnected:   false,
        syncMode:      'unknown',
        tabs:          item.tabs.map(t => ({ sheetName: t.sheetName, label: t.sheetName, count: t.count })),
        totalLeads:    item.totalLeads,
      });
    }

    // Third: legacy leads with no spreadsheetId (Apps Script users, or leads synced before
    // the spreadsheetId field was added to the Lead model) — if NOT consumed by a configured
    // spreadsheet above, synthesize a selector entry so tabs remain accessible.
    const legacyEntry     = leadMap['__no_spreadsheet_id__'];
    const legacyLeadsCount = legacyEntry?.totalLeads || 0;

    if (legacyEntry && configSpreadsheets.length === 0) {
      // No configured spreadsheet at all (Apps Script-only, or OAuth not yet finished) —
      // create a "Google Sheet Leads" catch-all entry with all distinct tabs.
      spreadsheets.push({
        spreadsheetId: null,
        displayName:   'Google Sheet Leads',
        isConnected:   false,
        syncMode:      'unknown',
        tabs: [
          { sheetName: null, label: 'All Tabs', count: legacyEntry.totalLeads, isAllTabs: true },
          ...legacyEntry.tabs.map(t => ({ sheetName: t.sheetName, label: t.sheetName, count: t.count })),
        ],
        totalLeads: legacyEntry.totalLeads,
      });
    }

    res.json({
      success: true,
      data: {
        spreadsheets,
        isConnected,
        connectedSpreadsheetId: config.spreadsheetId || null,
        selectedFileName:       config.selectedFileName || null,
        syncMode:               config.syncMode || 'single',
        legacyLeadsCount,
        configuredCount:        configSpreadsheets.length,
      },
    });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/oauth/:provider/init
// Redirect browser to external OAuth provider's authorization page
// ─────────────────────────────────────────────────────────────────────────────
exports.oauthInit = async (req, res, next) => {
  try {
    const { provider } = req.params;
    const tenantId    = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context for OAuth', 403));

    // noRedirect=true → return JSON { authUrl } instead of browser redirect
    // Used by the frontend to open the OAuth URL in a popup via JS
    const noRedirect = req.query.noRedirect === 'true';

    const state       = crypto.randomBytes(16).toString('hex');
    const callbackBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

    // Persist state so the callback can look up the tenant
    await Integration.findOneAndUpdate(
      { tenantId, provider },
      {
        $set: {
          tenantId,
          provider,
          oauthState: state,
          category: (provider === 'google' || provider === 'google_sheets') ? 'google' : 'marketing',
          name: provider === 'google'        ? 'Google Workspace'
              : provider === 'google_sheets' ? 'Google Sheets'
              : provider === 'whatsapp'      ? 'WhatsApp Business'
              : 'Meta Ads',
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    let authUrl;

    switch (provider) {
      case 'meta_ads':
      case 'whatsapp': {
        const appId = process.env.META_APP_ID;
        if (!appId) return next(err('META_APP_ID is not configured on the server', 500));
        const scope = provider === 'whatsapp'
          ? 'whatsapp_business_management,whatsapp_business_messaging'
          : 'ads_management,ads_read,business_management,pages_read_engagement,instagram_basic';
        const redirectUri = encodeURIComponent(`${callbackBase}/api/integrations/oauth/${provider}/callback`);
        authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code`;
        break;
      }
      case 'google': {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) return next(err('GOOGLE_CLIENT_ID is not configured on the server', 500));
        const scope = encodeURIComponent([
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/gmail.readonly',
        ].join(' '));
        const redirectUri = encodeURIComponent(`${callbackBase}/api/integrations/oauth/google/callback`);
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
        break;
      }
      case 'google_sheets': {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) return next(err('GOOGLE_CLIENT_ID is not configured on the server', 500));
        // drive.file: required by Google Picker to browse/select Drive files.
        // spreadsheets.readonly: read any sheet the user has access to (title + values + tabs).
        // Both scopes are needed — drive.file for Picker, spreadsheets.readonly for Sheets API reads.
        const scope = encodeURIComponent([
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/spreadsheets.readonly',
        ].join(' '));
        const redirectUri = encodeURIComponent(`${callbackBase}/api/integrations/oauth/google_sheets/callback`);
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
        break;
      }
      default:
        return next(err(`OAuth not supported for provider: ${provider}`));
    }

    if (noRedirect) {
      return res.json({ success: true, authUrl });
    }
    res.redirect(authUrl);
  } catch (e) { next(e) }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/integrations/oauth/:provider/callback   (PUBLIC — no auth cookie)
// Exchange code for tokens, store encrypted, redirect popup to close page
// ─────────────────────────────────────────────────────────────────────────────
exports.oauthCallback = async (req, res, next) => {
  const { provider }  = req.params;
  const { code, state, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const closeUrl  = (status, extra = '') =>
    `${clientUrl}/oauth-callback?status=${status}&provider=${provider}${extra}`;

  if (error) {
    return res.redirect(closeUrl('error', `&reason=${encodeURIComponent(error)}`));
  }
  if (!code) {
    return res.redirect(closeUrl('error', '&reason=no_code'));
  }

  try {
    // Look up tenant via saved state
    const existing = await Integration.findOne({ oauthState: state });
    if (!existing) {
      return res.redirect(closeUrl('error', '&reason=invalid_state'));
    }

    const callbackBase  = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    let tokens = {};
    let displayConfig  = {};

    switch (provider) {
      case 'meta_ads':
      case 'whatsapp': {
        const appId    = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        const redirectUri = encodeURIComponent(`${callbackBase}/api/integrations/oauth/${provider}/callback`);

        // Exchange code → short-lived token
        const shortRes = await httpGet(
          `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${redirectUri}&code=${code}`
        );
        if (!shortRes.body?.access_token) {
          throw new Error(shortRes.body?.error?.message || 'Token exchange failed');
        }
        const shortToken = shortRes.body.access_token;

        // Exchange → long-lived token
        const longRes = await httpGet(
          `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
        );
        const longToken = longRes.body?.access_token || shortToken;

        // Get identity
        const meRes = await httpGet(`https://graph.facebook.com/v18.0/me?access_token=${longToken}`);
        tokens        = { accessToken: longToken };
        displayConfig = { connectedName: meRes.body?.name, metaUserId: meRes.body?.id };
        break;
      }

      case 'google': {
        const clientId     = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri  = `${callbackBase}/api/integrations/oauth/google/callback`;

        const tokenRes = await httpPost('oauth2.googleapis.com', '/token', {
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        });

        if (!tokenRes.body?.access_token) {
          throw new Error(tokenRes.body?.error_description || 'Google token exchange failed');
        }

        // Get user info
        const userRes = await httpGet('https://www.googleapis.com/oauth2/v2/userinfo', {
          Authorization: `Bearer ${tokenRes.body.access_token}`,
        });

        tokens        = { accessToken: tokenRes.body.access_token, refreshToken: tokenRes.body.refresh_token };
        displayConfig = { connectedEmail: userRes.body?.email, connectedName: userRes.body?.name };
        break;
      }

      case 'google_sheets': {
        const clientId     = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        // Redirect URI must exactly match what was used in oauthInit
        const redirectUri  = `${callbackBase}/api/integrations/oauth/google_sheets/callback`;

        const tokenRes = await httpPost('oauth2.googleapis.com', '/token', {
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        });

        if (!tokenRes.body?.access_token) {
          throw new Error(tokenRes.body?.error_description || 'Google Sheets token exchange failed');
        }

        // Get user identity (openid + email + profile scopes)
        const userRes = await httpGet('https://www.googleapis.com/oauth2/v2/userinfo', {
          Authorization: `Bearer ${tokenRes.body.access_token}`,
        });

        // Log the exact scope Google returned — helps diagnose drive.file access issues
        console.log('[GSheets OAuth] granted scope:', tokenRes.body.scope);

        tokens = {
          accessToken:  tokenRes.body.access_token,
          refreshToken: tokenRes.body.refresh_token,
        };
        // Store token expiry + granted scope in config (not credentials) — not sensitive
        displayConfig = {
          connectedEmail:  userRes.body?.email,
          connectedName:   userRes.body?.name,
          tokenExpiresAt:  Date.now() + (tokenRes.body.expires_in || 3600) * 1000,
          grantedScope:    tokenRes.body.scope || '',   // e.g. "openid email profile https://www.googleapis.com/auth/drive.file"
        };
        break;
      }

      default:
        throw new Error(`No callback handler for provider: ${provider}`);
    }

    // Encrypt and save
    const encryptedCreds = encryptCreds(provider, tokens);
    await Integration.findOneAndUpdate(
      { _id: existing._id },
      {
        $set: {
          credentials:    encryptedCreds,
          config:         { ...existing.config, ...displayConfig },
          status:         'connected',
          connectedAt:    new Date(),
          disconnectedAt: null,
          oauthState:     null,
        },
      }
    );

    res.redirect(closeUrl('success'));
  } catch (e) {
    await Integration.findOneAndUpdate(
      { oauthState: state },
      { $set: { oauthState: null, status: 'failed' } }
    );
    res.redirect(closeUrl('error', `&reason=${encodeURIComponent(e.message)}`));
  }
};
