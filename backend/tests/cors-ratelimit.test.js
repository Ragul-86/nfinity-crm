'use strict';

/**
 * cors-ratelimit.test.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Tests for:
 *   1.  https://crm.nfinitypartner.com requests are accepted by CORS
 *   2.  https://nfinity-crm.vercel.app continues to work
 *   3.  An unauthorized external origin is rejected
 *   4.  Preflight OPTIONS requests return correct CORS headers
 *   5.  No-origin requests (Postman / curl) are allowed
 *   6.  express-rate-limit no longer throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
 *       when trust proxy is set to 1
 *   7.  Rate limiting remains active (limiter is created and applied)
 *   8.  Comma-separated CLIENT_URL is parsed correctly (multi-domain support)
 *
 * Run: npm test
 * Requires: jest  (npm install --save-dev jest)
 *
 * These tests do NOT import server.js — no MongoDB connection is needed.
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { buildAllowedOrigins, makeOriginValidator } = require('../utils/corsConfig');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wrap the cors origin callback in a Promise for clean async test assertions.
 */
function callValidator(validator, origin) {
  return new Promise((resolve, reject) => {
    validator(origin, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Build a minimal Express app that mirrors the production CORS + rate-limit
 * configuration in server.js, without needing a DB connection.
 */
function makeTestApp({ trustProxy = 1, rateLimitMax = 500, clientUrl = 'https://nfinity-crm.vercel.app,https://crm.nfinitypartner.com' } = {}) {
  const app = express();
  if (trustProxy !== null) app.set('trust proxy', trustProxy);

  const allowedOrigins = buildAllowedOrigins({ CLIENT_URL: clientUrl });

  app.use(cors({
    origin: makeOriginValidator(allowedOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  }));

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: rateLimitMax });
  app.use('/api/', limiter);

  app.get('/api/test', (req, res) => res.json({ ok: true }));

  // Minimal auth-style endpoint to verify auth routes are not broken by CORS
  app.post('/api/auth/login', (req, res) => res.json({ token: 'test' }));

  return app;
}

/**
 * Make an HTTP request to a listening server and resolve to { status, headers, body }.
 */
function httpRequest(server, { method = 'GET', path = '/api/test', headers = {} }) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const options = { hostname: '127.0.0.1', port, path, method, headers };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function startServer(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ─── Unit tests: buildAllowedOrigins ─────────────────────────────────────────

describe('buildAllowedOrigins — env parsing', () => {
  test('parses a single CLIENT_URL', () => {
    const origins = buildAllowedOrigins({ CLIENT_URL: 'https://nfinity-crm.vercel.app' });
    expect(origins).toContain('https://nfinity-crm.vercel.app');
  });

  test('8. parses comma-separated CLIENT_URL into multiple origins', () => {
    const origins = buildAllowedOrigins({
      CLIENT_URL: 'https://nfinity-crm.vercel.app,https://crm.nfinitypartner.com',
    });
    expect(origins).toContain('https://nfinity-crm.vercel.app');
    expect(origins).toContain('https://crm.nfinitypartner.com');
  });

  test('trims whitespace around comma-separated values', () => {
    const origins = buildAllowedOrigins({
      CLIENT_URL: 'https://nfinity-crm.vercel.app , https://crm.nfinitypartner.com ',
    });
    expect(origins).toContain('https://nfinity-crm.vercel.app');
    expect(origins).toContain('https://crm.nfinitypartner.com');
    // No stray whitespace in the stored values
    expect(origins).not.toContain('https://crm.nfinitypartner.com ');
  });

  test('always includes localhost:5173 and localhost:3000', () => {
    const origins = buildAllowedOrigins({ CLIENT_URL: '' });
    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('http://localhost:3000');
  });

  test('works when CLIENT_URL is absent from env', () => {
    const origins = buildAllowedOrigins({});
    expect(origins).toContain('http://localhost:5173');
  });
});

// ─── Unit tests: makeOriginValidator ─────────────────────────────────────────

describe('makeOriginValidator — CORS origin decisions', () => {
  const allowedOrigins = buildAllowedOrigins({
    CLIENT_URL: 'https://nfinity-crm.vercel.app,https://crm.nfinitypartner.com',
  });
  const validator = makeOriginValidator(allowedOrigins);

  test('1. accepts https://crm.nfinitypartner.com (new custom domain)', async () => {
    await expect(callValidator(validator, 'https://crm.nfinitypartner.com')).resolves.toBe(true);
  });

  test('2. accepts https://nfinity-crm.vercel.app (existing Vercel domain)', async () => {
    await expect(callValidator(validator, 'https://nfinity-crm.vercel.app')).resolves.toBe(true);
  });

  test('2b. accepts any *.vercel.app preview deployment', async () => {
    await expect(callValidator(validator, 'https://nfinity-crm-preview-abc.vercel.app')).resolves.toBe(true);
  });

  test('3. rejects an unauthorized external origin', async () => {
    await expect(callValidator(validator, 'https://evil.com')).rejects.toThrow(
      'CORS: https://evil.com not allowed'
    );
  });

  test('3b. rejects a subdomain impersonation attempt', async () => {
    // Must NOT allow "https://evil-crm.nfinitypartner.com" just because it
    // contains "nfinitypartner.com" — strict set membership prevents this.
    await expect(callValidator(validator, 'https://evil-crm.nfinitypartner.com')).rejects.toThrow('CORS');
  });

  test('5. accepts requests with no Origin header (Postman / curl / server-to-server)', async () => {
    await expect(callValidator(validator, null)).resolves.toBe(true);
    await expect(callValidator(validator, undefined)).resolves.toBe(true);
    await expect(callValidator(validator, '')).resolves.toBe(true);
  });

  test('accepts *.onrender.com (internal service calls)', async () => {
    await expect(callValidator(validator, 'https://nfinity-crm.onrender.com')).resolves.toBe(true);
  });
});

// ─── Integration tests: OPTIONS preflight ─────────────────────────────────────

describe('4. OPTIONS preflight returns correct CORS headers', () => {
  let server;
  beforeAll(async () => { server = await startServer(makeTestApp()); });
  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  test('OPTIONS from crm.nfinitypartner.com returns Allow-Origin for that domain', async () => {
    const res = await httpRequest(server, {
      method: 'OPTIONS',
      path: '/api/test',
      headers: {
        Origin: 'https://crm.nfinitypartner.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    });
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('https://crm.nfinitypartner.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('OPTIONS from nfinity-crm.vercel.app returns Allow-Origin for that domain', async () => {
    const res = await httpRequest(server, {
      method: 'OPTIONS',
      path: '/api/test',
      headers: {
        Origin: 'https://nfinity-crm.vercel.app',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://nfinity-crm.vercel.app');
  });

  test('OPTIONS from rejected origin has no Access-Control-Allow-Origin header', async () => {
    const res = await httpRequest(server, {
      method: 'OPTIONS',
      path: '/api/test',
      headers: {
        Origin: 'https://evil.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// ─── Integration tests: auth endpoint is reachable from allowed origins ────────

describe('5. Auth endpoint accessible from allowed origins', () => {
  let server;
  beforeAll(async () => { server = await startServer(makeTestApp()); });
  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  test('POST /api/auth/login from crm.nfinitypartner.com returns 200 (not CORS error)', async () => {
    const res = await httpRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: 'https://crm.nfinitypartner.com', 'Content-Type': 'application/json' },
    });
    // 200 confirms the CORS middleware allowed the request through
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://crm.nfinitypartner.com');
  });

  test('POST /api/auth/login from nfinity-crm.vercel.app still returns 200', async () => {
    const res = await httpRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: 'https://nfinity-crm.vercel.app', 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
  });
});

// ─── Integration tests: trust proxy + ERR_ERL_UNEXPECTED_X_FORWARDED_FOR ──────

describe('6. trust proxy = 1 prevents ERR_ERL_UNEXPECTED_X_FORWARDED_FOR', () => {
  test('request with X-Forwarded-For succeeds (no 500) when trust proxy = 1', async () => {
    const app = makeTestApp({ trustProxy: 1 });
    const server = await startServer(app);
    try {
      const res = await httpRequest(server, {
        path: '/api/test',
        headers: {
          Origin: 'https://crm.nfinitypartner.com',
          'X-Forwarded-For': '203.0.113.42', // simulated Render client IP
        },
      });
      // If trust proxy is correct, rate-limit reads the IP and does not throw
      expect(res.status).toBe(200);
    } finally {
      await new Promise(done => server.close(done));
    }
  });

  test('trust proxy value on the app is 1 (Render single-hop config)', () => {
    const app = express();
    app.set('trust proxy', 1);
    // Express stores numeric trust proxy as the number
    expect(app.get('trust proxy')).toBe(1);
    // Express also resolves the compiled fn — ensure it trusts exactly one hop
    expect(app.get('trust proxy fn')('203.0.113.42', 0)).toBe(true);  // first hop trusted
    expect(app.get('trust proxy fn')('10.0.0.1', 1)).toBe(false);     // second hop NOT trusted
  });
});

// ─── Integration tests: rate limiting remains active ─────────────────────────

describe('7. Rate limiting remains active', () => {
  test('limiter middleware is created and is a function', () => {
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
    expect(typeof limiter).toBe('function');
  });

  test('rate limiter sends 429 after max is exceeded', async () => {
    // Use a tiny limit (max: 2) to prove rate-limiting is enforced
    const app = makeTestApp({ rateLimitMax: 2 });
    const server = await startServer(app);
    try {
      // First two requests should pass
      const r1 = await httpRequest(server, { headers: { 'X-Forwarded-For': '5.5.5.5' } });
      const r2 = await httpRequest(server, { headers: { 'X-Forwarded-For': '5.5.5.5' } });
      // Third request from the same IP should be rate-limited
      const r3 = await httpRequest(server, { headers: { 'X-Forwarded-For': '5.5.5.5' } });
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
    } finally {
      await new Promise(done => server.close(done));
    }
  });
});
