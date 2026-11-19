/**
 * sheetPipelineSync.js
 *
 * Applies a Google Sheets spreadsheet's newly selected pipeline to the data
 * that already exists for that spreadsheet. Called by
 * integrationController.saveSheetConfig only when the user explicitly selects a
 * (validated) pipelineId for a spreadsheet.
 *
 *  1. Existing leads of this tenant AND this exact spreadsheetId are moved to
 *     the pipeline's first open stage (pipelineId, stageId, stageName, stageType).
 *       - leads already in the target pipeline are skipped (their stage is kept)
 *       - converted / archived leads, and leads linked to a client, are skipped
 *       - leads of other spreadsheets, other tenants, manual leads and legacy
 *         leads without a spreadsheetId never match
 *       - like the move-lead API, a won/lost lead moved into an open stage is
 *         reopened (status -> new_lead)
 *  2. Existing PipelineMapping records of this tenant + spreadsheet are repointed
 *     to the pipeline and their stage override is cleared. No mapping is created.
 *
 * It never creates pipelines or mappings, never edits a pipeline (so the tenant
 * default and the Recruitment configuration are untouched) and refuses to run
 * without a tenantId, a spreadsheetId and a valid, active, same-tenant pipeline.
 */

const Lead            = require('../models/Lead');
const PipelineMapping = require('../models/PipelineMapping');

const SHEET_SOURCES = ['google_sheet', 'google_sheets'];

const NOOP = Object.freeze({ leadsMoved: 0, mappingsRepointed: 0 });

/**
 * @param {{ tenantId: *, spreadsheetId: string, pipeline: object, session?: object }} args
 *   pipeline — the validated Pipeline document (lean) for this tenant
 *   session  — optional MongoDB session; when given, EVERY write joins that transaction
 * @returns {Promise<{ leadsMoved: number, mappingsRepointed: number }>}
 */
async function applySheetPipelineSelection({ tenantId, spreadsheetId, pipeline, session = null }) {
  const opts = session ? { session } : {};
  const sid = spreadsheetId == null ? '' : String(spreadsheetId).trim();

  // ── Safety guards: never run a bulk update without these ────────────────────
  if (!tenantId || !sid) return { ...NOOP };
  if (!pipeline || !pipeline._id) return { ...NOOP };
  if (String(pipeline.tenantId) !== String(tenantId)) return { ...NOOP };   // cross-tenant
  if (pipeline.isActive !== true) return { ...NOOP };                       // inactive

  // First open stage (same rule as Pipeline.firstOpenStage / the sync router)
  const sorted = [...(pipeline.stages || [])].sort((a, b) => a.order - b.order);
  const stage  = sorted.find(s => s.type === 'open') || sorted[0] || null;
  if (!stage) return { ...NOOP };   // a pipeline without stages cannot receive leads

  const stageFields = {
    pipelineId: pipeline._id,
    stageId:    stage._id,
    stageName:  stage.name,
    stageType:  stage.type || 'open',
  };

  // Exact tenant + exact spreadsheet + Google Sheets leads only; skip leads already
  // in the target pipeline, converted/archived leads and client-linked leads.
  const eligible = {
    tenantId,
    spreadsheetId:  sid,
    externalSource: { $in: SHEET_SOURCES },
    pipelineId:     { $ne: pipeline._id },
    status:         { $nin: ['converted', 'archived'] },
    convertedClientId: null,
  };

  let leadsMoved = 0;

  // Reopen won/lost leads when the target stage is open (mirrors moveLead).
  if (stageFields.stageType === 'open') {
    const reopened = await Lead.updateMany(
      { ...eligible, status: { $in: ['won', 'lost'] } },
      { $set: { ...stageFields, status: 'new_lead' } },
      opts,
    );
    leadsMoved += reopened?.modifiedCount || 0;
  }

  // Everything else eligible (leads moved above no longer match: pipelineId now equals the target).
  const moved = await Lead.updateMany(eligible, { $set: stageFields }, opts);
  leadsMoved += moved?.modifiedCount || 0;

  // Repoint EXISTING mappings for this tenant + spreadsheet only; clear stage override.
  const mappings = await PipelineMapping.updateMany(
    { tenantId, spreadsheetId: sid },
    { $set: { pipelineId: pipeline._id, stageId: null } },
    opts,
  );

  return { leadsMoved, mappingsRepointed: mappings?.modifiedCount || 0 };
}

module.exports = { applySheetPipelineSelection, SHEET_SOURCES };
