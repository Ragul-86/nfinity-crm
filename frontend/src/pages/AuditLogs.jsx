/**
 * AuditLogs.jsx — Phase 11
 * Complete audit log viewer with filters, stats, and export.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, Search, RefreshCcw, Filter, User, Calendar,
  ChevronLeft, ChevronRight, Download, Activity,
  LogIn, LogOut, Plus, Edit, Trash2, Settings,
  Key, AlertTriangle, CheckCircle, Database,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const REFRESH_MS = 30_000

const ACTION_ICONS = {
  login:               LogIn,
  logout:              LogOut,
  user_created:        Plus,
  user_invited:        Plus,
  user_updated:        Edit,
  role_changed:        Key,
  status_changed:      Activity,
  user_deactivated:    AlertTriangle,
  user_suspended:      AlertTriangle,
  user_activated:      CheckCircle,
  password_reset:      Key,
  permission_changed:  Settings,
  create_meeting:      Plus,
  update_meeting:      Edit,
  delete_meeting:      Trash2,
  assign_sop_to_customer: Plus,
  ai_chat:             Activity,
  default:             Database,
}

const ACTION_COLORS = {
  login:               'text-green-400 bg-green-500/10',
  logout:              'text-muted-foreground bg-muted/30',
  user_created:        'text-blue-400 bg-blue-500/10',
  user_invited:        'text-blue-400 bg-blue-500/10',
  user_updated:        'text-amber-400 bg-amber-500/10',
  role_changed:        'text-purple-400 bg-purple-500/10',
  status_changed:      'text-amber-400 bg-amber-500/10',
  user_deactivated:    'text-red-400 bg-red-500/10',
  user_suspended:      'text-red-400 bg-red-500/10',
  user_activated:      'text-green-400 bg-green-500/10',
  password_reset:      'text-orange-400 bg-orange-500/10',
  permission_changed:  'text-purple-400 bg-purple-500/10',
  default:             'text-muted-foreground bg-muted/20',
}

function ActionBadge({ action }) {
  const Icon = ACTION_ICONS[action] || ACTION_ICONS.default
  const color = ACTION_COLORS[action] || ACTION_COLORS.default
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>
      <Icon className="w-3 h-3" />
      {action?.replace(/_/g, ' ')}
    </span>
  )
}

function parseUA(ua = '') {
  if (!ua) return '—'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Edge')) return 'Edge'
  return ua.slice(0, 30)
}

function exportCSV(logs) {
  const rows = [
    ['Date', 'User', 'Action', 'Module', 'Resource', 'IP', 'Browser'],
    ...logs.map(l => [
      format(new Date(l.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      l.performedBy?.name || l.performedBy || '—',
      l.action,
      l.module || '—',
      l.resourceType || '—',
      l.ipAddress || '—',
      parseUA(l.userAgent),
    ]),
  ]
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

const ACTIONS = [
  'login','logout','user_created','user_invited','user_updated','role_changed',
  'status_changed','user_deactivated','user_activated','password_reset',
  'permission_changed','create_meeting','update_meeting','delete_meeting',
  'assign_sop_to_customer','ai_chat',
]

const MODULES = ['team','leads','clients','invoices','tasks','sop','meetings','operations','ai','system']

export default function AuditLogs() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ action: '', module: '', dateFrom: '', dateTo: '', q: '' })
  const [showFilters, setShowFilters] = useState(false)
  const limit = 25

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['audit-logs', page, filters],
    queryFn: () => api.get('/audit', {
      params: {
        page, limit,
        action: filters.action || undefined,
        module: filters.module || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        q: filters.q || undefined,
      }
    }).then(r => r.data),
    refetchInterval: REFRESH_MS,
  })

  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => api.get('/audit/stats').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const logs = data?.data || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)

  const setFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1) }
  const clearFilters = () => { setFilters({ action: '', module: '', dateFrom: '', dateTo: '', q: '' }); setPage(1) }
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Complete activity trail for your workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {logs.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportCSV(logs)}>
              <Download className="w-3.5 h-3.5 mr-1.5" />CSV
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {statsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Events',    value: statsData.total?.toLocaleString(),     color: 'text-foreground' },
            { label: 'Today',           value: statsData.todayCount,                   color: 'text-blue-400' },
            { label: 'This Week',       value: statsData.weekCount,                    color: 'text-purple-400' },
            { label: 'Action Types',    value: statsData.byAction?.length || 0,        color: 'text-green-400' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9 text-sm" placeholder="Search details…"
            value={filters.q} onChange={e => setFilter('q', e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(v => !v)}>
          <Filter className="w-3.5 h-3.5 mr-1.5" />
          Filters {hasFilters && <span className="ml-1 text-primary">●</span>}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear
          </Button>
        )}
        <p className="text-xs text-muted-foreground ml-auto">{total.toLocaleString()} events</p>
      </div>

      {/* Extended filters */}
      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Action</label>
            <select value={filters.action} onChange={e => setFilter('action', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
              <option value="">All Actions</option>
              {ACTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Module</label>
            <select value={filters.module} onChange={e => setFilter('module', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
              <option value="">All Modules</option>
              {MODULES.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">From</label>
            <Input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">To</label>
            <Input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      )}

      {/* Log table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({length:8}).map((_,i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20">
          <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No audit logs found</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Time</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">User</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">Action</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden md:table-cell">Module</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden lg:table-cell">Resource</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider hidden xl:table-cell">IP / Browser</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map(log => (
                  <tr key={log._id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium">{format(new Date(log.createdAt), 'MMM d, HH:mm')}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                          {log.performedBy?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{log.performedBy?.name || '—'}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{log.performedBy?.role?.replace(/_/g,' ')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground capitalize">{log.module || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{log.resourceType || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <p className="text-[10px] text-muted-foreground">{log.ipAddress || '—'}</p>
                      <p className="text-[10px] text-muted-foreground">{parseUA(log.userAgent)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
