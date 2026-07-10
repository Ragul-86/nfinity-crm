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
// GET /api/integrations/oauth/:provider/init
// Redirect browser to external OAuth provider's authorization page
// ─────────────────────────────────────────────────────────────────────────────
exports.oauthInit = async (req, res, next) => {
  try {
    const { provider } = req.params;
    const tenantId    = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context for OAuth', 403));

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
          category: provider === 'google' ? 'google' : 'marketing',
          name: provider === 'google' ? 'Google Workspace'
              : provider === 'whatsapp' ? 'WhatsApp Business'
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
      default:
        return next(err(`OAuth not supported for provider: ${provider}`));
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
