/**
 * routes/gsheetWebhook.js
 *
 * Public webhook endpoint for Google Apps Script → CRM lead sync.
 * Authentication is handled inside the controller via HMAC signature verification.
 * No JWT / cookie auth required — this is called by Google's servers, not a browser.
 */

const express    = require('express');
const router     = express.Router();
const { receiveLeads } = require('../controllers/gsheetWebhookController');

// POST /api/gsheet-webhook?workspaceId=<tenantId>
router.post('/', receiveLeads);

module.exports = router;
