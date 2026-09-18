const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getIntegrations,
  getIntegration,
  connectIntegration,
  testConnection,
  syncIntegration,
  disconnectIntegration,
  updateSyncSettings,
  oauthInit,
  oauthCallback,
  setupGoogleSheet,
  // Google Sheets OAuth (drive.file + Picker flow)
  getGoogleSheetsPickerConfig,
  verifySheetAccess,
  saveSheetConfig,
  syncGoogleSheet,
} = require('../controllers/integrationController');

// ── OAuth callback is PUBLIC — the OAuth provider redirects here with no cookie ──
// Must be registered BEFORE protect middleware, and before the /:provider wildcard.
router.get('/oauth/:provider/callback', oauthCallback);

// ── All remaining routes require authentication ───────────────────────────────
router.use(protect);

// OAuth init — authenticated (user clicked "Connect with Meta" etc.)
// platform_super_admin passes automatically via authorize(); tenant roles listed below.
const ALLOWED_ROLES = ['client_super_admin', 'super_admin'];

router.get('/oauth/:provider/init', authorize(...ALLOWED_ROLES), oauthInit);

// ── Google Sheets (OAuth + Picker flow) ──────────────────────────────────────
// These MUST come before the generic /:provider wildcard routes below.
router.get('/google_sheets/picker-config',   authorize(...ALLOWED_ROLES), getGoogleSheetsPickerConfig);
router.post('/google_sheets/config/verify',  authorize(...ALLOWED_ROLES), verifySheetAccess);
router.post('/google_sheets/config',         authorize(...ALLOWED_ROLES), saveSheetConfig);
router.post('/google_sheets/sync',           authorize(...ALLOWED_ROLES), syncGoogleSheet);

// ── Integration CRUD ──────────────────────────────────────────────────────────
// These must come AFTER the /oauth/* routes to avoid /:provider matching "oauth".
// Sub-routes (/:provider/setup, /:provider/test, etc.) MUST be before /:provider
// so that Express matches the longer path first.
router.get('/',                           authorize(...ALLOWED_ROLES), getIntegrations);
router.get('/:provider',                  authorize(...ALLOWED_ROLES), getIntegration);

// ── Google Sheets onboarding — generates a webhook secret + Script Properties config ──
// Registered before the generic /:provider/test|sync routes (same nesting level).
router.post('/:provider/setup',           authorize(...ALLOWED_ROLES), setupGoogleSheet);

router.post('/:provider/test',            authorize(...ALLOWED_ROLES), testConnection);
router.post('/:provider/sync',            authorize(...ALLOWED_ROLES), syncIntegration);
router.post('/:provider',                 authorize(...ALLOWED_ROLES), connectIntegration);
router.delete('/:provider',               authorize(...ALLOWED_ROLES), disconnectIntegration);
router.patch('/:provider/sync-settings',  authorize(...ALLOWED_ROLES), updateSyncSettings);

module.exports = router;
