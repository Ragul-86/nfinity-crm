/**
 * gsheetWebhookController.js
 *
 * Receives lead rows sent by a Google Apps Script from a Google Sheet.
 * Endpoint: POST /api/gsheet-webhook?workspaceId=<tenantId>
 *
 * Security:   HMAC-SHA256 signature in x-gsheet-signature header.
 * Dedup:      tenantId + externalLeadId compound lookup.
 * Isolation:  Each workspace has its own Integration record with its own secret.
 *             Leads are tagged with tenantId — no cross-workspace leakage.
 */

const crypto = require('crypto');
const Lead        = require('../models/Lead');
const Integration = require('../models/Integration');
const { decrypt } = require('../utils/encryption');

// ── HMAC verification ─────────────────────────────────────────────────────────
function verifyHmac(secret, rawBody, signature) {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    // Both buffers must be the same length for timingSafeEqual
    const a = Buffer.from(signature,  'hex');
    const b = Buffer.from(expected,   'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Valid source values accepted by Lead model ────────────────────────────────
const VALID_SOURCES = new Set([
  'website', 'referral', 'social_media', 'cold_call', 'email', 'event',
  'meta_ads', 'lead_form', 'facebook_ads', 'instagram_ads', 'whatsapp',
  'google_ads', 'landing_page', 'import', 'api', 'webhook', 'manual', 'other',
]);

const SOURCE_ALIASES = {
  facebook: 'facebook_ads',
  instagram: 'instagram_ads',
  google: 'google_ads',
  fb: 'facebook_ads',
  ig: 'instagram_ads',
  sheet: 'import',
  spreadsheet: 'import',
  gsheet: 'import',
};

function normaliseSource(raw) {
  if (!raw) return 'other';
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_SOURCES.has(s)) return s;
  if (SOURCE_ALIASES[s])    return SOURCE_ALIASES[s];
  return 'other';
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.receiveLeads = async (req, res) => {
  try {
  const { workspaceId } = req.query;

  if (!workspaceId) {
    return res.status(400).json({ success: false, message: 'Missing workspaceId query param' });
  }

  // ── 1. Load this workspace's Google Sheet integration ──
  const integration = await Integration.findOne({
    tenantId: workspaceId,
    provider: 'google_sheet',
    status:   'connected',
  }).lean();

  if (!integration) {
    return res.status(404).json({
      success: false,
      message: 'Google Sheet integration not found or not connected for this workspace',
    });
  }

  // ── 2. Decrypt the stored webhook secret ──
  const encryptedSecret = integration.credentials?.webhookSecret;
  const secret = encryptedSecret ? decrypt(encryptedSecret) : null;

  if (!secret) {
    return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
  }

  // ── 3. Verify HMAC signature ──
  const signature = req.headers['x-gsheet-signature'] || '';
  const rawBody   = req.rawBody || JSON.stringify(req.body);

  if (!verifyHmac(secret, rawBody, signature)) {
    return res.status(401).json({ success: false, message: 'Invalid signature' });
  }

  // ── 4. Process rows (array or single object) ──
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const results = { created: 0, duplicates: 0, errors: 0 };

  for (const row of rows) {
    try {
      const externalLeadId = String(row.lead_id || row.leadId || '').trim();
      const name           = String(row.name     || '').trim();

      if (!externalLeadId || !name) {
        results.errors++;
        continue;
      }

      // ── Duplicate check — scoped to this workspace ──
      const exists = await Lead.exists({ tenantId: workspaceId, externalLeadId });
      if (exists) {
        results.duplicates++;
        continue;
      }

      // ── Create lead using existing Lead model ──
      await Lead.create({
        externalLeadId,
        externalSource: 'google_sheet',
        name,
        phone:  String(row.phone  || '').trim(),
        email:  String(row.email  || '').trim(),
        source: normaliseSource(row.source),
        status: 'new_lead',
        tenantId: workspaceId,
        // campaign name stored in tags for reference (no campaign ObjectId lookup)
        tags: row.campaign ? [`campaign:${String(row.campaign).trim()}`] : [],
      });

      results.created++;
    } catch (rowErr) {
      console.error('GSheet webhook row error:', rowErr.message);
      results.errors++;
    }
  }

  // ── 5. Update lastSync on the integration record ──
  await Integration.findByIdAndUpdate(integration._id, {
    $set: {
      'syncSettings.lastSync':       new Date(),
      'syncSettings.lastSyncStatus': results.created === 0 && results.errors > 0 ? 'failed' : 'success',
      'syncSettings.lastSyncError':  results.errors > 0
        ? `${results.errors} row(s) could not be processed`
        : null,
      'config.lastSyncResults': results,
    },
  });

  return res.json({ success: true, ...results });
  } catch (e) {
    console.error('GSheet webhook fatal error:', e.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
