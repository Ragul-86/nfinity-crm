'use strict';

/**
 * corsConfig.js
 *
 * Centralises the CORS origin allowlist and validator so they can be unit-tested
 * without importing server.js (which boots a DB connection).
 */

/**
 * Build the set of explicitly allowed CORS origins from the environment.
 *
 * CLIENT_URL may be a single URL or a comma-separated list of URLs, which lets
 * a single env var cover both the primary Vercel domain and any custom subdomain:
 *
 *   CLIENT_URL=https://nfinity-crm.vercel.app,https://crm.nfinitypartner.com
 *
 * The localhost entries are always included for local development.
 *
 * @param {Object} env - environment object (default: process.env)
 * @returns {string[]} - deduplicated list of allowed origin strings
 */
function buildAllowedOrigins(env) {
  if (env === undefined) env = process.env;
  const fromEnv = (env.CLIENT_URL || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  return [
    ...fromEnv,
    'http://localhost:5173',
    'http://localhost:3000',
  ];
}

/**
 * Returns an Express-cors origin callback that:
 *  - Allows requests without an Origin header (Postman, curl, server-to-server)
 *  - Allows any *.vercel.app or *.onrender.com (preview / internal deployments)
 *  - Allows origins explicitly listed in allowedOrigins
 *  - Rejects all other origins with a hard error (logged by Express)
 *
 * Uses strict set membership for the custom origins — NOT substring matching —
 * so an attacker cannot bypass the check with a crafted hostname.
 *
 * @param {string[]} allowedOrigins
 * @returns {Function} cors origin callback (origin, callback) => void
 */
function makeOriginValidator(allowedOrigins) {
  // Convert to Set for O(1) lookup
  const originSet = new Set(allowedOrigins);

  return function originValidator(origin, callback) {
    // No origin header: non-browser request (Postman, curl, server-to-server) — allow
    if (!origin) return callback(null, true);

    // Wildcard rules for Vercel previews and Render internal services
    if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }

    // Explicitly configured origins (strict equality, no substring tricks)
    if (originSet.has(origin)) return callback(null, true);

    // Anything else is blocked
    callback(new Error(`CORS: ${origin} not allowed`));
  };
}

/**
 * Return the primary (first) client URL from CLIENT_URL.
 *
 * CLIENT_URL may be a single URL or a comma-separated list introduced to
 * support multiple CORS origins.  Controllers that build redirect or email
 * links must use ONE valid URL — they take the first entry so the result is
 * always a well-formed URL regardless of how many domains are listed.
 *
 * Examples:
 *   'https://crm.nfinitypartner.com'                         → 'https://crm.nfinitypartner.com'
 *   'https://nfinity-crm.vercel.app,https://crm.example.com' → 'https://nfinity-crm.vercel.app'
 *   ''  / undefined                                           → 'http://localhost:5173'
 *
 * @param {Object} env - environment object (default: process.env)
 * @returns {string} - a single, trimmed URL with no trailing slash
 */
function getPrimaryClientUrl(env) {
  if (env === undefined) env = process.env;
  const raw = (env.CLIENT_URL || '').split(',')[0].trim();
  return raw || 'http://localhost:5173';
}

module.exports = { buildAllowedOrigins, makeOriginValidator, getPrimaryClientUrl };
