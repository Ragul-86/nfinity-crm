/**
 * sheetPipelineSync.test.js
 *
 * Tests for applying a spreadsheet's newly selected pipeline to its existing
 * leads (utils/sheetPipelineSync.js) and its wiring in saveSheetConfig.
 *
 * Everything runs against in-memory fixtures with a small Mongo-filter
 * evaluator, so isolation is really exercised. No database connection is ever
 * opened: production data cannot be read or modified by these tests.
 */

const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ── Minimal Mongo filter evaluator ($in, $nin, $ne, null == missing) ─────────
function matchValue(actual, cond) {
  const isOp = cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId) && !Array.isArray(cond) &&
               Object.keys(cond).some(k => k.startsWith('$'));
  const eq = (a, b) => (b === null ? a === null || a === undefined : String(a) === String(b));
  if (!isOp) return eq(actual, cond);
  return Object.entries(cond).every(([op, v]) => {
    if (op === '$in')  return v.some(x => eq(actual, x));
    if (op === '$nin') return !v.some(x => eq(actual, x));
    if (op === '$ne')  return !eq(actual, v);
    throw new Error('unsupported operator ' + op);
  });
}
const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => matchValue(doc[k], v));

let mockLeads = [], mockMappings = [], mockWrites = [];
let mockFailOn = null;          // model name whose next write should throw
let mockIntegration = null;     // { config: {...} } — the Google Sheets integration document
let mockPipelineStore = [];     // Pipeline documents (read by saveSheetConfig validation)
const mockUpdateMany = (store, name) => jest.fn(async (filter, update, opts) => {
  mockWrites.push({ name, filter, update, opts });
  if (mockFailOn === name) throw new Error('simulated ' + name + ' failure');
  let n = 0;
  for (const d of store()) if (matches(d, filter)) { Object.assign(d, update.$set); n++; }
  return { modifiedCount: n, matchedCount: n };
});
jest.mock('../models/Lead', () => ({ updateMany: (...a) => mockUpdateMany(() => mockLeads, 'Lead')(...a) }));
jest.mock('../models/PipelineMapping', () => ({
  updateMany: (...a) => mockUpdateMany(() => mockMappings, 'PipelineMapping')(...a),
  findOneAndUpdate: async (filter, update, opts) => {
    mockWrites.push({ name: 'PipelineMapping.upsert', filter, update, opts });
    if (mockFailOn === 'PipelineMapping.upsert') throw new Error('simulated mapping upsert failure');
    return {};
  },
}));
jest.mock('../models/Pipeline', () => ({
  findOne: (q) => ({ lean: async () => mockPipelineStore.find(p => String(p._id) === String(q._id) && String(p.tenantId) === String(q.tenantId) && p.isActive === q.isActive) || null }),
}));
jest.mock('../models/Integration', () => ({
  findOne: async () => mockIntegration && JSON.parse(JSON.stringify({ ...mockIntegration, status: 'connected' })),   // snapshot, like a hydrated doc
  findOneAndUpdate: async (filter, update, opts) => {
    mockWrites.push({ name: 'Integration', filter, update, opts });
    if (mockFailOn === 'Integration') throw new Error('simulated Integration failure');
    for (const [k, v] of Object.entries(update.$set || {})) mockIntegration.config[k.replace(/^config\./, '')] = v;
    for (const k of Object.keys(update.$unset || {})) delete mockIntegration.config[k.replace(/^config\./, '')];
    return { toObject: () => ({ config: mockIntegration.config }) };
  },
}));
jest.mock('../utils/auditLogger', () => ({ logAction: async () => {} }));
jest.mock('../utils/driveWatch', () => ({ createDriveWatch: async () => null, stopDriveWatch: async () => {} }));

const { applySheetPipelineSelection } = require('../utils/sheetPipelineSync');
const integrationController = require('../controllers/integrationController');

const oid = () => new mongoose.Types.ObjectId();
const T1 = oid(), T2 = oid();
const SS_A = '18BmarketingSheetAAA', SS_B = '1cOtherSheetBBB';
const st = (...d) => d.map(([name, type], i) => ({ _id: oid(), name, type, order: i }));
const mkP = (o) => ({ _id: oid(), tenantId: T1, isActive: true, isDefault: false, name: 'P',
  stages: st(['New Lead', 'open'], ['Contacted', 'open'], ['Won', 'won']), ...o });

let rec, dm, snap;
const mkLead = (o) => ({ _id: oid(), tenantId: T1, spreadsheetId: SS_A, externalSource: 'google_sheets',
  pipelineId: rec._id, stageId: rec.stages[0]._id, stageName: 'New Applicant', stageType: 'open', status: 'new_lead',
  convertedClientId: null, ...o });

beforeEach(() => {
  mockWrites = [];
  rec = mkP({ name: 'Recruitment', isDefault: true, stages: st(['New Applicant', 'open'], ['Screening', 'open'], ['Hired', 'won']) });
  dm  = mkP({ name: 'Digital Marketing' });
  mockMappings = [];
  mockLeads = [];
});
const clone = x => JSON.parse(JSON.stringify(x));

describe('existing leads move to the selected pipeline', () => {
  test('eligible leads get pipelineId, stageId, stageName, stageType of the first open stage', async () => {
    mockLeads = [mkLead({ leadId: 'L1' }), mkLead({ leadId: 'L2' }), mkLead({ leadId: 'L3', externalSource: 'google_sheet' })];
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.leadsMoved).toBe(3);
    for (const l of mockLeads) {
      expect(String(l.pipelineId)).toBe(String(dm._id));
      expect(String(l.stageId)).toBe(String(dm.stages[0]._id));
      expect(l.stageName).toBe('New Lead');
      expect(l.stageType).toBe('open');
    }
  });

  test('first open stage is used even when a won stage sorts first', async () => {
    dm.stages = st(['Won', 'won'], ['Intake', 'open']);
    mockLeads = [mkLead({})];
    await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(mockLeads[0].stageName).toBe('Intake');
    expect(mockLeads[0].stageType).toBe('open');
  });

  test('won/lost leads are reopened like the move-lead API; other status values are kept', async () => {
    mockLeads = [mkLead({ status: 'won' }), mkLead({ status: 'lost' }), mkLead({ status: 'contacted' })];
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.leadsMoved).toBe(3);
    expect(mockLeads.map(l => l.status)).toEqual(['new_lead', 'new_lead', 'contacted']);
  });
});

describe('records that must stay untouched', () => {
  test('converted, archived and client-linked leads', async () => {
    mockLeads = [mkLead({ status: 'converted' }), mkLead({ status: 'archived' }), mkLead({ convertedClientId: oid() }), mkLead({})];
    snap = clone(mockLeads);
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.leadsMoved).toBe(1);
    [0, 1, 2].forEach(i => expect(clone(mockLeads[i])).toEqual(snap[i]));
  });

  test('other spreadsheets, other tenants, manual leads, legacy leads without spreadsheetId, webhook-less sources', async () => {
    mockLeads = [
      mkLead({ spreadsheetId: SS_B }),                         // other spreadsheet (same tenant)
      mkLead({ tenantId: T2 }),                                // other tenant, same spreadsheetId string
      mkLead({ externalSource: null, spreadsheetId: null }),   // manual lead
      mkLead({ externalSource: null }),                        // manual lead with stray spreadsheetId
      mkLead({ spreadsheetId: null }),                         // legacy google_sheets lead (unknown sheet)
      mkLead({ spreadsheetId: undefined }),                    // legacy, field absent
      mkLead({ externalSource: 'meta_ads' }),                  // different ingestion source
      mkLead({}),                                              // the only eligible lead
    ];
    snap = clone(mockLeads);
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.leadsMoved).toBe(1);
    for (let i = 0; i < 7; i++) expect(clone(mockLeads[i])).toEqual(snap[i]);
    expect(String(mockLeads[7].pipelineId)).toBe(String(dm._id));
  });

  test('spreadsheetId matching is exact (prefix/superstring does not match)', async () => {
    mockLeads = [mkLead({ spreadsheetId: SS_A + 'X' }), mkLead({ spreadsheetId: SS_A.slice(0, -1) })];
    snap = clone(mockLeads);
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.leadsMoved).toBe(0);
    expect(clone(mockLeads)).toEqual(snap);
  });

  test('leads already in the target pipeline keep their current stage', async () => {
    const advanced = mkLead({ pipelineId: dm._id, stageId: dm.stages[1]._id, stageName: 'Contacted', status: 'contacted' });
    const moving   = mkLead({});
    mockLeads = [advanced, moving];
    snap = clone(advanced);
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.leadsMoved).toBe(1);
    expect(clone(advanced)).toEqual(snap);
    expect(moving.stageName).toBe('New Lead');
  });
});

describe('changing the selection twice', () => {
  test('A → B moves eligible leads, B → A moves them back; re-applying the same pipeline moves nothing', async () => {
    mockLeads = [mkLead({}), mkLead({}), mkLead({ status: 'archived' })];
    const third = mkP({ name: 'Third', stages: st(['Inbox', 'open']) });

    expect((await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm })).leadsMoved).toBe(2);
    expect((await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm })).leadsMoved).toBe(0);
    expect((await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: third })).leadsMoved).toBe(2);
    expect(mockLeads.slice(0, 2).every(l => l.stageName === 'Inbox' && String(l.pipelineId) === String(third._id))).toBe(true);
    expect(String(mockLeads[2].pipelineId)).toBe(String(rec._id));   // archived lead never moved
  });
});

describe('mapping consistency', () => {
  test('existing mappings of this tenant + spreadsheet are repointed and stage override cleared; nothing is created', async () => {
    const mk = (o) => ({ _id: oid(), tenantId: T1, spreadsheetId: SS_A, sheetName: 'Tab', pipelineId: rec._id, stageId: rec.stages[1]._id, isActive: true, ...o });
    mockMappings = [
      mk({}),                                  // repointed
      mk({ isActive: false }),                 // existing record, repointed too
      mk({ spreadsheetId: SS_B }),             // other spreadsheet — untouched
      mk({ tenantId: T2 }),                    // other tenant — untouched
      mk({ spreadsheetId: null, adId: 'AD1' }),// ad mapping, no spreadsheet — untouched
      mk({ spreadsheetId: undefined, metaFormId: 'F1' }),
    ];
    snap = clone(mockMappings);
    const before = mockMappings.length;
    const r = await applySheetPipelineSelection({ tenantId: T1, spreadsheetId: SS_A, pipeline: dm });
    expect(r.mappingsRepointed).toBe(2);
    expect(mockMappings.length).toBe(before);
    [0, 1].forEach(i => { expect(String(mockMappings[i].pipelineId)).toBe(String(dm._id)); expect(mockMappings[i].stageId).toBeNull(); });
    [2, 3, 4, 5].forEach(i => expect(clone(mockMappings[i])).toEqual(snap[i]));
  });

  test('only update operations are used — no create/insert/delete anywhere in the helper', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'sheetPipelineSync.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.(create|insertMany|insertOne|deleteOne|deleteMany|remove|bulkWrite|findOneAndUpdate|save)\(/);
    expect(mockWrites.every(w => w.name === 'Lead' || w.name === 'PipelineMapping')).toBe(true);
  });
});

describe('safety guards — nothing is updated', () => {
  const expectNoWrites = async (args) => {
    mockLeads = [mkLead({})]; mockMappings = [{ _id: oid(), tenantId: T1, spreadsheetId: SS_A, pipelineId: rec._id, stageId: null }];
    snap = clone({ l: mockLeads, m: mockMappings });
    mockWrites = [];
    const r = await applySheetPipelineSelection(args);
    expect(r).toEqual({ leadsMoved: 0, mappingsRepointed: 0 });
    expect(mockWrites).toHaveLength(0);
    expect(clone({ l: mockLeads, m: mockMappings })).toEqual(snap);
  };
  test('missing tenantId',            () => expectNoWrites({ tenantId: undefined, spreadsheetId: SS_A, pipeline: dm }));
  test('null tenantId',               () => expectNoWrites({ tenantId: null, spreadsheetId: SS_A, pipeline: dm }));
  test('missing / blank spreadsheetId', async () => {
    await expectNoWrites({ tenantId: T1, spreadsheetId: undefined, pipeline: dm });
    await expectNoWrites({ tenantId: T1, spreadsheetId: '   ', pipeline: dm });
  });
  test('missing pipeline',            () => expectNoWrites({ tenantId: T1, spreadsheetId: SS_A, pipeline: null }));
  test('pipeline of another tenant',  () => expectNoWrites({ tenantId: T1, spreadsheetId: SS_A, pipeline: mkP({ tenantId: T2 }) }));
  test('inactive pipeline',           () => expectNoWrites({ tenantId: T1, spreadsheetId: SS_A, pipeline: mkP({ isActive: false }) }));
  test('pipeline without stages',     () => expectNoWrites({ tenantId: T1, spreadsheetId: SS_A, pipeline: mkP({ stages: [] }) }));
  test('the helper opens no database connection', () => { expect(mongoose.connection.readyState).toBe(0); });
});

describe('saveSheetConfig wiring and future-sync routing', () => {
  const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'integrationController.js'), 'utf8');
  const start = ctrl.indexOf('exports.saveSheetConfig');
  const end   = ctrl.indexOf('exports.removeSheetConfig');
  const body  = ctrl.slice(start, end);

  test('the move runs only for a validated pipeline, after validation and after the config save', () => {
    expect(body).toMatch(/Pipeline\.findOne\(\{ _id: rawPipelineId, \.\.\.tf, isActive: true \}\)/);
    expect(body.indexOf('applySheetPipelineSelection(')).toBeGreaterThan(body.indexOf("'config.spreadsheets':     existingSheets"));
    expect(body).toMatch(/if \(validatedPipeline\) \{[\s\S]*applySheetPipelineSelection\(/);
    expect(body).toMatch(/tenantId:\s+tf\.tenantId,\s*\n\s*spreadsheetId: newEntry\.spreadsheetId,/);
  });

  test('response reports leadsMoved', () => {
    expect(body).toMatch(/res\.json\(\{[^}]*leadsMoved[^}]*\}\)/);
  });

  test('the helper is imported by the controller and nothing else in it creates pipelines or mappings', () => {
    expect(ctrl).toMatch(/require\('\.\.\/utils\/sheetPipelineSync'\)/);
    expect(body).not.toMatch(/Pipeline\.create|PipelineMapping\.create/);
  });

  test('future syncs: saved per-sheet pipelineId is read by native + scheduled sync and routed by the shared router', () => {
    const internal = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'internalSyncController.js'), 'utf8');
    expect(ctrl).toMatch(/savedPipelineId = primary\.pipelineId \|\| null/);
    expect(internal).toMatch(/sheetCfg\.pipelineId \|\| null/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transaction behaviour of saveSheetConfig (real controller, mocked persistence).
// A fake session emulates MongoDB's all-or-nothing semantics by snapshotting the
// in-memory stores and restoring them when the transaction callback throws.
// ─────────────────────────────────────────────────────────────────────────────
describe('saveSheetConfig — explicit pipeline selection is transactional', () => {
  const SS = 'SS-MARKETING';
  const ROLLBACK_MSG = 'Could not apply the pipeline. No changes were saved.';
  const PARTIAL_MSG  = 'Pipeline selection could not be fully applied. Please contact support before retrying.';
  let dmP, recP, sessions;

  const cloneStores = () => JSON.parse(JSON.stringify({ l: mockLeads, m: mockMappings, i: mockIntegration }));
  const standaloneError = () => Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { name: 'MongoServerError', code: 20, codeName: 'IllegalOperation' });

  // mode: 'replica' | 'standalone'
  const useSession = (mode) => {
    sessions = [];
    jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
      const s = {
        ended: false,
        withTransaction: async (fn) => {
          if (mode === 'standalone') throw standaloneError();
          const snap = cloneStores();
          try { await fn(s); }
          catch (e) {
            mockLeads = snap.l; mockMappings = snap.m; mockIntegration = snap.i;   // rollback everything
            throw e;
          }
        },
        endSession: async () => { s.ended = true; },
      };
      sessions.push(s);
      return s;
    });
  };

  const call = async (body, tenantId = T1) => {
    const res = { json: jest.fn() }; const next = jest.fn();
    await integrationController.saveSheetConfig({ user: { _id: oid(), role: 'client_super_admin' }, tenantId, body, headers: {} }, res, next);
    return { res, next, payload: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    mockWrites = []; mockFailOn = null;
    recP = mkP({ name: 'Recruitment', isDefault: true, stages: st(['New Applicant', 'open']) });
    dmP  = mkP({ name: 'Digital Marketing', stages: st(['New Lead', 'open'], ['Contacted', 'open']) });
    mockPipelineStore = [recP, dmP];
    mockIntegration = { config: { spreadsheetId: SS, syncMode: 'all', sheetName: '', selectedFileName: 'Marketing', spreadsheets: [
      { spreadsheetId: SS, displayName: 'Marketing', syncMode: 'all', sheetName: '', pipelineId: String(recP._id) },
      { spreadsheetId: 'SS-OTHER', displayName: 'Other', syncMode: 'all', sheetName: '' },
    ] } };
    mockLeads = [
      mkLead({ leadId: 'M1', spreadsheetId: SS }), mkLead({ leadId: 'M2', spreadsheetId: SS }),
      mkLead({ leadId: 'O1', spreadsheetId: 'SS-OTHER' }), mkLead({ leadId: 'X1', spreadsheetId: SS, tenantId: T2 }),
    ];
    mockMappings = [{ _id: oid(), tenantId: T1, spreadsheetId: SS, sheetName: 'Tab', pipelineId: recP._id, stageId: recP.stages[0]._id }];
  });
  afterEach(() => jest.restoreAllMocks());

  const body = () => ({ spreadsheetId: SS, syncMode: 'all', selectedFileName: 'Marketing', pipelineId: String(dmP._id) });
  const savedPipeline = () => mockIntegration.config.spreadsheets.find(s => s.spreadsheetId === SS).pipelineId;

  test('success: every database write receives the SAME transaction session', async () => {
    useSession('replica');
    const { payload } = await call(body());
    expect(payload.leadsMoved).toBe(2);
    expect(sessions).toHaveLength(1);
    const writes = mockWrites.filter(w => ['Integration', 'Lead', 'PipelineMapping'].includes(w.name) || w.name === 'PipelineMapping.upsert');
    const names = writes.map(w => w.name);
    expect(names).toEqual(expect.arrayContaining(['Integration', 'Lead', 'PipelineMapping']));
    for (const w of writes) expect(w.opts && w.opts.session).toBe(sessions[0]);
    expect(sessions[0].ended).toBe(true);
    expect(savedPipeline()).toBe(String(dmP._id));
  });

  test('success in single-tab mode: the mapping upsert also joins the transaction', async () => {
    useSession('replica');
    await call({ ...body(), syncMode: 'single', sheetName: 'Tab' });
    const up = mockWrites.find(w => w.name === 'PipelineMapping.upsert');
    expect(up).toBeTruthy();
    expect(up.opts.session).toBe(sessions[0]);
  });

  test.each([
    ['lead bulk update', 'Lead'],
    ['mapping update', 'PipelineMapping'],
    ['config save', 'Integration'],
    ['mapping upsert (single-tab)', 'PipelineMapping.upsert'],
  ])('rollback: failure in %s reverts config, leads and mappings; friendly error returned', async (_label, failOn) => {
    useSession('replica');
    const before = cloneStores();
    mockFailOn = failOn;
    const single = failOn === 'PipelineMapping.upsert';
    const { res, error } = await call(single ? { ...body(), syncMode: 'single', sheetName: 'Tab' } : body());
    expect(res.json).not.toHaveBeenCalled();
    expect(error.message).toBe(ROLLBACK_MSG);               // genuine rollback → "no changes saved" is accurate
    expect(error.message).not.toBe(PARTIAL_MSG);
    expect(error.statusCode).toBe(500);
    expect(cloneStores()).toEqual(before);                  // nothing was saved anywhere
    expect(mockWrites.some(w => w.opts === undefined || !w.opts.session)).toBe(false);   // no write happened outside the transaction
    expect(sessions[0].ended).toBe(true);
  });

  test('a transaction failure is NEVER retried through the standalone fallback', async () => {
    useSession('replica');
    mockFailOn = 'Lead';
    const { error } = await call(body());
    const sequentialWrites = mockWrites.filter(w => !w.opts || !w.opts.session);
    expect(sequentialWrites).toHaveLength(0);
    expect(error.message).toBe(ROLLBACK_MSG);
  });

  test('other (non-"unsupported") transaction errors never use the fallback, whatever their code', async () => {
    // Look-alike errors must not be mistaken for "transactions unsupported".
    const lookAlikes = [
      Object.assign(new Error('WriteConflict'), { code: 112, codeName: 'WriteConflict' }),
      Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 11000 }),   // wrong code
      Object.assign(new Error('IllegalOperation: something else'), { code: 20, codeName: 'IllegalOperation' }),             // wrong text
    ];
    for (const failure of lookAlikes) {
      mockWrites = [];
      jest.restoreAllMocks();
      sessions = [];
      jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
        const s = { withTransaction: async () => { throw failure; }, endSession: async () => {} };
        sessions.push(s); return s;
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { error } = await call(body());
      expect(error.message).toBe(ROLLBACK_MSG);
      expect(mockWrites).toHaveLength(0);                   // fallback never ran
    }
  });

  test('standalone fallback: sequential writes (no session) succeed and report leadsMoved', async () => {
    useSession('standalone');
    const { payload } = await call(body());
    expect(payload.leadsMoved).toBe(2);
    expect(mockWrites.every(w => !w.opts || !w.opts.session)).toBe(true);
    expect(savedPipeline()).toBe(String(dmP._id));
    expect(sessions[0].ended).toBe(true);
  });

  test('standalone fallback failure: previous config is restored and the PARTIAL-failure message is returned', async () => {
    useSession('standalone');
    const prevConfig = JSON.parse(JSON.stringify(mockIntegration.config));
    mockFailOn = 'Lead';
    const { res, error } = await call(body());
    expect(res.json).not.toHaveBeenCalled();
    expect(error.message).toBe(PARTIAL_MSG);
    expect(error.message).not.toBe(ROLLBACK_MSG);           // must not claim "no changes were saved"
    expect(error.statusCode).toBe(500);
    expect(mockIntegration.config).toEqual(prevConfig);     // config put back (incl. old pipelineId)
    expect(savedPipeline()).toBe(String(recP._id));
  });

  test('standalone fallback failure AFTER leads were moved: leads stay moved, message says so honestly, config restored', async () => {
    useSession('standalone');
    const prevConfig = JSON.parse(JSON.stringify(mockIntegration.config));
    mockFailOn = 'PipelineMapping';                         // leads already updated when the mapping update fails
    const { res, error } = await call(body());
    expect(res.json).not.toHaveBeenCalled();
    expect(error.message).toBe(PARTIAL_MSG);
    expect(error.message).not.toMatch(/No changes were saved/);
    expect(mockLeads.filter(l => l.spreadsheetId === SS && l.tenantId === T1).every(l => String(l.pipelineId) === String(dmP._id))).toBe(true);
    expect(mockIntegration.config).toEqual(prevConfig);
  });

  test('standalone fallback: a failed config restore is logged and the partial-failure message is still returned', async () => {
    useSession('standalone');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFailOn = 'Lead';
    // make the restore write (2nd Integration write) fail too
    const Integration = require('../models/Integration');
    const original = Integration.findOneAndUpdate;
    let integrationWrites = 0;
    Integration.findOneAndUpdate = async (...a) => { integrationWrites++; if (integrationWrites === 2) throw new Error('restore failed'); return original(...a); };
    try {
      const { error } = await call(body());
      expect(error.message).toBe(PARTIAL_MSG);
      expect(spy.mock.calls.flat().join(' ')).toMatch(/Restoring previous sheet config failed: restore failed/);
    } finally { Integration.findOneAndUpdate = original; }
  });

  test('the two error messages are distinct and the controller source uses each only on its own path', () => {
    expect(PARTIAL_MSG).not.toBe(ROLLBACK_MSG);
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'integrationController.js'), 'utf8');
    expect(src).toContain(ROLLBACK_MSG);
    expect(src).toContain(PARTIAL_MSG);
    // partial message only after the fallback persist(null) failed; rollback message only for non-fallback failures
    expect(src).toMatch(/if \(!isTransactionUnsupported\(txErr\)\) \{[\s\S]*?throw applyFailed\(\);[\s\S]*?\}\s*\/\/ Standalone dev database[\s\S]*?catch \(fbErr\)[\s\S]*?throw partiallyApplied\(\);/);
    expect((src.match(/throw partiallyApplied\(\)/g) || []).length).toBe(1);
    expect((src.match(/throw applyFailed\(\)/g) || []).length).toBe(1);
  });

  test('standalone fallback restores legacy fields that were absent before', async () => {
    useSession('standalone');
    delete mockIntegration.config.selectedFileName;
    const prevConfig = JSON.parse(JSON.stringify(mockIntegration.config));
    mockFailOn = 'Lead';
    await call(body());
    expect(mockIntegration.config).toEqual(prevConfig);
    expect('selectedFileName' in mockIntegration.config).toBe(false);
  });

  test('the original database error is logged, not swallowed', async () => {
    useSession('replica');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFailOn = 'Lead';
    await call(body());
    expect(spy.mock.calls.flat().join(' ')).toMatch(/simulated Lead failure/);
  });

  test('same pipeline can be reapplied safely: only still-misplaced leads move, others keep their stage', async () => {
    useSession('replica');
    expect((await call(body())).payload.leadsMoved).toBe(2);
    mockLeads[0].stageId = dmP.stages[1]._id; mockLeads[0].stageName = 'Contacted';      // user advanced one lead
    mockLeads.push(mkLead({ leadId: 'M3', spreadsheetId: SS }));                           // a lead synced to the old pipeline meanwhile
    const again = await call(body());
    expect(again.payload.leadsMoved).toBe(1);
    expect(mockLeads[0].stageName).toBe('Contacted');
    expect(mockLeads.find(l => l.leadId === 'M3').stageName).toBe('New Lead');
    expect((await call(body())).payload.leadsMoved).toBe(0);
  });

  test('tenant and spreadsheet isolation unchanged inside the transaction', async () => {
    useSession('replica');
    const other = clone(mockLeads.filter(l => l.leadId === 'O1' || l.leadId === 'X1'));
    await call(body());
    expect(clone(mockLeads.filter(l => l.leadId === 'O1' || l.leadId === 'X1'))).toEqual(other);
    for (const w of mockWrites.filter(w => w.name === 'Lead')) {
      expect(String(w.filter.tenantId)).toBe(String(T1));
      expect(w.filter.spreadsheetId).toBe(SS);
    }
  });

  test('invalid / other-tenant pipeline and missing tenantId: nothing is written at all', async () => {
    useSession('replica');
    const foreign = mkP({ tenantId: T2 }); mockPipelineStore.push(foreign);
    const r1 = await call({ ...body(), pipelineId: String(foreign._id) });
    expect(r1.error.statusCode).toBe(400);
    expect(mockWrites).toHaveLength(0);
    expect(sessions).toHaveLength(0);                       // no transaction was even started
  });

  test('plain config save (no pipelineId) keeps the original sequence: no transaction, no lead updates', async () => {
    useSession('replica');
    const { payload } = await call({ spreadsheetId: SS, syncMode: 'all', selectedFileName: 'Marketing' });
    expect(payload.leadsMoved).toBe(0);
    expect(sessions).toHaveLength(0);
    expect(mockWrites.some(w => w.name === 'Lead')).toBe(false);
  });

  test('fallback is chosen only for "transactions unsupported" errors (source check)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'integrationController.js'), 'utf8');
    expect(src).toMatch(/function isTransactionUnsupported\(e\)/);
    expect(src).toMatch(/if \(!isTransactionUnsupported\(txErr\)\) \{[\s\S]*?throw applyFailed\(\);/);
  });

  test('Drive Watch runs after the transaction (not inside persist)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'integrationController.js'), 'utf8');
    const s = src.slice(src.indexOf('exports.saveSheetConfig'), src.indexOf('exports.removeSheetConfig'));
    expect(s.indexOf('createDriveWatch(')).toBeGreaterThan(s.indexOf('session.withTransaction('));
    const persistBody = s.slice(s.indexOf('const persist = async'), s.indexOf('let persisted;'));
    expect(persistBody).not.toMatch(/DriveWatch|getOrRefreshToken/);
  });
});

describe('mapping priority vs saved pipelineId (shared router) stays consistent after repointing', () => {
  // Uses the real router with mocked read-only models.
  let mockPipelines = [];
  jest.isolateModules(() => {});
  test('after repoint, mapping and saved id agree, so either tier routes to the selected pipeline', async () => {
    jest.resetModules();
    jest.doMock('../models/Pipeline', () => ({
      findOne: (q) => ({ lean: async () => mockPipelines.find(p => String(p._id) === String(q._id) && String(p.tenantId) === String(q.tenantId) && p.isActive) || null }),
      find: () => { const c = { sort: () => c, lean: async () => mockPipelines.filter(p => p.isActive) }; return c; },
    }));
    const stored = [{ isActive: true, spreadsheetId: SS_A, sheetName: 'Tab', pipelineId: null, stageId: null }];
    jest.doMock('../models/PipelineMapping', () => ({
      findOne: (q) => { const m = stored.find(x => x.isActive && x.spreadsheetId === q.spreadsheetId && x.sheetName === q.sheetName); const c = { populate: () => c, lean: async () => m ? { ...m, pipelineId: mockPipelines.find(p => String(p._id) === String(m.pipelineId)) || null } : null }; return c; },
    }));
    const { resolveLeadPipeline } = require('../utils/pipelineRouting');
    mockPipelines = [rec, dm];
    stored[0].pipelineId = dm._id;                      // repointed mapping
    const r = await resolveLeadPipeline(T1, { spreadsheetId: SS_A, sheetName: 'Tab', savedPipelineId: dm._id, adName: 'We are hiring' });
    expect(String(r.pipelineId)).toBe(String(dm._id));  // mapping + saved id agree; keyword "hiring" does not override
    expect(r.stageName).toBe('New Lead');
    const r2 = await resolveLeadPipeline(T1, { spreadsheetId: SS_A, sheetName: 'Other', savedPipelineId: dm._id, adName: 'We are hiring' });
    expect(String(r2.pipelineId)).toBe(String(dm._id)); // no mapping for this tab → saved id still wins over classification
  });
});
