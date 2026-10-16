/**
 * diagnose-sheets-gap.js
 *
 * READ-ONLY diagnostic for the "65 sheet rows vs 55 CRM leads" discrepancy.
 *
 * What it does:
 *   1. Loads .env and connects to MongoDB (read-only operations only).
 *   2. Finds the google_sheets integration, reads its config.
 *   3. Decrypts credentials. If the token is expired, refreshes it via Google OAuth
 *      but does NOT persist the new token to MongoDB (fully read-only).
 *   4. For every tab in the spreadsheet (syncMode: all fetches all tabs):
 *      - Counts total data rows (rows − 1 header).
 *      - Counts rows where Name cell is blank (silently dropped by sync).
 *      - For rows WITH a name: determines what the sync would do without doing it:
 *          ALREADY_IN_CRM  — externalLeadId already exists → skipped
 *          PHONE_MATCH     — phone matches existing lead (skipped/linked)
 *          EMAIL_MATCH     — email matches existing lead (skipped/linked)
 *          TOMBSTONE       — DeletedLeadSource record exists → skipped
 *          WOULD_CREATE    — none of the above → would be created on next sync
 *   5. Checks audit logs for the most recent manual sync event.
 *   6. Prints a plain-text report. No tokens, no secrets, no writes.
 *
 * Usage (from backend/ directory):
 *   node scripts/diagnose-sheets-gap.js
 *
 * Safe to run any number of times. Does not trigger a sync.
 * Does not create, update, or delete any Lead, Integration, or other document.
 * Zero DB writes — token refresh result is used in-memory only, never persisted.
 */

'use strict';

require('dotenv').config();

const https    = require('https');
const mongoose = require('mongoose');
const { decryptFields } = require('../utils/encryption');

// ─── Minimal models (read-only) ───────────────────────────────────────────────
const Integration     = require('../models/Integration');
const Lead            = require('../models/Lead');
const DeletedLeadSource = require('../models/DeletedLeadSource');
const AuditLog        = require('../models/AuditLog');

// ─── Helpers (copied from internalSyncController — read-only logic) ───────────

const GSHEET_HEADER_MAP = {
  'name': 'name', 'contact name': 'name', 'full name': 'name', 'lead name': 'name',
  'phone': 'phone', 'mobile': 'phone', 'phone number': 'phone',
  'email': 'email', 'email address': 'email',
  'company': 'company', 'company name': 'company', 'organization': 'company',
  'city': 'city', 'state': 'state', 'country': 'country',
  'industry': 'industry', 'budget': 'budget',
  'service': 'serviceRequired', 'services': 'serviceRequired', 'service required': 'serviceRequired',
  'website': 'website', 'brand': 'brandName', 'brand name': 'brandName',
  'platform': 'source',
};
const GSHEET_ID_HEADERS = new Set(['id', 'lead id', 'lead_id', 'external id', 'external_id']);
const normalizeHeader   = (h) => String(h).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

// ─── Phone helpers (mirrors backend/utils/phoneUtils.js) ─────────────────────
// This script is self-contained; we inline rather than require to keep it
// runnable without a full node_modules install.
const MIN_PHONE_DIGITS = 7;
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return '';
  const digits = String(raw).trim().replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS ? digits : '';
}
function isValidPhone(raw)           { return normalizePhone(raw).length > 0; }
function resolvePhone(phoneRaw, waRaw) {
  if (isValidPhone(phoneRaw)) return phoneRaw;
  if (isValidPhone(waRaw))    return waRaw;
  return '';
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function httpPost(hostname, path, bodyObj, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof bodyObj === 'string' ? bodyObj : new URLSearchParams(bodyObj).toString();
    const options = {
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

function callSheetsApi(accessToken, path) {
  return httpGet(`https://sheets.googleapis.com/v4${path}`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

async function getOrRefreshToken(doc) {
  const creds = decryptFields(doc.credentials, ['accessToken', 'refreshToken']);
  if (!creds.accessToken) throw new Error('No access token — integration needs reconnection');

  const expiresAt = doc.config?.tokenExpiresAt || 0;
  if (Date.now() < expiresAt - 60_000) return creds.accessToken;

  if (!creds.refreshToken) throw new Error('No refresh token — integration needs reconnection');

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'Token is expired but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in .env — cannot refresh.\n' +
      '  Copy these values from your Render environment into backend/.env, then re-run.'
    );
  }

  const refreshed = await httpPost('oauth2.googleapis.com', '/token', {
    grant_type:    'refresh_token',
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: creds.refreshToken,
  });

  if (!refreshed.body.access_token) {
    const reason = refreshed.body.error_description || refreshed.body.error || 'Token refresh failed';
    throw new Error(`OAuth refresh failed: ${reason}`);
  }

  // READ-ONLY: The refreshed token is used in-memory only. It is NOT written back
  // to MongoDB. The next real production sync will persist the refresh naturally.
  console.log('  [token] Access token refreshed in-memory (not persisted — read-only mode).');
  return refreshed.body.access_token;
}

// ─── Per-tab diagnostic ───────────────────────────────────────────────────────

async function diagnoseTab(accessToken, tenantId, spreadsheetId, tabName) {
  const range    = encodeURIComponent(tabName);
  const response = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}/values/${range}`);

  if (response.status === 401) return { tab: tabName, error: 'AUTH_EXPIRED' };
  if (response.status !== 200) {
    const msg = response.body?.error?.message || `HTTP ${response.status}`;
    return { tab: tabName, error: msg };
  }

  const rows = response.body.values || [];
  const totalRows   = rows.length;
  const dataRows    = Math.max(0, totalRows - 1); // excluding header

  if (totalRows < 2) {
    return { tab: tabName, totalRows, dataRows: 0, note: 'Empty or header-only — sync skips this tab' };
  }

  // ── Header analysis ──────────────────────────────────────────────────────
  const headers    = rows[0].map(normalizeHeader);
  const fieldMap   = {};
  let idColIndex       = -1;
  let whatsappColIndex = -1; // fallback phone source when phone_number column is invalid

  for (let c = 0; c < headers.length; c++) {
    const h = headers[c];
    if (GSHEET_ID_HEADERS.has(h)) {
      if (idColIndex === -1) idColIndex = c;
    } else if (h === 'whatsapp number') {
      if (whatsappColIndex === -1) whatsappColIndex = c;
    } else if (GSHEET_HEADER_MAP[h] && fieldMap[GSHEET_HEADER_MAP[h]] === undefined) {
      fieldMap[GSHEET_HEADER_MAP[h]] = c;
    }
  }

  const hasNameColumn     = fieldMap.name !== undefined;
  const hasIdColumn       = idColIndex !== -1;
  const hasPhoneColumn    = fieldMap.phone !== undefined || whatsappColIndex !== -1;
  const hasWAColumn       = whatsappColIndex !== -1;
  const hasEmailColumn    = fieldMap.email !== undefined;

  if (!hasNameColumn) {
    return {
      tab: tabName, totalRows, dataRows,
      hasNameColumn: false,
      note: 'No "Name" column found — ENTIRE TAB SKIPPED by sync',
      headers: rows[0],
    };
  }

  // ── Row-level classification ─────────────────────────────────────────────
  const results = {
    tab:           tabName,
    totalRows,
    dataRows,
    hasNameColumn,
    hasIdColumn,
    hasPhoneColumn,
    hasWAColumn,
    hasEmailColumn,
    blankName:          0,  // silently skipped — no counter in sync
    alreadyInCRM:       0,  // externalLeadId exact match → skipped
    phoneMatch:         0,  // phone match → skipped/linked (no spreadsheetId stamped if already had externalLeadId)
    emailMatch:         0,  // email match → skipped/linked
    tombstoned:         0,  // DeletedLeadSource record → deletedSourceSkipped
    wouldCreate:        0,  // none of above → would be created on next sync
    wouldCreateRows:    [],  // row numbers of leads that would be created
    blankNameRows:      [],  // row numbers with blank name
    phoneMatchRows:     [],  // row numbers matched by phone
    emailMatchRows:     [],  // row numbers matched by email
    alreadyInCRMRows:   [],  // row numbers already in CRM
    tombstonedRows:     [],  // row numbers blocked by tombstone
    rowErrors:          [],  // rows that cause unexpected errors during analysis
  };

  const getVal = (row, field) => {
    const idx = fieldMap[field];
    return idx !== undefined ? String(row[idx] || '').trim() : '';
  };

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const rowIndex = i + 1; // 1-based, matches Google Sheets row numbers

    try {
      const name  = getVal(row, 'name');
      if (!name) {
        results.blankName++;
        results.blankNameRows.push(rowIndex);
        continue;
      }

      // Resolve phone using the same logic as production sync (phoneUtils.resolvePhone).
      const phoneRaw  = getVal(row, 'phone');
      const waRaw     = whatsappColIndex !== -1 ? String(row[whatsappColIndex] || '').trim() : '';
      const phone     = resolvePhone(phoneRaw, waRaw);
      const email     = getVal(row, 'email');

      // Compute the externalLeadId the sync would use
      const idColVal       = hasIdColumn ? String(row[idColIndex] || '').trim() : '';
      const externalLeadId = idColVal || `gsheets:${tabName}:R${rowIndex}`;
      const externalSource = 'google_sheets';

      // Step 1: exact key match
      const byKey = await Lead.exists({ tenantId, externalLeadId, externalSource });
      if (byKey) {
        results.alreadyInCRM++;
        results.alreadyInCRMRows.push(rowIndex);
        continue;
      }

      // Step 1b: tombstone check
      const tombstone = await DeletedLeadSource.exists({ tenantId, externalSource, externalLeadId });
      if (tombstone) {
        results.tombstoned++;
        results.tombstonedRows.push(rowIndex);
        continue;
      }

      // Step 2: phone match
      if (phone) {
        const byPhone = await Lead.findOne({ tenantId, phone }, { _id: 1, externalLeadId: 1, externalSource: 1 }).lean();
        if (byPhone) {
          results.phoneMatch++;
          results.phoneMatchRows.push({
            row: rowIndex,
            existingLeadId: byPhone._id.toString(),
            alreadyHasExternalKey: !!byPhone.externalLeadId,
            existingExternalSource: byPhone.externalSource || null,
            willBeStamped: !byPhone.externalLeadId,
            note: !byPhone.externalLeadId
              ? 'Lead will be stamped with externalLeadId+externalSource on next sync'
              : `Lead already has externalLeadId (source: ${byPhone.externalSource}) — NO update, row silently skipped`,
          });
          continue;
        }
      }

      // Step 3: email match
      if (email) {
        const byEmail = await Lead.findOne({ tenantId, email }, { _id: 1, externalLeadId: 1, externalSource: 1 }).lean();
        if (byEmail) {
          results.emailMatch++;
          results.emailMatchRows.push({
            row: rowIndex,
            existingLeadId: byEmail._id.toString(),
            alreadyHasExternalKey: !!byEmail.externalLeadId,
            existingExternalSource: byEmail.externalSource || null,
            willBeStamped: !byEmail.externalLeadId,
            note: !byEmail.externalLeadId
              ? 'Lead will be stamped with externalLeadId+externalSource on next sync'
              : `Lead already has externalLeadId (source: ${byEmail.externalSource}) — NO update, row silently skipped`,
          });
          continue;
        }
      }

      // Would be created
      results.wouldCreate++;
      results.wouldCreateRows.push(rowIndex);

    } catch (e) {
      results.rowErrors.push({ row: rowIndex, error: e.message });
    }
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const MONGO_URI = process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error('ERROR: MONGODB_URI not set in .env');
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  NFINITY CRM — Google Sheets Gap Diagnostic (READ-ONLY)');
  console.log('══════════════════════════════════════════════════════\n');

  // ── Guard: ENCRYPTION_KEY must be set ────────────────────────────────────────
  const ENC_KEY = (process.env.ENCRYPTION_KEY || '').trim();
  if (!ENC_KEY || ENC_KEY.length < 64) {
    console.error('BLOCKER: ENCRYPTION_KEY is missing or too short in backend/.env');
    console.error('  The credentials stored in MongoDB are encrypted with this key.');
    console.error('  Without the correct key, token decryption returns null and the');
    console.error('  script cannot call the Google Sheets API.');
    console.error('  Fix: copy the ENCRYPTION_KEY value from your Render environment');
    console.error('  into backend/.env (64-char hex string), then re-run.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✓ MongoDB connected\n');

  // ── 1. Find integration ────────────────────────────────────────────────────
  const doc = await Integration.findOne({ provider: 'google_sheets', status: { $in: ['connected', 'sync_error'] } }).lean();
  if (!doc) {
    console.error('ERROR: No connected google_sheets integration found.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const tenantId     = doc.tenantId;
  const config       = doc.config || {};
  const syncSettings = doc.syncSettings || {};

  console.log('Integration found:');
  console.log(`  tenantId:        ${tenantId}`);
  console.log(`  status:          ${doc.status}`);
  console.log(`  lastSync:        ${syncSettings.lastSync || 'never'}`);
  console.log(`  lastSyncStatus:  ${syncSettings.lastSyncStatus || 'n/a'}`);
  console.log(`  lastSyncError:   ${syncSettings.lastSyncError || 'none'}`);

  // ── 2. Determine configured spreadsheets ──────────────────────────────────
  const configSpreadsheets =
    Array.isArray(config.spreadsheets) && config.spreadsheets.length > 0
      ? config.spreadsheets
      : config.spreadsheetId
        ? [{ spreadsheetId: config.spreadsheetId, syncMode: config.syncMode || 'single', sheetName: config.sheetName || '' }]
        : [];

  if (!configSpreadsheets.length) {
    console.error('\nERROR: No spreadsheets configured in integration.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\nConfigured spreadsheets: ${configSpreadsheets.length}`);
  for (const ss of configSpreadsheets) {
    console.log(`  - ${ss.spreadsheetId} | syncMode: ${ss.syncMode} | tab: "${ss.sheetName || '(all)'}"`);
  }

  // ── 3. Check audit log for most recent manual sync ─────────────────────────
  console.log('\n── Audit Log: Last Manual Sync ──────────────────────────────');
  const lastAudit = await AuditLog.findOne({
    tenantId,
    action: 'integration_synced',
    resourceId: 'google_sheets',
  }).sort({ createdAt: -1 }).lean();

  if (lastAudit) {
    console.log(`  Last manual sync: ${lastAudit.createdAt.toISOString()}`);
    const d = lastAudit.details || {};
    console.log(`  created:              ${d.created ?? 'n/a'}`);
    console.log(`  skipped:              ${d.skipped ?? 'n/a'}`);
    console.log(`  linked:               ${d.linked ?? 'n/a'}`);
    console.log(`  deletedSourceSkipped: ${d.deletedSourceSkipped ?? 'n/a'}`);
    console.log(`  errors:               ${d.errors ?? 'n/a'}`);
    console.log(`  tabs synced:          ${JSON.stringify(d.tabs) ?? 'n/a'}`);
    console.log(`  spreadsheetId:        ${d.spreadsheetId ?? 'n/a'}`);
    console.log(`  syncMode:             ${d.syncMode ?? 'n/a'}`);
    const total = (d.created || 0) + (d.skipped || 0) + (d.linked || 0) + (d.deletedSourceSkipped || 0);
    console.log(`  -- sum(created+skipped+linked+tombstoned): ${total}`);
    console.log(`  -- NOTE: blank-name rows are NOT counted in any of these numbers`);
  } else {
    console.log('  No manual sync audit logs found. Integration was synced by cron only.');
    console.log('  (Cron path does not write to AuditLog — use syncSettings.lastSync above.)');
  }

  // ── 4. DB totals before scanning ──────────────────────────────────────────
  console.log('\n── CRM Lead Counts (current state) ──────────────────────────');
  const totalGSLeads = await Lead.countDocuments({
    tenantId,
    externalSource: { $in: ['google_sheets', 'google_sheet'] },
  });
  console.log(`  Total google_sheets leads in CRM: ${totalGSLeads}`);

  const byTab = await Lead.aggregate([
    { $match: { tenantId, externalSource: { $in: ['google_sheets', 'google_sheet'] } } },
    { $group: { _id: { sheetName: '$sheetName', spreadsheetId: '$spreadsheetId' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log('  Breakdown by (spreadsheetId, sheetName):');
  for (const b of byTab) {
    console.log(`    spreadsheetId: ${b._id.spreadsheetId || 'null'}  tab: "${b._id.sheetName || 'null'}"  count: ${b.count}`);
  }

  const noSheetName = await Lead.countDocuments({
    tenantId,
    externalSource: { $in: ['google_sheets', 'google_sheet'] },
    $or: [{ sheetName: null }, { sheetName: { $exists: false } }, { sheetName: '' }],
  });
  console.log(`  Leads with null/empty sheetName: ${noSheetName}  (invisible in tab-filtered dashboard views)`);

  const tombstoneCount = await DeletedLeadSource.countDocuments({ tenantId, externalSource: 'google_sheets' });
  console.log(`  Tombstones (deletedleadsources): ${tombstoneCount}`);

  // ── 5. Get access token ────────────────────────────────────────────────────
  console.log('\n── Token ──────────────────────────────────────────────────────');
  let accessToken;
  try {
    accessToken = await getOrRefreshToken(doc);
    console.log('  Access token: ready (value not printed)');
  } catch (tokenErr) {
    console.error(`  ERROR: ${tokenErr.message}`);
    console.error('  Cannot fetch spreadsheet data without a valid token. Reconnect the integration.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── 6. Per-spreadsheet, per-tab diagnosis ─────────────────────────────────
  let grandTotalSheetDataRows = 0;
  let grandBlank = 0, grandAlreadyInCRM = 0, grandPhone = 0, grandEmail = 0;
  let grandTombstone = 0, grandWouldCreate = 0, grandErrors = 0;

  for (const ss of configSpreadsheets) {
    const { spreadsheetId, syncMode, sheetName } = ss;

    console.log(`\n══ Spreadsheet: ${spreadsheetId} ══`);
    console.log(`   syncMode: ${syncMode}  |  configured tab: "${sheetName || '(all)'}"`);

    // Determine tabs to examine (mirrors sync logic exactly)
    let tabsToCheck = [];
    if (syncMode === 'all') {
      const metaRes = await callSheetsApi(accessToken, `/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
      if (metaRes.status === 401) { console.error('  AUTH EXPIRED — cannot read tab list'); continue; }
      if (metaRes.status !== 200) { console.error(`  Sheets API error: ${metaRes.body?.error?.message}`); continue; }
      tabsToCheck = (metaRes.body.sheets || []).map(s => s.properties?.title).filter(Boolean);
      console.log(`   Tabs in spreadsheet (${tabsToCheck.length}): ${tabsToCheck.map(t => `"${t}"`).join(', ')}`);
    } else {
      if (!sheetName) { console.error('  syncMode=single but no sheetName configured'); continue; }
      tabsToCheck = [sheetName];
      console.log(`   Tab: "${sheetName}" (single mode)`);
    }

    for (const tabName of tabsToCheck) {
      console.log(`\n  ── Tab: "${tabName}" ──────────────────────────────`);
      const r = await diagnoseTab(accessToken, tenantId, spreadsheetId, tabName);

      if (r.error) { console.log(`  ERROR: ${r.error}`); continue; }
      if (r.note)  { console.log(`  NOTE: ${r.note}`); }

      console.log(`  Sheet rows total (incl. header): ${r.totalRows}`);
      console.log(`  Data rows (excl. header):        ${r.dataRows}`);
      console.log(`  Headers detected: Name=${r.hasNameColumn} | ID=${r.hasIdColumn} | Phone=${r.hasPhoneColumn} | WhatsApp(fallback)=${r.hasWAColumn} | Email=${r.hasEmailColumn}`);

      if (!r.hasNameColumn) continue;

      console.log(`\n  Row classification:`);
      console.log(`    blank Name (silently skipped — NO counter in sync): ${r.blankName}`);
      if (r.blankNameRows.length) console.log(`      rows: ${r.blankNameRows.join(', ')}`);

      console.log(`    already in CRM (exact externalLeadId match):        ${r.alreadyInCRM}`);
      if (r.alreadyInCRMRows.length) console.log(`      rows: ${r.alreadyInCRMRows.join(', ')}`);

      console.log(`    tombstoned (blocked by DeletedLeadSource):          ${r.tombstoned}`);
      if (r.tombstonedRows.length) console.log(`      rows: ${r.tombstonedRows.join(', ')}`);

      console.log(`    phone match (skipped/linked):                       ${r.phoneMatch}`);
      if (r.phoneMatchRows.length) {
        for (const pm of r.phoneMatchRows) {
          console.log(`      row ${pm.row}: ${pm.note}`);
        }
      }

      console.log(`    email match (skipped/linked):                       ${r.emailMatch}`);
      if (r.emailMatchRows.length) {
        for (const em of r.emailMatchRows) {
          console.log(`      row ${em.row}: ${em.note}`);
        }
      }

      console.log(`    would CREATE on next sync:                          ${r.wouldCreate}`);
      if (r.wouldCreateRows.length) console.log(`      rows: ${r.wouldCreateRows.join(', ')}`);

      if (r.rowErrors.length) {
        console.log(`    analysis errors (row-level):                        ${r.rowErrors.length}`);
        for (const e of r.rowErrors) console.log(`      row ${e.row}: ${e.error}`);
      }

      const accountedFor = r.blankName + r.alreadyInCRM + r.tombstoned + r.phoneMatch + r.emailMatch + r.wouldCreate + r.rowErrors.length;
      console.log(`\n  Verification: ${r.dataRows} data rows = ${accountedFor} accounted (${r.dataRows - accountedFor} unaccounted)`);

      grandTotalSheetDataRows += r.dataRows;
      grandBlank              += r.blankName;
      grandAlreadyInCRM       += r.alreadyInCRM;
      grandPhone              += r.phoneMatch;
      grandEmail              += r.emailMatch;
      grandTombstone          += r.tombstoned;
      grandWouldCreate        += r.wouldCreate;
      grandErrors             += r.rowErrors.length;
    }
  }

  // ── 7. Grand summary ──────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  GRAND SUMMARY (all tabs combined)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Total sheet data rows:          ${grandTotalSheetDataRows}`);
  console.log(`  Already in CRM (key match):     ${grandAlreadyInCRM}`);
  console.log(`  Blank Name rows (silent skip):  ${grandBlank}`);
  console.log(`  Phone match (skip/link):        ${grandPhone}`);
  console.log(`  Email match (skip/link):        ${grandEmail}`);
  console.log(`  Tombstoned:                     ${grandTombstone}`);
  console.log(`  Would CREATE on next sync:      ${grandWouldCreate}`);
  console.log(`  Row analysis errors:            ${grandErrors}`);
  const grandTotal = grandAlreadyInCRM + grandBlank + grandPhone + grandEmail + grandTombstone + grandWouldCreate + grandErrors;
  console.log(`  ─────────────────────────────────────────────────`);
  console.log(`  Sum of all categories:          ${grandTotal}`);
  console.log(`  Discrepancy (sheet - sum):      ${grandTotalSheetDataRows - grandTotal}`);

  console.log('\n── Conclusions ──────────────────────────────────────');
  if (grandBlank > 0) {
    console.log(`  ⚠️  ${grandBlank} rows have a blank Name cell — permanently invisible to sync.`);
    console.log(`     Sync silently skips these with no counter increment.`);
    console.log(`     Fix: fill in the Name in Google Sheets, then trigger a sync.`);
  }
  if (grandWouldCreate > 0) {
    console.log(`  ℹ️  ${grandWouldCreate} rows WOULD be created if a sync runs now.`);
    console.log(`     These are new rows added to the sheet after the last sync.`);
  }
  if (grandPhone > 0 || grandEmail > 0) {
    const phoneNoUpdate = [];
    const emailNoUpdate = [];
    // We can't easily re-aggregate here, but flag the totals
    console.log(`  ℹ️  ${grandPhone} row(s) matched by phone, ${grandEmail} row(s) matched by email.`);
    console.log(`     See per-tab detail above for which ones will NOT be updated (already had externalLeadId).`);
    console.log(`     Leads matched where externalLeadId was already set: missing spreadsheetId/sheetName stamp.`);
  }
  if (grandTombstone > 0) {
    console.log(`  ℹ️  ${grandTombstone} row(s) blocked by tombstone (previously deleted in CRM).`);
  }
  if (grandWouldCreate === 0 && grandBlank === 0 && grandPhone === 0 && grandEmail === 0) {
    console.log(`  ✓  All ${grandTotalSheetDataRows} rows are accounted for. No new leads to import.`);
  }

  await mongoose.disconnect();
  console.log('\n✓ Diagnostic complete. No data was created or modified (token refresh excepted).');
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
