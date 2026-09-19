const crypto = require('crypto');
const https  = require('https');
const Integration = require('../models/Integration');
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
};
const GSHEET_ID_HEADERS = new Set(['id', 'lead id', 'lead_id', 'external id', 'external_id']);
const normalizeHeader = (h) => String(h).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

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
// The access_token is scoped to drive.file only — deliberately limited.
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
// Body: { spreadsheetId }
// ─────────────────────────────────────────────────────────────────────────────
exports.verifySheetAccess = async (req, res, next) => {
  try {
    // ── DIAGNOSTIC: entry point ───────────────────────────────────────────────
    console.log('[GSheets Verify] req.user:', JSON.stringify({
      _id:      req.user?._id,
      email:    req.user?.email,
      role:     req.user?.role,
      tenantId: req.user?.tenantId,
      isActive: req.user?.isActive,
    }));
    console.log('[GSheets Verify] tenantId:', req.user?.tenantId);
    console.log('[GSheets Verify] body:', req.body);

    const tf = getTenantFilter(req);
    const { spreadsheetId } = req.body || {};

    if (!spreadsheetId) {
      console.log('[GSheets Verify] → 400: spreadsheetId missing from body');
      return next(err('spreadsheetId is required'));
    }

    // ── DIAGNOSTIC: before DB lookup ─────────────────────────────────────────
    console.log('[GSheets Verify] searching integration:', {
      tenantId: req.user?.tenantId,
      provider: 'google_sheets',
    });

    const integration = await Integration.findOne({ ...tf, provider: 'google_sheets' });

    // ── DIAGNOSTIC: after DB lookup ───────────────────────────────────────────
    console.log('[GSheets Verify] integration found:', !!integration);

    if (!integration) {
      console.log('[GSheets Verify] → 404: integration document not found in DB (tenantId/provider mismatch or not created)');
      return next(err('Google Sheets is not connected', 404));
    }

    // ── DIAGNOSTIC: safe metadata ─────────────────────────────────────────────
    console.log('[GSheets Verify] integration metadata:', {
      id:              integration._id,
      tenantId:        integration.tenantId,
      provider:        integration.provider,
      status:          integration.status,
      hasCredentials:  !!integration.credentials && Object.keys(integration.credentials).length > 0,
      hasAccessToken:  !!(integration.credentials?.accessToken),
      hasRefreshToken: !!(integration.credentials?.refreshToken),
      configKeys:      Object.keys(integration.config || {}),
    });

    let accessToken;
    try {
      accessToken = await getOrRefreshToken(integration, tf);
      console.log('[GSheets Verify] token obtained:', { hasToken: !!accessToken });
    } catch (tokenErr) {
      console.error('[GSheets Verify] token error:', tokenErr.message);
      return next(Object.assign(new Error(tokenErr.message), { statusCode: 401 }));
    }

    // ── Step 1: Verify file access via Drive API ──────────────────────────────
    // drive.file scope reliably works with Drive API for Picker-selected files.
    // Calling Drive API first also "registers" the file so Sheets API can access it.
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=name,mimeType`;
    console.log('[GSheets Verify] Drive API call:', driveUrl.replace(/Bearer .+/, 'Bearer [REDACTED]'));
    const driveRes = await httpGet(driveUrl, { Authorization: `Bearer ${accessToken}` });
    console.log('[GSheets Verify] Drive API status:', driveRes.status, '| body:', JSON.stringify(driveRes.body).slice(0, 300));

    if (driveRes.status === 401) {
      console.log('[GSheets Verify] → 401: Drive API says token is invalid/expired');
      return next(Object.assign(new Error('Authorization expired. Please reconnect Google Sheets.'), { statusCode: 401 }));
    }
    if (driveRes.status === 403) {
      console.log('[GSheets Verify] → 403: Drive API denied access. Body:', JSON.stringify(driveRes.body));
      return next(err('Access denied to this file. Please reconnect Google Sheets and re-select the file.', 403));
    }
    if (driveRes.status === 404) {
      console.log('[GSheets Verify] → 404: Drive API says file not found. Picker may have returned wrong ID. Body:', JSON.stringify(driveRes.body));
      return next(err('Spreadsheet not found or access was not granted by the Picker. Please select the file again.', 404));
    }
    if (driveRes.status !== 200) {
      const detail = driveRes.body?.error?.message || `Drive API error (HTTP ${driveRes.status})`;
      console.log('[GSheets Verify] → 502: Drive API unexpected status', driveRes.status, detail);
      return next(err(detail, 502));
    }

    const fileName = driveRes.body.name || 'Untitled Spreadsheet';

    // ── Step 2: Get sheet tab names via Sheets API ────────────────────────────
    // After the Drive API call, the Sheets API should recognise the file under drive.file scope.
    const sheetsPath = `/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`;
    const sheetsRes  = await callSheetsApi(accessToken, sheetsPath);
    console.log('[GSheets Verify] Sheets API status:', sheetsRes.status, '| body:', JSON.stringify(sheetsRes.body).slice(0, 300));

    let availableSheets;
    if (sheetsRes.status === 200) {
      availableSheets = (sheetsRes.body.sheets || []).map(s => s.properties?.title).filter(Boolean);
    } else {
      // drive.file scope may not grant Sheets API access even after Drive API call.
      // Fall back to Sheet1 so the user can still complete the flow.
      console.warn('[GSheets Verify] Sheets API non-200 — falling back to Sheet1. Status:', sheetsRes.status, JSON.stringify(sheetsRes.body).slice(0, 200));
      availableSheets = ['Sheet1'];
    }

    if (!availableSheets.length) availableSheets = ['Sheet1'];

    console.log('[GSheets Verify] → 200 success. fileName:', fileName, '| sheets:', availableSheets);
    res.json({ success: true, spreadsheetId, fileName, availableSheets });
  } catch (e) {
    console.error('[GSheets Verify] unexpected error:', e.message, e.stack?.split('\n')[1]);
    next(e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/integrations/google_sheets/config
// Save the spreadsheetId + sheetName chosen by the user after Picker + tab selection.
// Body: { spreadsheetId, sheetName, selectedFileName }
// ─────────────────────────────────────────────────────────────────────────────
exports.saveSheetConfig = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { spreadsheetId, sheetName, selectedFileName } = req.body || {};
    if (!spreadsheetId) return next(err('spreadsheetId is required'));
    if (!sheetName)     return next(err('sheetName is required'));

    const doc = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    if (!doc) return next(err('Google Sheets is not connected', 404));

    const updated = await Integration.findOneAndUpdate(
      { ...tf, provider: 'google_sheets' },
      {
        $set: {
          'config.spreadsheetId':    String(spreadsheetId).trim(),
          'config.sheetName':        String(sheetName).trim(),
          'config.selectedFileName': selectedFileName ? String(selectedFileName).trim() : '',
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
      details:     { spreadsheetId, sheetName, selectedFileName },
      req,
    });

    res.json({ success: true, data: toClient(updated), message: 'Sheet configuration saved' });
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
  try {
    const tf  = getTenantFilter(req);
    const doc = await Integration.findOne({ ...tf, provider: 'google_sheets' });
    if (!doc)                      return next(err('Google Sheets is not connected', 404));
    if (doc.status !== 'connected' && doc.status !== 'sync_error')
      return next(err('Google Sheets is not connected. Please connect first.', 400));

    const { spreadsheetId, sheetName } = doc.config || {};
    if (!spreadsheetId) return next(err('No spreadsheet configured. Please select a Google Sheet first.', 400));
    if (!sheetName)     return next(err('No sheet tab configured. Please select a sheet tab first.', 400));

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

    // Fetch up to 1000 rows (A1:Z1000) — sufficient for most sheets
    const range    = encodeURIComponent(`${sheetName}!A1:Z1000`);
    const sheetsRes = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}/values/${range}`);

    if (sheetsRes.status === 401) {
      await Integration.findOneAndUpdate(
        { ...tf, provider: 'google_sheets' },
        { $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': 'Authorization expired' } }
      );
      return next(err('Google authorization expired. Please reconnect.', 401));
    }
    if (sheetsRes.status !== 200) {
      const errMsg = sheetsRes.body?.error?.message || `Sheets API error (HTTP ${sheetsRes.status})`;
      await Integration.findOneAndUpdate(
        { ...tf, provider: 'google_sheets' },
        { $set: { status: 'sync_error', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': errMsg } }
      );
      return next(err(errMsg, 502));
    }

    const rows = sheetsRes.body.values || [];
    if (rows.length < 2) {
      const now = new Date();
      await Integration.findOneAndUpdate(
        { ...tf, provider: 'google_sheets' },
        { $set: { 'syncSettings.lastSync': now, 'syncSettings.lastSyncStatus': 'success', 'syncSettings.lastSyncError': null } }
      );
      return res.json({ success: true, created: 0, skipped: 0, linked: 0, errors: [], message: 'No data rows found in the sheet.' });
    }

    // Parse headers and build column-index map
    const headers = rows[0].map(normalizeHeader);
    const fieldMap = {}; // { leadField: colIndex } — first matching header wins
    let idColIndex  = -1;

    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (GSHEET_ID_HEADERS.has(h)) {
        if (idColIndex === -1) idColIndex = c; // first ID column wins
      } else if (GSHEET_HEADER_MAP[h] && fieldMap[GSHEET_HEADER_MAP[h]] === undefined) {
        fieldMap[GSHEET_HEADER_MAP[h]] = c;
      }
    }

    if (fieldMap.name === undefined) {
      return next(err('Sheet must have a "Name" column. Please check the header row.', 400));
    }

    const Lead = require('../models/Lead');
    let created = 0, skipped = 0, linked = 0;
    const errors = [];

    for (let i = 1; i < rows.length; i++) {
      const row      = rows[i];
      const rowIndex = i + 1; // 1-based; row 1 = header, row 2 = first data row

      try {
        const getVal = (field) => {
          const idx = fieldMap[field];
          return idx !== undefined ? String(row[idx] || '').trim() : '';
        };

        const name = getVal('name');
        if (!name) continue; // Skip rows without a name

        const phone          = getVal('phone');
        const email          = getVal('email');
        const company        = getVal('company');
        const city           = getVal('city');
        const state          = getVal('state');
        const country        = getVal('country');
        const industry       = getVal('industry');
        const website        = getVal('website');
        const brandName      = getVal('brandName');
        const serviceRequired = getVal('serviceRequired');
        const budgetRaw      = getVal('budget');
        const budget         = budgetRaw ? (parseFloat(budgetRaw.replace(/[^0-9.]/g, '')) || 0) : 0;

        // Unmapped columns → customFields (for reference; not indexed)
        const mappedColIndices = new Set([idColIndex, ...Object.values(fieldMap)].filter(n => n !== -1));
        const customFields = {};
        for (let c = 0; c < headers.length; c++) {
          if (!mappedColIndices.has(c) && headers[c] && row[c]) {
            customFields[headers[c]] = String(row[c]).trim();
          }
        }

        // ── Deterministic external key ──────────────────────────────────────
        const idColVal      = idColIndex !== -1 ? String(row[idColIndex] || '').trim() : '';
        const externalLeadId = idColVal
          ? `gsheets:${spreadsheetId}:${sheetName}:ID${idColVal}`
          : `gsheets:${spreadsheetId}:${sheetName}:R${rowIndex}`;
        const externalSource = 'google_sheets';

        // Step 1 — Primary: exact source key match → skip
        const byKey = await Lead.findOne({ tenantId: tf.tenantId, externalLeadId, externalSource });
        if (byKey) { skipped++; continue; }

        // Step 2 — Secondary: phone match (separate query)
        if (phone) {
          const byPhone = await Lead.findOne({ tenantId: tf.tenantId, phone });
          if (byPhone) {
            // Link if not already linked to another google_sheets source key
            if (!byPhone.externalLeadId || byPhone.externalSource !== 'google_sheets') {
              await Lead.updateOne({ _id: byPhone._id }, { $set: { externalLeadId, externalSource } });
            }
            linked++; continue;
          }
        }

        // Step 3 — Tertiary: email match (separate query)
        if (email) {
          const byEmail = await Lead.findOne({ tenantId: tf.tenantId, email });
          if (byEmail) {
            if (!byEmail.externalLeadId || byEmail.externalSource !== 'google_sheets') {
              await Lead.updateOne({ _id: byEmail._id }, { $set: { externalLeadId, externalSource } });
            }
            linked++; continue;
          }
        }

        // Step 4 — Create new lead
        await Lead.create({
          name, phone, email, company, city, state, country, industry,
          website, brandName, serviceRequired, budget,
          customFields,
          externalLeadId,
          externalSource,
          source:    'import',
          sheetName,
          tenantId:  tf.tenantId,
          createdBy: req.user._id,
        });
        created++;

      } catch (rowErr) {
        errors.push({ row: rowIndex, reason: rowErr.message });
      }
    }

    // Persist sync result
    const now = new Date();
    const syncErrMsg = errors.length ? `${errors.length} row(s) failed — check errors` : null;
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
      details:     { spreadsheetId, sheetName, created, skipped, linked, errors: errors.length },
      req,
    });

    const message = `Sync complete — ${created} new, ${skipped} skipped, ${linked} linked` +
      (errors.length ? `, ${errors.length} error(s)` : '');

    res.json({ success: true, created, skipped, linked, errors, message });
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
        // Minimal scopes: identity for connectedEmail/Name + drive.file for Picker-selected files only.
        // drive.file grants access ONLY to files the user explicitly opens via Google Picker.
        const scope = encodeURIComponent([
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/drive.file',
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

        tokens = {
          accessToken:  tokenRes.body.access_token,
          refreshToken: tokenRes.body.refresh_token,
        };
        // Store token expiry in config (not credentials) — not sensitive
        displayConfig = {
          connectedEmail:  userRes.body?.email,
          connectedName:   userRes.body?.name,
          tokenExpiresAt:  Date.now() + (tokenRes.body.expires_in || 3600) * 1000,
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
