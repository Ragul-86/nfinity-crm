/**
 * AIAssistant.jsx — Phase 11
 * Floating FAB + slide-in chat drawer with Anthropic backend proxy.
 * Context-aware: detects current page from URL to auto-inject context.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  X, Send, Copy, Check, ChevronDown,
  Loader2, Sparkles, Bot, Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/services/api'

const ROLE_LEVELS = {
  platform_super_admin: 100, client_super_admin: 80, super_admin: 80,
  admin: 60, manager: 40, employee: 20, viewer: 10,
}
const CAN_USE_AI = (role) => (ROLE_LEVELS[role] || 0) >= 40 // manager+

const HISTORY_KEY = 'crm_ai_history'
const MAX_HISTORY_TURNS = 20

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY_TURNS))) } catch {}
}
function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY) } catch {}
}

function getPageContext(pathname) {
  if (pathname.includes('/clients/'))  return 'customer'
  if (pathname.includes('/clients'))   return 'clients'
  if (pathname.includes('/crm-leads')) return 'lead'
  if (pathname.includes('/leads'))     return 'lead'
  if (pathname.includes('/finance'))   return 'invoice'
  if (pathname.includes('/sop'))       return 'sop'
  if (pathname.includes('/tasks'))     return 'task'
  if (pathname.includes('/operations'))return 'sop'
  if (pathname.includes('/campaigns')) return 'general'
  if (pathname.includes('/meetings'))  return 'meeting'
  if (pathname === '/')                return 'general'
  return 'general'
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-accent transition-colors shrink-0" title="Copy">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  )
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {isUser ? <span className="text-[10px] font-bold">You</span> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`group max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
          {msg.content}
        </div>
        {!isUser && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={msg.content} />
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

export default function AIAssistant() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(loadHistory)
  const [showQuickPrompts, setShowQuickPrompts] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const pageCtx = getPageContext(location.pathname)

  // Only render for allowed roles
  if (!user || !CAN_USE_AI(user.role)) return null

  const { data: statusData } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get('/ai/status').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: quickPromptsData } = useQuery({
    queryKey: ['ai-quick-prompts', pageCtx],
    queryFn: () => api.get('/ai/quick-prompts', { params: { page: pageCtx } }).then(r => r.data),
    enabled: open,
    staleTime: 60_000,
  })

  const quickPrompts = quickPromptsData?.prompts || []
  const aiConfigured = statusData?.configured !== false

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  useEffect(() => { if (open) { scrollToBottom(); setTimeout(() => inputRef.current?.focus(), 100) } }, [open, scrollToBottom])
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const chatMutation = useMutation({
    mutationFn: ({ message, history }) =>
      api.post('/ai/chat', {
        message,
        history: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        pageContext: pageCtx,
        pageUrl: location.pathname,
      }).then(r => r.data),
    onSuccess: (data, { userMsg, assistantPlaceholder }) => {
      const assistantMsg = {
        role: 'assistant',
        content: data.response || data.message || 'Sorry, I could not process that.',
        timestamp: new Date().toISOString(),
        id: Date.now() + 1,
      }
      setMessages(prev => {
        const updated = prev.map(m => m.id === assistantPlaceholder.id ? assistantMsg : m)
        saveHistory(updated)
        return updated
      })
    },
    onError: (_, { assistantPlaceholder }) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantPlaceholder.id
          ? { ...m, content: 'Failed to get a response. Please try again.', error: true }
          : m
      ))
    },
  })

  const sendMessage = useCallback((text) => {
    const msg = (text || input).trim()
    if (!msg || chatMutation.isPending) return

    const userMsg = { role: 'user', content: msg, timestamp: new Date().toISOString(), id: Date.now() }
    const assistantPlaceholder = { role: 'assistant', content: '', loading: true, timestamp: new Date().toISOString(), id: Date.now() + 0.5 }

    setMessages(prev => {
      const updated = [...prev, userMsg, assistantPlaceholder]
      return updated
    })
    setInput('')
    setShowQuickPrompts(false)

    chatMutation.mutate({
      message: msg,
      history: messages,
      userMsg,
      assistantPlaceholder,
    })
  }, [input, messages, chatMutation])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleClear = () => {
    clearHistory()
    setMessages([])
    setShowQuickPrompts(true)
  }

  return (
    <>
      {/* Floating FAB */}
      <motion.button
        initial={false}
        animate={{ scale: open ? 0.9 : 1 }}
        whileHover={{ scale: open ? 0.9 : 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 hover:shadow-xl transition-shadow"
        title="AI Assistant"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span key="ai" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Sparkles className="w-5 h-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-22 right-6 w-[360px] h-[520px] bg-card border border-border rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden"
            style={{ bottom: '80px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">AI Assistant</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{pageCtx} context</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-accent transition-colors" title="Clear history">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Not configured warning */}
            {!aiConfigured && (
              <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
                <p className="text-[11px] text-amber-500">
                  AI not configured. Add <code className="font-mono">ANTHROPIC_API_KEY</code> to the backend <code>.env</code> file.
                </p>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <Sparkles className="w-8 h-8 text-primary/40 mx-auto mb-2" />
                  <p className="text-sm font-medium">How can I help?</p>
                  <p className="text-[11px] text-muted-foreground mt-1">I'm context-aware — I know you're viewing <span className="capitalize font-medium">{pageCtx}</span>.</p>
                </div>
              )}
              {messages.map(msg => (
                msg.loading ? (
                  <div key={msg.id} className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                ) : (
                  <MessageBubble key={msg.id} msg={msg} />
                )
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            <AnimatePresence>
              {showQuickPrompts && quickPrompts.length > 0 && messages.length === 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-border shrink-0"
                >
                  <div className="px-3 py-2 flex flex-wrap gap-1.5">
                    {quickPrompts.slice(0, 4).map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(prompt)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:bg-accent hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
              <div className="flex items-end gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border focus-within:border-primary/50 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your CRM…"
                  rows={1}
                  className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground max-h-[80px] overflow-y-auto"
                  style={{ minHeight: '24px' }}
                  disabled={chatMutation.isPending || !aiConfigured}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || chatMutation.isPending || !aiConfigured}
                  className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {chatMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">Enter to send · Shift+Enter for newline</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
