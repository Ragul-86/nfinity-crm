/**
 * systemHealthController.js
 * Returns real-time system health metrics.
 * GET /api/health — public lightweight ping
 * GET /api/health/details — protected, admin+
 */
const mongoose = require('mongoose')
const os = require('os')

// GET /api/health  (public)
exports.ping = (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() })
}

// GET /api/health/details  (admin+, protected)
exports.getHealthDetails = async (req, res, next) => {
  try {
    const startMs = Date.now()

    // MongoDB ping
    let dbStatus = 'ok'
    let dbLatencyMs = 0
    try {
      const t0 = Date.now()
      await mongoose.connection.db.command({ ping: 1 })
      dbLatencyMs = Date.now() - t0
    } catch {
      dbStatus = 'error'
    }

    // Memory
    const totalMem  = os.totalmem()
    const freeMem   = os.freemem()
    const usedMem   = totalMem - freeMem
    const memUsedPct = Math.round((usedMem / totalMem) * 100)

    // CPU (load avg)
    const loadAvg = os.loadavg()

    // Node process memory
    const procMem = process.memoryUsage()

    // Uptime
    const uptimeSecs = process.uptime()

    // Mongoose connection state: 0=disconnected,1=connected,2=connecting,3=disconnecting
    const dbReadyState = mongoose.connection.readyState
    const DB_STATE_LABELS = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }

    // Collection counts (fast — just metadata)
    let dbStats = {}
    try {
      const db = mongoose.connection.db
      const collections = await db.listCollections().toArray()
      dbStats.collections = collections.length
    } catch {}

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      responseMs: Date.now() - startMs,
      services: {
        api: { status: 'ok' },
        database: {
          status: dbStatus,
          state: DB_STATE_LABELS[dbReadyState] || 'unknown',
          latencyMs: dbLatencyMs,
          collections: dbStats.collections,
        },
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        uptimeSecs: Math.round(uptimeSecs),
        uptimeHuman: formatUptime(uptimeSecs),
        loadAvg: {
          '1m': Number(loadAvg[0].toFixed(2)),
          '5m': Number(loadAvg[1].toFixed(2)),
          '15m': Number(loadAvg[2].toFixed(2)),
        },
        cpu: {
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'unknown',
        },
        memory: {
          totalMB: Math.round(totalMem / 1024 / 1024),
          usedMB:  Math.round(usedMem  / 1024 / 1024),
          freeMB:  Math.round(freeMem  / 1024 / 1024),
          usedPct: memUsedPct,
        },
        process: {
          heapUsedMB:  Math.round(procMem.heapUsed  / 1024 / 1024),
          heapTotalMB: Math.round(procMem.heapTotal / 1024 / 1024),
          rssMB:       Math.round(procMem.rss / 1024 / 1024),
          externalMB:  Math.round(procMem.external / 1024 / 1024),
        },
        hostname: os.hostname(),
      },
    })
  } catch (e) { next(e) }
}

function formatUptime(secs) {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}
