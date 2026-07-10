/**
 * AICopilot.jsx — Context-aware AI CRM Copilot
 * Floating FAB → right side panel (desktop) / full-screen sheet (mobile).
 * Supports Claude, OpenAI, Gemini via backend proxy.
 * Preview → Confirm flow for all destructive actions.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, X, Send, Copy, Check, ChevronDown,
  Loader2, Bot, Trash2, Plus, FileText, Zap,
  AlertCircle, ClipboardList,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/services/api'
import toast from 'react-hot-toast'

// ─── Role gate ────────────────────────────────────────────────────────────────
const ROLE_LEVELS = {
  platform_super_admin: 100, client_super_admin: 80, super_admin: 80,
  admin: 60, manager: 40, employee: 20, viewer: 10,
}

// ─── Page context detection ───────────────────────────────────────────────────
function detectContext(pathname) {
  if (/\/clients\/[^/]+/.test(pathname))  return { module: 'customer',   label: 'Customer Workspace' }
  if (pathname.includes('/clients'))       return { module: 'customer',   label: 'Clients' }
  if (pathname.includes('/crm-leads'))     return { module: 'lead',       label: 'Leads' }
  if (pathname.includes('/leads'))         return { module: 'lead',       label: 'Meta Leads' }
  if (pathname.includes('/finance'))       return { module: 'invoice',    label: 'Finance' }
  if (pathname.includes('/sop'))           return { module: 'sop',        label: 'SOP' }
  if (pathname.includes('/tasks'))         return { module: 'task',       label: 'Tasks' }
  if (pathname.includes('/operations'))    return { module: 'sop',        label: 'Operations' }
  if (pathname.includes('/reports'))       return { module: 'reports',    label: 'Reports' }
  if (pathname.includes('/meetings'))      return { module: 'meeting',    label: 'Meetings' }
  if (pathname.includes('/campaigns'))     return { module: 'general',    label: 'Campaigns' }
  if (pathname === '/')                    return { module: 'dashboard',  label: 'Dashboard' }
  return { module: 'general', label: 'CRM' }
}

// ─── Local history storage ────────────────────────────────────────────────────
const HIST_KEY = 'crm_copilot_messages'
function loadHistory() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]') } catch { return [] } }
function saveHistory(msgs) { try { localStorage.setItem(HIST_KEY, JSON.stringify(msgs.slice(-40))) } catch {} }
function clearHistory() { try { localStorage.removeItem(HIST_KEY) } catch {} }

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text, small = false }) {
  const [done, setDone] = useState(false)
  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) })
  }
  const sz = small ? 'w-3 h-3' : 'w-3.5 h-3.5'
  return (
    <button onClick={handleCopy} title="Copy" className="p-1 rounded hover:bg-accent/60 transition-colors shrink-0">
      {done ? <Check className={`${sz} text-green-400`} /> : <Copy className={`${sz} text-muted-foreground`} />}
    </button>
  )
}

// ─── Create Task confirmation modal ───────────────────────────────────────────
function CreateTaskModal({ content, onConfirm, onClose }) {
  const [title, setTitle] = useState(content.slice(0, 80).replace(/\n/g, ' '))
  const [desc, setDesc]   = useState(content)
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm({ title, description: desc }) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Create Task from AI</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Task Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={!title.trim() || saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Plus className="w-3.5 h-3.5" /> Create Task
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Save Note confirmation modal ─────────────────────────────────────────────
function SaveNoteModal({ content, onConfirm, onClose }) {
  const [text, setText] = useState(content)
  const [saving, setSaving] = useState(false)
  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm(text) } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Save as Note</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Note content (review before saving)</label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={!text.trim() || saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <FileText className="w-3.5 h-3.5" /> Copy & Confirm
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, onCreateTask, onSaveNote }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold
        ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        {isUser ? 'You' : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`group flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
          {msg.content}
        </div>

        {/* Action bar on AI messages */}
        {!isUser && !msg.loading && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyBtn text={msg.content} small />
            <button onClick={() => onSaveNote(msg.content)} title="Save as note"
              className="p-1 rounded hover:bg-accent/60 transition-colors">
              <FileText className="w-3 h-3 text-muted-foreground" />
            </button>
            <button onClick={() => onCreateTask(msg.content)} title="Create task"
              className="p-1 rounded hover:bg-accent/60 transition-colors">
              <ClipboardList className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        )}

        {msg.timestamp && (
          <span className="text-[10px] text-muted-foreground px-1">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main AICopilot component ─────────────────────────────────────────────────
export default function AICopilot() {
  const { user } = useAuth()
  const location = useLocation()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(loadHistory)
  const [input, setInput] = useState('')
  const [showPrompts, setShowPrompts] = useState(true)
  const [taskModal, setTaskModal] = useState(null)   // content string or null
  const [noteModal, setNoteModal] = useState(null)   // content string or null
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const ctx = detectContext(location.pathname)

  // Role check — only render for manager+
  if (!user || (ROLE_LEVELS[user.role] || 0) < 40) return null

  // Status check
  const { data: statusData } = useQuery({
    queryKey: ['ai-copilot-status'],
    queryFn: () => api.get('/ai/status').then(r => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // Quick prompts
  const { data: promptsData } = useQuery({
    queryKey: ['ai-quick-prompts', ctx.module],
    queryFn: () => api.get('/ai/quick-prompts', { params: { page: ctx.module } }).then(r => r.data),
    enabled: open,
    staleTime: 300_000,
  })

  const quickPrompts = promptsData?.data || []
  const aiEnabled = statusData?.enabled !== false && statusData?.configured !== false

  const scrollBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }, [])

  useEffect(() => { if (open) { scrollBottom(); setTimeout(() => inputRef.current?.focus(), 100) } }, [open])
  useEffect(() => { scrollBottom() }, [messages])

  // Track open
  useEffect(() => {
    if (open) api.post('/ai/track', { action: 'opened', module: ctx.module, pageContext: ctx.label }).catch(() => {})
  }, [open, ctx.module])

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || sending) return
    if (!aiEnabled) { toast.error('AI Copilot is not configured. Check Settings → AI Copilot.'); return }

    const userMsg = { role: 'user', content: msg, timestamp: new Date().toISOString(), id: Date.now() }
    const placeholder = { role: 'assistant', content: '', loading: true, id: Date.now() + 0.5 }

    setMessages(prev => { const n = [...prev, userMsg, placeholder]; saveHistory(n); return n })
    setInput('')
    setShowPrompts(false)
    setSending(true)

    try {
      const { data } = await api.post('/ai/chat', {
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        pageContext: ctx.module,
        context: `Module: ${ctx.label}. Page: ${location.pathname}`,
      })
      const reply = { role: 'assistant', content: data.reply || 'No response generated.', timestamp: new Date().toISOString(), id: Date.now() + 1 }
      setMessages(prev => { const n = prev.map(m => m.id === placeholder.id ? reply : m); saveHistory(n); return n })
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to get a response. Please try again.'
      setMessages(prev => prev.map(m => m.id === placeholder.id
        ? { ...m, content: errMsg, loading: false, error: true }
        : m
      ))
      if (err.response?.status === 429) toast.error(errMsg)
    } finally { setSending(false) }
  }, [input, messages, sending, aiEnabled, ctx, location.pathname])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleClearChat = () => { clearHistory(); setMessages([]); setShowPrompts(true) }

  // ── Create task handler ─────────────────────────────────────────────────────
  const handleCreateTaskConfirm = async ({ title, description }) => {
    try {
      await api.post('/tasks', { title, description, priority: 'medium', status: 'todo' })
      api.post('/ai/track', { action: 'task_created', module: ctx.module, pageContext: ctx.label }).catch(() => {})
      toast.success('Task created successfully')
      setTaskModal(null)
    } catch { toast.error('Failed to create task') }
  }

  // ── Save note handler ───────────────────────────────────────────────────────
  const handleSaveNoteConfirm = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      api.post('/ai/track', { action: 'note_saved', module: ctx.module, pageContext: ctx.label }).catch(() => {})
      toast.success('Content copied to clipboard — paste it into your note')
      setNoteModal(null)
    }).catch(() => toast.error('Failed to copy'))
  }

  // ── Panel dimensions — responsive ───────────────────────────────────────────
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <>
      {/* Floating FAB */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-40 hover:shadow-xl transition-shadow"
        title="AI CRM Copilot"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open
            ? <motion.span key="x"  initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X className="w-5 h-5" /></motion.span>
            : <motion.span key="ai" initial={{ rotate: 90, opacity: 0 }}  animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><Sparkles className="w-5 h-5" /></motion.span>
          }
        </AnimatePresence>
      </motion.button>

      {/* Backdrop on mobile */}
      <AnimatePresence>
        {open && isMobile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />
        )}
      </AnimatePresence>

      {/* Side panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={isMobile ? { y: '100%' } : { x: '100%', opacity: 0 }}
            animate={isMobile ? { y: 0 }     : { x: 0, opacity: 1 }}
            exit={isMobile   ? { y: '100%' } : { x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`
              fixed z-50 bg-card border-border flex flex-col shadow-2xl
              ${isMobile
                ? 'inset-x-0 bottom-0 top-16 rounded-t-2xl border-t'
                : 'top-0 right-0 h-full w-[420px] border-l'
              }
            `}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">AI Copilot</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{ctx.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={handleClearChat} title="Clear chat"
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Not configured banner ───────────────────────────────────── */}
            {statusData && !statusData.configured && (
              <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  AI not configured. Go to <strong>Settings → AI Copilot</strong> to add your API key.
                </p>
              </div>
            )}

            {/* Usage indicator */}
            {statusData?.dailyLimit > 0 && (
              <div className="px-4 py-1.5 border-b border-border/50 bg-muted/20 shrink-0">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Daily usage: {statusData.todayCount || 0} / {statusData.dailyLimit}</span>
                  <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((statusData.todayCount || 0) / statusData.dailyLimit) * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Messages ────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">How can I help?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    I'm context-aware — currently on <span className="font-medium">{ctx.label}</span>.
                  </p>
                </div>
              )}

              {messages.map(msg => (
                msg.loading
                  ? (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      onCreateTask={content => setTaskModal(content)}
                      onSaveNote={content => setNoteModal(content)}
                    />
                  )
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick prompts ────────────────────────────────────────────── */}
            <AnimatePresence>
              {showPrompts && quickPrompts.length > 0 && messages.length === 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-border shrink-0">
                  <div className="px-3 pt-2 pb-1">
                    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">Quick prompts</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {quickPrompts.slice(0, 4).map((p, i) => (
                        <button key={i} onClick={() => sendMessage(p)}
                          className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-colors text-left text-muted-foreground hover:text-foreground leading-snug">
                          {p.length > 50 ? p.slice(0, 50) + '…' : p}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Input area ───────────────────────────────────────────────── */}
            <div className="px-3 pb-4 pt-2 border-t border-border shrink-0">
              <div className={`flex items-end gap-2 rounded-xl px-3 py-2 border transition-colors
                ${sending ? 'bg-muted/30 border-border' : 'bg-muted/50 border-border focus-within:border-primary/50'}`}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={aiEnabled ? `Ask anything about ${ctx.label}…` : 'Configure AI in Settings first…'}
                  rows={1}
                  disabled={sending || !aiEnabled}
                  className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground max-h-[100px] overflow-y-auto disabled:opacity-50"
                  style={{ minHeight: '24px' }}
                />
                <button onClick={() => sendMessage()} disabled={!input.trim() || sending || !aiEnabled}
                  className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
                  {sending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                Enter to send · Shift+Enter for newline · Hover response for actions
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {taskModal !== null && (
        <CreateTaskModal
          content={taskModal}
          onConfirm={handleCreateTaskConfirm}
          onClose={() => setTaskModal(null)}
        />
      )}
      {noteModal !== null && (
        <SaveNoteModal
          content={noteModal}
          onConfirm={handleSaveNoteConfirm}
          onClose={() => setNoteModal(null)}
        />
      )}
    </>
  )
}
