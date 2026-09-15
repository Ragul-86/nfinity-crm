// ═══════════════════════════════════════════════════════════════════════════════
// NFINITY CRM — Google Sheet Lead Sync  (full-column edition)
// Compatible with: backend/controllers/gsheetWebhookController.js
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
var WEBHOOK_URL    = 'https://nfinity-crm.onrender.com/api/gsheet-webhook';
var TENANT_ID      = '6a5f17a06f87de2d61dab272';
var WEBHOOK_SECRET = 'PASTE_YOUR_WEBHOOK_SECRET_HERE'; // ← paste your CRM secret here
var SHEET_NAME     = 'Performance marketer';
// ──────────────────────────────────────────────────────────────────────────────

// ─── STANDARD FIELD MAP ───────────────────────────────────────────────────────
// Maps sheet header (exact, case-sensitive) → top-level payload key expected by CRM.
// Every other column goes into customFields automatically.
var STANDARD_FIELDS = {
  'id':           'lead_id',   // → externalLeadId (dedup key)
  'full_name':    'name',      // → Lead.name (required)
  'phone_number': 'phone',     // → Lead.phone
  'email':        'email',     // → Lead.email
  'platform':     'source',    // → Lead.source (normalised to enum)
};

// Columns that must NEVER be included in the payload (tracking-only)
var SKIP_COLUMNS = ['sent_to_crm'];
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 of the message using the secret.
 * Returns a lowercase hex string — matches Node.js crypto.createHmac('sha256').digest('hex')
 */
function computeHmac(secret, message) {
  var secretBytes  = Utilities.newBlob(secret).getBytes();
  var messageBytes = Utilities.newBlob(message).getBytes();
  var mac = Utilities.computeHmacSha256Signature(messageBytes, secretBytes);
  return mac.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

/**
 * Build a lead payload object from a single data row.
 * Standard fields go to top-level keys; everything else to customFields.
 *
 * @param {Array}  headers   - Row 1 values (header names), lowercased
 * @param {Array}  rawHeaders- Row 1 values (original casing)
 * @param {Array}  row       - Data row values
 * @param {number} rowIndex  - 0-based index within data array (for fallback lead_id)
 * @returns {Object|null}    - Lead payload, or null if required fields missing
 */
function buildLeadPayload(headers, rawHeaders, row, rowIndex) {
  // Locate standard columns
  var iLeadId = headers.indexOf('id');
  var iName   = headers.indexOf('full_name');

  // name is required; skip row if absent
  var nameVal = (iName !== -1) ? String(row[iName] || '').trim() : '';
  if (!nameVal) return null;

  // lead_id: use sheet value or generate a stable fallback
  var leadId = (iLeadId !== -1 && row[iLeadId] && String(row[iLeadId]).trim() !== '')
    ? String(row[iLeadId]).trim()
    : 'GS-' + Date.now() + '-' + rowIndex;

  // Build base payload with standard fields
  var payload = {
    lead_id: leadId,
    name:    nameVal,
    phone:   '',
    email:   '',
    source:  '',
    customFields: {}
  };

  // Fill standard top-level fields and everything else into customFields
  for (var c = 0; c < rawHeaders.length; c++) {
    var rawHeader = rawHeaders[c];
    var header    = headers[c];

    // Skip empty header cells and the tracking column
    if (!rawHeader || rawHeader === '') continue;
    if (SKIP_COLUMNS.indexOf(header) !== -1) continue;

    var cellValue = row[c];

    // Format Date objects as ISO strings
    if (cellValue instanceof Date) {
      cellValue = cellValue.toISOString();
    } else if (cellValue !== null && cellValue !== undefined) {
      cellValue = String(cellValue);
    } else {
      cellValue = '';
    }

    if (STANDARD_FIELDS[rawHeader]) {
      // Map to top-level payload key (phone, email, source)
      var payloadKey = STANDARD_FIELDS[rawHeader];
      if (payloadKey !== 'lead_id' && payloadKey !== 'name') {
        payload[payloadKey] = cellValue;
      }
    } else {
      // Everything else → customFields, keyed by the original sheet header name
      // Skip empty cells to keep the payload lean
      if (cellValue !== '') {
        payload.customFields[rawHeader] = cellValue;
      }
    }
  }

  return payload;
}

/**
 * Core sync function — automatic and manual trigger.
 * Reads unsent rows, sends them to the CRM webhook, marks successfully accepted
 * rows as sent_to_crm=TRUE.
 *
 * Marking rules (same as before):
 *   errors === 0  → mark ALL rows TRUE (created + duplicates both qualify)
 *   errors  > 0  → mark NOTHING; retry all next sync (CRM dedup prevents doubles)
 */
function syncNewLeads() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log('ERROR: Sheet tab "' + SHEET_NAME + '" not found.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('INFO: No data rows found.');
    return;
  }

  var data       = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  var rawHeaders = data[0].map(function(h) { return String(h).trim(); });
  var headers    = rawHeaders.map(function(h) { return h.toLowerCase(); });

  // ── Auto-add sent_to_crm column if missing ────────────────────────────────
  var iSent = headers.indexOf('sent_to_crm');
  if (iSent === -1) {
    var newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue('sent_to_crm');
    Logger.log('INFO: Added "sent_to_crm" column at position ' + newCol + '.');
    data       = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    rawHeaders = data[0].map(function(h) { return String(h).trim(); });
    headers    = rawHeaders.map(function(h) { return h.toLowerCase(); });
    iSent      = headers.indexOf('sent_to_crm');
  }

  // ── Validate required headers ─────────────────────────────────────────────
  if (headers.indexOf('id') === -1) {
    Logger.log('ERROR: Required column "id" not found. Found: ' + rawHeaders.join(', '));
    return;
  }
  if (headers.indexOf('full_name') === -1) {
    Logger.log('ERROR: Required column "full_name" not found. Found: ' + rawHeaders.join(', '));
    return;
  }

  // ── Collect unsent rows ───────────────────────────────────────────────────
  var toSend     = [];
  var rowIndices = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Skip already-sent rows
    var sentVal = row[iSent];
    if (sentVal === true || String(sentVal).toUpperCase() === 'TRUE') continue;

    var payload = buildLeadPayload(headers, rawHeaders, row, i);
    if (!payload) continue;  // blank/invalid row

    toSend.push(payload);
    rowIndices.push(i + 1);  // 1-based sheet row number
  }

  if (toSend.length === 0) {
    Logger.log('INFO: No unsent rows found. Nothing to sync.');
    return;
  }

  Logger.log('INFO: Sending ' + toSend.length + ' lead(s) to CRM...');
  var result = postToWebhook(toSend, WEBHOOK_URL + '?workspaceId=' + TENANT_ID);
  if (!result) return;

  Logger.log(
    'SUCCESS: CRM accepted the batch. ' +
    'Created=' + (result.created || 0) + ', ' +
    'Duplicates=' + (result.duplicates || 0) + ', ' +
    'Errors=' + (result.errors || 0)
  );

  var errors = result.errors || 0;
  if (errors === 0) {
    for (var r = 0; r < rowIndices.length; r++) {
      sheet.getRange(rowIndices[r], iSent + 1).setValue(true);
    }
    Logger.log('INFO: Marked ' + rowIndices.length + ' row(s) as sent_to_crm=TRUE.');
    if ((result.duplicates || 0) > 0) {
      Logger.log('INFO: ' + result.duplicates + ' duplicate(s) skipped by CRM (already exist).');
    }
  } else {
    Logger.log('WARNING: ' + errors + ' row(s) had server-side errors.');
    Logger.log('INFO: No rows marked as sent. All will be retried on next sync.');
    Logger.log('INFO: Previously created rows will be de-duplicated by CRM on retry.');
  }
}

/**
 * Backfill function — run ONCE manually after deploying the new backend.
 * Reads ALL rows (ignores sent_to_crm) and sends them to the ?update=true endpoint.
 * The backend updates customFields on EXISTING leads only — never creates new ones.
 * Does NOT modify sent_to_crm. Safe to run more than once.
 */
function backfillAllLeads() {
  Logger.log('=== backfillAllLeads() started ===');
  Logger.log('INFO: This will update customFields on existing leads. No new leads will be created.');

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log('ERROR: Sheet tab "' + SHEET_NAME + '" not found.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('INFO: No data rows found.');
    return;
  }

  var data       = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  var rawHeaders = data[0].map(function(h) { return String(h).trim(); });
  var headers    = rawHeaders.map(function(h) { return h.toLowerCase(); });

  if (headers.indexOf('id') === -1) {
    Logger.log('ERROR: Required column "id" not found.');
    return;
  }
  if (headers.indexOf('full_name') === -1) {
    Logger.log('ERROR: Required column "full_name" not found.');
    return;
  }

  // Build payload for ALL data rows (ignore sent_to_crm entirely)
  var toSend = [];
  for (var i = 1; i < data.length; i++) {
    var payload = buildLeadPayload(headers, rawHeaders, data[i], i);
    if (payload) toSend.push(payload);
  }

  if (toSend.length === 0) {
    Logger.log('INFO: No valid rows found to backfill.');
    return;
  }

  Logger.log('INFO: Sending ' + toSend.length + ' row(s) to CRM backfill endpoint...');

  // Send in batches of 50 to avoid large payloads
  var BATCH_SIZE = 50;
  var totalUpdated  = 0;
  var totalNotFound = 0;
  var totalErrors   = 0;

  for (var start = 0; start < toSend.length; start += BATCH_SIZE) {
    var batch = toSend.slice(start, start + BATCH_SIZE);
    var url   = WEBHOOK_URL + '?workspaceId=' + TENANT_ID + '&update=true';
    var result = postToWebhook(batch, url);

    if (result) {
      totalUpdated  += result.updated  || 0;
      totalNotFound += result.notFound || 0;
      totalErrors   += result.errors   || 0;
      Logger.log(
        'Batch ' + (Math.floor(start / BATCH_SIZE) + 1) + ': ' +
        'Updated=' + (result.updated || 0) + ', ' +
        'NotFound=' + (result.notFound || 0) + ', ' +
        'Errors=' + (result.errors || 0)
      );
    }
  }

  Logger.log('=== backfillAllLeads() complete ===');
  Logger.log(
    'TOTAL — Updated=' + totalUpdated + ', NotFound=' + totalNotFound + ', Errors=' + totalErrors
  );
  Logger.log('NOTE: sent_to_crm column was NOT modified. Normal sync is unaffected.');
}

/**
 * Sign and POST a batch of lead payloads to the given URL.
 * Shared by syncNewLeads() and backfillAllLeads().
 *
 * @param  {Array}       payloads - Array of lead objects
 * @param  {string}      url      - Full webhook URL with query params
 * @returns {Object|null}         - Parsed JSON response, or null on failure
 */
function postToWebhook(payloads, url) {
  var body      = JSON.stringify(payloads);
  var signature = computeHmac(WEBHOOK_SECRET, body);

  var options = {
    method:             'post',
    contentType:        'application/json',
    payload:            body,
    headers:            { 'x-gsheet-signature': signature },
    muteHttpExceptions: true,
  };

  var response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (fetchErr) {
    Logger.log('ERROR: Network request failed: ' + fetchErr.message);
    return null;
  }

  var statusCode = response.getResponseCode();
  var rawText    = response.getContentText();

  var result;
  try {
    result = JSON.parse(rawText);
  } catch (e) {
    Logger.log('ERROR: Could not parse server response. HTTP ' + statusCode + ' — ' + rawText);
    return null;
  }

  if (result.success !== true) {
    Logger.log('ERROR: CRM rejected the request. HTTP ' + statusCode + '. Message: ' + (result.message || rawText));
    Logger.log('INFO: No rows will be marked. They will be retried on next sync.');
    return null;
  }

  return result;
}

/**
 * Step 3: Run ONCE — but only AFTER testSync() succeeds.
 * Installs a 5-minute time-based trigger for automatic syncing.
 */
function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncNewLeads') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('INFO: Removed existing syncNewLeads trigger.');
    }
  }
  ScriptApp.newTrigger('syncNewLeads')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('SUCCESS: Trigger created. syncNewLeads will run every 5 minutes automatically.');
}

/**
 * Step 1: Run this first to verify your connection before activating the trigger.
 * Behaves identically to the automatic sync.
 */
function testSync() {
  Logger.log('=== testSync() started — sheet: "' + SHEET_NAME + '" ===');
  syncNewLeads();
  Logger.log('=== testSync() finished — check logs above before running setupTrigger() ===');
}
