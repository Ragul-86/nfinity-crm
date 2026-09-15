/**
 * gsheetWebhookController.js
 *
 * Receives lead rows sent by a Google Apps Script from a Google Sheet.
 *
 * Normal sync  — POST /api/gsheet-webhook?workspaceId=<tenantId>
 *   Creates new leads. Existing externalLeadId → counted as duplicate, skipped.
 *
 * Backfill     — POST /api/gsheet-webhook?workspaceId=<tenantId>&update=true
 *   Updates customFields + ad attribution on EXISTING leads only.
 *   Never creates new documents. Idempotent — safe to run multiple times.
 *
 * Security:   HMAC-SHA256 in x-gsheet-signature header (same for both modes).
 * Dedup:      tenantId + externalLeadId compound index.
 * Isolation:  Each workspace uses its own Integration record with its own encrypted secret.
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
const CF_BLOCKED_KEYS = new Set([
  'webhookSecret', 'webhook_secret', 'accessToken', 'access_token',
  'refreshToken', 'refresh_token', 'apiKey', 'api_key',
  'secret', 'token', 'password', 'credentials', 'iv', 'tag', 'encrypted',
]);

// ── Extract Meta ad attribution from customFields to top-level ─────────────────
// These fields are promoted to indexed top-level schema fields for fast filtering.
// They remain in customFields too for backward compat and direct raw access.
function extractAttribution(customFields, rowSheetName) {
  const str = (v) => (v !== undefined && v !== null ? String(v).trim() : null) || null;
  return {
    adId:        str(customFields.ad_id),
    adName:      str(customFields.ad_name),
    adSetId:     str(customFields.adset_id),
    adSetName:   str(customFields.adset_name),
    campaignId:  str(customFields.campaign_id),
    campaignName:str(customFields.campaign_name),
    metaFormId:  str(customFields.form_id),
    metaFormName:str(customFields.form_name),
    sheetName:   str(rowSheetName),
  };
}

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

    // ── 3b. Optional spreadsheet binding check ──
    // If the Integration has a spreadsheetId configured, verify that the incoming
    // request comes from that exact spreadsheet (header sent by the universal Code.gs).
    // This adds defense-in-depth: even if the HMAC secret is somehow known by a
    // third party, requests from a different spreadsheet are rejected.
    //
    // Backward-compatible: only enforced when BOTH sides have the value.
    //   – Old Code.gs (no x-spreadsheet-id header): no validation, allowed.
    //   – New Code.gs + integration without spreadsheetId configured: no validation, allowed.
    //   – New Code.gs + spreadsheetId configured: must match exactly.
    const configuredSpreadsheetId = integration.config?.spreadsheetId;
    const incomingSpreadsheetId   = req.headers['x-spreadsheet-id'];
    if (configuredSpreadsheetId && incomingSpreadsheetId) {
      if (configuredSpreadsheetId !== incomingSpreadsheetId) {
        console.warn(
          `GSheet webhook: spreadsheet ID mismatch for tenant ${workspaceId}. ` +
          `Configured: ${configuredSpreadsheetId}, Received: ${incomingSpreadsheetId}`
        );
        return res.status(403).json({
          success: false,
          message: 'Spreadsheet not authorized for this workspace. ' +
                   'Run setupTrigger() on the correct spreadsheet, or update the integration config.',
        });
      }
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
          if (CF_BLOCKED_KEYS.has(k)) continue;
          if (v === null || v === undefined) continue;
          customFields[k] = v;
        }

        // ── Extract top-level attribution fields ──
        const attribution = extractAttribution(customFields, row.sheetName);

        // ── BACKFILL MODE: update existing leads only ──────────────────────────
        if (isBackfill) {
          // Build $set — only update fields that have real values
          const setFields = { customFields };
          for (const [k, v] of Object.entries(attribution)) {
            if (v !== null) setFields[k] = v;
          }

          const updated = await Lead.findOneAndUpdate(
            { tenantId: workspaceId, externalLeadId },
            { $set: setFields },
            { new: false, upsert: false }   // never create; never touch status/notes/etc.
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

        // Keep campaign name in tags for backward-compat with existing tag-based filters
        const campaignTag = attribution.campaignName || '';

        await Lead.create({
          externalLeadId,
          externalSource: 'google_sheet',
          name,
          phone:  String(row.phone  || '').trim(),
          email:  String(row.email  || '').trim(),
          source: normaliseSource(row.source),
          status: 'new_lead',
          tenantId: workspaceId,
          tags: campaignTag ? [`campaign:${campaignTag}`] : [],
          customFields,
          // Top-level attribution for indexing and filtering
          ...attribution,
        });

        results.created++;
      } catch (rowErr) {
        console.error('GSheet webhook row error:', rowErr.message);
        results.errors++;
      }
    }

    // ── 5. Update lastSync on the integration record ──
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
