/**
 * internalSyncController.js
 *
 * Called by an external cron (Render Cron Job, GitHub Actions, etc.) to
 * automatically sync ALL connected Google Sheets integrations across all tenants.
 *
 * Authentication: Bearer token in Authorization header must match
 * process.env.INTERNAL_SYNC_SECRET.
 *
 * POST /api/internal/google-sheets/sync-all
 */

'use strict';

const https      = require('https');
const Integration     = require('../models/Integration');
const Lead            = require('../models/Lead');
const DeletedLeadSource = require('../models/DeletedLeadSource');
const Pipeline        = require('../models/Pipeline');
const PipelineMapping = require('../models/PipelineMapping');
const { decryptFields, encryptFields } = require('../utils/encryption');
const { createDriveWatch, stopDriveWatch } = require('../utils/driveWatch');
const { isValidPhone, resolvePhone } = require('../utils/phoneUtils');

// ─── Sensitive fields for google_sheets provider ──────────────────────────────
const GS_SENSITIVE = ['accessToken', 'refreshToken'];

// ─── Diagnostic logging ───────────────────────────────────────────────────────
// Set GSHEETS_SYNC_DEBUG=true in the environment to enable per-row tombstone
// and dedup tracing. Safe: does NOT log tokens, secrets, names, phones, or emails.
// Disable (default) in production unless actively debugging the sync.
const DEBUG_SYNC = process.env.GSHEETS_SYNC_DEBUG === 'true';
function syncDiag(...args) {
  if (DEBUG_SYNC) console.log('[SyncDiag][auto]', ...args);
}

function decryptCreds(stored) {
  if (!stored || !Object.keys(stored).length) return {};
  return decryptFields(stored, GS_SENSITIVE);
}
function encryptCreds(raw) {
  if (!raw || !Object.keys(raw).length) return {};
  return encryptFields(raw, GS_SENSITIVE);
}

// ─── Minimal HTTPS helpers ────────────────────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function httpPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const options = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

function callSheetsApi(accessToken, path) {
  return httpGet(`https://sheets.googleapis.com/v4${path}`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

async function refreshGoogleToken(refreshToken) {
  const res = await httpPost('oauth2.googleapis.com', '/token', {
    grant_type:    'refresh_token',
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  return res.body;
}

async function getOrRefreshToken(doc, tenantId) {
  const creds = decryptCreds(doc.credentials);
  if (!creds.accessToken) throw new Error('No access token — integration needs reconnection');

  const expiresAt = doc.config?.tokenExpiresAt || 0;
  if (Date.now() < expiresAt - 60_000) return creds.accessToken;

  if (!creds.refreshToken) throw new Error('No refresh token — integration needs reconnection');

  const refreshed = await refreshGoogleToken(creds.refreshToken);
  if (!refreshed.access_token) {
    const reason = refreshed.error_description || refreshed.error || 'Token refresh failed';
    throw new Error(`Session expired: ${reason}`);
  }

  const newToken  = refreshed.access_token;
  const newExpiry = Date.now() + (refreshed.expires_in || 3600) * 1000;
  const newCreds  = encryptCreds({ ...creds, accessToken: newToken });

  await Integration.findOneAndUpdate(
    { tenantId, provider: 'google_sheets' },
    { $set: { credentials: newCreds, 'config.tokenExpiresAt': newExpiry, status: 'connected' } }
  );
  return newToken;
}

// ─── Header / column helpers ─────────────────────────────────────────────────
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
  'platform': 'source',
};
const GSHEET_ID_HEADERS = new Set(['id', 'lead id', 'lead_id', 'external id', 'external_id']);
const normalizeHeader = (h) => String(h).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

const _VALID_SOURCES = new Set([
  'website', 'referral', 'social_media', 'cold_call', 'email', 'event',
  'meta_ads', 'lead_form', 'facebook_ads', 'instagram_ads', 'whatsapp',
  'google_ads', 'landing_page', 'import', 'api', 'webhook', 'manual', 'other',
]);
const _SOURCE_ALIASES = {
  facebook: 'facebook_ads', instagram: 'instagram_ads', google: 'google_ads',
  fb: 'facebook_ads', ig: 'instagram_ads', sheet: 'import', spreadsheet: 'import', gsheet: 'import',
};
function normaliseSrc(raw) {
  if (!raw) return 'import';
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (_VALID_SOURCES.has(s)) return s;
  if (_SOURCE_ALIASES[s])    return _SOURCE_ALIASES[s];
  return 'other';
}

async function resolvePipeline(tenantId, { adId, metaFormId, spreadsheetId, sheetName, source }) {
  try {
    const tiers = [
      adId                           ? { adId }                               : null,
      metaFormId                     ? { metaFormId }                         : null,
      // Tier 3 (new): per-spreadsheet per-tab — more specific than sheetName alone
      (spreadsheetId && sheetName)   ? { spreadsheetId, sheetName }           : null,
      sheetName                      ? { sheetName }                          : null,
      source                         ? { source }                             : null,
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
  } catch {
    return { pipelineId: null, stageId: null };
  }
}

// ─── Core: sync one tab from a spreadsheet for a given tenant ────────────────
async function syncTab(accessToken, tenantId, spreadsheetId, tabName) {
  // Passing only the sheet name as the range returns ALL rows that contain data.
  // No row cap — Google Sheets API handles up to 10M cells per request.
  const range    = encodeURIComponent(tabName);
  const response = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}/values/${range}`);

  if (response.status === 401) return { status: 'auth_expired', created: 0, skipped: 0, deletedSourceSkipped: 0, blankRows: 0, errors: [] };
  if (response.status !== 200) {
    const msg = response.body?.error?.message || `HTTP ${response.status}`;
    return { status: 'error', error: msg, created: 0, skipped: 0, deletedSourceSkipped: 0, blankRows: 0, errors: [{ tab: tabName, reason: msg }] };
  }

  const rows = response.body.values || [];
  if (rows.length < 2) return { status: 'ok', created: 0, skipped: 0, deletedSourceSkipped: 0, blankRows: 0, errors: [] };

  const originalHeaders = rows[0];
  const headers         = rows[0].map(normalizeHeader);
  const fieldMap        = {};
  let idColIndex        = -1;
  let whatsappColIndex  = -1; // fallback phone source when phone_number column is invalid

  for (let c = 0; c < headers.length; c++) {
    const h = headers[c];
    if (GSHEET_ID_HEADERS.has(h)) {
      if (idColIndex === -1) idColIndex = c;
    } else if (h === 'whatsapp number') {
      // Track whatsapp_number as a phone fallback but do NOT add it to fieldMap —
      // that would prevent phone_number (which comes after it) from being mapped.
      if (whatsappColIndex === -1) whatsappColIndex = c;
    } else if (GSHEET_HEADER_MAP[h] && fieldMap[GSHEET_HEADER_MAP[h]] === undefined) {
      fieldMap[GSHEET_HEADER_MAP[h]] = c;
    }
  }

  // Track whether the tab has a dedicated Name column so we can generate fallback names.
  // We no longer skip tabs that lack a Name column — every non-blank row gets imported.
  const hasNameCol = fieldMap.name !== undefined; // eslint-disable-line no-unused-vars

  let created = 0, skipped = 0, deletedSourceSkipped = 0, blankRows = 0;
  const errors = [];

  syncDiag(`START tab="${tabName}" sheet="${spreadsheetId}" dataRows=${rows.length - 1}`);

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const rowIndex = i + 1;

    try {
      const getVal = (field) => {
        const idx = fieldMap[field];
        return idx !== undefined ? String(row[idx] || '').trim() : '';
      };

      // ── Blank row: skip rows where every cell is empty / whitespace ─────────
      const isBlankRow = row.every(cell => !String(cell || '').trim());
      if (isBlankRow) { blankRows++; continue; }

      // ── Resolve phone first so it is available for the name fallback ─────────
      // Resolve phone: use phone_number column if it contains ≥7 digits;
      // fall back to whatsapp_number column if available and valid;
      // otherwise '' — falsy, so no DB phone-match query runs.
      const phoneRaw        = getVal('phone');
      const waRaw           = whatsappColIndex !== -1 ? String(row[whatsappColIndex] || '').trim() : '';
      const phone           = resolvePhone(phoneRaw, waRaw);
      const email           = getVal('email');

      // ── Name: use column value, or generate a fallback for anonymous rows ────
      // Never skip a non-blank row just because the name field is missing.
      // Priority: name column → email prefix → resolved phone → row-position label.
      const nameRaw = getVal('name');
      const name    = nameRaw
        || (email ? email.split('@')[0] : '')
        || phone
        || `Unknown (Row ${rowIndex})`;
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

      // Unmapped columns → customFields
      const mappedColIndices = new Set([idColIndex, ...Object.values(fieldMap)].filter(n => n !== -1));
      const customFields = {};
      for (let c = 0; c < headers.length; c++) {
        if (!mappedColIndices.has(c) && originalHeaders[c] && row[c]) {
          customFields[String(originalHeaders[c]).trim().toLowerCase()] = String(row[c]).trim();
        }
      }
      // phone_number is a mapped column so it is excluded from the loop above.
      // When the raw value was non-empty but invalid (e.g. 'female', 'male', 'p:'),
      // preserve it in customFields so operators can see what the original cell contained.
      if (phoneRaw && !isValidPhone(phoneRaw)) {
        customFields['phone_number'] = phoneRaw;
      }

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
        sheetName:    tabName,
        spreadsheetId,
      };

      const idColVal       = idColIndex !== -1 ? String(row[idColIndex] || '').trim() : '';
      const externalLeadId = idColVal || `gsheets:${tabName}:R${rowIndex}`;
      const externalSource = 'google_sheets';

      const source = normaliseSrc(getVal('source'));

      // Step 1: exact key dedup — scoped to this spreadsheet.
      // Legacy fallback: leads imported before spreadsheetId tracking (spreadsheetId null/'') are
      // still matched by externalLeadId alone, preventing re-import of pre-existing records.
      const byKey = await Lead.findOne({
        tenantId,
        externalLeadId,
        externalSource,
        $or: [{ spreadsheetId }, { spreadsheetId: { $in: [null, ''] } }],
      });
      if (byKey) { skipped++; continue; }

      // Step 1b: tombstone check — STRICT: only tombstones for this exact spreadsheet.
      // We intentionally do NOT use a legacy fallback ($in:[null,'']) here.
      // Tombstones with spreadsheetId:'' were created from leads imported before spreadsheetId
      // tracking was added; their origin spreadsheet is unknown and they must not block rows
      // from a new, identified spreadsheet. If the same sheet is reconnected with its real ID,
      // tombstones created by the current code (which always stores the real spreadsheetId) will
      // correctly prevent re-import.
      const tombstone = await DeletedLeadSource.findOne({
        tenantId,
        externalSource,
        externalLeadId,
        spreadsheetId,
      });
      if (tombstone) {
        syncDiag(`TOMBSTONE BLOCKED tab="${tabName}" sheet="${spreadsheetId}" R=${rowIndex} key="${externalLeadId}" tombstoneSheet="${tombstone.spreadsheetId}"`);
        deletedSourceSkipped++; continue;
      }

      // Step 2: pipeline resolution
      // NOTE: Phone/email matching was intentionally removed.
      // Business requirement: every distinct valid source row must become its own CRM lead,
      // even if another lead shares the same phone or email.
      // Row identity is guaranteed by externalLeadId (Steps 1 + 1b above).
      const { pipelineId, stageId } = await resolvePipeline(tenantId, {
        adId:          attribution.adId,
        metaFormId:    attribution.metaFormId,
        spreadsheetId: spreadsheetId,   // enables per-spreadsheet-per-tab mapping
        sheetName:     tabName,
        source,
      });

      // Step 5: create
      await Lead.create({
        name, phone, email, company, city, state, country, industry,
        website, brandName, serviceRequired, budget,
        customFields,
        externalLeadId,
        externalSource,
        source,
        sheetName:    tabName,
        spreadsheetId,
        tags: attribution.campaignName ? [`campaign:${attribution.campaignName}`] : [],
        tenantId,
        createdBy: null, // scheduler — no logged-in user
        ...attribution,
        ...(pipelineId ? { pipelineId, stageId } : {}),
      });
      created++;

    } catch (rowErr) {
      errors.push({ tab: tabName, row: rowIndex, reason: rowErr.message });
    }
  }

  syncDiag(`DONE  tab="${tabName}" sheet="${spreadsheetId}" created=${created} skipped=${skipped} tombstoneBlocked=${deletedSourceSkipped} blank=${blankRows}`);
  return { status: 'ok', created, skipped, deletedSourceSkipped, blankRows, errors };
}

// ─── Core: sync one integration doc (all or one specific spreadsheet) ─────────
// @param {object} doc                — Integration document (lean or hydrated)
// @param {string|null} targetSpreadsheetId — When provided, only sync this spreadsheet.
//                                             When null/undefined, sync all configured sheets.
async function syncIntegrationDoc(doc, targetSpreadsheetId = null) {
  const tenantId = doc.tenantId;
  const result   = { tenantId, integrationId: doc._id, spreadsheets: [], totalCreated: 0, totalSkipped: 0, totalDeletedSourceSkipped: 0, totalBlankRows: 0, errors: [] };

  let accessToken;
  try {
    accessToken = await getOrRefreshToken(doc, tenantId);
  } catch (tokenErr) {
    await Integration.findByIdAndUpdate(doc._id, {
      $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': tokenErr.message },
    }).catch(() => {});
    result.errors.push({ reason: `Token error: ${tokenErr.message}` });
    return result;
  }

  // Determine which spreadsheets to sync
  const allConfigSheets = Array.isArray(doc.config?.spreadsheets) && doc.config.spreadsheets.length > 0
    ? doc.config.spreadsheets
    : doc.config?.spreadsheetId
      ? [{ spreadsheetId: doc.config.spreadsheetId, syncMode: doc.config.syncMode || 'single', sheetName: doc.config.sheetName || '' }]
      : [];

  // Filter to target sheet if specified (Drive Watch notification path)
  const configSheets = targetSpreadsheetId
    ? allConfigSheets.filter(s => s.spreadsheetId === targetSpreadsheetId)
    : allConfigSheets;

  if (!configSheets.length) {
    result.errors.push({ reason: targetSpreadsheetId ? `Spreadsheet ${targetSpreadsheetId} not in config` : 'No spreadsheets configured' });
    return result;
  }

  for (const sheetCfg of configSheets) {
    const { spreadsheetId, syncMode, sheetName } = sheetCfg;
    if (!spreadsheetId) continue;

    const sheetResult = { spreadsheetId, created: 0, skipped: 0, deletedSourceSkipped: 0, blankRows: 0, errors: [] };

    // Determine which tabs to process
    let tabsToSync = [];
    if (syncMode === 'all') {
      const metaRes = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
      if (metaRes.status === 401) {
        // Auth expired — stop processing this integration
        await Integration.findByIdAndUpdate(doc._id, {
          $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': 'Authorization expired' },
        }).catch(() => {});
        result.errors.push({ spreadsheetId, reason: 'Authorization expired during metadata fetch' });
        result.spreadsheets.push(sheetResult);
        break; // skip remaining spreadsheets for this tenant
      }
      if (metaRes.status !== 200) {
        const msg = metaRes.body?.error?.message || `HTTP ${metaRes.status}`;
        sheetResult.errors.push({ reason: `Metadata fetch failed: ${msg}` });
        result.spreadsheets.push(sheetResult);
        continue;
      }
      tabsToSync = (metaRes.body.sheets || []).map(s => s.properties?.title).filter(Boolean);
    } else {
      if (!sheetName) {
        sheetResult.errors.push({ reason: 'No sheet tab configured' });
        result.spreadsheets.push(sheetResult);
        continue;
      }
      tabsToSync = [sheetName];
    }

    for (const tabName of tabsToSync) {
      const tabResult = await syncTab(accessToken, tenantId, spreadsheetId, tabName);

      if (tabResult.status === 'auth_expired') {
        await Integration.findByIdAndUpdate(doc._id, {
          $set: { status: 'expired', 'syncSettings.lastSyncStatus': 'failed', 'syncSettings.lastSyncError': 'Authorization expired' },
        }).catch(() => {});
        result.errors.push({ spreadsheetId, tab: tabName, reason: 'Authorization expired' });
        break; // stop tabs for this spreadsheet
      }

      sheetResult.created              += tabResult.created;
      sheetResult.skipped              += tabResult.skipped;
      sheetResult.deletedSourceSkipped += tabResult.deletedSourceSkipped;
      sheetResult.blankRows            += (tabResult.blankRows || 0);
      sheetResult.errors.push(...(tabResult.errors || []));
    }

    result.totalCreated              += sheetResult.created;
    result.totalSkipped              += sheetResult.skipped;
    result.totalDeletedSourceSkipped += sheetResult.deletedSourceSkipped;
    result.totalBlankRows            += (sheetResult.blankRows || 0);
    result.errors.push(...sheetResult.errors.map(e => ({ spreadsheetId, ...e })));
    result.spreadsheets.push(sheetResult);
  }

  // Update lastSync on integration
  const syncOk = result.errors.length === 0 || result.totalCreated > 0 || result.totalSkipped > 0;
  await Integration.findByIdAndUpdate(doc._id, {
    $set: {
      'syncSettings.lastSync':       new Date(),
      'syncSettings.lastSyncStatus': syncOk ? 'success' : 'failed',
      'syncSettings.lastSyncError':  result.errors.length ? `${result.errors.length} error(s) during auto-sync` : null,
    },
  }).catch(() => {});

  return result;
}

// ─── POST /api/internal/google-sheets/sync-all ───────────────────────────────
exports.syncAllGoogleSheets = async (req, res) => {
  // ── 1. Authenticate with internal secret ──────────────────────────────────
  const secret  = process.env.INTERNAL_SYNC_SECRET;
  const authHdr = req.headers.authorization || '';
  const token   = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : authHdr;

  if (!secret || !token || token !== secret) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const startedAt = Date.now();
  const summary   = { processed: 0, totalCreated: 0, totalSkipped: 0, totalDeletedSourceSkipped: 0, totalBlankRows: 0, errors: 0, details: [] };

  try {
    // ── 2. Find all connected (and expired) Google Sheets integrations (all tenants) ──
    // Expired integrations are included so the cron can attempt token refresh and
    // automatically restore status:'connected' if the refresh token is still valid.
    // getOrRefreshToken handles the refresh and resets status on success; if the
    // refresh token is revoked/missing it throws and status remains 'expired'.
    const docs = await Integration.find({ provider: 'google_sheets', status: { $in: ['connected', 'expired'] } }).lean();

    console.log(`[AutoSync] Starting — ${docs.length} connected Google Sheets integration(s)`);

    // ── 3. Sync each integration sequentially (safe, no thundering herd) ──
    for (const doc of docs) {
      try {
        const result = await syncIntegrationDoc(doc);
        summary.processed++;
        summary.totalCreated              += result.totalCreated;
        summary.totalSkipped              += result.totalSkipped;
        summary.totalDeletedSourceSkipped += result.totalDeletedSourceSkipped;
        summary.totalBlankRows            += (result.totalBlankRows || 0);
        if (result.errors.length) summary.errors++;
        summary.details.push({
          tenantId:            String(result.tenantId),
          created:             result.totalCreated,
          skipped:             result.totalSkipped,
          deletedSourceSkipped: result.totalDeletedSourceSkipped,
          blankRows:           result.totalBlankRows || 0,
          errors:              result.errors.length,
        });
      } catch (docErr) {
        summary.errors++;
        summary.details.push({ tenantId: String(doc.tenantId), error: docErr.message });
        console.error(`[AutoSync] Error for tenant ${doc.tenantId}:`, docErr.message);
      }
    }
  } catch (fatalErr) {
    console.error('[AutoSync] Fatal error:', fatalErr.message);
    return res.status(500).json({ success: false, message: fatalErr.message });
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[AutoSync] Done in ${durationMs}ms — created: ${summary.totalCreated}, skipped: ${summary.totalSkipped}, tombstoneSkipped: ${summary.totalDeletedSourceSkipped}`);

  return res.json({ success: true, durationMs, ...summary });
};

// ─── Export syncIntegrationDoc for Drive notification handler ─────────────────
exports.syncIntegrationDoc = syncIntegrationDoc;

// ─── POST /api/internal/google-sheets/renew-watches ──────────────────────────
// Finds watch channels expiring within the next 24 hours (or already expired),
// stops the old channel, creates a new one, and persists the updated metadata.
// Called daily by GitHub Actions (google-sheets-watch-renewal.yml).
// Auth: same INTERNAL_SYNC_SECRET Bearer token.
// ─────────────────────────────────────────────────────────────────────────────
exports.renewWatches = async (req, res) => {
  // ── Authenticate ──────────────────────────────────────────────────────────
  const secret  = process.env.INTERNAL_SYNC_SECRET;
  const authHdr = req.headers.authorization || '';
  const token   = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : authHdr;

  if (!secret || !token || token !== secret) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const startedAt   = Date.now();
  const renewalHorizon = Date.now() + 24 * 60 * 60 * 1000; // renew if expiring within 24h
  const summary = { processed: 0, renewed: 0, failed: 0, details: [] };

  try {
    const docs = await Integration.find({ provider: 'google_sheets', status: 'connected' });
    console.log(`[WatchRenew] Checking ${docs.length} integration(s) for expiring watches`);

    for (const doc of docs) {
      const sheets = Array.isArray(doc.config?.spreadsheets) ? doc.config.spreadsheets : [];
      const toRenew = sheets.filter(s =>
        s.watch?.channelId && s.watch?.resourceId &&
        (s.watch.expiry == null || s.watch.expiry <= renewalHorizon)
      );

      if (!toRenew.length) continue;
      summary.processed++;

      let accessToken;
      try {
        accessToken = await getOrRefreshToken(doc, doc.tenantId);
      } catch (tokenErr) {
        console.warn(`[WatchRenew] Token error for tenant ${doc.tenantId}:`, tokenErr.message);
        await Integration.findByIdAndUpdate(doc._id, {
          $set: { status: 'expired', 'syncSettings.lastSyncError': tokenErr.message },
        }).catch(() => {});
        summary.failed += toRenew.length;
        summary.details.push({ tenantId: String(doc.tenantId), error: `Token error: ${tokenErr.message}` });
        continue;
      }

      for (const sheet of toRenew) {
        try {
          // Stop old channel first (best effort)
          await stopDriveWatch(sheet.watch.channelId, sheet.watch.resourceId, accessToken);

          // Create fresh channel
          const newWatch = await createDriveWatch(sheet.spreadsheetId, accessToken);
          if (newWatch) {
            await Integration.findOneAndUpdate(
              { _id: doc._id, 'config.spreadsheets.spreadsheetId': sheet.spreadsheetId },
              { $set: { 'config.spreadsheets.$.watch': newWatch } }
            );
            summary.renewed++;
            summary.details.push({
              tenantId:      String(doc.tenantId),
              spreadsheetId: sheet.spreadsheetId,
              newExpiry:     new Date(newWatch.expiry).toISOString(),
            });
            console.log(`[WatchRenew] Renewed channel for ${sheet.spreadsheetId} (tenant ${doc.tenantId})`);
          }
        } catch (sheetErr) {
          summary.failed++;
          summary.details.push({
            tenantId:      String(doc.tenantId),
            spreadsheetId: sheet.spreadsheetId,
            error:         sheetErr.message,
          });
          console.error(`[WatchRenew] Failed to renew ${sheet.spreadsheetId}:`, sheetErr.message);
        }
      }
    }
  } catch (fatalErr) {
    console.error('[WatchRenew] Fatal error:', fatalErr.message);
    return res.status(500).json({ success: false, message: fatalErr.message });
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[WatchRenew] Done in ${durationMs}ms — renewed: ${summary.renewed}, failed: ${summary.failed}`);
  return res.json({ success: true, durationMs, ...summary });
};
