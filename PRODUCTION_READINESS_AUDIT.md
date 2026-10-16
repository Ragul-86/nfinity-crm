# NFINITY CRM — Production Readiness Audit
**Date:** 2026-10-15
**Auditor:** Claude (automated code review)
**Scope:** Full backend + frontend review across 8 areas
**Method:** Static analysis of source files only — no live API calls, no DB writes

---

## Summary

| Area | Result |
|------|--------|
| 1. Google Drive Watch implementation | ⚠️ PARTIAL PASS |
| 2. Google Sheets OAuth / sync / token refresh / webhook security | ✅ PASS |
| 3. Lead deduplication + tombstone protection | ✅ PASS |
| 4. Multi-tenant isolation + role-based permissions | ✅ PASS |
| 5. Pipelines, stages, lead routing | ✅ PASS |
| 6. Frontend / backend production configuration | ⚠️ PARTIAL PASS |
| 7. Automated tests and build verification | ❌ FAIL |
| 8. TODOs, broken routes, critical security issues | ⚠️ PARTIAL PASS |

**Critical launch blockers: 3**
**Important (fix before/shortly after launch): 4**
**Optional improvements: 4**

---

## CRITICAL LAUNCH BLOCKERS

### BLOCKER 1 — `BACKEND_PUBLIC_URL` is unset in Render → Drive Watch silently disabled
**File:** `backend/utils/driveWatch.js` lines 20–24
**Evidence:**
```javascript
if (!backendUrl) {
  console.warn('[DriveWatch] BACKEND_PUBLIC_URL not set — skipping watch creation');
  return null; // safe no-op for local dev
}
```
The guard is intentional for local dev, but if the Render environment variable `BACKEND_PUBLIC_URL` is not set, **every call to `createDriveWatch()` silently returns null** — no channel is registered, no push notification is ever delivered. The feature appears to work (no errors) but does nothing. `BACKEND_PUBLIC_URL` is documented only in `.env.example` — you must also add it in the Render dashboard under Environment.

**Required action:** Add `BACKEND_PUBLIC_URL=https://nfinity-crm.onrender.com` in Render → backend service → Environment.

---

### BLOCKER 2 — Google Cloud Console: domain not registered for Drive push notifications
**File:** N/A (Google Cloud Console configuration)
**Evidence:** NOT TESTED from code — but it is a Google API hard requirement.
Drive push notifications require that the webhook address (your `BACKEND_PUBLIC_URL` + `/api/integrations/google_sheets/notifications`) is registered as an authorized notification URL in Google Cloud Console → APIs & Services → Domain verification. Without this, Google will reject all `files.watch` calls with HTTP 400 `"pushNotificationsNotSupportedForRequestedResource"` or domain validation errors.

**Required action:** In Google Cloud Console, go to APIs & Services → Domain verification, add and verify `nfinity-crm.onrender.com`. Also confirm the notification URL is listed in the OAuth consent screen's authorized domains.

---

### BLOCKER 3 — `GET /api/integrations/google_sheets/debug-routes` is a public unauthenticated endpoint in production
**File:** `backend/routes/integrations.js` lines 35–47
**Evidence:**
```javascript
// ── TEMPORARY DIAGNOSTIC — remove after confirming route registration ──
router.get('/google_sheets/debug-routes', (req, res) => {
  res.json({
    routeFileLoaded: true,
    googleSheetsPickerConfig: typeof getGoogleSheetsPickerConfig === 'function',
    // ...
  });
});
```
This endpoint exposes which handlers are loaded, giving an attacker a free route inventory and confirmation that the google_sheets integration is active. It is before `router.use(protect)` — anyone on the internet can call it.

**Required action:** Delete lines 35–47 from `backend/routes/integrations.js` before deploying to production.

---

## IMPORTANT — Fix Before or Shortly After Launch

### ISSUE 1 — `portalApi.js` double `/api` in production baseURL
**File:** `frontend/src/services/portalApi.js` line 9
**Evidence:**
```javascript
baseURL: `${import.meta.env.VITE_API_URL || ''}/api/portal`,
```
When `VITE_API_URL=https://nfinity-crm.onrender.com/api` (the documented value in `.env.example`), this evaluates to:
`https://nfinity-crm.onrender.com/api/api/portal` — **double `/api`**, all Client Portal API calls return 404 in production.
In local dev (VITE_API_URL unset) it becomes `/api/portal` — correct. The bug is masked in development.

**Fix:** Change line 9 to:
```javascript
baseURL: `${(import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '')}/api/portal`,
```
Or simpler: use the same pattern as `api.js`:
```javascript
baseURL: (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '') + '/api/portal',
```

---

### ISSUE 2 — Rate limiter covers Drive push notification webhook
**File:** `backend/server.js` line 241–242
**Evidence:**
```javascript
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);
```
The global 500-per-15-min limiter applies to `POST /api/integrations/google_sheets/notifications`. Google Drive can send notifications in bursts (e.g., many concurrent spreadsheet edits). If 500 requests arrive in 15 minutes (low threshold for a large deployment), Google's notifications receive HTTP 429 and the real-time sync silently stops. The GitHub Actions 5-minute polling is a safety net, but silent failures of push notifications would not be obvious.

**Recommendation:** Exempt the notification route from the limiter, or give it a separate, much higher limit:
```javascript
// Before global limiter:
app.use('/api/integrations/google_sheets/notifications', rateLimit({ windowMs: 60_000, max: 200 }));
```

---

### ISSUE 3 — `drive.file` OAuth scope for Drive Watch — limited coverage
**File:** `backend/controllers/integrationController.js` (OAuth scope config)
**Evidence:** OAuth requests scopes `drive.file` + `spreadsheets.readonly`.
The `drive.file` scope only grants access to files that **the app opened or created** via Google Picker. This is correct for the Picker workflow. However, `files.watch` using `drive.file` scope may fail for spreadsheets:
- Shared with the user via a link (not opened via app Picker)
- Created outside the app but accessed via URL

If a tenant adds a spreadsheet that wasn't opened through the Picker flow, `createDriveWatch()` may fail silently (try/caught in `saveSheetConfig`) and the sheet falls back to GitHub Actions polling only. No error surfaces to the user.

**Recommendation:** Ensure the Picker flow always opens the spreadsheet (it should — that's the only way to add sheets in the UI). Add a log warning in the watch creation catch so watch failures are visible in Render logs. Consider upgrading scope to `drive.readonly` if budget allows, to cover edge cases.

---

### ISSUE 4 — No automated tests exist
**Files:** `backend/package.json`, `frontend/package.json`
**Evidence:** No jest, mocha, vitest, supertest, or any test runner in either package.json. Zero `.test.js`, `.spec.js`, `.test.jsx` files found in the repo.

This means no regressions will be caught automatically. Critical flows (dedup, tombstone, sync, auth, multi-tenant isolation) have never been tested programmatically.

**Recommendation:** At minimum, add integration tests for:
- `POST /api/integrations/google_sheets/notifications` — bad channelId ignored, valid channelId triggers sync, debounce respected
- Lead dedup via `externalLeadId` — duplicate import skipped
- Tombstone check — deleted lead not re-imported
- `getTenantFilter` — tenant isolation (request from tenant A cannot read tenant B data)

---

## AUDIT DETAILS BY AREA

### Area 1 — Google Drive Watch Implementation

| Check | Result | Notes |
|-------|--------|-------|
| `driveWatch.js` utility — JSON POST helper, createDriveWatch, stopDriveWatch | ✅ PASS | Well-structured, timeout 15s, proper error propagation |
| Watch metadata stored in `config.spreadsheets[].watch` per-sheet | ✅ PASS | channelId, resourceId, expiry, createdAt, lockUntil |
| Watch created on `saveSheetConfig`, stopped on `removeSheetConfig` | ✅ PASS | Old channel stopped before new one created |
| Watches stopped on `disconnectIntegration` | ✅ PASS | Token refresh failure handled gracefully (skips stop, still disconnects) |
| Notification handler ignores 'sync' state ping | ✅ PASS | `if (state === 'sync') return` |
| channelId+resourceId validated against DB (not trusted from request) | ✅ PASS | `Integration.findOne({ 'config.spreadsheets': { $elemMatch: { 'watch.channelId': channelId, 'watch.resourceId': resourceId } } })` |
| tenantId derived from DB doc, not from request | ✅ PASS | `const tenantId = doc.tenantId;` |
| 30-second debounce lock via MongoDB positional `$` update | ✅ PASS | `lockUntil: Date.now() + 30_000` |
| `setImmediate` — HTTP 200 before async processing | ✅ PASS | Google receives 200 within <1ms |
| Watch renewal GitHub Actions workflow | ✅ PASS | Daily at 03:17 UTC |
| `BACKEND_PUBLIC_URL` set in Render environment | ❌ **BLOCKER** | See Blocker 1 |
| Google Cloud domain verification for push notifications | ❌ **NOT TESTED** | Must be done in Google Cloud Console |

---

### Area 2 — Google Sheets OAuth / Sync / Token Refresh / Webhook Security

| Check | Result | Notes |
|-------|--------|-------|
| OAuth scopes: drive.file + spreadsheets.readonly + openid email profile | ✅ PASS | Minimal necessary scope |
| `access_type=offline&prompt=consent` → refresh token obtained | ✅ PASS | Guaranteed refresh token on every OAuth grant |
| `getOrRefreshToken` used before all Sheets API calls | ✅ PASS | Consistent pattern throughout |
| Refresh token encrypted at rest (AES-256-GCM) | ✅ PASS | `encryption.js` with ENCRYPTION_KEY env var |
| `ENCRYPTION_KEY` absent → CRITICAL log, all-zeros fallback | ⚠️ WARN | Insecure fallback acceptable only if key is set in Render |
| Apps Script webhook permanently disabled (HTTP 410) | ✅ PASS | `gsheetWebhook.js` — `receiveLeads()` commented out |
| Drive notification webhook validates channelId+resourceId | ✅ PASS | See Area 1 |
| `drive.file` scope coverage for Picker-opened files | ⚠️ WARN | See Issue 3 |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET set in Render | ❌ NOT TESTED | Required; cannot verify from code |

---

### Area 3 — Lead Deduplication + Tombstone Protection

| Check | Result | Notes |
|-------|--------|-------|
| Dedup by `externalLeadId` + `externalSource` before import | ✅ PASS | `Lead.findOne({ tenantId, externalLeadId, externalSource })` |
| Stable `externalLeadId` — id column or `gsheets:${tabName}:R${rowIndex}` | ✅ PASS | Deterministic, reproducible key |
| Compound sparse index `{ tenantId, externalLeadId }` | ✅ PASS | In `Lead.js` schema |
| Tombstone check before import (`DeletedLeadSource`) | ✅ PASS | `DeletedLeadSource.findOne({ tenantId, externalSource, externalLeadId })` |
| Single delete creates tombstone for google_sheets leads | ✅ PASS | `leadController.js` lines 155–161, `$setOnInsert` upsert |
| Bulk delete creates tombstones before `Lead.deleteMany` | ✅ PASS | `leadController.js` lines 413–433, `bulkWrite` |
| `externalLeadId` never modified after creation | ✅ PASS | No update path touches this field |

---

### Area 4 — Multi-Tenant Isolation + Role-Based Permissions

| Check | Result | Notes |
|-------|--------|-------|
| `getTenantFilter(req)` used in all controllers | ✅ PASS | Derived from JWT middleware |
| `req.body.tenantId` / `req.query.tenantId` trusted anywhere | ✅ PASS | Zero matches in grep scan |
| `protect` middleware on all non-public routes | ✅ PASS | `router.use(protect)` before all auth-required routes |
| `authorize()` on admin-only endpoints | ✅ PASS | ALLOWED_ROLES checked on sensitive integrations routes |
| Deactivated/suspended users rejected | ✅ PASS | `auth.js` middleware checks user status |
| `platform_super_admin` can impersonate via `X-Tenant-Id` | ✅ PASS | Documented in auth.js, header listed in CORS allowedHeaders |
| Webhook notification: tenantId never from request body | ✅ PASS | driveWatchController.js derives tenantId only from `doc.tenantId` |

---

### Area 5 — Pipelines, Stages, Lead Routing

| Check | Result | Notes |
|-------|--------|-------|
| Pipeline model has tenantId index and required constraint | ✅ PASS | `required: true, index: true` |
| Unique pipeline name per tenant (compound index) | ✅ PASS | `{ tenantId: 1, name: 1 }, { unique: true }` |
| Stage types: open / won / lost enum | ✅ PASS | Used for semantic reporting |
| `conversionAction` is per-stage config, not inferred from name/type | ✅ PASS | Explicit `enum: ['none', 'convert_to_client']`, default 'none' |
| `isDefault` flag for default pipeline per tenant | ✅ PASS | One pipeline per tenant enforced at app layer |
| `firstOpenStage()` helper for new lead placement | ✅ PASS | Sorts by order, finds first 'open' type stage |
| Pipeline routes registered in server.js | ✅ PASS | `/api/pipeline` and `/api/pipeline-defs` both mounted |

---

### Area 6 — Frontend / Backend Production Configuration

| Check | Result | Notes |
|-------|--------|-------|
| `api.js` uses `VITE_API_URL \|\| '/api'` | ✅ PASS | Correct Vercel production fallback |
| `portalApi.js` baseURL double `/api` in production | ❌ **BUG** | See Issue 1 — all Client Portal endpoints 404 in production |
| CORS allows `*.vercel.app`, `*.onrender.com`, `CLIENT_URL` | ✅ PASS | Correct for staging and production |
| Rate limiting: 500 req / 15 min on all `/api/` routes | ⚠️ WARN | Reasonable but covers notification webhook (see Issue 2) |
| Helmet security headers enabled | ✅ PASS | `crossOriginResourcePolicy: cross-origin` for uploads |
| Body size limit 10MB | ✅ PASS | Reasonable for spreadsheet payloads |
| `errorHandler` does not send stack traces to client | ✅ PASS | Only sends `message`, not `stack` |
| `morgan` logging disabled in production | ✅ PASS | `if (NODE_ENV === 'development')` guard |
| vite.config.js proxy only used in local dev | ✅ PASS | Production frontend hits `VITE_API_URL` directly |
| `LeadForms.jsx` uses inconsistent API base (`'http://localhost:5000'` without `/api`) | ⚠️ MINOR | Fallback differs from `api.js`; affects only if `VITE_API_URL` unset (dev only) |

---

### Area 7 — Automated Tests and Build Verification

| Check | Result | Notes |
|-------|--------|-------|
| Backend test runner (jest/mocha/supertest) | ❌ FAIL | Not present in package.json |
| Frontend test runner (vitest/jest) | ❌ FAIL | Not present in package.json |
| Any `.test.js` or `.spec.js` files | ❌ FAIL | Zero test files found in entire repo |
| ESLint configured | ✅ PASS | `frontend/package.json` has `lint` script |
| Build passes | ❌ NOT TESTED | Build environment unavailable (VM disk full during prior session) |

---

### Area 8 — Incomplete TODOs, Broken Routes, Critical Security Issues

| Check | Result | Notes |
|-------|--------|-------|
| `debug-routes` public diagnostic endpoint present | ❌ **BLOCKER** | See Blocker 3 — remove before production |
| Any `req.body.tenantId` / `req.query.tenantId` usage | ✅ PASS | None found |
| Secret tokens logged to console | ✅ PASS | No console.log of tokens, secrets, or keys found |
| Internal sync endpoints protected by `INTERNAL_SYNC_SECRET` Bearer token | ✅ PASS | `internalSync.js` middleware checks Authorization header |
| `internalSyncController.js` logs tenantId (not secret) in error paths | ✅ PASS | Only logs `doc.tenantId`, `docErr.message` |
| gsheetWebhook route mounted but disabled | ✅ PASS | Returns 410, no code runs |
| `PLATFORM_ADMIN_*` credentials in .env.example are placeholder | ✅ PASS | Must be overridden in Render — not a security issue in source |
| Mongoose `Mixed` type on `config` + `credentials` fields | ⚠️ NOTE | No schema validation on nested structure; rely on app layer |
| Platform API key `rateLimit` stored in memory (`_apiKeys` array) | ⚠️ NOTE | In-memory store resets on every Render restart; API key data lost. Not a security issue but a reliability one if API keys are used. |

---

## Pre-Launch Checklist

### Must-do before going live:
- [ ] **Remove `debug-routes` endpoint** — `backend/routes/integrations.js` lines 35–47
- [ ] **Set `BACKEND_PUBLIC_URL`** in Render backend environment variables
- [ ] **Register domain in Google Cloud Console** for Drive push notifications
- [ ] **Fix `portalApi.js` double `/api`** in production — `frontend/src/services/portalApi.js` line 9
- [ ] **Set `ENCRYPTION_KEY`** in Render (32 random bytes as hex) — without it tokens are encrypted with all-zeros key
- [ ] **Set `GOOGLE_CLIENT_ID`** and `GOOGLE_CLIENT_SECRET`** in Render
- [ ] **Set `INTERNAL_SYNC_SECRET`** in Render and in GitHub Secrets
- [ ] **Set `JWT_SECRET`** and `JWT_REFRESH_SECRET` in Render (strong random 64-char hex)
- [ ] **Set `CLIENT_URL`** in Render to your Vercel domain

### Recommended soon after launch:
- [ ] Exempt notification webhook from global rate limiter (or raise its limit)
- [ ] Add at minimum 10 integration tests covering dedup, tombstone, auth isolation
- [ ] Monitor Render logs for `[DriveWatch] Created channel` after first sheet save — confirm Watch creation succeeds
- [ ] Run `GET /api/health` after deploy to confirm DB connected

---

## Optional Improvements (not blocking launch)

1. **Move Drive watch creation to async background job** — currently `saveSheetConfig` awaits the Google API call before responding. An unresponsive Google API stalls the user's save operation. A queue or `setImmediate` pattern (same as notification handler) would fix this.

2. **Persist platform API keys to MongoDB** — `platformController.js` stores `_apiKeys` in a module-level array that resets on every Render dyno restart. If API keys are a real feature, they need to be persisted.

3. **Stricter rate limiting on auth routes** — The global 500/15min limit applies equally to `/api/auth/login`. A separate brute-force limiter (e.g., 10/min on `/api/auth/`) would be prudent.

4. **`ENCRYPTION_KEY` missing → hard fail rather than insecure fallback** — `encryption.js` logs a CRITICAL error but continues with an all-zeros key. In production mode it should throw on startup rather than operate insecurely.
