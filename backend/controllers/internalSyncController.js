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

// ─── Sensitive fields for google_sheets provider ──────────────────────────────
const GS_SENSITIVE = ['accessToken', 'refreshToken'];

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
    { $set: { credentials: newCreds, 'config.tokenExpiresAt': newExpiry } }
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

async function resolvePipeline(tenantId, { adId, metaFormId, sheetName, source }) {
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

  if (response.status === 401) return { status: 'auth_expired', created: 0, skipped: 0, deletedSourceSkipped: 0, errors: [] };
  if (response.status !== 200) {
    const msg = response.body?.error?.message || `HTTP ${response.status}`;
    return { status: 'error', error: msg, created: 0, skipped: 0, deletedSourceSkipped: 0, errors: [{ tab: tabName, reason: msg }] };
  }

  const rows = response.body.values || [];
  if (rows.length < 2) return { status: 'ok', created: 0, skipped: 0, deletedSourceSkipped: 0, errors: [] };

  const originalHeaders = rows[0];
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
    return { status: 'ok', created: 0, skipped: 0, deletedSourceSkipped: 0, errors: [{ tab: tabName, reason: 'No "Name" column found — tab skipped' }] };
  }

  let created = 0, skipped = 0, deletedSourceSkipped = 0;
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const rowIndex = i + 1;

    try {
      const getVal = (field) => {
        const idx = fieldMap[field];
        return idx !== undefined ? String(row[idx] || '').trim() : '';
      };

      const name = getVal('name');
      if (!name) continue;

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

      // Unmapped columns → customFields
      const mappedColIndices = new Set([idColIndex, ...Object.values(fieldMap)].filter(n => n !== -1));
      const customFields = {};
      for (let c = 0; c < headers.length; c++) {
        if (!mappedColIndices.has(c) && originalHeaders[c] && row[c]) {
          customFields[String(originalHeaders[c]).trim().toLowerCase()] = String(row[c]).trim();
        }
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

      // Step 1: exact key dedup
      const byKey = await Lead.findOne({ tenantId, externalLeadId, externalSource });
      if (byKey) { skipped++; continue; }

      // Step 1b: tombstone check
      const tombstone = await DeletedLeadSource.findOne({ tenantId, externalSource, externalLeadId });
      if (tombstone) { deletedSourceSkipped++; continue; }

      // Step 2: phone dedup
      if (phone) {
        const byPhone = await Lead.findOne({ tenantId, phone });
        if (byPhone) {
          if (!byPhone.externalLeadId) {
            await Lead.updateOne({ _id: byPhone._id }, { $set: { externalLeadId, externalSource } });
          }
          skipped++; continue;
        }
      }

      // Step 3: email dedup
      if (email) {
        const byEmail = await Lead.findOne({ tenantId, email });
        if (byEmail) {
          if (!byEmail.externalLeadId) {
            await Lead.updateOne({ _id: byEmail._id }, { $set: { externalLeadId, externalSource } });
          }
          skipped++; continue;
        }
      }

      // Step 4: pipeline resolution
      const { pipelineId, stageId } = await resolvePipeline(tenantId, {
        adId:       attribution.adId,
        metaFormId: attribution.metaFormId,
        sheetName:  tabName,
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

  return { status: 'ok', created, skipped, deletedSourceSkipped, errors };
}

// ─── Core: sync one integration doc (all its configured spreadsheets) ─────────
async function syncIntegrationDoc(doc) {
  const tenantId = doc.tenantId;
  const result   = { tenantId, integrationId: doc._id, spreadsheets: [], totalCreated: 0, totalSkipped: 0, totalDeletedSourceSkipped: 0, errors: [] };

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
  const configSheets = Array.isArray(doc.config?.spreadsheets) && doc.config.spreadsheets.length > 0
    ? doc.config.spreadsheets
    : doc.config?.spreadsheetId
      ? [{ spreadsheetId: doc.config.spreadsheetId, syncMode: doc.config.syncMode || 'single', sheetName: doc.config.sheetName || '' }]
      : [];

  if (!configSheets.length) {
    result.errors.push({ reason: 'No spreadsheets configured' });
    return result;
  }

  for (const sheetCfg of configSheets) {
    const { spreadsheetId, syncMode, sheetName } = sheetCfg;
    if (!spreadsheetId) continue;

    const sheetResult = { spreadsheetId, created: 0, skipped: 0, deletedSourceSkipped: 0, errors: [] };

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

      sheetResult.created            += tabResult.created;
      sheetResult.skipped            += tabResult.skipped;
      sheetResult.deletedSourceSkipped += tabResult.deletedSourceSkipped;
      sheetResult.errors.push(...(tabResult.errors || []));
    }

    result.totalCreated            += sheetResult.created;
    result.totalSkipped            += sheetResult.skipped;
    result.totalDeletedSourceSkipped += sheetResult.deletedSourceSkipped;
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
  const summary   = { processed: 0, totalCreated: 0, totalSkipped: 0, totalDeletedSourceSkipped: 0, errors: 0, details: [] };

  try {
    // ── 2. Find all connected Google Sheets integrations (all tenants) ──────
    const docs = await Integration.find({ provider: 'google_sheets', status: 'connected' }).lean();

    console.log(`[AutoSync] Starting — ${docs.length} connected Google Sheets integration(s)`);

    // ── 3. Sync each integration sequentially (safe, no thundering herd) ──
    for (const doc of docs) {
      try {
        const result = await syncIntegrationDoc(doc);
        summary.processed++;
        summary.totalCreated              += result.totalCreated;
        summary.totalSkipped              += result.totalSkipped;
        summary.totalDeletedSourceSkipped += result.totalDeletedSourceSkipped;
        if (result.errors.length) summary.errors++;
        summary.details.push({
          tenantId:            String(result.tenantId),
          created:             result.totalCreated,
          skipped:             result.totalSkipped,
          deletedSourceSkipped: result.totalDeletedSourceSkipped,
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
