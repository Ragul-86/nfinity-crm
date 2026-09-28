/**
 * routes/internalSync.js
 *
 * Internal-only endpoints for scheduled background jobs.
 * Authentication: Bearer token matching INTERNAL_SYNC_SECRET env var.
 * No JWT / session cookies required.
 *
 * Designed for a Render Cron Job that POSTs to:
 *   POST /api/internal/google-sheets/sync-all
 * with header:
 *   Authorization: Bearer <INTERNAL_SYNC_SECRET>
 */

const express = require('express');
const router  = express.Router();
const { syncAllGoogleSheets } = require('../controllers/internalSyncController');

// POST /api/internal/google-sheets/sync-all
router.post('/google-sheets/sync-all', syncAllGoogleSheets);

module.exports = router;
