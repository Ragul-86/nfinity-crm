/**
 * GlobalSearch.jsx — Phase 11
 * Ctrl+K / Cmd+K modal with instant search across all CRM modules.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, Clock, Users, Building2, CheckSquare,
  FileText, BookOpen, Calendar, ArrowRight,
  IndianRupee,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

const RECENT_KEY = 'crm_recent_searches'
const MAX_RECENT = 8

const TYPE_META = {
  lead:      { icon: Users,        label: 'Lead',      color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  client:    { icon: Building2,    label: 'Client',    color: 'text-green-400',  bg: 'bg-green-500/10' },
  task:      { icon: CheckSquare,  label: 'Task',      color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  invoice:   { icon: IndianRupee,  label: 'Invoice',   color: 'text-purple-400', bg: 'bg-purple-500/10' },
  quotation: { icon: FileText,     label: 'Quotation', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  sop:       { icon: BookOpen,     label: 'SOP',       color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
  meeting:   { icon: Calendar,     label: 'Meeting',   color: 'text-pink-400',   bg: 'bg-pink-500/10' },
  user:      { icon: Users,        label: 'Team',      color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function addRecent(q) {
  if (!q?.trim()) return
  const prev = getRecent().filter(r => r !== q).slice(0, MAX_RECENT - 1)
  localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev]))
}
function clearRecent() { localStorage.removeItem(RECENT_KEY) }

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function ResultItem({ result, isActive, onClick }) {
  const meta = TYPE_META[result.type] || TYPE_META.task
  const Icon = meta.icon
  const ref = useRef(null)

  useEffect(() => {
    if (isActive && ref.current) ref.current.scrollIntoView({ block: 'nearest' })
  }, [isActive])

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-accent' : 'hover:bg-accent/50'}`}
    >
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.title}</p>
        {result.subtitle && <p className="text-[11px] text-muted-foreground truncate">{result.subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {result.status && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
            {result.status}
          </span>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.bg} ${meta.color} capitalize`}>
          {meta.label}
        </span>
        {isActive && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
      </div>
    </button>
  )
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [recentSearches, setRecentSearches] = useState(getRecent)
  const inputRef = useRef(null)
  const debouncedQ = useDebounce(query, 250)

  // Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(''); setActiveIdx(0) }
  }, [open])

  const { data: searchData, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQ],
    queryFn: () => api.get('/search', { params: { q: debouncedQ, limit: 20 } }).then(r => r.data),
    enabled: debouncedQ.length >= 2,
    staleTime: 10_000,
  })

  const results = searchData?.results || []

  // Group results by type
  const groups = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  // Flat list for keyboard nav
  const flat = results

  const handleSelect = useCallback((result) => {
    addRecent(query)
    setRecentSearches(getRecent())
    setOpen(false)
    const url = result.openUrl || result.url
    if (url) navigate(url)
  }, [query, navigate])

  const handleRecentSelect = (q) => {
    setQuery(q)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[activeIdx]) handleSelect(flat[activeIdx])
      else if (query.trim()) { addRecent(query); setRecentSearches(getRecent()) }
    }
  }

  useEffect(() => { setActiveIdx(0) }, [debouncedQ])

  const showRecent = !debouncedQ && recentSearches.length > 0
  const showResults = debouncedQ.length >= 2
  const isEmpty = showResults && !isFetching && results.length === 0

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 px-3 rounded-lg bg-muted/50 border border-transparent hover:border-border text-sm text-muted-foreground transition-all max-w-[240px] w-full"
      >
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left truncate hidden sm:block">Search…</span>
        <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground/70 shrink-0">
          <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono">⌘</kbd>
          <kbd className="px-1 py-0.5 rounded bg-background border border-border font-mono">K</kbd>
        </span>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed top-[10vh] left-1/2 -translate-x-1/2 w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className={`w-4 h-4 shrink-0 ${isFetching ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search clients, leads, tasks, invoices…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="p-0.5 rounded hover:bg-accent">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">Esc</kbd>
              </div>

              {/* Body */}
              <div className="max-h-[420px] overflow-y-auto">
                {/* Recent searches */}
                {showRecent && (
                  <div>
                    <div className="flex items-center justify-between px-4 pt-3 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</span>
                      <button onClick={() => { clearRecent(); setRecentSearches([]) }}
                        className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
                    </div>
                    {recentSearches.map(r => (
                      <button key={r} onClick={() => handleRecentSelect(r)}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent/50 text-sm text-muted-foreground transition-colors">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                {/* Results */}
                {showResults && !isEmpty && (
                  <div>
                    {Object.entries(groups).map(([type, items]) => {
                      const meta = TYPE_META[type] || {}
                      return (
                        <div key={type}>
                          <div className="px-4 pt-3 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">
                              {meta.label || type}s
                            </span>
                          </div>
                          {items.map(r => {
                            const idx = flat.indexOf(r)
                            return (
                              <ResultItem
                                key={r.id}
                                result={r}
                                isActive={idx === activeIdx}
                                onClick={() => handleSelect(r)}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Empty */}
                {isEmpty && (
                  <div className="text-center py-12">
                    <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No results for "{debouncedQ}"</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Try a different search term</p>
                  </div>
                )}

                {/* Prompt to type */}
                {!showRecent && !showResults && (
                  <div className="text-center py-10">
                    <p className="text-sm text-muted-foreground">Type at least 2 characters to search</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground bg-muted/20">
                <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-border bg-background">↑</kbd><kbd className="px-1 rounded border border-border bg-background">↓</kbd> Navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-border bg-background">↵</kbd> Open</span>
                <span className="flex items-center gap-1"><kbd className="px-1 rounded border border-border bg-background">Esc</kbd> Close</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
