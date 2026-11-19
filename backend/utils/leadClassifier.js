/**
 * leadClassifier.js
 *
 * Keyword-based lead type classification, shared by the live Google Sheets
 * sync paths (via utils/pipelineRouting.js) and scripts/migratePipelines.js.
 *
 * Extracted unchanged from migratePipelines.js (same regexes, same precedence:
 * internship > recruitment > sales). By default only these fields are
 * searched, so free-text form answers can never change a lead's type:
 *   adName, metaFormName, sheetName, campaignName
 *
 * Callers that need a wider search (only scripts/migratePipelines.js) pass the
 * extra text explicitly via the optional `extraText` option. It is appended
 * after the four fields, matching the migration's original text order. The live
 * sync paths never pass it.
 */

const INTERNSHIP_RE = /\b(intern(ship)?|trainee|traini?ng|apprentice)\b/i;
const HIRING_RE     = /\b(hir(e|ing|ed)|job|career|vacanc(y|ies)|recruit(ment)?|appl(y|ication|icant)|staff(ing)?|position|employment|hr\b|resume|cv\b|walk.?in)\b/i;

/**
 * Classify a lead into 'sales' | 'recruitment' | 'internship'.
 * @param {{adName?:string, metaFormName?:string, sheetName?:string, campaignName?:string}} lead
 * @param {{ extraText?: Array<string|null|undefined> }} [options]
 *   Optional additional text to search (appended after the four fields).
 * @returns {{ type: 'sales'|'recruitment'|'internship', matchedIn: string|null }}
 */
function classifyLead(lead = {}, { extraText = [] } = {}) {
  const text = [
    lead.adName,
    lead.metaFormName,
    lead.sheetName,
    lead.campaignName,
    ...extraText,
  ].filter(Boolean).join(' ');

  if (INTERNSHIP_RE.test(text)) return { type: 'internship', matchedIn: text.match(INTERNSHIP_RE)?.[0] };
  if (HIRING_RE.test(text))     return { type: 'recruitment', matchedIn: text.match(HIRING_RE)?.[0] };
  return { type: 'sales', matchedIn: null };
}

module.exports = { classifyLead, INTERNSHIP_RE, HIRING_RE };
