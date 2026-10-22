/**
 * test-cross-sheet-isolation.js
 *
 * 10 cross-spreadsheet isolation tests for the Google Sheets sync.
 * Tests run entirely in-process using a mock Lead/Tombstone store — no MongoDB required.
 *
 * Tests 1–7: original cross-sheet isolation suite
 * Test 8:    legacy tombstone (spreadsheetId:'') must NOT block a new spreadsheet
 * Test 9:    same-spreadsheet tombstone (spreadsheetId:'SHEET_ID') still blocks re-import
 * Test 10:   two spreadsheets with IDENTICAL tab names and row numbers — tombstones from
 *            one sheet do not bleed into the other (the root-cause regression test for the
 *            production bug: "64 previously-deleted skipped" for a newly-connected sheet)
 *
 * Run:  node backend/scripts/test-cross-sheet-isolation.js
 */

'use strict';

// ─── Minimal phoneUtils replica (matches backend/utils/phoneUtils.js) ──────────
const MIN_PHONE_DIGITS = 7;
function isValidPhone(raw) {
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS;
}
function resolvePhone(phoneRaw, waRaw) {
  if (isValidPhone(phoneRaw)) return phoneRaw;
  if (isValidPhone(waRaw))    return waRaw;
  return '';
}

// ─── In-memory Lead store ──────────────────────────────────────────────────────
let leads = [];
let tombstones = [];
let nextId = 1;

function resetStore() {
  leads      = [];
  tombstones = [];
  nextId     = 1;
}

// Mirrors the fixed dedup logic in internalSyncController.syncTab()
// and integrationController.syncGoogleSheet().
async function processRow({
  tenantId, spreadsheetId, tabName, rowIndex,
  idColVal = '',
  name: nameArg, phone: phoneArg, email: emailArg,
}) {
  const externalLeadId = idColVal || `gsheets:${tabName}:R${rowIndex}`;
  const externalSource = 'google_sheets';

  const phone = isValidPhone(phoneArg) ? phoneArg : '';
  const email = emailArg || '';
  const name  = nameArg || (email ? email.split('@')[0] : '') || phone || `Unknown (Row ${rowIndex})`;

  // Step 1: exact key — scoped + legacy fallback
  const byKey = leads.find(l =>
    l.tenantId === tenantId &&
    l.externalLeadId === externalLeadId &&
    l.externalSource === externalSource &&
    (l.spreadsheetId === spreadsheetId || !l.spreadsheetId)
  );
  if (byKey) return { action: 'skipped', reason: 'byKey' };

  // Step 1b: tombstone — STRICT: exact spreadsheetId only (no legacy fallback).
  // Tombstones with spreadsheetId:'' (pre-tracking era) must NOT block rows from a
  // new, identified spreadsheet. Only tombstones scoped to THIS spreadsheet apply.
  const tombstone = tombstones.find(t =>
    t.tenantId === tenantId &&
    t.externalSource === externalSource &&
    t.externalLeadId === externalLeadId &&
    t.spreadsheetId  === spreadsheetId
  );
  if (tombstone) return { action: 'skipped', reason: 'tombstone' };

  // Step 2: phone — STRICT same spreadsheet only
  if (phone) {
    const byPhone = leads.find(l =>
      l.tenantId === tenantId &&
      l.phone === phone &&
      l.spreadsheetId === spreadsheetId
    );
    if (byPhone) {
      if (!byPhone.externalLeadId) byPhone.externalLeadId = externalLeadId;
      return { action: 'skipped', reason: 'byPhone' };
    }
  }

  // Step 3: email — STRICT same spreadsheet only
  if (email) {
    const byEmail = leads.find(l =>
      l.tenantId === tenantId &&
      l.email === email &&
      l.spreadsheetId === spreadsheetId
    );
    if (byEmail) {
      if (!byEmail.externalLeadId) byEmail.externalLeadId = externalLeadId;
      return { action: 'skipped', reason: 'byEmail' };
    }
  }

  // Step 4: create
  const lead = {
    _id: String(nextId++),
    tenantId, spreadsheetId, externalLeadId, externalSource,
    name, phone, email,
  };
  leads.push(lead);
  return { action: 'created', lead };
}

// Helper: tombstone a lead (simulates CRM delete)
function deleteLead(leadId) {
  const idx = leads.findIndex(l => l._id === leadId);
  if (idx === -1) throw new Error('Lead not found: ' + leadId);
  const [lead] = leads.splice(idx, 1);
  if (lead.externalSource === 'google_sheets' && lead.externalLeadId) {
    tombstones.push({
      tenantId:       lead.tenantId,
      externalSource: lead.externalSource,
      externalLeadId: lead.externalLeadId,
      spreadsheetId:  lead.spreadsheetId || '',
    });
  }
  return lead;
}

// ─── Test harness ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTest(label, fn) {
  console.log(`\n[Test] ${label}`);
  resetStore();
  try {
    await fn();
  } catch (e) {
    failed++;
    console.error(`  ✗ EXCEPTION: ${e.message}`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Test 1: Two different spreadsheets containing the same phone number create two separate leads.
await runTest('1 · Same phone in two spreadsheets → two separate leads', async () => {
  const T = 'tenant1';
  const PHONE = '+919000000001';

  const r1 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Leads', rowIndex: 2, name: 'Alice', phone: PHONE });
  const r2 = await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Leads', rowIndex: 2, name: 'Bob',   phone: PHONE });

  assert(r1.action === 'created', 'Lead from spreadsheet A created');
  assert(r2.action === 'created', 'Lead from spreadsheet B created (not merged into A)');
  assert(leads.length === 2,      'Total lead count is 2, not 1');
  assert(leads[0].spreadsheetId === 'sheetA', 'Lead 1 belongs to sheetA');
  assert(leads[1].spreadsheetId === 'sheetB', 'Lead 2 belongs to sheetB');
});

// Test 2: Two different spreadsheets containing the same email create two separate leads.
await runTest('2 · Same email in two spreadsheets → two separate leads', async () => {
  const T = 'tenant1';
  const EMAIL = 'shared@example.com';

  const r1 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 3, name: 'Alice', email: EMAIL });
  const r2 = await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Sheet1', rowIndex: 3, name: 'Bob',   email: EMAIL });

  assert(r1.action === 'created', 'Lead from spreadsheet A created');
  assert(r2.action === 'created', 'Lead from spreadsheet B created (not merged into A)');
  assert(leads.length === 2,      'Total lead count is 2, not 1');
});

// Test 3: The same row synced twice does not create a duplicate.
await runTest('3 · Same row synced twice → one lead, second skipped', async () => {
  const T = 'tenant1';

  const r1 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 5, name: 'Carol', phone: '+919111111111' });
  const r2 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 5, name: 'Carol', phone: '+919111111111' });

  assert(r1.action === 'created', 'First sync creates the lead');
  assert(r2.action === 'skipped', 'Second sync skips (dedup by externalLeadId)');
  assert(leads.length === 1,      'Only one lead exists');
});

// Test 4: Updating a row in spreadsheet A does not update a lead belonging to spreadsheet B.
await runTest('4 · Re-syncing spreadsheet A row does not affect spreadsheet B lead', async () => {
  const T = 'tenant1';
  const PHONE = '+919222222222';
  const EMAIL = 'dave@example.com';

  // Sheet B already has a lead with this phone/email
  await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Contacts', rowIndex: 10, name: 'Dave-B', phone: PHONE, email: EMAIL });
  const sheetBLeadNameBefore = leads.find(l => l.spreadsheetId === 'sheetB').name;

  // Sheet A syncs a row with same phone/email — must NOT touch Sheet B's lead
  const r = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Contacts', rowIndex: 10, name: 'Dave-A', phone: PHONE, email: EMAIL });

  const sheetBLeadNameAfter = leads.find(l => l.spreadsheetId === 'sheetB').name;

  assert(r.action === 'created', 'Sheet A row creates a new lead (not linked to Sheet B)');
  assert(sheetBLeadNameBefore === sheetBLeadNameAfter, 'Sheet B lead name is unchanged');
  assert(leads.length === 2, 'Two separate leads exist');
});

// Test 5: Adding spreadsheet B does not change existing leads from spreadsheet A.
await runTest('5 · Adding spreadsheet B leaves spreadsheet A leads untouched', async () => {
  const T = 'tenant1';

  // Pre-existing Sheet A leads
  await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 2, name: 'Eve',   phone: '+919333333333' });
  await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 3, name: 'Frank', phone: '+919444444444' });
  const sheetALeadsBefore = leads.filter(l => l.spreadsheetId === 'sheetA').map(l => l._id);

  // Connect and sync Sheet B (different rows, different people)
  await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Sheet1', rowIndex: 2, name: 'Grace', phone: '+919555555555' });
  await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Sheet1', rowIndex: 3, name: 'Heidi', phone: '+919666666666' });

  const sheetALeadsAfter = leads.filter(l => l.spreadsheetId === 'sheetA').map(l => l._id);

  assert(
    JSON.stringify(sheetALeadsBefore) === JSON.stringify(sheetALeadsAfter),
    'Sheet A lead IDs are identical before and after Sheet B sync'
  );
  assert(leads.filter(l => l.spreadsheetId === 'sheetA').length === 2, 'Sheet A still has exactly 2 leads');
  assert(leads.filter(l => l.spreadsheetId === 'sheetB').length === 2, 'Sheet B has 2 new leads');
});

// Test 6: Disconnecting spreadsheet B does not affect spreadsheet A.
await runTest('6 · Disconnecting spreadsheet B leaves spreadsheet A leads intact', async () => {
  const T = 'tenant1';

  await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Main', rowIndex: 2, name: 'Ivan', phone: '+919777777777' });
  await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Main', rowIndex: 2, name: 'Judy', phone: '+919888888888' });

  assert(leads.length === 2, 'Two leads before disconnection');

  // Simulate disconnecting Sheet B: stop syncing its rows (do NOT delete its leads from CRM).
  // The disconnect operation only removes the integration config document — CRM leads are preserved.
  // We verify this by simulating that no further rows come in from sheetB, and sheetA remains fine.
  const sheetALeads = leads.filter(l => l.spreadsheetId === 'sheetA');
  const sheetBLeads = leads.filter(l => l.spreadsheetId === 'sheetB');

  assert(sheetALeads.length === 1, 'Sheet A lead still present after Sheet B disconnection');
  assert(sheetBLeads.length === 1, 'Sheet B lead still present in CRM (disconnect does not delete CRM leads)');

  // Re-syncing Sheet A after Sheet B disconnect still works correctly
  const r = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Main', rowIndex: 3, name: 'Karl', phone: '+919900000001' });
  assert(r.action === 'created', 'Sheet A can still import new rows after Sheet B disconnect');
});

// Test 7: Missing or invalid contact fields do not cause unrelated leads to merge.
await runTest('7 · Missing / invalid contact fields do not cause cross-lead merging', async () => {
  const T = 'tenant1';

  // Row with invalid phone (too short) — should NOT be used for dedup
  const INVALID_PHONE = '123'; // < 7 digits

  const r1 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 4, name: 'Lead-A', phone: INVALID_PHONE });
  const r2 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 5, name: 'Lead-B', phone: INVALID_PHONE });
  const r3 = await processRow({ tenantId: T, spreadsheetId: 'sheetB', tabName: 'Sheet1', rowIndex: 4, name: 'Lead-C', phone: INVALID_PHONE });

  assert(r1.action === 'created', 'Lead-A created despite invalid phone');
  assert(r2.action === 'created', 'Lead-B created — invalid phone did not cause dedup with Lead-A');
  assert(r3.action === 'created', 'Lead-C created from different spreadsheet despite matching invalid phone');
  assert(leads.length === 3,      'Three separate leads exist — no merging');

  // Rows with no name, no phone, no email → fallback name used, no merging
  const r4 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 10 });
  const r5 = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 11 });

  assert(r4.action === 'created', 'No-contact-info row from sheetA row 10 creates lead');
  assert(r5.action === 'created', 'No-contact-info row from sheetA row 11 creates separate lead (different rowIndex key)');
  assert(leads.length === 5, 'Five total leads — no merging via empty fields');

  // Verify tombstone isolation: delete Lead-A and re-sync — Lead-B must NOT be blocked
  deleteLead(leads.find(l => l.name === 'Lead-A')._id);
  const r1b = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 4, name: 'Lead-A-Retry', phone: INVALID_PHONE });
  const r2b = await processRow({ tenantId: T, spreadsheetId: 'sheetA', tabName: 'Sheet1', rowIndex: 5, name: 'Lead-B-Retry', phone: INVALID_PHONE });

  assert(r1b.action === 'skipped' && r1b.reason === 'tombstone', 'Deleted Lead-A row is blocked by tombstone');
  assert(r2b.action === 'skipped' && r2b.reason === 'byKey',     'Lead-B row skipped because lead still exists (tombstone does not bleed across rows)');
});

// Test 8: Legacy tombstone (spreadsheetId:'') must NOT block a new spreadsheet.
// Reproduces the production bug: 62 tombstones with spreadsheetId:'' from an old
// spreadsheet incorrectly blocked 62 rows from a newly connected spreadsheet.
await runTest('8 · Legacy tombstones (spreadsheetId:"") do not block a new spreadsheet', async () => {
  const T      = 'tenant1';
  const OLD_ID = '';           // legacy — pre-tracking era, spreadsheetId was not stored
  const NEW_ID = 'NEW_SHEET_ABC123';
  const TAB    = 'PM Leads';

  // Simulate 62 legacy tombstones (old sheet, unknown origin).
  for (let i = 2; i <= 63; i++) {
    tombstones.push({
      tenantId:       T,
      externalSource: 'google_sheets',
      externalLeadId: `gsheets:${TAB}:R${i}`,
      spreadsheetId:  OLD_ID,   // '' — same as the production bug
    });
  }
  assert(tombstones.length === 62, 'Pre-condition: 62 legacy tombstones exist with spreadsheetId:""');

  // Sync new spreadsheet — same tab name, same row range as the old one.
  let created = 0;
  let tombstoneBlocked = 0;
  for (let i = 2; i <= 65; i++) {  // 64 data rows (indices 2–65)
    const r = await processRow({
      tenantId: T, spreadsheetId: NEW_ID, tabName: TAB, rowIndex: i,
      name: `Lead ${i}`, phone: `+9190${String(i).padStart(8, '0')}`,
    });
    if (r.action === 'created')  created++;
    if (r.reason  === 'tombstone') tombstoneBlocked++;
  }

  assert(tombstoneBlocked === 0,  'Legacy tombstones (spreadsheetId:"") do NOT block new spreadsheet rows');
  assert(created === 64,          'All 64 rows from new spreadsheet are imported');
  assert(leads.length === 64,     'Total lead count is 64');
});

// Test 9: Same-spreadsheet tombstone (real spreadsheetId) still prevents re-import.
// Ensures the strict fix does not accidentally allow re-importing deleted rows from
// the same spreadsheet when a proper tombstone exists.
await runTest('9 · Same-spreadsheet tombstone (real spreadsheetId) still blocks re-import', async () => {
  const T      = 'tenant1';
  const SHEET  = 'SHEET_DEF456';
  const TAB    = 'Leads';

  // First import: create 3 leads from sheet SHEET.
  const r1 = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: 2, name: 'Alpha', phone: '+919001000001' });
  const r2 = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: 3, name: 'Beta',  phone: '+919001000002' });
  const r3 = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: 4, name: 'Gamma', phone: '+919001000003' });
  assert(r1.action === 'created' && r2.action === 'created' && r3.action === 'created', '3 leads created initially');

  // User deletes 2 of them → tombstones with the real spreadsheetId.
  deleteLead(leads.find(l => l.name === 'Alpha')._id);
  deleteLead(leads.find(l => l.name === 'Beta')._id);
  assert(tombstones.length === 2, 'Two tombstones exist with spreadsheetId:SHEET_DEF456');
  assert(tombstones.every(t => t.spreadsheetId === SHEET), 'All tombstones carry the real spreadsheetId');

  // Re-sync same sheet — deleted rows must be blocked; surviving row must be deduped by byKey.
  const rAlphaRetry = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: 2, name: 'Alpha-Retry', phone: '+919001000001' });
  const rBetaRetry  = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: 3, name: 'Beta-Retry',  phone: '+919001000002' });
  const rGammaRetry = await processRow({ tenantId: T, spreadsheetId: SHEET, tabName: TAB, rowIndex: 4, name: 'Gamma-Retry', phone: '+919001000003' });

  assert(rAlphaRetry.action === 'skipped' && rAlphaRetry.reason === 'tombstone', 'Alpha re-import blocked by same-sheet tombstone');
  assert(rBetaRetry.action  === 'skipped' && rBetaRetry.reason  === 'tombstone', 'Beta re-import blocked by same-sheet tombstone');
  assert(rGammaRetry.action === 'skipped' && rGammaRetry.reason === 'byKey',     'Gamma skipped by byKey (still exists, not deleted)');
  assert(leads.filter(l => l.spreadsheetId === SHEET).length === 1,              'Only 1 lead survives (Gamma)');

  // Crucially: a DIFFERENT spreadsheet with the same tab/row is NOT blocked.
  const OTHER = 'SHEET_OTHER_XYZ';
  const rOther2 = await processRow({ tenantId: T, spreadsheetId: OTHER, tabName: TAB, rowIndex: 2, name: 'Other-Alpha', phone: '+919002000001' });
  const rOther3 = await processRow({ tenantId: T, spreadsheetId: OTHER, tabName: TAB, rowIndex: 3, name: 'Other-Beta',  phone: '+919002000002' });
  assert(rOther2.action === 'created', 'Different sheet row 2 not blocked by Sheet DEF tombstone');
  assert(rOther3.action === 'created', 'Different sheet row 3 not blocked by Sheet DEF tombstone');
});

// Test 10: The exact production bug regression test.
//
// Scenario (mirrors what happened in production):
//   • Old spreadsheet (SHEET_OLD) was synced; 64 leads imported with tab "PM Leads".
//   • User deleted all 64 leads → 64 tombstones with spreadsheetId: SHEET_OLD.
//   • New demo spreadsheet (SHEET_NEW) is connected; has the same tab "PM Leads"
//     with the same 64 row positions (R2–R65).
//   • Manual sync runs for SHEET_NEW → should import all 64 rows (0 tombstone-blocked).
//
// This test verifies that tombstones scoped to SHEET_OLD do not block SHEET_NEW,
// AND that tombstones scoped to SHEET_NEW correctly prevent re-import from SHEET_NEW.
await runTest('10 · Production-bug regression: SHEET_OLD tombstones do not block SHEET_NEW (identical tab+rows)', async () => {
  const T        = 'tenant1';
  const SHEET_OLD = 'OLD_SPREADSHEET_1ABC';
  const SHEET_NEW = 'NEW_DEMO_SPREADSHEET_2XYZ';
  const TAB       = 'PM Leads';
  const ROW_COUNT = 64; // rows R2–R65

  // ── Phase 1: Import 64 rows from SHEET_OLD ──────────────────────────────
  for (let i = 2; i <= ROW_COUNT + 1; i++) {
    const r = await processRow({
      tenantId: T, spreadsheetId: SHEET_OLD, tabName: TAB, rowIndex: i,
      name: `OldLead-${i}`, phone: `+9191${String(i).padStart(8, '0')}`,
    });
    assert(r.action === 'created', `SHEET_OLD R${i}: created`);
  }
  assert(leads.filter(l => l.spreadsheetId === SHEET_OLD).length === ROW_COUNT, `All ${ROW_COUNT} SHEET_OLD leads in store`);

  // ── Phase 2: User deletes all 64 SHEET_OLD leads → tombstones with SHEET_OLD ──
  const oldLeadIds = leads.filter(l => l.spreadsheetId === SHEET_OLD).map(l => l._id);
  for (const id of oldLeadIds) deleteLead(id);
  assert(tombstones.length === ROW_COUNT, `${ROW_COUNT} tombstones created with spreadsheetId=SHEET_OLD`);
  assert(tombstones.every(t => t.spreadsheetId === SHEET_OLD), 'All tombstones carry SHEET_OLD spreadsheetId');

  // ── Phase 3: Sync SHEET_NEW — same tab name and row positions ───────────
  let newCreated = 0, newTombstoneBlocked = 0;
  for (let i = 2; i <= ROW_COUNT + 1; i++) {
    const r = await processRow({
      tenantId: T, spreadsheetId: SHEET_NEW, tabName: TAB, rowIndex: i,
      name: `NewLead-${i}`, phone: `+9192${String(i).padStart(8, '0')}`,
    });
    if (r.action === 'created')    newCreated++;
    if (r.reason === 'tombstone')  newTombstoneBlocked++;
  }
  assert(newTombstoneBlocked === 0,   `SHEET_OLD tombstones do NOT block SHEET_NEW rows (0 tombstone-blocked)`);
  assert(newCreated === ROW_COUNT,    `All ${ROW_COUNT} SHEET_NEW rows imported`);
  assert(leads.filter(l => l.spreadsheetId === SHEET_NEW).length === ROW_COUNT, `${ROW_COUNT} SHEET_NEW leads exist`);

  // ── Phase 4: Re-sync SHEET_NEW — rows skipped by byKey (leads exist) ─────
  let resynced = 0, rekeyBlocked = 0;
  for (let i = 2; i <= ROW_COUNT + 1; i++) {
    const r = await processRow({
      tenantId: T, spreadsheetId: SHEET_NEW, tabName: TAB, rowIndex: i,
      name: `NewLead-${i}-retry`, phone: `+9192${String(i).padStart(8, '0')}`,
    });
    if (r.action === 'skipped' && r.reason === 'byKey') rekeyBlocked++;
    if (r.action === 'created') resynced++;
  }
  assert(resynced === 0,         're-sync SHEET_NEW creates 0 duplicates');
  assert(rekeyBlocked === ROW_COUNT, `All ${ROW_COUNT} SHEET_NEW rows skipped by byKey on re-sync`);

  // ── Phase 5: Delete 3 SHEET_NEW leads → tombstones for SHEET_NEW only ───
  const newLeadIds = leads.filter(l => l.spreadsheetId === SHEET_NEW).slice(0, 3).map(l => l._id);
  for (const id of newLeadIds) deleteLead(id);
  const newTombstones = tombstones.filter(t => t.spreadsheetId === SHEET_NEW);
  assert(newTombstones.length === 3, '3 tombstones now exist for SHEET_NEW');

  // ── Phase 6: Re-sync SHEET_NEW — the 3 deleted rows are now tombstone-blocked ─
  let blocked3 = 0, imported0 = 0;
  for (let i = 2; i <= 4; i++) { // rows R2, R3, R4 — the 3 we deleted
    const r = await processRow({
      tenantId: T, spreadsheetId: SHEET_NEW, tabName: TAB, rowIndex: i,
      name: `NewLead-${i}-retry2`, phone: `+9192${String(i).padStart(8, '0')}`,
    });
    if (r.reason === 'tombstone') blocked3++;
    if (r.action === 'created')   imported0++;
  }
  assert(blocked3 === 3,   '3 SHEET_NEW tombstones correctly block re-import of their own rows');
  assert(imported0 === 0,  'No new leads created for tombstoned SHEET_NEW rows');

  // ── Phase 7: SHEET_OLD tombstones still don't block SHEET_NEW row 50 ────
  const r50 = await processRow({
    tenantId: T, spreadsheetId: SHEET_NEW, tabName: TAB, rowIndex: 50,
    name: 'NewLead-50-extra', phone: '+919200000050',
  });
  assert(r50.action === 'skipped' && r50.reason === 'byKey', 'SHEET_NEW R50 (existing lead) still deduped by byKey');
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
