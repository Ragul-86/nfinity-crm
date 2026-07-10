/**
 * aiController.js — AI CRM Copilot
 * Supports Claude (Anthropic), OpenAI, and Google Gemini.
 * Per-tenant settings, usage limits, full audit trail.
 * All provider calls use Node.js built-in `https` — no external HTTP deps.
 */
const https = require('https')
const { getTenantFilter } = require('../middleware/auth')
const { logAction }       = require('../utils/auditLogger')
const AISettings          = require('../models/AISettings')
const AIUsage             = require('../models/AIUsage')

const ROLE_LEVELS = {
  platform_super_admin: 100, client_super_admin: 80, super_admin: 80,
  admin: 60, manager: 40, employee: 20, viewer: 10,
}

const DEFAULT_MODELS = {
  claude: 'claude-3-5-haiku-20241022',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpsPost(hostname, path, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed)
          } else {
            const msg = parsed?.error?.message
              || parsed?.error?.errors?.[0]?.message
              || `API error ${res.statusCode}`
            reject(new Error(msg))
          }
        } catch { reject(new Error('Invalid JSON from AI provider')) }
      })
    })
    req.on('error', reject)
    req.write(payload); req.end()
  })
}

// ─── Provider calls ───────────────────────────────────────────────────────────
async function callClaude({ apiKey, model, systemPrompt, messages, maxTokens, temperature }) {
  const result = await httpsPost('api.anthropic.com', '/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }, {
    model: model || DEFAULT_MODELS.claude,
    max_tokens: Math.min(Number(maxTokens) || 1024, 4096),
    system: systemPrompt,
    messages,
  })
  return {
    reply: result?.content?.[0]?.text || '',
    tokensUsed: (result?.usage?.input_tokens || 0) + (result?.usage?.output_tokens || 0),
  }
}

async function callOpenAI({ apiKey, model, systemPrompt, messages, maxTokens, temperature }) {
  const result = await httpsPost('api.openai.com', '/v1/chat/completions', {
    'Authorization': `Bearer ${apiKey}`,
  }, {
    model: model || DEFAULT_MODELS.openai,
    max_tokens: Math.min(Number(maxTokens) || 1024, 4096),
    temperature: Number(temperature) || 0.7,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  })
  return {
    reply: result?.choices?.[0]?.message?.content || '',
    tokensUsed: result?.usage?.total_tokens || 0,
  }
}

async function callGemini({ apiKey, model, systemPrompt, messages, maxTokens }) {
  const geminiModel = model || DEFAULT_MODELS.gemini
  // Gemini doesn't have a separate system role — prepend as a user/model exchange
  const contents = [
    ...(systemPrompt ? [
      { role: 'user',  parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
    ] : []),
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ]
  const result = await httpsPost(
    'generativelanguage.googleapis.com',
    `/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
    {},
    { contents, generationConfig: { maxOutputTokens: Math.min(Number(maxTokens) || 1024, 8192) } }
  )
  return {
    reply: result?.candidates?.[0]?.content?.parts?.[0]?.text || '',
    tokensUsed: (result?.usageMetadata?.promptTokenCount || 0) + (result?.usageMetadata?.candidatesTokenCount || 0),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getOrCreateSettings(tenantId) {
  let s = await AISettings.findOne({ tenantId }).select('+apiKey').lean()
  if (!s) {
    const doc = await AISettings.create({ tenantId })
    s = doc.toObject(); s.apiKey = ''
  }
  return s
}

async function checkUsageLimits(tenantId, userId, settings) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const month = new Date(now.getFullYear(), now.getMonth(), 1)
  const [dayCount, moCount] = await Promise.all([
    AIUsage.countDocuments({ tenantId, userId, action: 'chat', createdAt: { $gte: today } }),
    AIUsage.countDocuments({ tenantId, userId, action: 'chat', createdAt: { $gte: month } }),
  ])
  if (settings.dailyLimitPerUser > 0 && dayCount >= settings.dailyLimitPerUser)
    return { exceeded: true, message: `Daily AI limit reached (${settings.dailyLimitPerUser}/day). Contact your admin.` }
  if (settings.monthlyLimitPerUser > 0 && moCount >= settings.monthlyLimitPerUser)
    return { exceeded: true, message: `Monthly AI limit reached (${settings.monthlyLimitPerUser}/month). Contact your admin.` }
  return { exceeded: false, dayCount, moCount }
}

function buildSystemPrompt(context, pageContext) {
  const lines = [
    'You are an AI CRM Copilot for a marketing agency. You are an expert at:',
    'CRM management, lead conversion, proposal writing, email and WhatsApp drafting,',
    'invoice management, SOP optimization, task prioritization, and business analytics.',
    'Be concise, professional, and action-oriented. Use clear formatting with line breaks.',
    'When writing messages (email, WhatsApp), produce ready-to-send content.',
    'When analyzing data, give specific, actionable insights.',
    'NEVER reveal, request, or reference API keys, passwords, tokens, or any credentials.',
  ]
  if (pageContext) lines.push(`\nCurrent module: ${pageContext}`)
  if (context)    lines.push(`\nPage context:\n${context}`)
  return lines.join(' ')
}

function effectiveKey(settings) {
  return (settings.apiKey && settings.hasKey) ? settings.apiKey : (process.env.ANTHROPIC_API_KEY || '')
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ai/settings
exports.getSettings = async (req, res, next) => {
  try {
    const tenantId = getTenantFilter(req).tenantId || req.user.tenantId
    let s = await AISettings.findOne({ tenantId }).lean()
    if (!s) { s = (await AISettings.create({ tenantId })).toObject() }
    // Strip apiKey — never expose
    const { apiKey: _k, ...safe } = s
    res.json({ success: true, data: safe })
  } catch (e) { next(e) }
}

// PUT /api/ai/settings
exports.updateSettings = async (req, res, next) => {
  try {
    const tenantId = getTenantFilter(req).tenantId || req.user.tenantId
    const {
      enabled, provider, apiKey, model, temperature, maxTokens,
      dailyLimitPerUser, monthlyLimitPerUser, rolePermissions,
    } = req.body

    let s = await AISettings.findOne({ tenantId }).select('+apiKey')
    if (!s) s = new AISettings({ tenantId })

    if (enabled      !== undefined) s.enabled      = enabled
    if (provider)                   s.provider      = provider
    if (model        !== undefined) s.model         = model
    if (temperature  !== undefined) s.temperature   = temperature
    if (maxTokens    !== undefined) s.maxTokens     = maxTokens
    if (dailyLimitPerUser  !== undefined) s.dailyLimitPerUser  = dailyLimitPerUser
    if (monthlyLimitPerUser !== undefined) s.monthlyLimitPerUser = monthlyLimitPerUser
    if (rolePermissions) s.rolePermissions = { ...s.rolePermissions.toObject?.() || s.rolePermissions, ...rolePermissions }

    // Only store key if it's a new non-masked value
    if (apiKey !== undefined) {
      if (apiKey === '') {
        s.apiKey = ''; s.hasKey = false; s.keyLastFour = ''
      } else if (!apiKey.startsWith('•')) {
        s.apiKey = apiKey; s.hasKey = true; s.keyLastFour = apiKey.slice(-4)
      }
      // else masked value passed → don't overwrite
    }

    await s.save()
    logAction({ req, action: 'update_ai_settings', resourceType: 'AISettings', performedBy: req.user.id, details: { provider: s.provider, enabled: s.enabled } }).catch(() => {})

    const { apiKey: _k, ...safe } = s.toObject()
    res.json({ success: true, data: safe })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ai/status
exports.getStatus = async (req, res, next) => {
  try {
    const tenantId = getTenantFilter(req).tenantId || req.user.tenantId
    const s = await AISettings.findOne({ tenantId }).lean()
    const envKey = process.env.ANTHROPIC_API_KEY

    const hasKey    = s?.hasKey || !!envKey
    const enabled   = s ? (s.enabled && hasKey) : !!envKey
    const userRole  = req.user.role
    const roleOK    = s ? (s.rolePermissions?.[userRole] !== false) : true

    // Usage today
    const today = new Date(); today.setHours(0,0,0,0)
    const todayCount = await AIUsage.countDocuments({ tenantId, userId: req.user.id, action: 'chat', createdAt: { $gte: today } })

    res.json({
      success: true,
      configured: hasKey,
      enabled: enabled && roleOK,
      roleAllowed: roleOK,
      provider: s?.provider || 'claude',
      model: s?.model || DEFAULT_MODELS[s?.provider || 'claude'],
      hasKey,
      keyLastFour: s?.keyLastFour || (envKey ? envKey.slice(-4) : ''),
      todayCount,
      dailyLimit: s?.dailyLimitPerUser || 50,
    })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ai/chat
exports.chat = async (req, res, next) => {
  try {
    const tenantId = getTenantFilter(req).tenantId || req.user.tenantId
    const settings = await getOrCreateSettings(tenantId)

    // Resolve API key (tenant key takes precedence over env fallback)
    const key = effectiveKey(settings)
    if (!key) {
      return res.status(503).json({
        success: false, configured: false,
        message: 'AI not configured. Add an API key in Settings → AI Copilot.',
      })
    }

    // Enabled check
    if (!settings.enabled && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ success: false, message: 'AI Copilot is disabled. Enable it in Settings → AI Copilot.' })
    }

    // Role permission
    const userRole = req.user.role
    if (settings.rolePermissions?.[userRole] === false) {
      return res.status(403).json({ success: false, message: 'AI access is not enabled for your role.' })
    }

    // Usage limits
    const limit = await checkUsageLimits(tenantId, req.user.id, settings)
    if (limit.exceeded) return res.status(429).json({ success: false, message: limit.message })

    // Normalize messages — support both { messages } array and legacy { message, history }
    let { messages, message, history = [], context = '', pageContext = 'general' } = req.body
    if (!messages || !messages.length) {
      if (message) {
        messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }]
      } else {
        return res.status(400).json({ success: false, message: 'messages or message is required' })
      }
    }

    const provider    = settings.provider || 'claude'
    const model       = settings.model    || DEFAULT_MODELS[provider]
    const systemPrompt = buildSystemPrompt(context, pageContext)
    const formatted   = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content) }))

    let result
    try {
      if (provider === 'openai')  result = await callOpenAI({ apiKey: key, model, systemPrompt, messages: formatted, maxTokens: settings.maxTokens, temperature: settings.temperature })
      else if (provider === 'gemini') result = await callGemini({ apiKey: key, model, systemPrompt, messages: formatted, maxTokens: settings.maxTokens })
      else result = await callClaude({ apiKey: key, model, systemPrompt, messages: formatted, maxTokens: settings.maxTokens, temperature: settings.temperature })
    } catch (providerErr) {
      // AI provider error — log it and return user-friendly message
      logAction({ req, action: 'ai_provider_error', resourceType: 'AI', performedBy: req.user.id, details: { error: providerErr.message, provider } }).catch(() => {})
      return res.status(502).json({ success: false, message: `AI provider error: ${providerErr.message}` })
    }

    // Track usage (fire-and-forget)
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    AIUsage.create({
      tenantId, userId: req.user.id, provider, model,
      module: pageContext, action: 'chat',
      prompt: (lastUser?.content || '').slice(0, 2000),
      response: result.reply.slice(0, 6000),
      tokensUsed: result.tokensUsed,
      pageContext,
    }).catch(() => {})

    logAction({ req, action: 'ai_chat', resourceType: 'AI', performedBy: req.user.id, details: { provider, model, module: pageContext } }).catch(() => {})

    res.json({ success: true, reply: result.reply, provider, model, tokensUsed: result.tokensUsed })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACK ACTION (copy, save note, create task, etc.)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ai/track
exports.trackAction = async (req, res, next) => {
  try {
    const tenantId = getTenantFilter(req).tenantId || req.user.tenantId
    const { action = 'opened', module: mod = 'general', pageContext = '' } = req.body
    AIUsage.create({ tenantId, userId: req.user.id, action, module: mod, pageContext, prompt: '', response: '', tokensUsed: 0 }).catch(() => {})
    logAction({ req, action: `ai_${action}`, resourceType: 'AI', performedBy: req.user.id, details: { module: mod } }).catch(() => {})
    res.json({ success: true })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ai/history
exports.getHistory = async (req, res, next) => {
  try {
    const tenantId  = getTenantFilter(req).tenantId || req.user.tenantId
    const userLevel = ROLE_LEVELS[req.user.role] || 0
    const { page = 1, limit = 20, module: mod, action } = req.query

    const filter = { tenantId }
    if (userLevel < 60) filter.userId = req.user.id  // employees/managers see own only
    if (mod)    filter.module = mod
    if (action) filter.action = action

    const skip = (Number(page) - 1) * Number(limit)
    const [data, total] = await Promise.all([
      AIUsage.find(filter)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit)).lean(),
      AIUsage.countDocuments(filter),
    ])
    res.json({ success: true, total, page: Number(page), data })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE STATS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ai/usage-stats
exports.getUsageStats = async (req, res, next) => {
  try {
    const tenantId = getTenantFilter(req).tenantId || req.user.tenantId
    const now   = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const month = new Date(now.getFullYear(), now.getMonth(), 1)
    const filter = { tenantId, action: 'chat' }

    const [total, thisMonth, today2, byModule, topUsers] = await Promise.all([
      AIUsage.countDocuments({ tenantId }),
      AIUsage.countDocuments({ ...filter, createdAt: { $gte: month } }),
      AIUsage.countDocuments({ ...filter, createdAt: { $gte: today } }),
      AIUsage.aggregate([
        { $match: { tenantId, createdAt: { $gte: month } } },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 },
      ]),
      AIUsage.aggregate([
        { $match: { ...filter, createdAt: { $gte: month } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, tokensUsed: { $sum: '$tokensUsed' } } },
        { $sort: { count: -1 } }, { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmpty: true } },
        { $project: { count: 1, tokensUsed: 1, 'user.name': 1, 'user.email': 1 } },
      ]),
    ])

    res.json({ success: true, data: { total, thisMonth, today: today2, byModule, topUsers } })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK PROMPTS  (context-specific suggestions)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ai/quick-prompts?page=customer
exports.getQuickPrompts = (req, res) => {
  const { page = 'general' } = req.query
  const MAP = {
    customer: [
      'Summarize this customer and suggest the next best action.',
      'Write a friendly WhatsApp check-in message.',
      'Draft a professional renewal reminder email.',
      'Assess customer health and flag any risks.',
    ],
    lead: [
      'Summarize this lead and suggest the best sales approach.',
      'Write a follow-up WhatsApp message.',
      'Draft an introduction email for this lead.',
      'Predict conversion probability and suggest next step.',
    ],
    invoice: [
      'Write a polite payment reminder message.',
      'Summarize this invoice and highlight concerns.',
      'Draft a firm overdue payment notice.',
      'Generate a professional invoice cover note.',
    ],
    quotation: [
      'Generate compelling proposal text for this quotation.',
      'Improve this quotation message professionally.',
      'Draft an approval follow-up message.',
      'Summarize this quotation for the client.',
    ],
    sop: [
      'Summarize this SOP for a new team member.',
      'Identify potential blockers in this SOP.',
      'Suggest improvements for this SOP.',
      'Write training notes based on this SOP.',
    ],
    task: [
      'Summarize this task and its current status.',
      'Suggest priority level and timeline assessment.',
      'Write a professional task status update.',
      'Break this task into actionable subtasks.',
    ],
    dashboard: [
      "Summarize today's business performance.",
      'Highlight the top 3 actions to take today.',
      'Identify key anomalies in current metrics.',
      'Explain the most important KPIs.',
    ],
    reports: [
      'Summarize this report in plain language.',
      'Identify the best-performing lead source.',
      'Highlight pending collections and overdue items.',
      'Explain the revenue trend.',
    ],
    meeting: [
      'Create a professional meeting summary.',
      'List key action items from this meeting.',
      'Write a follow-up email for this meeting.',
      'Draft meeting minutes.',
    ],
    general: [
      'Write a professional follow-up email.',
      'Generate a WhatsApp message template.',
      'Summarize the current situation clearly.',
      'Suggest the best next action.',
    ],
  }
  res.json({ success: true, data: MAP[page] || MAP.general })
}
