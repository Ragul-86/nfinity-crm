/**
 * leadDate.js
 *
 * Parses the original lead date from a Google Sheet cell (the `created_time`
 * column) so the CRM can show it instead of the import time. The result goes in
 * Lead.leadDate. Lead.createdAt (the CRM import time) is never touched.
 *
 * Supported inputs
 *   - JavaScript Date objects
 *   - ISO 8601 with offset/Z:      2026-11-15T10:23:45+05:30, 2026-11-15T04:53:45Z
 *   - ISO date-time, no offset:    2026-11-15T10:23:45          (read as India time)
 *   - ISO date only:               2026-11-15
 *   - Day-first dates:             15-11-2026, 15/11/2026, 15.11.2026
 *       with optional time:        15-11-2026 14:30, 15/11/2026 2:30:15 PM
 *   - Spreadsheet serial numbers:  46341 (date) / 46341.5 (date + time)
 *
 * Rules
 *   - Date-only values are stored at 12:00 UTC of that calendar day, so the same
 *     calendar date shows in every timezone from UTC-11 to UTC+11 (including India).
 *   - Date-times without an explicit timezone are read as India Standard Time (UTC+5:30).
 *   - Anything missing, unparseable, impossible (e.g. 31-02-2026) or outside a sane
 *     range returns null so callers keep the createdAt fallback. Free-form text is
 *     never guessed at, and month-first formats (MM/DD/YYYY) are not supported.
 */

const IST_OFFSET_MIN = 330;                        // UTC+5:30
const MIN_YEAR = 2000;
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;   // allow one day of clock/timezone skew

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const DMY_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/;
const SERIAL_RE = /^\d{1,6}(?:\.\d+)?$/;

// True when y-m-d is a real calendar date
function isRealDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validTime(h, mi, s) {
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;
}

// Build the instant. hasTime=false → noon UTC; offsetMin=null → India time.
function build(y, m, d, h, mi, s, hasTime, offsetMin) {
  if (!isRealDate(y, m, d)) return null;
  if (!hasTime) return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (!validTime(h, mi, s)) return null;
  const offset = offsetMin == null ? IST_OFFSET_MIN : offsetMin;
  return new Date(Date.UTC(y, m - 1, d, h, mi, s) - offset * 60000);
}

function parseOffset(tz) {
  if (!tz || /^z$/i.test(tz)) return 0;
  const m = tz.match(/^([+-])(\d{2}):?(\d{2})?$/);
  if (!m) return null;
  const mins = parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10);
  return (m[1] === '-' ? -1 : 1) * mins;
}

function inRange(date, now) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  if (date.getUTCFullYear() < MIN_YEAR) return false;
  return date.getTime() <= now + FUTURE_TOLERANCE_MS;
}

/**
 * @param {*} raw        cell value (string, number or Date)
 * @param {{ now?: number }} [options]  `now` (epoch ms) is injectable for tests
 * @returns {Date|null}
 */
function parseSheetDate(raw, { now = Date.now() } = {}) {
  let result = null;

  if (raw instanceof Date) {
    result = Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
  } else if (typeof raw === 'number') {
    result = fromSerial(raw);
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;

    let m;
    if (SERIAL_RE.test(s)) {
      result = fromSerial(parseFloat(s));
    } else if ((m = s.match(ISO_RE))) {
      const [, y, mo, d, h, mi, sec, tz] = m;
      const hasTime = h !== undefined;
      const offset = hasTime && tz !== undefined ? parseOffset(tz) : null;
      if (!(hasTime && tz !== undefined && offset === null)) {
        result = build(+y, +mo, +d, +h || 0, +mi || 0, +sec || 0, hasTime, offset);
      }
    } else if ((m = s.match(DMY_RE))) {
      const [, d, mo, y, h, mi, sec, ampm] = m;
      let hour = h !== undefined ? +h : 0;
      const hasTime = h !== undefined;
      let ok = true;
      if (ampm) {
        if (hour < 1 || hour > 12) ok = false;
        else hour = (hour % 12) + (/p/i.test(ampm) ? 12 : 0);
      }
      if (ok) result = build(+y, +mo, +d, hour, +mi || 0, +sec || 0, hasTime, null);
    }
  }

  return result && inRange(result, now) ? result : null;
}

// Google Sheets / Excel serial: days since 1899-12-30. Integer → date only; fraction → time (India).
function fromSerial(n) {
  if (!Number.isFinite(n) || n < 36526 || n > 80000) return null;   // 2000-01-01 .. far future
  const whole = Math.floor(n);
  const frac = n - whole;
  const base = Date.UTC(1899, 11, 30) + whole * 86400000;
  if (frac === 0) {
    const d = new Date(base);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  }
  const secs = Math.round(frac * 86400);
  return new Date(base + secs * 1000 - IST_OFFSET_MIN * 60000);
}

/**
 * Read the lead date from a lead's customFields (the `created_time` column).
 * Keys are matched case-insensitively. Returns Date | null.
 */
function leadDateFromCustomFields(customFields, options) {
  if (!customFields || typeof customFields !== 'object') return null;
  const key = Object.keys(customFields).find(k => String(k).trim().toLowerCase() === 'created_time');
  return key === undefined ? null : parseSheetDate(customFields[key], options);
}

/**
 * Fill Lead.leadDate on an EXISTING lead, only when it is still empty.
 * The `leadDate: null` condition is part of the update filter, so a lead that
 * already has a leadDate is never overwritten (race-safe) and no lead is created.
 * Touches nothing else: createdAt is untouched and updatedAt is not bumped.
 * Failures are logged and never abort the sync.
 *
 * @param {object} LeadModel     the Lead model
 * @param {object} filter        identifies the existing lead (must include tenantId), e.g. { _id, tenantId }
 * @param {object} customFields  the row's custom fields (read for `created_time`)
 * @returns {Promise<boolean>}   true when a leadDate was written
 */
async function backfillLeadDate(LeadModel, filter, customFields) {
  try {
    if (!filter || !filter.tenantId) return false;
    const leadDate = leadDateFromCustomFields(customFields);
    if (!leadDate) return false;
    const res = await LeadModel.updateOne(
      { ...filter, leadDate: null },
      { $set: { leadDate } },
      { timestamps: false },
    );
    return (res?.modifiedCount || 0) > 0;
  } catch (e) {
    console.error('[leadDate] backfill failed:', e.message);
    return false;
  }
}

module.exports = { parseSheetDate, leadDateFromCustomFields, backfillLeadDate, IST_OFFSET_MIN };
