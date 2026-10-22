/**
 * test-tombstone-reset.js
 *
 * Regression tests for the resetSheetTombstones endpoint logic.
 *
 * Covers:
 *   1.  Dry-run returns count, deletes nothing
 *   2.  confirm: false (explicit falsy) still dry-run
 *   3.  confirm: true deletes tombstones for the target sheet only
 *   4.  Tenant isolation: resetting tenant A never touches tenant B tombstones
 *   5.  Spreadsheet isolation: resetting sheet X never touches sheet Y tombstones
 *   6.  spreadsheetId not in tenant config → rejected (400)
 *   7.  Non-admin role → rejected (403)
 *   8.  Missing spreadsheetId → rejected (400)
 *   9.  Empty-string spreadsheetId → rejected (400)
 *  10.  After reset, re-sync imports rows that were previously blocked
 *  11.  Re-deleting after reset recreates tombstones (re-protects)
 *  12.  Legacy tombstones (spreadsheetId:'') are not affected by reset
 *  13.  count in dry-run matches deletedCount in confirm
 *
 * Run:  node backend/scripts/test-tombstone-reset.js
 */

'use strict';

// ─── Minimal test harness ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTest(name, fn) {
  console.log(`\n[Test] ${name}`);
  // Reset shared state before each test
  tombstones.length = 0;
  leads.length      = 0;
  try {
    await fn();
  } catch (e) {
    console.error(`  ✗ UNCAUGHT: ${e.message}`);
    failed++;
  }
}

// ─── In-memory stores (mirror production models) ─────────────────────────────
const tombstones = [];  // { tenantId, externalSource, externalLeadId, spreadsheetId }
const leads      = [];  // { _id, tenantId, externalSource, externalLeadId, spreadsheetId }
let   _nextId    = 1;
const nextId     = () => String(_nextId++);

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Simulate the tombstone reset endpoint logic.
 * @param {{ tenantId, role, spreadsheetId, confirm, ownedSheets }} opts
 * @returns {{ status, body }}
 */
async function callReset({ tenantId, role, spreadsheetId, confirm, ownedSheets }) {
  // 1. Role check
  if (!['super_admin', 'admin'].includes(role)) {
    return { status: 403, body: { error: 'Admin access required' } };
  }

  // 2. Validate spreadsheetId
  const sheetId = (spreadsheetId || '').trim();
  if (!sheetId) {
    return { status: 400, body: { error: 'spreadsheetId is required in the request body' } };
  }

  // 3. Verify spreadsheet belongs to this tenant
  if (!ownedSheets.includes(sheetId)) {
    return { status: 400, body: {
      error: `Spreadsheet ID "${sheetId}" is not in this tenant's Google Sheets configuration.`,
    }};
  }

  // 4. Count
  const matching = tombstones.filter(
    t => t.tenantId === tenantId &&
         t.externalSource === 'google_sheets' &&
         t.spreadsheetId  === sheetId
  );
  const count = matching.length;

  // 5. Dry-run
  if (confirm !== true) {
    return { status: 200, body: {
      success: true, dryRun: true, count, spreadsheetId: sheetId,
      message: `Dry run: ${count} tombstone(s) found for spreadsheet "${sheetId}". No data was changed.`,
    }};
  }

  // 6. Confirmed delete
  const before = tombstones.length;
  for (let i = tombstones.length - 1; i >= 0; i--) {
    const t = tombstones[i];
    if (t.tenantId === tenantId && t.externalSource === 'google_sheets' && t.spreadsheetId === sheetId) {
      tombstones.splice(i, 1);
    }
  }
  const deletedCount = before - tombstones.length;
  return { status: 200, body: {
    success: true, dryRun: false, deletedCount, spreadsheetId: sheetId,
    message: `Reset complete: ${deletedCount} tombstone(s) deleted.`,
  }};
}

/**
 * Simulate one sync row — mirrors processRow from test-cross-sheet-isolation.js.
 * Returns { action: 'created'|'skipped', reason: 'byKey'|'tombstone'|'blank'|'created' }
 */
async function processRow({ tenantId, spreadsheetId, tabName, rowIndex, name, phone }) {
  if (!name && !phone) return { action: 'skipped', reason: 'blank' };

  const externalLeadId = `gsheets:${tabName}:R${rowIndex}`;
  const externalSource = 'google_sheets';

  // byKey check
  const byKey = leads.find(l =>
    l.tenantId === tenantId &&
    l.externalLeadId === externalLeadId &&
    l.externalSource === externalSource &&
    (l.spreadsheetId === spreadsheetId || !l.spreadsheetId)
  );
  if (byKey) return { action: 'skipped', reason: 'byKey' };

  // Tombstone check — STRICT: exact spreadsheetId only
  const tombstone = tombstones.find(t =>
    t.tenantId       === tenantId &&
    t.externalSource === externalSource &&
    t.externalLeadId === externalLeadId &&
    t.spreadsheetId  === spreadsheetId
  );
  if (tombstone) return { action: 'skipped', reason: 'tombstone' };

  // Create lead
  leads.push({ _id: nextId(), tenantId, externalSource, externalLeadId, spreadsheetId, name, phone });
  return { action: 'created', reason: 'created' };
}

/**
 * Simulate deleting a lead — creates a tombstone with the lead's spreadsheetId.
 */
function deleteLead(leadId) {
  const idx = leads.findIndex(l => l._id === leadId);
  if (idx === -1) return;
  const lead = leads.splice(idx, 1)[0];
  if (lead.externalLeadId) {
    tombstones.push({
      tenantId:       lead.tenantId,
      externalSource: lead.externalSource,
      externalLeadId: lead.externalLeadId,
      spreadsheetId:  lead.spreadsheetId || '',
    });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

await runTest('1 · Dry-run returns count and does not delete anything', async () => {
  const T = 'tenant1'; const SHEET = 'SHEET_A'; const TAB = 'Leads';
  // Seed 3 tombstones for SHEET_A
  for (let i = 0; i < 3; i++) {
    tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `key_${i}`, spreadsheetId: SHEET });
  }
  const res = await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: false, ownedSheets: [SHEET] });
  assert(res.status === 200,       'Returns 200');
  assert(res.body.dryRun === true, 'dryRun is true');
  assert(res.body.count  === 3,    'Reports 3 tombstones');
  assert(tombstones.length === 3,  'No tombstones deleted (dry-run)');
});

await runTest('2 · confirm: undefined (missing) is treated as dry-run', async () => {
  const T = 'tenant1'; const SHEET = 'SHEET_B';
  tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: 'k1', spreadsheetId: SHEET });
  tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: 'k2', spreadsheetId: SHEET });
  const res = await callReset({ tenantId: T, role: 'super_admin', spreadsheetId: SHEET, confirm: undefined, ownedSheets: [SHEET] });
  assert(res.body.dryRun === true, 'Missing confirm treated as dry-run');
  assert(tombstones.length === 2,  'Tombstones untouched');
});

await runTest('3 · confirm: true deletes only target sheet tombstones', async () => {
  const T = 'tenant1'; const SHEET = 'SHEET_C'; const OTHER = 'SHEET_D';
  // 4 tombstones for SHEET_C, 2 for SHEET_D
  for (let i = 0; i < 4; i++) {
    tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `c${i}`, spreadsheetId: SHEET });
  }
  for (let i = 0; i < 2; i++) {
    tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `d${i}`, spreadsheetId: OTHER });
  }
  assert(tombstones.length === 6, 'Pre-condition: 6 tombstones total');

  const res = await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: true, ownedSheets: [SHEET, OTHER] });
  assert(res.status === 200,                  'Returns 200');
  assert(res.body.dryRun === false,           'dryRun is false');
  assert(res.body.deletedCount === 4,         'deletedCount is 4');
  assert(tombstones.length === 2,             'Only 2 tombstones remain (SHEET_D)');
  assert(tombstones.every(t => t.spreadsheetId === OTHER), 'Remaining tombstones all belong to SHEET_D');
});

await runTest('4 · Tenant isolation: reset tenant A does not affect tenant B tombstones', async () => {
  const A = 'tenantA'; const B = 'tenantB'; const SHEET = 'SHARED_SHEET_ID';
  // 3 tombstones for tenant A, 3 for tenant B — same spreadsheetId
  for (let i = 0; i < 3; i++) {
    tombstones.push({ tenantId: A, externalSource: 'google_sheets', externalLeadId: `a${i}`, spreadsheetId: SHEET });
    tombstones.push({ tenantId: B, externalSource: 'google_sheets', externalLeadId: `b${i}`, spreadsheetId: SHEET });
  }
  assert(tombstones.length === 6, 'Pre-condition: 6 tombstones (3 per tenant)');

  // Reset tenant A only
  const res = await callReset({ tenantId: A, role: 'admin', spreadsheetId: SHEET, confirm: true, ownedSheets: [SHEET] });
  assert(res.body.deletedCount === 3,            'Deleted exactly 3 (tenant A only)');
  assert(tombstones.length === 3,                '3 tombstones remain');
  assert(tombstones.every(t => t.tenantId === B),'Remaining tombstones all belong to tenant B');
});

await runTest('5 · Spreadsheet isolation: resetting sheet X never touches sheet Y', async () => {
  const T = 'tenant1'; const X = 'SHEET_X'; const Y = 'SHEET_Y'; const Z = 'SHEET_Z';
  for (const sheet of [X, Y, Z]) {
    for (let i = 0; i < 5; i++) {
      tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `${sheet}_${i}`, spreadsheetId: sheet });
    }
  }
  assert(tombstones.length === 15, 'Pre-condition: 15 tombstones (5 per sheet)');

  const res = await callReset({ tenantId: T, role: 'super_admin', spreadsheetId: X, confirm: true, ownedSheets: [X, Y, Z] });
  assert(res.body.deletedCount === 5,                              'Deleted exactly 5 (sheet X only)');
  assert(tombstones.length === 10,                                 '10 tombstones remain');
  assert(tombstones.filter(t => t.spreadsheetId === Y).length === 5, 'SHEET_Y untouched');
  assert(tombstones.filter(t => t.spreadsheetId === Z).length === 5, 'SHEET_Z untouched');
  assert(tombstones.filter(t => t.spreadsheetId === X).length === 0, 'SHEET_X fully cleared');
});

await runTest('6 · spreadsheetId not in tenant config → rejected 400', async () => {
  const T = 'tenant1'; const OWNED = 'OWNED_SHEET'; const FOREIGN = 'FOREIGN_SHEET';
  tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: 'x', spreadsheetId: FOREIGN });
  const res = await callReset({ tenantId: T, role: 'admin', spreadsheetId: FOREIGN, confirm: true, ownedSheets: [OWNED] });
  assert(res.status === 400,              'Returns 400');
  assert(tombstones.length === 1,         'Tombstone untouched (config check failed)');
  assert(res.body.error.includes(FOREIGN),'Error message mentions the rejected sheet ID');
});

await runTest('7 · Non-admin role → rejected 403', async () => {
  const T = 'tenant1'; const SHEET = 'MY_SHEET';
  tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: 'k', spreadsheetId: SHEET });
  for (const role of ['member', 'viewer', 'manager']) {
    const res = await callReset({ tenantId: T, role, spreadsheetId: SHEET, confirm: true, ownedSheets: [SHEET] });
    assert(res.status === 403,       `Role "${role}" → 403`);
  }
  assert(tombstones.length === 1, 'Tombstone untouched (role rejected)');
});

await runTest('8 · Missing spreadsheetId → rejected 400', async () => {
  const res = await callReset({ tenantId: 'tenant1', role: 'admin', spreadsheetId: undefined, confirm: true, ownedSheets: ['A'] });
  assert(res.status === 400,                             'Returns 400');
  assert(res.body.error.includes('spreadsheetId'),       'Error mentions spreadsheetId');
});

await runTest('9 · Empty-string spreadsheetId → rejected 400', async () => {
  const res = await callReset({ tenantId: 'tenant1', role: 'admin', spreadsheetId: '   ', confirm: true, ownedSheets: ['A'] });
  assert(res.status === 400, 'Whitespace-only spreadsheetId → 400');
});

await runTest('10 · After tombstone reset, re-sync imports rows that were previously blocked', async () => {
  const T = 'tenant1'; const SHEET = 'DEMO_SHEET'; const TAB = 'PM Leads';

  // Phase 1: import 5 rows → 5 leads
  for (let i = 2; i <= 6; i++) {
    const r = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: i, name: `Lead ${i}`, phone: `+91900${i}00000` });
    assert(r.action === 'created', `Phase 1: R${i} created`);
  }
  assert(leads.length === 5, 'Phase 1: 5 leads in store');

  // Phase 2: delete all 5 → tombstones created with SHEET's real ID
  const idsToDelete = leads.map(l => l._id);
  idsToDelete.forEach(deleteLead);
  assert(leads.length === 0,      'Phase 2: all leads deleted');
  assert(tombstones.length === 5, 'Phase 2: 5 tombstones with real sheet ID');
  assert(tombstones.every(t => t.spreadsheetId === SHEET), 'Phase 2: tombstones have real sheet ID');

  // Phase 3: re-sync — all 5 rows tombstone-blocked
  let blocked = 0;
  for (let i = 2; i <= 6; i++) {
    const r = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: i, name: `Lead ${i}`, phone: `+91900${i}00000` });
    if (r.reason === 'tombstone') blocked++;
  }
  assert(blocked === 5,      'Phase 3: all 5 rows tombstone-blocked (correct behavior)');
  assert(leads.length === 0, 'Phase 3: no new leads created');

  // Phase 4: dry-run reset to inspect count
  const dry = await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: false, ownedSheets: [SHEET] });
  assert(dry.body.dryRun === true, 'Phase 4 dry-run: no deletion');
  assert(dry.body.count === 5,     'Phase 4 dry-run: reports 5 tombstones');
  assert(tombstones.length === 5,  'Phase 4: tombstones still intact after dry-run');

  // Phase 5: confirmed reset
  const reset = await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: true, ownedSheets: [SHEET] });
  assert(reset.body.dryRun        === false, 'Phase 5: dryRun is false');
  assert(reset.body.deletedCount  === 5,     'Phase 5: 5 tombstones deleted');
  assert(tombstones.length        === 0,     'Phase 5: tombstone store empty');

  // Phase 6: re-sync after reset → all 5 rows import successfully
  let created = 0;
  for (let i = 2; i <= 6; i++) {
    const r = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: i, name: `Lead ${i}`, phone: `+91900${i}00000` });
    if (r.action === 'created') created++;
  }
  assert(created === 5,      'Phase 6: all 5 rows re-imported after tombstone reset');
  assert(leads.length === 5, 'Phase 6: 5 leads now in store');
});

await runTest('11 · Re-deleting after reset recreates tombstones (re-protection)', async () => {
  const T = 'tenant1'; const SHEET = 'REGEN_SHEET'; const TAB = 'Leads';

  // Import 3 rows
  for (let i = 2; i <= 4; i++) {
    await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: i, name: `L${i}`, phone: `+91800${i}00000` });
  }
  assert(leads.length === 3, '3 leads created');

  // Delete → tombstones created
  leads.map(l => l._id).forEach(deleteLead);
  assert(tombstones.length === 3, '3 tombstones after deletion');

  // Reset tombstones
  await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: true, ownedSheets: [SHEET] });
  assert(tombstones.length === 0, 'Tombstones cleared');

  // Re-import
  for (let i = 2; i <= 4; i++) {
    await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: i, name: `L${i}`, phone: `+91800${i}00000` });
  }
  assert(leads.length === 3, '3 leads re-imported');

  // Delete again → tombstones recreated with real sheet ID
  leads.map(l => l._id).forEach(deleteLead);
  assert(tombstones.length === 3,                                      '3 tombstones re-created');
  assert(tombstones.every(t => t.spreadsheetId === SHEET),             'New tombstones carry real sheet ID');

  // Re-sync → all blocked again (re-protection working)
  let blocked = 0;
  for (let i = 2; i <= 4; i++) {
    const r = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: i, name: `L${i}`, phone: `+91800${i}00000` });
    if (r.reason === 'tombstone') blocked++;
  }
  assert(blocked === 3, 'All 3 rows blocked again after re-deletion (re-protection works)');
});

await runTest('12 · Legacy tombstones (spreadsheetId:"") are unaffected by reset of a real sheet', async () => {
  const T = 'tenant1'; const REAL = 'REAL_SHEET_ID';
  // 5 legacy tombstones with spreadsheetId:''
  for (let i = 0; i < 5; i++) {
    tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `legacy_${i}`, spreadsheetId: '' });
  }
  // 3 tombstones for the real sheet
  for (let i = 0; i < 3; i++) {
    tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `real_${i}`, spreadsheetId: REAL });
  }
  assert(tombstones.length === 8, 'Pre-condition: 8 tombstones (5 legacy + 3 real)');

  const res = await callReset({ tenantId: T, role: 'admin', spreadsheetId: REAL, confirm: true, ownedSheets: [REAL] });
  assert(res.body.deletedCount === 3,                                     'Deleted exactly 3 (real sheet only)');
  assert(tombstones.length === 5,                                          '5 legacy tombstones remain');
  assert(tombstones.every(t => t.spreadsheetId === ''),                   'All remaining are legacy (spreadsheetId:"")');
});

await runTest('13 · Count in dry-run matches deletedCount in confirmed run', async () => {
  const T = 'tenant1'; const SHEET = 'COUNT_CHECK_SHEET';
  for (let i = 0; i < 7; i++) {
    tombstones.push({ tenantId: T, externalSource: 'google_sheets', externalLeadId: `k${i}`, spreadsheetId: SHEET });
  }
  const dry     = await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: false,  ownedSheets: [SHEET] });
  const confirm = await callReset({ tenantId: T, role: 'admin', spreadsheetId: SHEET, confirm: true,   ownedSheets: [SHEET] });
  assert(dry.body.count === confirm.body.deletedCount, `Dry-run count (${dry.body.count}) === confirmed deletedCount (${confirm.body.deletedCount})`);
  assert(tombstones.length === 0, 'All tombstones gone after confirm');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
