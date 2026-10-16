'use strict';

/**
 * phoneUtils.js — Phone normalization and validation for Google Sheets sync.
 *
 * Design contract:
 *   - VALIDATION uses digit-stripping to reject non-phone values ('female', 'p:', etc.)
 *   - STORAGE and DB QUERIES always use the original raw column value (trimmed).
 *     This preserves backward compatibility: existing leads were stored with raw
 *     values like 'p:+919003809085'. Querying with the same raw value finds them
 *     without any data migration.
 *   - The whatsapp fallback produces a raw value in the same 'p:+91...' format as
 *     phone_number values, so deduplication works correctly against existing records.
 *
 * Used by:
 *   backend/controllers/internalSyncController.js  (cron sync path)
 *   backend/controllers/integrationController.js   (manual sync path)
 *   backend/scripts/diagnose-sheets-gap.js         (read-only diagnostic)
 */

/** Minimum digit count for a value to be treated as a real phone number. */
const MIN_PHONE_DIGITS = 7;

/**
 * Strip all non-digit characters from raw and return the result,
 * or '' if the result contains fewer than MIN_PHONE_DIGITS digits.
 *
 * Used for VALIDATION only — not for storage or DB queries.
 *
 * Examples:
 *   normalizePhone('p:+919003809085')  → '919003809085'   (valid)
 *   normalizePhone('female')           → ''               (invalid)
 *   normalizePhone('p:')               → ''               (invalid — no digits)
 *   normalizePhone('p:<test lead...>') → ''               (invalid — no digits)
 *   normalizePhone(null)               → ''               (invalid)
 *   normalizePhone('123456')           → ''               (invalid — only 6 digits)
 */
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return '';
  const digits = String(raw).trim().replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS ? digits : '';
}

/**
 * Returns true if raw contains at least MIN_PHONE_DIGITS digits.
 * Used as a guard before storing a phone value or running a dedup query.
 */
function isValidPhone(raw) {
  return normalizePhone(raw).length > 0;
}

/**
 * Resolve the effective phone value for a sheet row.
 *
 * Priority:
 *   1. phoneRaw  — value from the sheet's phone/phone_number column.
 *                  If it passes isValidPhone, use it as-is (raw, for DB compat).
 *   2. waRaw     — value from the sheet's whatsapp_number column (fallback).
 *                  If phoneRaw is invalid but waRaw passes isValidPhone, use waRaw.
 *   3. ''        — neither column has a usable number; skip phone match entirely.
 *
 * The resolved value is the raw column string, never normalized digits.
 * An empty return value ('') is falsy — callers use `if (phone)` to guard
 * the DB query, so no query runs when no usable number exists.
 */
function resolvePhone(phoneRaw, waRaw) {
  if (isValidPhone(phoneRaw)) return phoneRaw;
  if (isValidPhone(waRaw))    return waRaw;
  return '';
}

module.exports = { normalizePhone, isValidPhone, resolvePhone, MIN_PHONE_DIGITS };
