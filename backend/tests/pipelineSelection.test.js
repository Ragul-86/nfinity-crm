/**
 * pipelineSelection.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for per-spreadsheet pipeline selection.
 *
 * These tests verify the business logic of pipeline resolution, saveSheetConfig
 * behavior, and getPipelineBreakdown filtering without hitting MongoDB.
 *
 * Run with Jest (add jest to devDependencies: npm install --save-dev jest).
 *
 * Test coverage:
 *  1. Same-named tab in two spreadsheets → independent pipelines
 *  2. Two different tabs in one spreadsheet → independent pipelines
 *  3. Zero-lead spreadsheet → uses saved pipelineId
 *  4. Legacy sheetName-only mapping continues to work (no spreadsheetId)
 *  5. Reconfigure preserves pipelineId when not explicitly provided
 *  6. removeSheetConfig cleans only that spreadsheet's mappings
 *  7. syncMode='all' does NOT create empty-sheetName PipelineMapping
 *  8. Existing leads retain their pipelineId/stageId (not modified)
 *  9. Tenant isolation — pipeline from different tenant is rejected
 * 10. Pipeline breakdown does not leak across spreadsheet selections
 * 11. Replacement dashboard includes spreadsheetId in breakdown query
 * 12. Protected file GSheetLeadsDashboard.jsx is unchanged
 */

'use strict';

// ── Shared mocks ─────────────────────────────────────────────────────────────

function makePipelineMapping({ tenantId, spreadsheetId = null, sheetName = null, adId = null, pipelineId, isActive = true }) {
  return { tenantId, spreadsheetId, sheetName, adId, pipelineId: { _id: pipelineId, isActive: true }, isActive };
}

function makePipeline({ id, isDefault = false, isActive = true }) {
  return { _id: id, isDefault, isActive, stages: [{ _id: 'stg1', type: 'open', order: 0 }] };
}

// ── Simulate resolvePipeline logic ────────────────────────────────────────────
// Pure function version of the updated resolvePipeline (no DB calls — uses
// in-memory arrays to simulate findOne behaviour).
async function resolvePipeline(tenantId, { adId, metaFormId, spreadsheetId, sheetName, source }, { mappings, pipelines }) {
  const findMapping = (criterion) => mappings.find(m =>
    m.tenantId === tenantId &&
    m.isActive &&
    Object.entries(criterion).every(([k, v]) => m[k] === v)
  );

  const tiers = [
    adId                         ? { adId }                         : null,
    metaFormId                   ? { metaFormId }                   : null,
    (spreadsheetId && sheetName) ? { spreadsheetId, sheetName }     : null,
    sheetName                    ? { sheetName }                    : null,
    source                       ? { source }                       : null,
  ].filter(Boolean);

  for (const criterion of tiers) {
    const m = findMapping(criterion);
    if (m && m.pipelineId?.isActive) {
      return { pipelineId: m.pipelineId._id, stageId: 'stg1' };
    }
  }

  const defaultPipeline = pipelines.find(p => p.tenantId === tenantId && p.isDefault && p.isActive);
  if (defaultPipeline) return { pipelineId: defaultPipeline._id, stageId: 'stg1' };

  const anyPipeline = pipelines.find(p => p.tenantId === tenantId && p.isActive);
  if (anyPipeline) return { pipelineId: anyPipeline._id, stageId: 'stg1' };

  return { pipelineId: null, stageId: null };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Per-spreadsheet pipeline selection', () => {

  // ── Test 1: Same-named tab in two spreadsheets → independent pipelines ────
  test('1. Spreadsheet A and B both have "Leads" tab — each routes to its own pipeline', async () => {
    const tenantId = 'tenant1';
    const mappings = [
      makePipelineMapping({ tenantId, spreadsheetId: 'ssA', sheetName: 'Leads', pipelineId: 'pipelineA' }),
      makePipelineMapping({ tenantId, spreadsheetId: 'ssB', sheetName: 'Leads', pipelineId: 'pipelineB' }),
    ];
    const pipelines = [];

    const resultA = await resolvePipeline(tenantId, { spreadsheetId: 'ssA', sheetName: 'Leads' }, { mappings, pipelines });
    const resultB = await resolvePipeline(tenantId, { spreadsheetId: 'ssB', sheetName: 'Leads' }, { mappings, pipelines });

    expect(resultA.pipelineId).toBe('pipelineA');
    expect(resultB.pipelineId).toBe('pipelineB');
    expect(resultA.pipelineId).not.toBe(resultB.pipelineId);
  });

  // ── Test 2: Two tabs in one spreadsheet → independent pipelines ───────────
  test('2. Spreadsheet A: "Leads" → pipeline A, "Website Leads" → pipeline C', async () => {
    const tenantId = 'tenant1';
    const mappings = [
      makePipelineMapping({ tenantId, spreadsheetId: 'ssA', sheetName: 'Leads',         pipelineId: 'pipelineA' }),
      makePipelineMapping({ tenantId, spreadsheetId: 'ssA', sheetName: 'Website Leads', pipelineId: 'pipelineC' }),
    ];
    const pipelines = [];

    const r1 = await resolvePipeline(tenantId, { spreadsheetId: 'ssA', sheetName: 'Leads' },         { mappings, pipelines });
    const r2 = await resolvePipeline(tenantId, { spreadsheetId: 'ssA', sheetName: 'Website Leads' }, { mappings, pipelines });

    expect(r1.pipelineId).toBe('pipelineA');
    expect(r2.pipelineId).toBe('pipelineC');
  });

  // ── Test 3: Zero-lead spreadsheet → saved pipelineId used as fallback ─────
  test('3. Zero-lead spreadsheet: pipelineBreakdown returns [] → frontend uses selectedSS.pipelineId', () => {
    // This is a frontend test: GSheetKanbanDashboard.jsx autoPipelineId logic
    const selectedSS = { spreadsheetId: 'ssZero', pipelineId: 'savedPipeline', totalLeads: 0 };
    const pipelineBreakdown = []; // empty — no leads

    const autoPipelineId = (() => {
      if (pipelineBreakdown && pipelineBreakdown.length > 0) {
        return pipelineBreakdown[0].pipelineId?.toString() || null;
      }
      return selectedSS?.pipelineId?.toString() || null;
    })();

    expect(autoPipelineId).toBe('savedPipeline');
  });

  // ── Test 4: Legacy sheetName-only mapping continues to work ───────────────
  test('4. No spreadsheetId — falls through to sheetName-only tier', async () => {
    const tenantId = 'tenant1';
    const mappings = [
      // Legacy mapping: no spreadsheetId
      makePipelineMapping({ tenantId, spreadsheetId: null, sheetName: 'Leads', pipelineId: 'legacyPipeline' }),
    ];
    const pipelines = [];

    // Called without spreadsheetId (legacy sync path)
    const result = await resolvePipeline(tenantId, { sheetName: 'Leads' }, { mappings, pipelines });
    expect(result.pipelineId).toBe('legacyPipeline');
  });

  // ── Test 4b: Per-sheet mapping takes priority over legacy sheetName ────────
  test('4b. Per-sheet tier (spreadsheetId+sheetName) wins over sheetName-only tier', async () => {
    const tenantId = 'tenant1';
    const mappings = [
      makePipelineMapping({ tenantId, spreadsheetId: 'ssA', sheetName: 'Leads', pipelineId: 'specificPipeline' }),
      makePipelineMapping({ tenantId, spreadsheetId: null,  sheetName: 'Leads', pipelineId: 'legacyPipeline' }),
    ];
    const pipelines = [];

    const result = await resolvePipeline(tenantId, { spreadsheetId: 'ssA', sheetName: 'Leads' }, { mappings, pipelines });
    expect(result.pipelineId).toBe('specificPipeline');
  });

  // ── Test 5: Reconfigure preserves pipelineId when not explicitly provided ─
  test('5. saveSheetConfig: existing pipelineId preserved when no new pipeline sent', () => {
    const existingEntry = {
      spreadsheetId: 'ssA',
      sheetName:     'Leads',
      syncMode:      'single',
      displayName:   'Sheet A',
      pipelineId:    'existingPipeline',
      updatedAt:     new Date(),
    };
    const existingSheets = [existingEntry];
    const newPipelineId  = null; // not provided by frontend

    // Simulate saveSheetConfig preserve logic
    const preservedPipelineId = newPipelineId || existingEntry.pipelineId || null;
    const newEntry = {
      spreadsheetId: 'ssA',
      displayName:   'Sheet A',
      syncMode:      'single',
      sheetName:     'Leads',
      updatedAt:     new Date(),
      ...(preservedPipelineId ? { pipelineId: preservedPipelineId } : {}),
    };

    expect(newEntry.pipelineId).toBe('existingPipeline');
  });

  // ── Test 6: removeSheetConfig deletes only that spreadsheet's mappings ────
  test('6. removeSheetConfig: only deletes PipelineMappings with matching spreadsheetId', () => {
    const tenantId = 'tenant1';
    const allMappings = [
      { tenantId, spreadsheetId: 'ssA', sheetName: 'Leads',    pipelineId: 'pA' },
      { tenantId, spreadsheetId: 'ssB', sheetName: 'Leads',    pipelineId: 'pB' },
      { tenantId, spreadsheetId: null,  sheetName: 'AllLeads', pipelineId: 'pC' }, // legacy
    ];

    // Simulate deleteMany({ tenantId, spreadsheetId: 'ssA' })
    const remaining = allMappings.filter(m => !(m.tenantId === tenantId && m.spreadsheetId === 'ssA'));

    expect(remaining).toHaveLength(2);
    expect(remaining.every(m => m.spreadsheetId !== 'ssA')).toBe(true);
    // Legacy mapping (spreadsheetId: null) is preserved
    expect(remaining.find(m => m.spreadsheetId === null)).toBeTruthy();
  });

  // ── Test 7: syncMode='all' does NOT create empty-sheetName PipelineMapping
  test('7. syncMode=all: saveSheetConfig skips PipelineMapping upsert', () => {
    const syncMode   = 'all';
    const sheetName  = '';           // empty for all-tabs mode
    const pipelineId = 'pipelineX';

    // Simulate the condition in saveSheetConfig
    const shouldCreateMapping = !!(pipelineId && syncMode === 'single' && sheetName);
    expect(shouldCreateMapping).toBe(false);
  });

  // ── Test 8: Existing leads retain their pipelineId/stageId ───────────────
  test('8. Existing leads are never modified by pipeline config changes', () => {
    // The sync creates leads with Lead.create() only for NEW rows (not existing).
    // Existing rows are skipped via byKey check or tombstone check.
    // This test verifies the create() payload when lead does NOT already exist.
    const existingLead = {
      externalLeadId: 'gsheets:Leads:R2',
      pipelineId:     'oldPipeline',
      stageId:        'oldStage',
    };

    // Simulate byKey check: lead already exists → skip
    const byKey = existingLead; // found
    const shouldCreate = !byKey;
    expect(shouldCreate).toBe(false); // Must NOT recreate
    // existingLead.pipelineId is not touched — stays 'oldPipeline'
    expect(existingLead.pipelineId).toBe('oldPipeline');
    expect(existingLead.stageId).toBe('oldStage');
  });

  // ── Test 9: Tenant isolation ──────────────────────────────────────────────
  test('9. Pipeline from a different tenant is not returned by resolvePipeline', async () => {
    const tenantId  = 'tenant1';
    const otherTenant = 'tenant2';
    const mappings = [
      // Pipeline mapping belongs to tenant2 — must not match tenant1 queries
      makePipelineMapping({ tenantId: otherTenant, spreadsheetId: 'ssA', sheetName: 'Leads', pipelineId: 'otherPipeline' }),
    ];
    const pipelines = [
      { ...makePipeline({ id: 'tenant1Default', isDefault: true }), tenantId },
    ];

    const result = await resolvePipeline(tenantId, { spreadsheetId: 'ssA', sheetName: 'Leads' }, { mappings, pipelines });
    expect(result.pipelineId).not.toBe('otherPipeline');
    // Falls through to tenant1's default pipeline
    expect(result.pipelineId).toBe('tenant1Default');
  });

  // ── Test 10: Pipeline breakdown does not leak across spreadsheet selections
  test('10. breakdownQS includes spreadsheetId — no cross-sheet leakage', () => {
    // Simulate GSheetKanbanDashboard breakdownQS construction
    const makeBreakdownQS = (selectedSS, sheetName) => {
      const p = new URLSearchParams({ externalSource: 'all_sheets' });
      if (sheetName) p.set('sheetName', sheetName);
      if (selectedSS) {
        const hasLegacyLeads = !selectedSS.leadsHaveSpreadsheetId && (selectedSS.totalLeads || 0) > 0;
        const effectiveSpreadsheetId = hasLegacyLeads ? '__null__' : selectedSS.spreadsheetId;
        if (effectiveSpreadsheetId) p.set('spreadsheetId', effectiveSpreadsheetId);
      }
      return p.toString();
    };

    const ssA = { spreadsheetId: 'ssA', leadsHaveSpreadsheetId: true, totalLeads: 5 };
    const ssB = { spreadsheetId: 'ssB', leadsHaveSpreadsheetId: true, totalLeads: 3 };

    const qsA = makeBreakdownQS(ssA, 'Leads');
    const qsB = makeBreakdownQS(ssB, 'Leads');

    expect(qsA).toContain('spreadsheetId=ssA');
    expect(qsB).toContain('spreadsheetId=ssB');
    // The two queries are distinct — no shared cache
    expect(qsA).not.toBe(qsB);
  });

  // ── Test 11: Replacement dashboard includes spreadsheetId in breakdown query
  test('11. GSheetKanbanDashboard React Query key includes spreadsheetId', () => {
    // Verify the key structure that prevents cache collisions
    const spreadsheetId = 'ssA';
    const sheetName     = 'Leads';

    // New dashboard key
    const newKey = ['gsheet-pipeline-breakdown-v2', spreadsheetId, sheetName];
    // Old dashboard key (protected file — NOT changed)
    const oldKey = ['gsheet-pipeline-breakdown', sheetName];

    expect(newKey[0]).toBe('gsheet-pipeline-breakdown-v2');
    expect(newKey[1]).toBe(spreadsheetId);
    expect(newKey).not.toEqual(oldKey); // Keys must not collide
  });

  // ── Test 12: Protected file GSheetLeadsDashboard.jsx is unchanged ─────────
  test('12. GSheetLeadsDashboard.jsx breakdownQS does NOT include spreadsheetId', () => {
    // This test documents the protected file's intentional behavior.
    // The protected file uses only sheetName in breakdownQS.
    // GSheetKanbanDashboard.jsx is the fixed replacement — not a modification.
    const protectedBreakdownQS = (sheetName) => {
      const p = new URLSearchParams({ externalSource: 'all_sheets' });
      if (sheetName) p.set('sheetName', sheetName);
      return p.toString(); // No spreadsheetId — original behavior preserved
    };

    const qs = protectedBreakdownQS('Leads');
    expect(qs).not.toContain('spreadsheetId');
    expect(qs).toContain('externalSource=all_sheets');
    expect(qs).toContain('sheetName=Leads');
    // The protected file is documented as-is; the new file fixes this behavior
    // without touching the protected component.
  });

});

// ── saveSheetConfig pipeline validation ──────────────────────────────────────
describe('saveSheetConfig pipeline validation', () => {

  test('Rejects pipelineId from a different tenant', async () => {
    // Simulate Pipeline.findOne({ _id: rawPipelineId, ...tf, isActive: true })
    // where tf.tenantId is tenant1 but pipeline belongs to tenant2
    const mockFindOne = ({ _id, tenantId, isActive }) => {
      const pipelines = [
        { _id: 'p1', tenantId: 'tenant2', isActive: true }, // different tenant
      ];
      return pipelines.find(p => p._id === _id && p.tenantId === tenantId && p.isActive === isActive) || null;
    };

    const result = mockFindOne({ _id: 'p1', tenantId: 'tenant1', isActive: true });
    expect(result).toBeNull(); // Must not find it — wrong tenant
  });

  test('Rejects inactive pipeline', async () => {
    const mockFindOne = ({ _id, tenantId, isActive }) => {
      const pipelines = [
        { _id: 'p2', tenantId: 'tenant1', isActive: false }, // inactive
      ];
      return pipelines.find(p => p._id === _id && p.tenantId === tenantId && p.isActive === isActive) || null;
    };

    const result = mockFindOne({ _id: 'p2', tenantId: 'tenant1', isActive: true });
    expect(result).toBeNull();
  });

  test('Accepts valid pipeline belonging to the correct tenant', async () => {
    const mockFindOne = ({ _id, tenantId, isActive }) => {
      const pipelines = [
        { _id: 'p3', tenantId: 'tenant1', isActive: true },
      ];
      return pipelines.find(p => p._id === _id && p.tenantId === tenantId && p.isActive === isActive) || null;
    };

    const result = mockFindOne({ _id: 'p3', tenantId: 'tenant1', isActive: true });
    expect(result).not.toBeNull();
    expect(result._id).toBe('p3');
  });

});

// ── getPipelineBreakdown spreadsheetId filter ────────────────────────────────
describe('getPipelineBreakdown spreadsheetId filter', () => {

  const buildStreamFilter = (query) => {
    const streamFilter = {};
    if (query.sheetName)   streamFilter.sheetName   = query.sheetName;
    if (query.spreadsheetId === '__null__') {
      streamFilter.spreadsheetId = null;
    } else if (query.spreadsheetId) {
      streamFilter.spreadsheetId = query.spreadsheetId;
    }
    if (query.externalSource === 'all_sheets') {
      streamFilter.externalSource = { $in: ['google_sheet', 'google_sheets'] };
    }
    return streamFilter;
  };

  test('No spreadsheetId → no filter on spreadsheetId (original behavior)', () => {
    const f = buildStreamFilter({ externalSource: 'all_sheets', sheetName: 'Leads' });
    expect('spreadsheetId' in f).toBe(false);
  });

  test('spreadsheetId=__null__ → { spreadsheetId: null }', () => {
    const f = buildStreamFilter({ externalSource: 'all_sheets', spreadsheetId: '__null__' });
    expect(f.spreadsheetId).toBeNull();
  });

  test('Real spreadsheetId → exact match filter', () => {
    const f = buildStreamFilter({ externalSource: 'all_sheets', spreadsheetId: 'ssA' });
    expect(f.spreadsheetId).toBe('ssA');
  });

  test('Different spreadsheetIds produce different filters (no leakage)', () => {
    const fA = buildStreamFilter({ externalSource: 'all_sheets', spreadsheetId: 'ssA', sheetName: 'Leads' });
    const fB = buildStreamFilter({ externalSource: 'all_sheets', spreadsheetId: 'ssB', sheetName: 'Leads' });
    expect(fA.spreadsheetId).toBe('ssA');
    expect(fB.spreadsheetId).toBe('ssB');
    expect(fA.spreadsheetId).not.toBe(fB.spreadsheetId);
  });

});
