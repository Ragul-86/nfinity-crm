/**
 * routes/gsheetWebhook.js
 *
 * Public webhook endpoint for Google Apps Script → CRM lead sync.
 * Authentication is handled inside the controller via HMAC signature verification.
 * No JWT / cookie auth required — this is called by Google's servers, not a browser.
 */

const express = require('express');
const router  = express.Router();

// ── DISABLED: Google Sheets Apps Script webhook sync is turned off ─────────────
// receiveLeads() is intentionally NOT called. The route is kept alive so callers
// receive a clear HTTP 410 rather than a silent 404.
// To re-enable: uncomment the import below and replace the handler.
// const { receiveLeads } = require('../controllers/gsheetWebhookController');

// POST /api/gsheet-webhook?workspaceId=<tenantId>
router.post('/', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Google Sheets webhook sync is disabled',
  });
});

module.exports = router;
