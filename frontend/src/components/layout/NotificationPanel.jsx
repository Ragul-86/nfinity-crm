/**
 * NotificationPanel.jsx — Phase 11
 * Dropdown notification center from the bell icon.
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell, X, Check, CheckCheck, Archive, Trash2, Search,
  Filter, Circle, Info, AlertTriangle, AlertCircle,
  CheckCircle, Zap, ChevronDown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const SEVERITY_ICON = {
  info:     { Icon: Info,         cls: 'text-blue-400' },
  success:  { Icon: CheckCircle,  cls: 'text-green-400' },
  warning:  { Icon: AlertTriangle,cls: 'text-amber-400' },
  critical: { Icon: AlertCircle,  cls: 'text-red-500' },
  error:    { Icon: AlertCircle,  cls: 'text-red-400' },
}

const CATEGORIES = [
  'leads','customers','invoices','quotations','payments',
  'tasks','meetings','calendar','sop','team','integrations','system','security',
]

function NotifItem({ n, onRead, onArchive, onDelete, onNavigate }) {
  const { Icon, cls } = SEVERITY_ICON[n.severity] || SEVERITY_ICON.info
  const isUnread = !n.isRead

  return (
    <div
      className={`flex gap-3 px-4 py-3 hover:bg-accent/40 transition-colors group cursor-pointer border-b border-border/50 last:border-0 ${isUnread ? 'bg-primary/5' : ''}`}
      onClick={() => { onRead(n._id); if (n.actionUrl || n.link) onNavigate(n.actionUrl || n.link) }}
    >
      <div className={`mt-0.5 shrink-0 ${cls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs leading-snug ${isUnread ? 'font-semibold' : 'font-medium'}`}>
            {n.title}
          </p>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {isUnread && (
              <button onClick={e => { e.stopPropagation(); onRead(n._id) }}
                className="p-0.5 rounded hover:bg-accent" title="Mark read">
                <Check className="w-3 h-3" />
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onArchive(n._id) }}
              className="p-0.5 rounded hover:bg-accent" title="Archive">
              <Archive className="w-3 h-3" />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(n._id) }}
              className="p-0.5 rounded hover:bg-destructive/20 text-destructive" title="Delete">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        {n.message && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </span>
          {n.category && (
            <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground capitalize">
              {n.category}
            </span>
          )}
          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
        </div>
      </div>
    </div>
  )
}

export default function NotificationPanel() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const panelRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = e => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const params = { limit: 30 }
  if (search) params.q = search
  if (category) params.category = category
  if (unreadOnly) params.unreadOnly = 'true'

  const { data } = useQuery({
    queryKey: ['notifications-panel', params],
    queryFn: () => api.get('/notifications', { params }).then(r => r.data),
    refetchInterval: 30_000,
  })

  const notifications = data?.notifications || data?.data || []
  const unreadCount = data?.unreadCount || 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-panel'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-count'] })
  }

  const markRead = useMutation({
    mutationFn: id => api.put(`/notifications/${id}/read`),
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: () => api.put('/notifications/read-all', category ? { category } : {}),
    onSuccess: invalidate,
  })

  const archiveNotif = useMutation({
    mutationFn: id => api.put(`/notifications/${id}/archive`),
    onSuccess: invalidate,
  })

  const deleteNotif = useMutation({
    mutationFn: id => api.delete(`/notifications/${id}`),
    onSuccess: invalidate,
  })

  const handleNavigate = (url) => {
    setOpen(false)
    if (url?.startsWith('/')) navigate(url)
  }

  // Group by date label
  const groups = notifications.reduce((acc, n) => {
    const d = new Date(n.createdAt)
    const now = new Date()
    let label = 'Earlier'
    if (d.toDateString() === now.toDateString()) label = 'Today'
    else {
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
      if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
      else if (now - d < 7 * 86400000) label = 'This Week'
    }
    if (!acc[label]) acc[label] = []
    acc[label].push(n)
    return acc
  }, {})

  const DATE_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier']

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell trigger */}
      <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={() => setOpen(o => !o)}>
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[380px] max-h-[560px] bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{unreadCount}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowFilters(v => !v)}
                  className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-accent' : 'hover:bg-accent'}`}>
                  <Filter className="w-3.5 h-3.5" />
                </button>
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead.mutate()}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors" title="Mark all read">
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => navigate('/notifications')}
                  className="text-[10px] text-primary hover:underline px-1">All</button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filters */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden shrink-0"
                >
                  <div className="px-4 py-2 border-b border-border space-y-2 bg-muted/30">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3 h-3 text-muted-foreground" />
                      <Input className="pl-7 h-7 text-xs" placeholder="Search notifications…"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={category} onChange={e => setCategory(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
                        <option value="">All categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                      </select>
                      <button
                        onClick={() => setUnreadOnly(v => !v)}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${unreadOnly ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent'}`}
                      >
                        Unread
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No notifications</p>
                </div>
              ) : (
                DATE_ORDER.filter(label => groups[label]?.length).map(label => (
                  <div key={label}>
                    <div className="px-4 py-1.5 bg-muted/30 border-b border-border/50 sticky top-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                    </div>
                    {groups[label].map(n => (
                      <NotifItem
                        key={n._id}
                        n={n}
                        onRead={id => markRead.mutate(id)}
                        onArchive={id => archiveNotif.mutate(id)}
                        onDelete={id => deleteNotif.mutate(id)}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border shrink-0 flex justify-between items-center bg-muted/20">
              <p className="text-[10px] text-muted-foreground">Auto-refreshes every 30s</p>
              <button onClick={() => { setOpen(false); navigate('/notifications') }}
                className="text-[10px] text-primary hover:underline">
                View all notifications →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
