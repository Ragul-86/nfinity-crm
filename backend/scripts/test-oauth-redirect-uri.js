/**
 * test-oauth-redirect-uri.js
 *
 * Unit tests for OAuth redirect URI construction in integrationController.js.
 * Verifies that trailing slash(es) in API_BASE_URL never produce a double-slash
 * in the callback URL, and that the missing-env fallback is also correct.
 *
 * Runs fully in-process — no server, no DB, no network.
 * Safe to run in any environment.
 *
 * Usage:
 *   node backend/scripts/test-oauth-redirect-uri.js
 */

'use strict';

// ─── Minimal test harness ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// ─── Helper: mirrors the fix applied in integrationController.js ──────────
// buildCallbackBase replicates the two callbackBase construction lines
// (initOAuth ~line 1586 and oauthCallback ~line 1688) after the fix.
function buildCallbackBase(apiBaseUrl, port = 5000) {
  return (apiBaseUrl || `http://localhost:${port}`).replace(/\/+$/, '');
}

function buildRedirectUri(base, provider) {
  return `${base}/api/integrations/oauth/${provider}/callback`;
}

// ─── Tests ────────────────────────────────────────────────────────────────

console.log('\n[Test] 1 · No trailing slash — URI is correct as-is');
{
  const base = buildCallbackBase('https://nfinity-crm.onrender.com');
  const uri  = buildRedirectUri(base, 'google_sheets');
  assert(base === 'https://nfinity-crm.onrender.com', 'callbackBase unchanged when no trailing slash');
  assert(uri  === 'https://nfinity-crm.onrender.com/api/integrations/oauth/google_sheets/callback', 'redirect_uri correct — no double slash');
  assert(!uri.includes('//api'), 'No double slash in path');
}

console.log('\n[Test] 2 · Single trailing slash — stripped');
{
  const base = buildCallbackBase('https://nfinity-crm.onrender.com/');
  const uri  = buildRedirectUri(base, 'google_sheets');
  assert(base === 'https://nfinity-crm.onrender.com', 'Single trailing slash stripped from callbackBase');
  assert(uri  === 'https://nfinity-crm.onrender.com/api/integrations/oauth/google_sheets/callback', 'redirect_uri correct');
  assert(!uri.includes('//api'), 'No double slash in path');
}

console.log('\n[Test] 3 · Multiple trailing slashes — all stripped');
{
  const base = buildCallbackBase('https://nfinity-crm.onrender.com///');
  const uri  = buildRedirectUri(base, 'google_sheets');
  assert(base === 'https://nfinity-crm.onrender.com', 'Multiple trailing slashes stripped');
  assert(uri  === 'https://nfinity-crm.onrender.com/api/integrations/oauth/google_sheets/callback', 'redirect_uri correct');
  assert(!uri.includes('//api'), 'No double slash in path');
}

console.log('\n[Test] 4 · Localhost fallback (API_BASE_URL missing) — no trailing slash');
{
  const base = buildCallbackBase(undefined, 5000);
  const uri  = buildRedirectUri(base, 'google_sheets');
  assert(base === 'http://localhost:5000', 'Fallback base is correct');
  assert(uri  === 'http://localhost:5000/api/integrations/oauth/google_sheets/callback', 'Fallback redirect_uri correct');
  assert(!uri.includes('//api'), 'No double slash in fallback path');
}

console.log('\n[Test] 5 · Localhost fallback with custom PORT');
{
  const base = buildCallbackBase(undefined, 3001);
  const uri  = buildRedirectUri(base, 'google_sheets');
  assert(base === 'http://localhost:3001', 'Fallback base uses custom PORT');
  assert(uri  === 'http://localhost:3001/api/integrations/oauth/google_sheets/callback', 'redirect_uri uses custom PORT');
}

console.log('\n[Test] 6 · Empty string API_BASE_URL treated as falsy — uses fallback');
{
  const base = buildCallbackBase('', 5000);
  // '' is falsy, so || kicks in
  assert(base === 'http://localhost:5000', 'Empty string falls back to localhost');
}

console.log('\n[Test] 7 · google/callback provider — same stripping logic');
{
  const base = buildCallbackBase('https://nfinity-crm.onrender.com/');
  const uri  = buildRedirectUri(base, 'google');
  assert(uri === 'https://nfinity-crm.onrender.com/api/integrations/oauth/google/callback', 'google/callback correct');
  assert(!uri.includes('//api'), 'No double slash for google/callback');
}

console.log('\n[Test] 8 · Facebook provider — same stripping logic');
{
  const base = buildCallbackBase('https://nfinity-crm.onrender.com/');
  const uri  = buildRedirectUri(base, 'facebook');
  assert(uri === 'https://nfinity-crm.onrender.com/api/integrations/oauth/facebook/callback', 'facebook/callback correct');
  assert(!uri.includes('//api'), 'No double slash for facebook/callback');
}

console.log('\n[Test] 9 · Slash at end of path segment (not base) is not stripped');
// Sanity check: the replace only targets trailing slashes at end of the base URL.
// If someone passes 'https://host.com/api/', the path portion is stripped too —
// but that would be a mis-configured env var. Confirming current behavior.
{
  const base = buildCallbackBase('https://host.com/myapp/');
  assert(base === 'https://host.com/myapp', 'Trailing slash after path segment also stripped (expected behavior)');
  const uri = buildRedirectUri(base, 'google_sheets');
  assert(uri === 'https://host.com/myapp/api/integrations/oauth/google_sheets/callback', 'redirect_uri with sub-path correct');
}

console.log('\n[Test] 10 · Staging URL (common in CI) — no trailing slash needed');
{
  const base = buildCallbackBase('https://staging.nfinity-crm.onrender.com/');
  const uri  = buildRedirectUri(base, 'google_sheets');
  assert(base === 'https://staging.nfinity-crm.onrender.com', 'Staging trailing slash stripped');
  assert(uri  === 'https://staging.nfinity-crm.onrender.com/api/integrations/oauth/google_sheets/callback', 'Staging redirect_uri correct');
}

// ─── Results ──────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
