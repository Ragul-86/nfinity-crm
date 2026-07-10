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

// ── Integration CRUD ──────────────────────────────────────────────────────────
// These must come AFTER the /oauth/* routes to avoid /:provider matching "oauth".
router.get('/',                           authorize(...ALLOWED_ROLES), getIntegrations);
router.get('/:provider',                  authorize(...ALLOWED_ROLES), getIntegration);
router.post('/:provider',                 authorize(...ALLOWED_ROLES), connectIntegration);
router.post('/:provider/test',            authorize(...ALLOWED_ROLES), testConnection);
router.post('/:provider/sync',            authorize(...ALLOWED_ROLES), syncIntegration);
router.delete('/:provider',               authorize(...ALLOWED_ROLES), disconnectIntegration);
router.patch('/:provider/sync-settings',  authorize(...ALLOWED_ROLES), updateSyncSettings);

module.exports = router;
