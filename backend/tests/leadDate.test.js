/**
 * leadDate.test.js
 *
 * Original sheet date (`created_time`) → Lead.leadDate.
 *   1. Parser (utils/leadDate.js): formats, timezone rules, calendar-date preservation, invalid input.
 *   2. Backfill helper: only fills an EMPTY leadDate, never touches createdAt/updatedAt.
 *   3. The three real Google Sheets sync paths (native OAuth, scheduled, Apps Script webhook)
 *      run end to end against mocked persistence and a mocked Google Sheets API.
 *
 * No database or network connection is ever opened.
 */

const crypto = require('crypto');

// ── Shared in-memory persistence (names prefixed "mock" for jest) ─────────────
let mockExisting = {};      // externalLeadId → existing lead doc
let mockCreated = [];       // Lead.create payloads
let mockUpdateOne = [];     // Lead.updateOne calls
let mockFindOneAndUpdate = [];
let mockSheetRows = [];     // values returned by the fake Google Sheets API
let mockIntegrationDoc = null;

jest.mock('../models/Lead', () => ({
  findOne: jest.fn(async (q) => mockExisting[q.externalLeadId] || null),
  exists: jest.fn(async (q) => (mockExisting[q.externalLeadId] ? { _id: mockExisting[q.externalLeadId]._id } : null)),
  create: jest.fn(async (doc) => { mockCreated.push(doc); return doc; }),
  updateOne: jest.fn(async (filter, update, opts) => { mockUpdateOne.push({ filter, update, opts }); return { modifiedCount: 1 }; }),
  findOneAndUpdate: jest.fn(async (filter, update, opts) => { mockFindOneAndUpdate.push({ filter, update, opts }); return mockExisting[filter.externalLeadId] || null; }),
}));
jest.mock('../models/DeletedLeadSource', () => ({ findOne: jest.fn(async () => null), countDocuments: jest.fn(async () => 0) }));
jest.mock('../models/Integration', () => ({
  findOne: jest.fn(() => { const p = Promise.resolve(mockIntegrationDoc); p.lean = async () => mockIntegrationDoc; return p; }),
  findOneAndUpdate: jest.fn(async () => ({})),
  findByIdAndUpdate: jest.fn(() => { const p = Promise.resolve({}); p.catch = () => p; return p; }),
}));
jest.mock('../models/Pipeline', () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock('../models/PipelineMapping', () => ({ findOne: jest.fn(), updateMany: jest.fn(), findOneAndUpdate: jest.fn() }));
// Pipeline routing is out of scope here: no pipeline assignment.
jest.mock('../utils/pipelineRouting', () => ({ resolveLeadPipeline: jest.fn(async () => ({ pipelineId: null, stageId: null, stageName: null, stageType: 'open' })) }));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn(async () => {}) }));
jest.mock('../utils/driveWatch', () => ({ createDriveWatch: jest.fn(async () => null), stopDriveWatch: jest.fn(async () => {}) }));

// Fake Google Sheets API: every https.get returns the current mockSheetRows
jest.mock('https', () => {
  const { EventEmitter } = require('events');
  return {
    get: (url, opts, cb) => {
      const callback = typeof opts === 'function' ? opts : cb;
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = () => {};
      setImmediate(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        const body = /fields=sheets/.test(url)
          ? { sheets: [{ properties: { title: 'Tab1' } }] }
          : { values: mockSheetRows };
        res.emit('data', JSON.stringify(body));
        res.emit('end');
      });
      return req;
    },
    request: jest.fn(),
  };
});

const Lead = require('../models/Lead');
const { encryptFields, encrypt } = require('../utils/encryption');
const { parseSheetDate, leadDateFromCustomFields, backfillLeadDate } = require('../utils/leadDate');

const NOW = Date.UTC(2026, 10, 19, 6, 0, 0);          // 2026-11-19 06:00 UTC, injected for the parser tests
const p = (v) => parseSheetDate(v, { now: NOW });
const iso = (d) => (d ? d.toISOString() : null);

// ─────────────────────────────────────────────────────────────────────────────
describe('parseSheetDate — supported formats', () => {
  test.each([
    // [input, expected ISO instant, why]
    ['15-11-2026',                    '2026-11-15T12:00:00.000Z', 'DD-MM-YYYY (date only → noon UTC)'],
    ['15/11/2026',                    '2026-11-15T12:00:00.000Z', 'DD/MM/YYYY'],
    ['15.11.2026',                    '2026-11-15T12:00:00.000Z', 'DD.MM.YYYY'],
    ['5-1-2026',                      '2026-01-05T12:00:00.000Z', 'single-digit day and month'],
    ['2026-11-15',                    '2026-11-15T12:00:00.000Z', 'YYYY-MM-DD'],
    ['  15-11-2026  ',                '2026-11-15T12:00:00.000Z', 'surrounding whitespace'],
    ['2026-11-15T10:23:45+05:30',     '2026-11-15T04:53:45.000Z', 'ISO with +05:30 offset (Meta)'],
    ['2026-11-15T10:23:45+0530',      '2026-11-15T04:53:45.000Z', 'ISO with +0530 offset'],
    ['2026-11-15T04:53:45Z',          '2026-11-15T04:53:45.000Z', 'ISO UTC'],
    ['2026-11-15T04:53:45.123Z',      '2026-11-15T04:53:45.123Z'.replace('.123', '.000'), 'ISO with milliseconds'],
    ['2026-11-15T10:23:45-08:00',     '2026-11-15T18:23:45.000Z', 'ISO with negative offset'],
    ['2026-11-15T10:23:45',           '2026-11-15T04:53:45.000Z', 'ISO without offset → India time'],
    ['2026-11-15 10:23:45',           '2026-11-15T04:53:45.000Z', 'ISO with space separator, India time'],
    ['2026-11-15 10:23',              '2026-11-15T04:53:00.000Z', 'no seconds'],
    ['15-11-2026 14:30',              '2026-11-15T09:00:00.000Z', 'DD-MM-YYYY HH:mm → India time'],
    ['15/11/2026 14:30:15',           '2026-11-15T09:00:15.000Z', 'DD/MM/YYYY HH:mm:ss'],
    ['15/11/2026 2:30:15 PM',         '2026-11-15T09:00:15.000Z', '12-hour clock PM'],
    ['15/11/2026 12:05 AM',           '2026-11-14T18:35:00.000Z', '12:05 AM = 00:05 India time'],
    ['15/11/2026 12:00 PM',           '2026-11-15T06:30:00.000Z', '12 PM = noon India time'],
    ['15-11-2026 00:30',              '2026-11-14T19:00:00.000Z', 'just after midnight India time (previous day in UTC)'],
    ['29-02-2028',                    '2028-02-29T12:00:00.000Z', 'valid leap day'],
  ])('%s → %s (%s)', (input, expected) => {
    // 2028 leap-day case needs a later "now" than the shared one
    const now = input === '29-02-2028' ? Date.UTC(2030, 0, 1) : NOW;
    expect(iso(parseSheetDate(input, { now }))).toBe(expected);
  });

  test('spreadsheet serial numbers: integer = date only, fraction = time (India)', () => {
    expect(iso(p(46341))).toBe('2026-11-15T12:00:00.000Z');       // number
    expect(iso(p('46341'))).toBe('2026-11-15T12:00:00.000Z');     // numeric string
    expect(iso(p(46341.5))).toBe('2026-11-15T06:30:00.000Z');     // 12:00 India time
    expect(iso(p('46341.75'))).toBe('2026-11-15T12:30:00.000Z');  // 18:00 India time
  });

  test('JavaScript Date values (Apps Script) are kept; invalid Date → null', () => {
    expect(iso(p(new Date('2026-11-15T10:00:00Z')))).toBe('2026-11-15T10:00:00.000Z');
    expect(p(new Date('nope'))).toBeNull();
  });

  test('returns a new Date (the input Date is not shared)', () => {
    const d = new Date('2026-11-15T10:00:00Z');
    expect(p(d)).not.toBe(d);
  });
});

describe('parseSheetDate — empty, invalid and out-of-range input returns null', () => {
  test.each([
    [null], [undefined], [''], ['   '], ['abc'], ['not a date'], ['N/A'], ['-'],
    [{}], [[]], [true], [NaN], [Infinity],
    ['31-02-2026'], ['29-02-2027'], ['32-01-2026'], ['00-01-2026'], ['15-13-2026'], ['15-00-2026'],
    ['2026-02-30'], ['2026-13-01'], ['2026-00-10'],
    ['15-11-2026 25:00'], ['15-11-2026 10:61'], ['15-11-2026 13:00 PM'], ['15-11-2026 0:30 AM'],
    ['2026-11-15T24:00:00Z'], ['2026-11-15T10:23:45+25:00x'],
    ['11/15/2026'],                         // month-first is not supported
    ['15-11-26'], ['2026/11/15'], ['20261115'], ['Nov 15, 2026'], ['15 Nov 2026'],
    ['01-01-1999'], ['1999-12-31'], [1000], [99999999],     // before 2000 / bad serials
    ['15-11-2090'],                          // far future
    [0], [-5],
  ])('%p → null', (input) => {
    expect(p(input)).toBeNull();
  });

  test('today is accepted; dates beyond one day in the future are rejected', () => {
    expect(p('19-11-2026')).not.toBeNull();   // "today" (stored at noon UTC, a few hours ahead of the injected clock)
    expect(p('21-11-2026')).toBeNull();
    expect(p('22-11-2026')).toBeNull();
  });
});

describe('parseSheetDate — calendar date is preserved for date-only values', () => {
  // The same calendar day must display in every timezone from UTC-11 to UTC+11
  const zones = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Pago_Pago', 'Pacific/Noumea'];
  test.each(['15-11-2026', '15/11/2026', '2026-11-15', '46341'])('%s shows 2026-11-15 in %s zones', (input) => {
    const d = p(input);
    for (const tz of zones) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      expect(parts).toBe('2026-11-15');
    }
  });
  test('first and last day of month/year are not shifted', () => {
    for (const [input, ymd] of [['01-12-2025', '2025-12-01'], ['31-12-2025', '2025-12-31'], ['01-01-2026', '2026-01-01'], ['28-02-2026', '2026-02-28']]) {
      const d = p(input);
      expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)).toBe(ymd);
    }
  });
  test('date-times keep their exact instant and show the India calendar date', () => {
    const d = p('15-11-2026 00:30');   // 00:30 IST on the 15th
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)).toBe('2026-11-15');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('leadDateFromCustomFields', () => {
  test('reads created_time case-insensitively and ignores other keys', () => {
    expect(iso(leadDateFromCustomFields({ created_time: '15-11-2025' }))).toBe('2025-11-15T12:00:00.000Z');
    expect(iso(leadDateFromCustomFields({ Created_Time: '2025-11-15' }))).toBe('2025-11-15T12:00:00.000Z');
    expect(iso(leadDateFromCustomFields({ ' created_time ': '2025-11-15' }))).toBe('2025-11-15T12:00:00.000Z');
    expect(leadDateFromCustomFields({ date: '15-11-2025', created_at: '15-11-2025' })).toBeNull();
  });
  test('missing / invalid / bad container → null', () => {
    expect(leadDateFromCustomFields({})).toBeNull();
    expect(leadDateFromCustomFields({ created_time: 'garbage' })).toBeNull();
    expect(leadDateFromCustomFields({ created_time: '' })).toBeNull();
    expect(leadDateFromCustomFields(null)).toBeNull();
    expect(leadDateFromCustomFields(undefined)).toBeNull();
    expect(leadDateFromCustomFields('x')).toBeNull();
  });
});

describe('backfillLeadDate — fills only an empty leadDate', () => {
  const model = (modified = 1) => ({ updateOne: jest.fn(async () => ({ modifiedCount: modified })) });
  test('writes only leadDate, conditionally on leadDate being empty, without touching timestamps', async () => {
    const m = model();
    const ok = await backfillLeadDate(m, { _id: 'L1', tenantId: 'T1' }, { created_time: '15-11-2025' });
    expect(ok).toBe(true);
    const [filter, update, opts] = m.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'L1', tenantId: 'T1', leadDate: null });   // never overwrites an existing leadDate
    expect(Object.keys(update)).toEqual(['$set']);
    expect(Object.keys(update.$set)).toEqual(['leadDate']);                 // createdAt is never written
    expect(update.$set.leadDate.toISOString()).toBe('2025-11-15T12:00:00.000Z');
    expect(opts).toEqual({ timestamps: false });                            // updatedAt not bumped either
  });
  test('no write without tenantId, or when the date is missing/invalid', async () => {
    const m = model();
    expect(await backfillLeadDate(m, { _id: 'L1' }, { created_time: '15-11-2025' })).toBe(false);
    expect(await backfillLeadDate(m, null, { created_time: '15-11-2025' })).toBe(false);
    expect(await backfillLeadDate(m, { _id: 'L1', tenantId: 'T1' }, {})).toBe(false);
    expect(await backfillLeadDate(m, { _id: 'L1', tenantId: 'T1' }, { created_time: 'junk' })).toBe(false);
    expect(m.updateOne).not.toHaveBeenCalled();
  });
  test('returns false when nothing was modified (lead already had a leadDate)', async () => {
    expect(await backfillLeadDate(model(0), { _id: 'L1', tenantId: 'T1' }, { created_time: '15-11-2025' })).toBe(false);
  });
  test('a database failure is logged, never thrown, and does not abort the sync', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const m = { updateOne: jest.fn(async () => { throw new Error('db down'); }) };
    expect(await backfillLeadDate(m, { _id: 'L1', tenantId: 'T1' }, { created_time: '15-11-2025' })).toBe(false);
    expect(spy.mock.calls.flat().join(' ')).toMatch(/db down/);
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end through the three real sync paths
// ─────────────────────────────────────────────────────────────────────────────
const TENANT = '64b000000000000000000001';
const SHEET_ID = 'SPREADSHEET-ID-1';
const HEADER = ['id', 'full_name', 'phone_number', 'platform', 'created_time', 'ad_name'];
const ROWS = [
  HEADER,
  ['N1', 'New One',   '9876543210', 'fb', '15-11-2025',                '03/11 - Client Video'],  // new, DD-MM-YYYY
  ['N2', 'New Two',   '9876543211', 'fb', '2025-11-15T10:23:45+05:30', '03/11 - Client Video'],  // new, ISO
  ['N3', 'New Three', '9876543212', 'fb', '',                          '03/11 - Client Video'],  // new, empty date
  ['N4', 'New Four',  '9876543213', 'fb', 'garbage',                   '03/11 - Client Video'],  // new, invalid date
  ['E1', 'Old One',   '9876543214', 'fb', '14-11-2025',                'x'],                     // existing, no leadDate → backfill
  ['E2', 'Old Two',   '9876543215', 'fb', '13-11-2025',                'x'],                     // existing, has leadDate → untouched
  ['E3', 'Old Three', '9876543216', 'fb', 'garbage',                   'x'],                     // existing, invalid → untouched
];
const setupExisting = () => {
  mockExisting = {
    E1: { _id: 'id-E1', tenantId: TENANT, externalLeadId: 'E1', leadDate: null, createdAt: new Date('2025-11-19T05:00:00Z') },
    E2: { _id: 'id-E2', tenantId: TENANT, externalLeadId: 'E2', leadDate: new Date('2025-11-10T12:00:00Z'), createdAt: new Date('2025-11-19T05:00:00Z') },
    E3: { _id: 'id-E3', tenantId: TENANT, externalLeadId: 'E3', leadDate: null, createdAt: new Date('2025-11-19T05:00:00Z') },
  };
};
const leadsById = () => Object.fromEntries(mockCreated.map(l => [l.externalLeadId, l]));

function assertSyncResults() {
  const byId = leadsById();
  // new leads: only N1..N4 created, no duplicates of existing rows
  expect(mockCreated.map(l => l.externalLeadId).sort()).toEqual(['N1', 'N2', 'N3', 'N4']);
  expect(Lead.create).toHaveBeenCalledTimes(4);
  // original sheet date stored in leadDate
  expect(iso(byId.N1.leadDate)).toBe('2025-11-15T12:00:00.000Z');
  expect(iso(byId.N2.leadDate)).toBe('2025-11-15T04:53:45.000Z');
  // empty / invalid date → null → UI falls back to createdAt
  expect(byId.N3.leadDate).toBeNull();
  expect(byId.N4.leadDate).toBeNull();
  // createdAt is never supplied by the sync — it stays the CRM creation time set by Mongoose timestamps
  for (const l of mockCreated) {
    expect('createdAt' in l).toBe(false);
    expect('updatedAt' in l).toBe(false);
  }
  // created_time is still kept in customFields
  expect(byId.N1.customFields.created_time).toBe('15-11-2025');
  expect(byId.N4.customFields.created_time).toBe('garbage');
  // existing leads: only E1 (empty leadDate + valid sheet date) is backfilled
  expect(mockUpdateOne).toHaveLength(1);
  const { filter, update, opts } = mockUpdateOne[0];
  expect(filter).toEqual({ _id: 'id-E1', tenantId: TENANT, leadDate: null });
  expect(Object.keys(update.$set)).toEqual(['leadDate']);
  expect(iso(update.$set.leadDate)).toBe('2025-11-14T12:00:00.000Z');
  expect(opts).toEqual({ timestamps: false });
}

beforeEach(() => {
  mockCreated = []; mockUpdateOne = []; mockFindOneAndUpdate = [];
  setupExisting();
  mockSheetRows = ROWS;
  jest.clearAllMocks();
});

describe('scheduled sync (internalSyncController.syncIntegrationDoc)', () => {
  test('new leads get leadDate; existing leads are backfilled only when empty; createdAt untouched; no duplicates', async () => {
    const { syncIntegrationDoc } = require('../controllers/internalSyncController');
    const doc = {
      _id: 'int-1', tenantId: TENANT, status: 'connected',
      credentials: encryptFields({ accessToken: 'tok', refreshToken: 'ref' }, ['accessToken', 'refreshToken']),
      config: { tokenExpiresAt: Date.now() + 3600_000, spreadsheets: [{ spreadsheetId: SHEET_ID, syncMode: 'single', sheetName: 'Tab1' }] },
    };
    const result = await syncIntegrationDoc(doc);
    expect(result.errors).toEqual([]);
    expect(result.totalCreated).toBe(4);
    expect(result.totalSkipped).toBe(3);
    assertSyncResults();
  });

  test('a second identical sync creates nothing and writes no more dates once leadDate is set', async () => {
    const { syncIntegrationDoc } = require('../controllers/internalSyncController');
    const doc = {
      _id: 'int-1', tenantId: TENANT, status: 'connected',
      credentials: encryptFields({ accessToken: 'tok', refreshToken: 'ref' }, ['accessToken', 'refreshToken']),
      config: { tokenExpiresAt: Date.now() + 3600_000, spreadsheets: [{ spreadsheetId: SHEET_ID, syncMode: 'single', sheetName: 'Tab1' }] },
    };
    // everything already imported, E1 now has its date
    mockExisting = Object.fromEntries(['N1', 'N2', 'N3', 'N4', 'E1', 'E2', 'E3'].map(id => [id, { _id: 'id-' + id, tenantId: TENANT, externalLeadId: id, leadDate: new Date('2025-11-10T12:00:00Z') }]));
    const result = await syncIntegrationDoc(doc);
    expect(result.totalCreated).toBe(0);
    expect(Lead.create).not.toHaveBeenCalled();
    expect(mockUpdateOne).toHaveLength(0);
  });
});

describe('native OAuth sync (integrationController.syncGoogleSheet)', () => {
  test('new leads get leadDate; existing leads are backfilled only when empty; createdAt untouched; no duplicates', async () => {
    const { syncGoogleSheet } = require('../controllers/integrationController');
    mockIntegrationDoc = {
      _id: 'int-1', tenantId: TENANT, status: 'connected', provider: 'google_sheets',
      credentials: encryptFields({ accessToken: 'tok', refreshToken: 'ref' }, ['accessToken', 'refreshToken']),
      config: { tokenExpiresAt: Date.now() + 3600_000, spreadsheetId: SHEET_ID, spreadsheets: [{ spreadsheetId: SHEET_ID, syncMode: 'single', sheetName: 'Tab1' }] },
    };
    const res = { json: jest.fn() }; const next = jest.fn();
    await syncGoogleSheet({ user: { _id: 'u1', role: 'client_super_admin', name: 'Admin' }, tenantId: TENANT, body: {}, query: {}, headers: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    const out = res.json.mock.calls[0][0];
    expect(out.created).toBe(4);
    expect(out.skipped).toBe(3);
    assertSyncResults();
  });
});

describe('Apps Script webhook (gsheetWebhookController.receiveLeads)', () => {
  const SECRET = 'whsec-test';
  const call = async (rows, query = {}) => {
    const { receiveLeads } = require('../controllers/gsheetWebhookController');
    const raw = JSON.stringify(rows);
    mockIntegrationDoc = { _id: 'int-w', tenantId: TENANT, provider: 'google_sheet', status: 'connected', credentials: { webhookSecret: encrypt(SECRET) }, config: {} };
    const req = { query: { workspaceId: TENANT, ...query }, headers: { 'x-gsheet-signature': crypto.createHmac('sha256', SECRET).update(raw).digest('hex') }, body: rows, rawBody: raw };
    const res = { json: jest.fn(), status: jest.fn(() => res) };
    await receiveLeads(req, res);
    return res.json.mock.calls[0][0];
  };
  // Apps Script sends Date cells as UTC ISO strings and text cells as-is
  const row = (id, created) => ({ lead_id: id, name: 'Lead ' + id, phone: '9876543210', source: 'fb', sheetName: 'Tab1', customFields: created === undefined ? {} : { created_time: created, ad_name: 'x' } });

  test('new rows get leadDate (ISO, DD-MM-YYYY, empty, invalid); createdAt is never supplied', async () => {
    const out = await call([row('W1', '2025-11-15T04:53:45.000Z'), row('W2', '15-11-2025'), row('W3', ''), row('W4', 'garbage'), row('W5')]);
    expect(out.created).toBe(5);
    const byId = leadsById();
    expect(iso(byId.W1.leadDate)).toBe('2025-11-15T04:53:45.000Z');
    expect(iso(byId.W2.leadDate)).toBe('2025-11-15T12:00:00.000Z');
    expect(byId.W3.leadDate).toBeNull();
    expect(byId.W4.leadDate).toBeNull();
    expect(byId.W5.leadDate).toBeNull();
    for (const l of mockCreated) { expect('createdAt' in l).toBe(false); }
    expect(byId.W2.customFields.created_time).toBe('15-11-2025');   // still kept in customFields
  });

  test('a re-sent existing row fills an empty leadDate (no duplicate created) and never writes anything but leadDate', async () => {
    const out = await call([row('E1', '14-11-2025')]);
    expect(out.duplicates).toBe(1);
    expect(Lead.create).not.toHaveBeenCalled();
    expect(mockUpdateOne).toHaveLength(1);
    expect(mockUpdateOne[0].filter).toEqual({ tenantId: TENANT, externalLeadId: 'E1', leadDate: null });
    expect(Object.keys(mockUpdateOne[0].update.$set)).toEqual(['leadDate']);
    expect(mockUpdateOne[0].opts).toEqual({ timestamps: false });
  });

  test('backfill mode (update=true) fills only an empty leadDate and creates nothing', async () => {
    const out = await call([row('E1', '14-11-2025'), row('GONE', '14-11-2025')], { update: 'true' });
    expect(out.updated).toBe(1);
    expect(out.notFound).toBe(1);
    expect(Lead.create).not.toHaveBeenCalled();
    expect(mockUpdateOne).toHaveLength(1);                                   // only for the lead that exists
    expect(mockUpdateOne[0].filter.leadDate).toBeNull();
    for (const c of mockFindOneAndUpdate) expect('leadDate' in c.update.$set).toBe(false);   // the bulk $set never carries leadDate
  });

  test('re-sent row with an invalid date writes nothing', async () => {
    await call([row('E3', 'garbage')]);
    expect(mockUpdateOne).toHaveLength(0);
  });
});

describe('scope guards', () => {
  const fs = require('fs'); const path = require('path');
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  test('all three sync paths use the same shared helpers', () => {
    for (const f of ['integrationController.js', 'internalSyncController.js', 'gsheetWebhookController.js']) {
      const src = read('controllers', f);
      expect(src).toMatch(/require\('\.\.\/utils\/leadDate'\)/);
      expect(src).toMatch(/leadDate: leadDateFromCustomFields\(customFields\)/);
      expect(src).toMatch(/backfillLeadDate\(/);
    }
  });
  test('Lead schema has leadDate and createdAt is still managed by timestamps', () => {
    const src = read('models', 'Lead.js');
    expect(src).toMatch(/leadDate:\s*\{ type: Date, default: null \}/);
    expect(src).toMatch(/\}, \{ timestamps: true \}\)/);                 // createdAt/updatedAt stay Mongoose-managed
    expect(src).not.toMatch(/createdAt:\s*\{\s*type/);                    // no hand-defined createdAt field
  });
  test('the date code never writes createdAt', () => {
    expect(read('utils', 'leadDate.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/createdAt/);
  });
});
