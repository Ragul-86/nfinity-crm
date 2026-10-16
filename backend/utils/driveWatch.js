/**
 * utils/driveWatch.js
 *
 * Shared helpers for creating and stopping Google Drive push-notification
 * watch channels.  Used by:
 *   - integrationController.js  (create on saveSheetConfig, stop on removeSheetConfig/disconnect)
 *   - internalSyncController.js (renewWatches cron handler)
 *
 * Security:
 *   - Watch address is derived from BACKEND_PUBLIC_URL env var — never from client input.
 *   - channelId is a cryptographically random UUID generated server-side.
 *
 * Drive Watch API docs:
 *   https://developers.google.com/drive/api/guides/push
 */

'use strict';

const crypto = require('crypto');
const https  = require('https');

// ─── Low-level HTTPS JSON POST ────────────────────────────────────────────────
function httpPostJson(hostname, path, bodyObj, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(bodyObj);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data',  (chunk) => (data += chunk));
      res.on('end',   () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Drive API request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

// ─── createDriveWatch ─────────────────────────────────────────────────────────
// Registers a push-notification channel for `spreadsheetId` with Google Drive.
// Returns watch metadata to store in config.spreadsheets[n].watch, or null if
// BACKEND_PUBLIC_URL is not set (safe no-op for local dev).
//
// @param {string} spreadsheetId  — Google Sheets file ID
// @param {string} accessToken    — valid OAuth2 access token with drive.file scope
// @returns {{ channelId, resourceId, expiry, createdAt } | null}
// ─────────────────────────────────────────────────────────────────────────────
async function createDriveWatch(spreadsheetId, accessToken) {
  const backendUrl = (process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!backendUrl) {
    console.warn('[DriveWatch] BACKEND_PUBLIC_URL not set — skipping watch creation for', spreadsheetId);
    return null;
  }

  const channelId  = crypto.randomUUID();
  // 6-day expiry (well under Google's 7-day max); renewal cron runs daily
  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;
  const address    = `${backendUrl}/api/integrations/google_sheets/notifications`;

  const res = await httpPostJson(
    'www.googleapis.com',
    `/drive/v3/files/${encodeURIComponent(spreadsheetId)}/watch`,
    {
      id:         channelId,
      type:       'web_hook',
      address,
      expiration: String(expiration),
    },
    { Authorization: `Bearer ${accessToken}` }
  );

  if (res.status !== 200) {
    const reason = res.body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Drive watch creation failed for ${spreadsheetId}: ${reason}`);
  }

  console.log(`[DriveWatch] Created channel ${res.body.id} for ${spreadsheetId} (expires ${new Date(parseInt(res.body.expiration, 10)).toISOString()})`);

  return {
    channelId:  res.body.id,
    resourceId: res.body.resourceId,
    expiry:     parseInt(res.body.expiration, 10),
    createdAt:  Date.now(),
  };
}

// ─── stopDriveWatch ───────────────────────────────────────────────────────────
// Stops a push-notification channel.  Always resolves (errors are logged, not
// thrown) because a failed stop should never block config updates.
//
// @param {string} channelId   — the channel id we sent when creating
// @param {string} resourceId  — returned by Google at channel creation time
// @param {string} accessToken — valid OAuth2 access token
// ─────────────────────────────────────────────────────────────────────────────
async function stopDriveWatch(channelId, resourceId, accessToken) {
  try {
    const res = await httpPostJson(
      'www.googleapis.com',
      '/drive/v3/channels/stop',
      { id: channelId, resourceId },
      { Authorization: `Bearer ${accessToken}` }
    );
    // 204 No Content = success
    if (res.status !== 204 && res.status !== 200) {
      console.warn(`[DriveWatch] Stop returned HTTP ${res.status} for channel ${channelId}:`,
        typeof res.body === 'object' ? res.body?.error?.message : res.body);
    } else {
      console.log(`[DriveWatch] Stopped channel ${channelId}`);
    }
  } catch (e) {
    console.warn(`[DriveWatch] Stop failed for channel ${channelId}:`, e.message);
  }
}

module.exports = { createDriveWatch, stopDriveWatch };
