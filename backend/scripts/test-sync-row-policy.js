'use strict';
/**
 * test-sync-row-policy.js
 *
 * Unit tests for the "import every non-blank row" policy implemented in
 * internalSyncController.syncTab() and integrationController.syncGoogleSheet().
 *
 * Covers:
 *   1.  Missing name   — name fallback from email, phone, row-position label
 *   2.  Missing email  — row still imported
 *   3.  Missing phone  — row still imported
 *   4.  All three missing — row imported with row-position label
 *   5.  Invalid phone values ('female', 'male', 'p:') — not used for dedup,
 *       not stored as phone, preserved in customFields
 *   6.  WhatsApp fallback — valid WA used when phone_number is invalid
 *   7.  WA fallback NOT applied when phone_number is already valid
 *   8.  Blank row detection — truly blank rows counted, not imported
 *   9.  Non-blank row with only invalid phone and no name — still imported
 *   10. Duplicate sync — same externalLeadId never creates two leads
 *   11. No cross-merge — two rows with different invalid phones stay separate
 *   12. externalLeadId stamped on phone match for future dedup
 *   13. Tombstoned rows never re-imported
 *   14. Three tab types — Performance marketer, Intern leads, anonymous tab
 *   15. Row-index identity — R2 and R3 get distinct externalLeadIds
 *
 * This is a pure-logic test — no MongoDB connection required.
 * All DB operations are replaced by in-memory stub objects.
 *
 * Run: node backend/scripts/test-sync-row-policy.js
 */

// ─── Inline copies of the sync helpers (same logic as in the controllers) ─────
// This avoids require()-ing mongoose models and controllers in a test context.

const { normalizePhone, isValidPhone, resolvePhone } = require('../utils/phoneUtils');

const GSHEET_HEADER_MAP = {
  'name': 'name', 'contact name': 'name', 'full name': 'name', 'lead name': 'name',
  'phone': 'phone', 'mobile': 'phone', 'phone number': 'phone',
  'email': 'email', 'email address': 'email',
  'company': 'company', 'company name': 'company', 'organization': 'company',
  'city': 'city', 'state': 'state', 'country': 'country',
  'industry': 'industry', 'budget': 'budget',
  'service': 'serviceRequired', 'service required': 'serviceRequired',
  'website': 'website', 'brand': 'brandName', 'brand name': 'brandName',
  'platform': 'source',
};
const GSHEET_ID_HEADERS = new Set(['id', 'lead id', 'lead_id', 'external id', 'external_id']);
const normalizeHeader   = (h) => String(h).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

/**
 * processRows — mirrors the core row-processing logic from both controllers.
 *
 * @param {string[][]} rawRows  — First row is header. Data rows follow.
 * @param {string}     tabName
 * @param {string}     spreadsheetId
 * @param {object[]}   existingLeads — In-memory "DB" of Lead documents.
 * @param {object[]}   tombstones    — In-memory "DB" of DeletedLeadSource documents.
 * @returns {{ created, skipped, linked, blankRows, errors, leads }}
 */
function processRows(rawRows, tabName, spreadsheetId, existingLeads = [], tombstones = []) {
  if (rawRows.length < 2) return { created: 0, skipped: 0, linked: 0, blankRows: 0, errors: [], leads: [...existingLeads] };

  const originalHeaders = rawRows[0];
  const headers         = rawRows[0].map(normalizeHeader);
  const fieldMap        = {};
  let idColIndex        = -1;
  let whatsappColIndex  = -1;

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

  // NEW: no tab-level gate for missing name column
  const tenantId = 'tenant-1';
  let created = 0, skipped = 0, linked = 0, blankRows = 0;
  const errors = [];
  const leads  = [...existingLeads]; // mutable copy

  for (let i = 1; i < rawRows.length; i++) {
    const row      = rawRows[i];
    const rowIndex = i + 1;

    try {
      // Blank row check
      const isBlankRow = row.every(cell => !String(cell || '').trim());
      if (isBlankRow) { blankRows++; continue; }

      const getVal = (field) => {
        const idx = fieldMap[field];
        return idx !== undefined ? String(row[idx] || '').trim() : '';
      };

      const phoneRaw = getVal('phone');
      const waRaw    = whatsappColIndex !== -1 ? String(row[whatsappColIndex] || '').trim() : '';
      const phone    = resolvePhone(phoneRaw, waRaw);
      const email    = getVal('email');
      const nameRaw  = getVal('name');
      const name     = nameRaw
        || (email ? email.split('@')[0] : '')
        || phone
        || `Unknown (Row ${rowIndex})`;

      const company         = getVal('company');
      const budgetRaw       = getVal('budget');
      const budget          = budgetRaw ? (parseFloat(budgetRaw.replace(/[^0-9.]/g, '')) || 0) : 0;

      const mappedColIndices = new Set([idColIndex, ...Object.values(fieldMap)].filter(n => n !== -1));
      const customFields = {};
      for (let c = 0; c < headers.length; c++) {
        if (!mappedColIndices.has(c) && originalHeaders[c] && row[c]) {
          customFields[String(originalHeaders[c]).trim().toLowerCase()] = String(row[c]).trim();
        }
      }
      // Preserve invalid phone_number in customFields
      if (phoneRaw && !isValidPhone(phoneRaw)) {
        customFields['phone_number'] = phoneRaw;
      }

      const idColVal       = idColIndex !== -1 ? String(row[idColIndex] || '').trim() : '';
      const externalLeadId = idColVal || `gsheets:${tabName}:R${rowIndex}`;
      const externalSource = 'google_sheets';

      // Step 1: exact key dedup
      const byKey = leads.find(l => l.externalLeadId === externalLeadId && l.externalSource === externalSource);
      if (byKey) { skipped++; continue; }

      // Step 1b: tombstone check
      const tombstone = tombstones.find(t => t.tenantId === tenantId && t.externalSource === externalSource && t.externalLeadId === externalLeadId);
      if (tombstone) { skipped++; continue; }

      // Step 2: phone dedup
      if (phone) {
        const byPhone = leads.find(l => l.tenantId === tenantId && l.phone === phone);
        if (byPhone) {
          if (!byPhone.externalLeadId) {
            byPhone.externalLeadId = externalLeadId;
            byPhone.externalSource = externalSource;
          }
          linked++; continue;
        }
      }

      // Step 3: email dedup
      if (email) {
        const byEmail = leads.find(l => l.tenantId === tenantId && l.email === email);
        if (byEmail) {
          if (!byEmail.externalLeadId) {
            byEmail.externalLeadId = externalLeadId;
            byEmail.externalSource = externalSource;
          }
          linked++; continue;
        }
      }

      // Step 4: create
      leads.push({ tenantId, name, phone, email, company, budget, customFields, externalLeadId, externalSource, sheetName: tabName, spreadsheetId });
      created++;

    } catch (e) {
      errors.push({ row: rowIndex, reason: e.message });
    }
  }

  return { created, skipped, linked, blankRows, errors, leads };
}

// ─── Test harness ─────────────────────────────────────────────────────────────
let passCount = 0, failCount = 0;
const failures = [];

function section(title) {
  const bar = '─'.repeat(Math.max(0, 62 - title.length));
  console.log(`\n── ${title} ${bar}`);
}
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓  ${label}`);
    passCount++;
  } else {
    console.log(`  ✗  ${label}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
    failCount++;
    failures.push(label);
  }
}
function assertTrue(label, value) {
  assert(label, !!value, true);
}
function assertFalse(label, value) {
  assert(label, !!value, false);
}

// ─── Performance marketer headers (matches production sheet) ─────────────────
const PM_HEADERS = [
  'id', 'Name', 'Email', 'whatsapp_number', 'phone_number',
  'Company', 'Budget', 'city', 'campaign_id',
];

// ─── 1. Missing name: fallback from email ─────────────────────────────────────
section('1. Missing name — fallback from email');
{
  const rows = [
    PM_HEADERS,
    ['R1', '', 'alice@example.com', '', 'p:+911234567890', 'Acme', '', '', ''],
  ];
  const { created, leads } = processRows(rows, 'Performance marketer', 'sheet1');
  assert('created = 1',    created, 1);
  assert('name = email prefix', leads[0].name, 'alice');
  assert('email stored',  leads[0].email,  'alice@example.com');
}

// ─── 2. Missing name: fallback from phone ────────────────────────────────────
section('2. Missing name — fallback from phone');
{
  const rows = [
    PM_HEADERS,
    ['R1', '', '', '', 'p:+911234567890', '', '', '', ''],
  ];
  const { created, leads } = processRows(rows, 'Performance marketer', 'sheet1');
  assert('created = 1',   created, 1);
  assert('name = phone',  leads[0].name, 'p:+911234567890');
}

// ─── 3. Missing name: fallback from row-position label ───────────────────────
section('3. Missing name — fallback to row-position label');
{
  const rows = [
    PM_HEADERS,
    ['R1', '', '', '', '', 'Acme Corp', '5000', '', ''],
  ];
  const { created, leads } = processRows(rows, 'Performance marketer', 'sheet1');
  assert('created = 1',          created, 1);
  assert('name = Unknown (Row 2)', leads[0].name, 'Unknown (Row 2)');
}

// ─── 4. Missing name, email AND phone — still imported ───────────────────────
section('4. All three missing — row imported with row-position label');
{
  const rows = [
    ['Name', 'Email', 'Phone'],
    ['', '', ''],         // technically blank — must be handled
    ['', '', '', '', 'SomeCompany'],  // more columns with data → NOT blank
  ];
  // Row 2 (index 1): all mapped columns empty, but the overall row has no cells with data → blank
  // Let's make row 3 have data in an unmapped column
  const headers2 = ['Name', 'Email', 'Phone', 'Company'];
  const rows2 = [
    headers2,
    ['', '', '', 'Acme Corp'],
  ];
  const { created, leads } = processRows(rows2, 'test tab', 'sheet1');
  assert('created = 1', created, 1);
  assertTrue('name is row-label', leads[0].name.startsWith('Unknown (Row'));
}

// ─── 5. Invalid phone values not used for dedup, preserved in customFields ───
section('5. Invalid phone values — no dedup, preserved in customFields');
{
  // Row A: phone_number = 'female'
  // Row B: phone_number = 'male'
  // They must NOT be merged (separate leads)
  const rows = [
    ['Name', 'phone_number'],
    ['Alice', 'female'],
    ['Bob',   'male'],
  ];
  const { created, leads } = processRows(rows, 'PM', 'sheet1');
  assert('two separate leads created', created, 2);
  // Invalid phone not stored in Lead.phone
  assert('Alice phone empty',          leads[0].phone, '');
  assert('Bob phone empty',            leads[1].phone, '');
  // Invalid value preserved in customFields
  assert('Alice phone_number in customFields', leads[0].customFields['phone_number'], 'female');
  assert('Bob phone_number in customFields',   leads[1].customFields['phone_number'], 'male');
}

// ─── 6. WA fallback: invalid phone_number → valid whatsapp_number used ───────
section('6. WhatsApp fallback — valid WA used when phone_number is invalid');
{
  const rows = [
    ['Name', 'whatsapp_number', 'phone_number'],
    ['Carol', 'p:+919001234567', 'female'],
  ];
  const { created, leads } = processRows(rows, 'PM', 'sheet1');
  assert('created = 1',                  created, 1);
  assert('phone = WA number',            leads[0].phone, 'p:+919001234567');
  assert('invalid phoneRaw in customFields', leads[0].customFields['phone_number'], 'female');
}

// ─── 7. WA fallback NOT applied when phone_number is valid ───────────────────
section('7. WA fallback NOT applied when phone_number is already valid');
{
  const rows = [
    ['Name', 'whatsapp_number', 'phone_number'],
    ['Dave', 'p:+919009876543', 'p:+911112223333'],
  ];
  const { created, leads } = processRows(rows, 'PM', 'sheet1');
  assert('created = 1',            created, 1);
  assert('phone = phone_number',   leads[0].phone, 'p:+911112223333');
  assertFalse('no phone_number in customFields (valid phone not preserved)', leads[0].customFields['phone_number']);
}

// ─── 8. Blank row detection ───────────────────────────────────────────────────
section('8. Blank row detection — blank rows counted, not imported');
{
  const rows = [
    ['Name', 'Email', 'Phone'],
    ['Alice', 'alice@a.com', 'p:+911234567890'], // real row
    ['', '', ''],                                  // truly blank
    ['', '', '   '],                               // whitespace-only blank
    ['Bob', '', ''],                               // non-blank (has name)
  ];
  const { created, blankRows } = processRows(rows, 'tab1', 'sheet1');
  assert('created = 2',    created,   2);
  assert('blankRows = 2',  blankRows, 2);
}

// ─── 9. Non-blank row with only an invalid phone — still imported ─────────────
section('9. Non-blank row with only invalid phone and no name — still imported');
{
  const rows = [
    ['Name', 'phone_number'],
    ['', 'p:'],  // 'p:' has no digits — invalid phone, but row is non-blank (has 'p:' in a cell)
  ];
  const { created } = processRows(rows, 'tab1', 'sheet1');
  assert('created = 1 (row not skipped)', created, 1);
}

// ─── 10. Duplicate sync — same externalLeadId never creates two leads ─────────
section('10. Duplicate sync — re-syncing same row does not create duplicate');
{
  const rows = [
    ['Name', 'Email', 'Phone'],
    ['Eve', 'eve@e.com', 'p:+911234567890'],
  ];
  const { created: c1, leads: leads1 } = processRows(rows, 'tab1', 'sheet1', []);
  assert('first sync: created = 1', c1, 1);

  // Second sync with the same rows (same externalLeadId)
  const { created: c2, skipped: s2 } = processRows(rows, 'tab1', 'sheet1', leads1);
  assert('second sync: created = 0', c2, 0);
  assert('second sync: skipped = 1', s2, 1);
}

// ─── 11. No cross-merge — rows with different invalid phones stay separate ────
section('11. No cross-merge — two rows with different invalid phones are separate leads');
{
  const rows = [
    ['Name', 'phone_number'],
    ['Alice', 'female'],
    ['Bob',   'male'],
    ['Carol', 'p:'],
  ];
  const { created } = processRows(rows, 'tab1', 'sheet1');
  assert('three separate leads created', created, 3);
}

// ─── 12. externalLeadId stamped on phone match ───────────────────────────────
section('12. externalLeadId stamped on phone match for future dedup');
{
  // Existing lead has no externalLeadId (e.g. manually added)
  const existingLeads = [
    { tenantId: 'tenant-1', name: 'Frank', phone: 'p:+911112223333', email: '', externalLeadId: null, externalSource: null },
  ];
  const rows = [
    ['Name', 'phone_number'],
    ['Frank', 'p:+911112223333'],
  ];
  const { linked, leads } = processRows(rows, 'tab1', 'sheet1', existingLeads);
  assert('linked = 1',          linked, 1);
  // The existing lead should now have externalLeadId stamped
  const frank = leads.find(l => l.name === 'Frank');
  assert('externalLeadId stamped', frank.externalLeadId, 'gsheets:tab1:R2');
  assert('externalSource stamped', frank.externalSource,  'google_sheets');

  // On re-sync: Step 1 (exact key match) should now find it → skipped
  const { skipped } = processRows(rows, 'tab1', 'sheet1', leads);
  assert('next sync: skipped by key (not phone query)', skipped, 1);
}

// ─── 13. Tombstoned rows never re-imported ───────────────────────────────────
section('13. Tombstoned rows are skipped');
{
  const tombstones = [
    { tenantId: 'tenant-1', externalSource: 'google_sheets', externalLeadId: 'gsheets:tab1:R2' },
  ];
  const rows = [
    ['Name', 'Email'],
    ['Grace', 'grace@g.com'],
  ];
  const { created, skipped } = processRows(rows, 'tab1', 'sheet1', [], tombstones);
  assert('created = 0 (tombstoned)', created, 0);
  assert('skipped = 1',              skipped, 1);
}

// ─── 14. Three tab types — PM, Intern leads, and no-name-column tab ───────────
section('14. Three sheet tab types handled correctly');

// 14a. Performance marketer tab (has whatsapp_number fallback rows)
{
  const rows = [
    ['Name', 'whatsapp_number', 'phone_number', 'Email', 'Company'],
    ['Alice', 'p:+919001111111', 'female',      'a@a.com', 'Acme'],  // WA fallback
    ['Bob',   '',               'p:+919002222222', 'b@b.com', ''],   // valid phone_number
    ['',      'p:+919003333333', '',              '',        'X Co'], // no name, WA fallback
  ];
  const { created, leads } = processRows(rows, 'Performance marketer', 'sheet1');
  assert('[PM] created = 3 (all rows imported)', created, 3);
  assert('[PM] Alice phone = WA', leads[0].phone, 'p:+919001111111');
  assert('[PM] Bob phone = phone_number', leads[1].phone, 'p:+919002222222');
  assert('[PM] Row 4 fallback name = phone', leads[2].name, 'p:+919003333333');
}

// 14b. Intern leads tab (no whatsapp_number column)
{
  const rows = [
    ['Name', 'phone_number', 'Email'],
    ['Hina', 'p:+919004444444', 'hina@h.com'],
    ['Iram', 'p:<test dummy>',  'iram@i.com'],  // invalid phone, valid email
    ['',     '',                'jane@j.com'],   // no name, fallback from email
  ];
  const { created, leads } = processRows(rows, 'Intern leads', 'sheet1');
  assert('[IL] created = 3', created, 3);
  assert('[IL] Iram phone empty (invalid)', leads[1].phone, '');
  assert('[IL] Iram invalid phone in customFields', leads[1].customFields['phone_number'], 'p:<test dummy>');
  assert('[IL] Row 4 name = email prefix', leads[2].name, 'jane');
}

// 14c. Tab with no Name column at all
{
  const rows = [
    ['Email', 'Budget'],
    ['kevin@k.com', '10000'],
    ['',           '20000'],  // no email but has budget → non-blank
  ];
  const { created, leads } = processRows(rows, 'No-name tab', 'sheet1');
  assert('[NN] created = 2 (tab not skipped)', created, 2);
  assert('[NN] Row 2 name = email prefix', leads[0].name, 'kevin');
  assertTrue('[NN] Row 3 name is row-label', leads[1].name.startsWith('Unknown (Row'));
}

// ─── 15. Row-index identity — R2 and R3 get distinct externalLeadIds ─────────
section('15. Row-index identity — adjacent rows get distinct externalLeadIds');
{
  const rows = [
    ['Name', 'Email'],
    ['Lead A', 'a@a.com'],
    ['Lead B', 'b@b.com'],
  ];
  const { created, leads } = processRows(rows, 'tab1', 'sheet1');
  assert('created = 2', created, 2);
  assert('R2 externalLeadId', leads[0].externalLeadId, 'gsheets:tab1:R2');
  assert('R3 externalLeadId', leads[1].externalLeadId, 'gsheets:tab1:R3');
  assertFalse('IDs are distinct', leads[0].externalLeadId === leads[1].externalLeadId);
}

// ─── Bonus: WA column NOT clobbered by phone column (header order safety) ─────
section('Bonus: WA column does not block phone_number from being mapped');
{
  // whatsapp_number appears BEFORE phone_number in the header row (matches real sheet)
  const rows = [
    ['Name', 'whatsapp_number', 'phone_number'],
    ['Zoe',  'p:+919009991111', 'p:+919009992222'],
  ];
  const { leads } = processRows(rows, 'PM', 'sheet1');
  // phone_number is mapped to Lead.phone because WA is tracked outside fieldMap
  assert('phone = phone_number (not WA)',   leads[0].phone, 'p:+919009992222');
  assertFalse('no phone_number in customFields (valid phone)',   leads[0].customFields['phone_number']);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passCount} passed, ${failCount} failed`);
console.log('══════════════════════════════════════════════════════════════\n');
if (failCount > 0) {
  console.log('Failed tests:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
