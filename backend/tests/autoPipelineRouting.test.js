/**
 * autoPipelineRouting.test.js
 *
 * Focused tests for automatic lead→pipeline routing:
 *   utils/leadClassifier.js, utils/pipelineRouting.js and the three Google
 *   Sheets ingestion paths that use them.
 *
 * All DB access is mocked with in-memory fixtures. No database connection is
 * opened, so these tests can never read or modify production data.
 */

const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ── In-memory fixtures + call log (names must start with "mock" for jest) ─────
let mockPipelines = [];
let mockMappings  = [];
let mockCalls     = [];

// Deliberately "leaky" mocks: they return documents WITHOUT enforcing tenantId
// (and mappings return a populated pipeline regardless of tenant), so the tests
// prove the router performs its own tenant + active validation.
jest.mock('../models/Pipeline', () => ({
  findOne: jest.fn((q) => {
    mockCalls.push(['Pipeline.findOne', q]);
    const p = mockPipelines.find(x => String(x._id) === String(q._id) && (q.isActive === undefined || x.isActive === q.isActive));
    return { lean: async () => p || null };
  }),
  find: jest.fn((q) => {
    mockCalls.push(['Pipeline.find', q]);
    const rows = mockPipelines.filter(x => String(x.tenantId) === String(q.tenantId) && x.isActive === q.isActive);
    const chain = { sort: () => chain, lean: async () => rows };
    return chain;
  }),
}));
jest.mock('../models/PipelineMapping', () => ({
  findOne: jest.fn((q) => {
    mockCalls.push(['PipelineMapping.findOne', q]);
    const m = mockMappings.find(x =>
      x.isActive &&
      Object.entries(q).every(([k, v]) => k === 'tenantId' || k === 'isActive' || x[k] === v));
    const chain = {
      populate: () => chain,
      lean: async () => m ? { ...m, pipelineId: mockPipelines.find(p => String(p._id) === String(m.pipelineId)) || null } : null,
    };
    return chain;
  }),
}));

const { classifyLead } = require('../utils/leadClassifier');
const { resolveLeadPipeline } = require('../utils/pipelineRouting');

const oid = () => new mongoose.Types.ObjectId();
const T1 = oid();       // current tenant
const T2 = oid();       // another tenant

const stages = (...defs) => defs.map(([name, type], i) => ({ _id: oid(), name, type, order: i }));
const mkPipeline = (over) => ({
  _id: oid(), tenantId: T1, isActive: true, isDefault: false, industry: '', key: '',
  createdAt: new Date(), stages: stages(['First', 'open'], ['Second', 'open'], ['Won', 'won'], ['Lost', 'lost']), ...over,
});

let recruitment, internship, sales;
beforeEach(() => {
  mockCalls = [];
  mockMappings = [];
  recruitment = mkPipeline({ name: 'Recruitment Pipeline', key: 'recruitment', industry: 'recruitment_hr', isDefault: true,
    stages: stages(['New Applicant', 'open'], ['Screening', 'open'], ['Hired', 'won'], ['Rejected', 'lost']) });
  internship  = mkPipeline({ name: 'Internship Pipeline', key: 'internship', industry: 'internship_training',
    stages: stages(['New Applicant', 'open'], ['Joined', 'won']) });
  sales       = mkPipeline({ name: 'Sales Pipeline', key: 'sales', industry: 'digital_marketing',
    stages: stages(['New Lead', 'open'], ['Contacted', 'open'], ['Won', 'won'], ['Lost', 'lost']) });
  mockPipelines = [recruitment, internship, sales];
});

// The two real leads' (non-personal) routing fields
const clientLead = {
  sheetName: 'Sheet1', source: 'facebook_ads',
  adName: '03/11 - Client Testimonial Video',
  campaignName: '03/11 - Marketing Test Lead Campaign',
  metaFormName: '02/11/2026 - Marketing Lead Form',
};

// ─────────────────────────────────────────────────────────────────────────────
describe('classifyLead (shared classifier)', () => {
  test('1. Digital Marketing client enquiry → sales', () => {
    expect(classifyLead(clientLead).type).toBe('sales');
  });
  test('2. Recruitment / job applicant → recruitment', () => {
    expect(classifyLead({ adName: 'Hiring Performance Marketer', sheetName: 'Performance marketer' }).type).toBe('recruitment');
    expect(classifyLead({ metaFormName: '09/04_Meta Hiring form' }).type).toBe('recruitment');
  });
  test('3. Internship applicant → internship (wins over hiring words)', () => {
    expect(classifyLead({ sheetName: 'Intern leads' }).type).toBe('internship');
    expect(classifyLead({ adName: 'Internship job openings' }).type).toBe('internship');
  });
  test('only ad/form/sheet/campaign names are searched — custom answers & source ignored', () => {
    const lead = {
      adName: 'Client Testimonial Video',
      customFields: { 'what_is_your_position?': 'job application hiring', job_title: 'recruiter' },
      serviceRequired: 'recruitment', source: 'hiring',
    };
    expect(classifyLead(lead).type).toBe('sales');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('resolveLeadPipeline priority', () => {
  test('3 → keyword classification beats the default fallback (sales lead leaves default Recruitment)', async () => {
    const r = await resolveLeadPipeline(T1, clientLead);
    expect(String(r.pipelineId)).toBe(String(sales._id));
  });
  test('recruitment and internship leads route to their own pipelines', async () => {
    const rec = await resolveLeadPipeline(T1, { sheetName: 'Performance marketer', adName: 'We are hiring' });
    expect(String(rec.pipelineId)).toBe(String(recruitment._id));
    const int = await resolveLeadPipeline(T1, { sheetName: 'Intern leads' });
    expect(String(int.pipelineId)).toBe(String(internship._id));
  });

  test('4. explicit PipelineMapping beats keyword classification', async () => {
    mockMappings = [{ isActive: true, sheetName: 'Sheet1', pipelineId: recruitment._id }];
    const r = await resolveLeadPipeline(T1, clientLead);     // classifies as sales, mapping says recruitment
    expect(String(r.pipelineId)).toBe(String(recruitment._id));
  });
  test('4b. mapping stage override is honoured', async () => {
    mockMappings = [{ isActive: true, adId: 'AD1', pipelineId: sales._id, stageId: sales.stages[1]._id }];
    const r = await resolveLeadPipeline(T1, { ...clientLead, adId: 'AD1' });
    expect(r.stageName).toBe('Contacted');
  });

  test('5. valid saved per-sheet pipelineId beats keyword classification', async () => {
    const r = await resolveLeadPipeline(T1, { ...clientLead, savedPipelineId: internship._id });
    expect(String(r.pipelineId)).toBe(String(internship._id));
  });
  test('5b. mapping still beats saved per-sheet pipelineId', async () => {
    mockMappings = [{ isActive: true, sheetName: 'Sheet1', pipelineId: recruitment._id }];
    const r = await resolveLeadPipeline(T1, { ...clientLead, savedPipelineId: internship._id });
    expect(String(r.pipelineId)).toBe(String(recruitment._id));
  });

  test('7. no matching classified pipeline → existing default fallback', async () => {
    mockPipelines = [recruitment];                            // tenant has ONLY Recruitment (today\'s production shape)
    const r = await resolveLeadPipeline(T1, clientLead);      // classified sales, none exists
    expect(String(r.pipelineId)).toBe(String(recruitment._id));
  });
  test('7b. no default flagged → oldest active pipeline', async () => {
    recruitment.isDefault = false;
    recruitment.createdAt = new Date('2026-01-01');
    internship.createdAt  = new Date('2026-02-01');
    mockPipelines = [recruitment, internship];
    const r = await resolveLeadPipeline(T1, clientLead);
    expect(String(r.pipelineId)).toBe(String(recruitment._id));
  });
  test('6. null only when the tenant has no valid pipeline', async () => {
    mockPipelines = [];
    const r = await resolveLeadPipeline(T1, clientLead);
    expect(r).toEqual({ pipelineId: null, stageId: null, stageName: null, stageType: 'open' });
  });

  test('8. inactive pipelines are never selected (mapping, saved id, classification)', async () => {
    sales.isActive = false;
    mockMappings = [{ isActive: true, sheetName: 'Sheet1', pipelineId: sales._id }];
    const r1 = await resolveLeadPipeline(T1, { ...clientLead, savedPipelineId: sales._id });
    expect(String(r1.pipelineId)).toBe(String(recruitment._id));     // falls to default
    expect(String(r1.pipelineId)).not.toBe(String(sales._id));
  });

  test('9. cross-tenant pipelines are rejected (mapping, saved id)', async () => {
    const foreign = mkPipeline({ tenantId: T2, name: 'Foreign Sales', key: 'sales', industry: 'digital_marketing' });
    mockPipelines.push(foreign);
    mockMappings = [{ isActive: true, sheetName: 'Sheet1', pipelineId: foreign._id }];
    const r = await resolveLeadPipeline(T1, { ...clientLead, savedPipelineId: foreign._id });
    expect(String(r.pipelineId)).not.toBe(String(foreign._id));
    expect(String(r.pipelineId)).toBe(String(sales._id));            // own tenant's sales via classification
  });

  test('malformed saved pipelineId is ignored, routing continues', async () => {
    const r = await resolveLeadPipeline(T1, { ...clientLead, savedPipelineId: 'not-an-id' });
    expect(String(r.pipelineId)).toBe(String(sales._id));
  });

  test('never changes the tenant default pipeline', async () => {
    await resolveLeadPipeline(T1, clientLead);
    expect(recruitment.isDefault).toBe(true);
    expect(sales.isDefault).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('stage fields', () => {
  test('11. first open stage: stageId, stageName, stageType all populated', async () => {
    const r = await resolveLeadPipeline(T1, clientLead);
    expect(String(r.stageId)).toBe(String(sales.stages[0]._id));
    expect(r.stageName).toBe('New Lead');
    expect(r.stageType).toBe('open');
  });
  test('uses first OPEN stage even if a won stage sorts first', async () => {
    sales.stages = stages(['Won', 'won'], ['Intake', 'open']);
    const r = await resolveLeadPipeline(T1, clientLead);
    expect(r.stageName).toBe('Intake');
    expect(r.stageType).toBe('open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('all three Google Sheets sync paths share the same routing', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8');
  const files = [
    ['integrationController.js',   'resolvePipelineGS'],
    ['internalSyncController.js',  'resolvePipeline'],
    ['gsheetWebhookController.js', 'resolvePipeline'],
  ];

  test.each(files)('10. %s imports the shared router and delegates %s to it', (file, fn) => {
    const src = read(file);
    expect(src).toMatch(/require\('\.\.\/utils\/pipelineRouting'\)/);
    const body = src.slice(src.indexOf(`async function ${fn}(`));
    expect(body.slice(0, 260)).toMatch(/return resolveLeadPipeline\(/);
  });

  test.each(files)('%s no longer queries PipelineMapping / default pipeline itself', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/PipelineMapping\.findOne\(/);
    expect(src).not.toMatch(/Pipeline\.findOne\(\{ tenantId[^)]*isDefault/);
  });

  test('native + scheduled sync pass the saved per-sheet pipelineId and classification text', () => {
    for (const f of ['integrationController.js', 'internalSyncController.js', 'gsheetWebhookController.js']) {
      const src = read(f);
      expect(src).toMatch(/savedPipelineId/);
      expect(src).toMatch(/metaFormName:\s+attribution\.metaFormName/);
      expect(src).toMatch(/campaignName:\s+attribution\.campaignName/);
    }
  });

  test('11b. native + scheduled sync persist stageName and stageType on the lead', () => {
    for (const f of ['integrationController.js', 'internalSyncController.js']) {
      expect(read(f)).toMatch(/\{ pipelineId, stageId, stageName, stageType \}/);
    }
  });

  test('migratePipelines.js uses the shared classifier (no duplicate regexes)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migratePipelines.js'), 'utf8');
    expect(src).toMatch(/require\('\.\.\/utils\/leadClassifier'\)/);
    expect(src).not.toMatch(/HIRING_RE\s*=/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('12. no data is modified by this implementation', () => {
  test('routing performs reads only and opens no DB connection', async () => {
    await resolveLeadPipeline(T1, clientLead);
    await resolveLeadPipeline(T1, { sheetName: 'Intern leads' });
    const ops = new Set(mockCalls.map(c => c[0]));
    for (const op of ops) expect(op).toMatch(/\.(find|findOne)$/);
    expect(mongoose.connection.readyState).toBe(0);          // 0 = disconnected
  });
  test('router source contains no write operations', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'pipelineRouting.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.(create|insertMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|save|deleteOne|deleteMany|remove|bulkWrite)\(/);
  });
});
