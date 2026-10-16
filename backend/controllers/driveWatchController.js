/**
 * driveWatchController.js
 *
 * Handles Google Drive push-notification webhooks for near-real-time
 * Google Sheets → CRM lead sync.
 *
 * Endpoint (public — Google Drive calls it directly, no JWT):
 *   POST /api/integrations/google_sheets/notifications
 *
 * ── Security model ────────────────────────────────────────────────────────────
 *   - tenantId is NEVER read from the request body or query params.
 *   - The channelId + resourceId from Google's headers are matched against
 *     watch metadata stored in config.spreadsheets[].watch in MongoDB.
 *   - Only state === 'change' | 'update' triggers a sync; 'sync' (initial
 *     verification ping) is acknowledged and ignored.
 *   - A 30-second per-spreadsheet debounce lock prevents thundering-herd
 *     re-syncs when a spreadsheet is edited rapidly.
 *   - Actual lead import reuses the same syncIntegrationDoc() function
 *     used by the GitHub Actions scheduled cron — no parallel lead-creation
 *     path.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *   Google POSTs headers:
 *     X-Goog-Channel-Id      — must match stored watch.channelId
 *     X-Goog-Resource-Id     — must match stored watch.resourceId
 *     X-Goog-Resource-State  — 'sync' (ignored) | 'change' | 'update'
 *   1. Respond HTTP 200 immediately (Google requires ≤ 10s response).
 *   2. In setImmediate: look up integration by channelId + resourceId.
 *   3. Check debounce lock; if active, skip.
 *   4. Acquire 30s lock, call syncIntegrationDoc(doc, spreadsheetId).
 */

'use strict';

const Integration = require('../models/Integration');
const { syncIntegrationDoc } = require('./internalSyncController');

// ─── POST /api/integrations/google_sheets/notifications ──────────────────────
exports.handleDriveNotification = (req, res) => {
  // Acknowledge immediately — Google requires a response within 10 seconds.
  // All actual work happens in setImmediate (after response is flushed).
  res.status(200).send('ok');

  setImmediate(async () => {
    try {
      const channelId  = req.headers['x-goog-channel-id'];
      const resourceId = req.headers['x-goog-resource-id'];
      const state      = req.headers['x-goog-resource-state']; // 'sync' | 'change' | 'update'
      const token      = req.headers['x-goog-channel-token'];  // unused, but logged for debug

      // ── Basic header validation ───────────────────────────────────────────
      if (!channelId || !resourceId) {
        console.warn('[DriveWatch] Notification missing required headers — ignored');
        return;
      }

      // ── Initial sync ping — Google sends this when the watch is first created ──
      if (state === 'sync') {
        console.log(`[DriveWatch] Sync ping received for channel ${channelId} — acknowledged`);
        return;
      }

      // ── Resolve integration from stored watch metadata ────────────────────
      // NEVER trust tenantId from request body/query — derive it from DB lookup.
      const doc = await Integration.findOne({
        provider: 'google_sheets',
        status:   { $in: ['connected', 'sync_error'] },
        'config.spreadsheets': {
          $elemMatch: {
            'watch.channelId':  channelId,
            'watch.resourceId': resourceId,
          },
        },
      }).lean();

      if (!doc) {
        // Channel not registered in our DB — could be stale from a previous deployment
        console.warn(`[DriveWatch] Unknown channel ${channelId} / resource ${resourceId} — notification ignored`);
        return;
      }

      // ── Find the specific spreadsheet this channel belongs to ─────────────
      const sheetEntry = doc.config.spreadsheets.find(
        s => s.watch?.channelId === channelId && s.watch?.resourceId === resourceId
      );
      if (!sheetEntry) {
        console.warn(`[DriveWatch] Channel ${channelId} found in doc but sheet entry missing — ignored`);
        return;
      }

      const spreadsheetId = sheetEntry.spreadsheetId;
      const tenantId      = doc.tenantId;

      console.log(`[DriveWatch] ${state} notification — channel ${channelId}, spreadsheet ${spreadsheetId}, tenant ${tenantId}`);

      // ── Debounce: skip if sync for this spreadsheet was triggered recently ──
      const lockUntil = sheetEntry.watch?.lockUntil || 0;
      if (Date.now() < lockUntil) {
        console.log(`[DriveWatch] Debounced ${spreadsheetId} — lock active until ${new Date(lockUntil).toISOString()}`);
        return;
      }

      // ── Acquire 30-second debounce lock ──────────────────────────────────
      await Integration.updateOne(
        {
          _id: doc._id,
          'config.spreadsheets.spreadsheetId': spreadsheetId,
        },
        { $set: { 'config.spreadsheets.$.watch.lockUntil': Date.now() + 30_000 } }
      );

      // ── Trigger sync scoped to this spreadsheet only ──────────────────────
      // Reuses the same logic as the GitHub Actions cron — no separate lead-
      // creation path.
      console.log(`[DriveWatch] Triggering sync for spreadsheet ${spreadsheetId} (tenant ${tenantId})`);
      const result = await syncIntegrationDoc(doc, spreadsheetId);

      console.log(
        `[DriveWatch] Sync complete — created: ${result.totalCreated}, ` +
        `skipped: ${result.totalSkipped}, errors: ${result.errors.length}`
      );

    } catch (e) {
      console.error('[DriveWatch] Notification handler error:', e.message, e.stack?.split('\n')[1]);
    }
  });
};
