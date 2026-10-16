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
const { syncAllGoogleSheets, renewWatches } = require('../controllers/internalSyncController');

// POST /api/internal/google-sheets/sync-all
// Called by GitHub Actions every 5 minutes to sync all connected Google Sheets.
router.post('/google-sheets/sync-all', syncAllGoogleSheets);

// POST /api/internal/google-sheets/renew-watches
// Called by GitHub Actions daily to renew Drive watch channels expiring within 24h.
router.post('/google-sheets/renew-watches', renewWatches);

module.exports = router;
