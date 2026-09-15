/**
 * gsheetWebhookController.js
 *
 * Receives lead rows sent by a Google Apps Script from a Google Sheet.
 *
 * Normal sync  — POST /api/gsheet-webhook?workspaceId=<tenantId>
 *   Creates new leads. Existing externalLeadId → counted as duplicate, skipped.
 *
 * Backfill     — POST /api/gsheet-webhook?workspaceId=<tenantId>&update=true
 *   Updates customFields on EXISTING leads only. Never creates new documents.
 *   Safe to run multiple times (idempotent).
 *
 * Security:   HMAC-SHA256 signature in x-gsheet-signature header (both modes).
 * Dedup:      tenantId + externalLeadId compound lookup.
 * Isolation:  Each workspace uses its own Integration record and encrypted secret.
 */

const crypto      = require('crypto');
const Lead        = require('../models/Lead');
const Integration = require('../models/Integration');
const { decrypt } = require('../utils/encryption');

// ── HMAC verification ──────────────────────────────────────────────────────────
function verifyHmac(secret, rawBody, signature) {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected,  'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Valid source values accepted by Lead model ─────────────────────────────────
const VALID_SOURCES = new Set([
  'website', 'referral', 'social_media', 'cold_call', 'email', 'event',
  'meta_ads', 'lead_form', 'facebook_ads', 'instagram_ads', 'whatsapp',
  'google_ads', 'landing_page', 'import', 'api', 'webhook', 'manual', 'other',
]);

const SOURCE_ALIASES = {
  facebook:    'facebook_ads',
  instagram:   'instagram_ads',
  google:      'google_ads',
  fb:          'facebook_ads',
  ig:          'instagram_ads',
  sheet:       'import',
  spreadsheet: 'import',
  gsheet:      'import',
};

function normaliseSource(raw) {
  if (!raw) return 'other';
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_SOURCES.has(s)) return s;
  if (SOURCE_ALIASES[s])    return SOURCE_ALIASES[s];
  return 'other';
}

// ── Keys that should NEVER be stored in customFields (security) ────────────────
// These should never arrive in a row payload, but we guard here defensively.
const CF_BLOCKED_KEYS = new Set([
  'webhookSecret', 'webhook_secret', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token', 'apiKey', 'api_key',
  'secret', 'token', 'password', 'credentials', 'iv', 'tag', 'encrypted',
]);

// ── Main handler ───────────────────────────────────────────────────────────────
exports.receiveLeads = async (req, res) => {
  try {
    const { workspaceId } = req.query;
    const isBackfill = req.query.update === 'true';

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

    // ── 3. Verify HMAC signature (same for normal sync and backfill) ──
    const signature = req.headers['x-gsheet-signature'] || '';
    const rawBody   = req.rawBody || JSON.stringify(req.body);

    if (!verifyHmac(secret, rawBody, signature)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    // ── 4. Process rows ──
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    const results = { created: 0, duplicates: 0, errors: 0, updated: 0, notFound: 0 };

    for (const row of rows) {
      try {
        const externalLeadId = String(row.lead_id || row.leadId || '').trim();
        const name           = String(row.name     || '').trim();

        if (!externalLeadId || !name) {
          results.errors++;
          continue;
        }

        // ── Build customFields: everything in row.customFields, minus blocked keys ──
        const rawCF = (row.customFields && typeof row.customFields === 'object')
          ? row.customFields
          : {};
        const customFields = {};
        for (const [k, v] of Object.entries(rawCF)) {
          if (CF_BLOCKED_KEYS.has(k)) continue;         // drop security keys defensively
          if (v === null || v === undefined) continue;   // drop nulls
          customFields[k] = v;
        }

        // ── BACKFILL MODE: update customFields on existing leads only ──────────
        if (isBackfill) {
          const updated = await Lead.findOneAndUpdate(
            { tenantId: workspaceId, externalLeadId },
            { $set: { customFields } },
            { new: false, upsert: false }   // never create; never touch other fields
          );
          if (updated) results.updated++;
          else         results.notFound++;
          continue;
        }

        // ── NORMAL SYNC: duplicate check then create ───────────────────────────
        const exists = await Lead.exists({ tenantId: workspaceId, externalLeadId });
        if (exists) {
          results.duplicates++;
          continue;
        }

        // Extract campaign name from customFields for backward-compat tags
        const campaignName = String(customFields.campaign_name || '').trim();

        await Lead.create({
          externalLeadId,
          externalSource: 'google_sheet',
          name,
          phone:  String(row.phone  || '').trim(),
          email:  String(row.email  || '').trim(),
          source: normaliseSource(row.source),
          status: 'new_lead',
          tenantId: workspaceId,
          // Keep campaign name in tags for backward compatibility with existing filters
          tags: campaignName ? [`campaign:${campaignName}`] : [],
          customFields,
        });

        results.created++;
      } catch (rowErr) {
        console.error('GSheet webhook row error:', rowErr.message);
        results.errors++;
      }
    }

    // ── 5. Update lastSync on the integration record ──
    // Mark failed only when nothing succeeded AND there were errors
    const productive = results.created + results.duplicates + results.updated + results.notFound;
    await Integration.findByIdAndUpdate(integration._id, {
      $set: {
        'syncSettings.lastSync':       new Date(),
        'syncSettings.lastSyncStatus': productive === 0 && results.errors > 0 ? 'failed' : 'success',
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
