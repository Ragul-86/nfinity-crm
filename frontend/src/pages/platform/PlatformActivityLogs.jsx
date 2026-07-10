import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format, subDays, startOfMonth } from 'date-fns'
import { Activity, RefreshCcw, Download, Search, Monitor, Smartphone, Globe } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, StatusBadge } from '@/components/platform/PlatformPageHeader'

const today = () => format(new Date(), 'yyyy-MM-dd')
const daysAgo = (n) => format(subDays(new Date(), n), 'yyyy-MM-dd')

const ALL_ACTIONS = [
  'LOGIN','LOGOUT',
  'WORKSPACE_CREATED','WORKSPACE_EDITED','WORKSPACE_SUSPENDED','WORKSPACE_ACTIVATED','WORKSPACE_DELETED',
  'USER_CREATED','USER_EDITED','USER_DELETED',
  'ROLE_CHANGED','ROLE_CREATED','ROLE_UPDATED','ROLE_DELETED',
  'PERMISSION_MATRIX_UPDATED',
  'TEMPLATE_CREATED','TEMPLATE_PUSHED',
  'FEATURE_ENABLED','FEATURE_DISABLED','FEATURES_BULK_SAVED',
  'INTEGRATION_UPDATED',
  'API_KEY_CREATED','API_KEY_REVOKED',
  'WEBHOOK_CREATED','WEBHOOK_DELETED',
]

const MODULES = ['all','platform','leads','tasks','clients','finance','campaigns','users','settings','ai','sop','audit']

const DATE_PRESETS = [
  { label: 'Today',       start: today,          end: today },
  { label: 'Yesterday',   start: () => daysAgo(1), end: () => daysAgo(1) },
  { label: 'Last 7 Days', start: () => daysAgo(6), end: today },
  { label: 'Last 30 Days',start: () => daysAgo(29),end: today },
  { label: 'This Month',  start: () => format(startOfMonth(new Date()),'yyyy-MM-dd'), end: today },
]

function getDevice(ua = '') {
  if (!ua) return { icon: Globe, label: '—' }
  const u = ua.toLowerCase()
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) return { icon: Smartphone, label: 'Mobile' }
  return { icon: Monitor, label: 'Desktop' }
}

function ActionBadge({ action }) {
  const colorMap = {
    LOGIN: 'bg-emerald-100 text-emerald-700',
    LOGOUT: 'bg-slate-100 text-slate-600',
    WORKSPACE_CREATED: 'bg-blue-100 text-blue-700',
    WORKSPACE_SUSPENDED: 'bg-amber-100 text-amber-700',
    WORKSPACE_ACTIVATED: 'bg-emerald-100 text-emerald-700',
    WORKSPACE_DELETED: 'bg-red-100 text-red-700',
    USER_CREATED: 'bg-violet-100 text-violet-700',
    FEATURE_ENABLED: 'bg-emerald-100 text-emerald-700',
    FEATURE_DISABLED: 'bg-red-100 text-red-700',
    API_KEY_CREATED: 'bg-indigo-100 text-indigo-700',
    API_KEY_REVOKED: 'bg-red-100 text-red-700',
  }
  const color = colorMap[action] || 'bg-muted text-muted-foreground'
  const label = action?.replace(/_/g, ' ') || '—'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${color}`}>{label}</span>
  )
}

export default function PlatformActivityLogs() {
  const [search,      setSearch]      = useState('')
  const [module,      setModule]      = useState('all')
  const [action,      setAction]      = useState('all')
  const [workspace,   setWorkspace]   = useState('')
  const [datePreset,  setDatePreset]  = useState('')
  const [dateRange,   setDateRange]   = useState({ start: '', end: '' })
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(50)
  const [sort,        setSort]        = useState({ key: 'createdAt', dir: 'desc' })

  const { data: wsData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-activity-logs', page, pageSize, search, module, action, workspace, dateRange, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        page, limit: pageSize,
        sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search     && { search }),
        ...(module !== 'all' && { module }),
        ...(action !== 'all' && { action }),
        ...(workspace  && { tenantId: workspace }),
        ...(dateRange.start && { dateFrom: dateRange.start }),
        ...(dateRange.end   && { dateTo:   dateRange.end }),
      })
      return api.get(`/platform/audit-logs?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
    keepPreviousData: true,
  })

  const logs    = data?.logs  || []
  const total   = data?.total || 0
  const tenants = wsData?.tenants || []

  const applyPreset = (p) => {
    setDatePreset(p.label)
    setDateRange({ start: p.start(), end: p.end() })
    setPage(1)
  }

  const clearFilters = () => {
    setModule('all'); setAction('all'); setWorkspace(''); setDatePreset(''); setDateRange({ start:'', end:'' }); setSearch(''); setPage(1)
  }

  const columns = [
    {
      key: 'createdAt', header: 'Date & Time', sortable: true,
      render: (row) => row.createdAt ? (
        <div>
          <p className="text-xs font-medium">{format(new Date(row.createdAt), 'MMM d, yyyy')}</p>
          <p className="text-[10px] text-muted-foreground">{format(new Date(row.createdAt), 'HH:mm:ss')}</p>
        </div>
      ) : <span className="text-muted-foreground">—</span>,
      exportValue: (row) => row.createdAt ? format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm:ss') : '',
    },
    {
      key: 'actor', header: 'User',
      render: (row) => (
        <div>
          <p className="text-sm font-medium">{row.performedBy?.name || row.actor?.name || '—'}</p>
          <p className="text-[10px] text-muted-foreground">{row.performedBy?.email || row.actor?.email || ''}</p>
        </div>
      ),
      exportValue: (row) => row.performedBy?.name || '—',
    },
    {
      key: 'role', header: 'Role',
      render: (row) => (
        <span className="text-xs capitalize text-muted-foreground">
          {(row.performedBy?.role || row.actor?.role || '—').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'tenantId', header: 'Workspace',
      render: (row) => <span className="text-xs text-muted-foreground">{row.tenantName || row.tenantId?.name || '—'}</span>,
    },
    {
      key: 'module', header: 'Module',
      render: (row) => <span className="text-xs capitalize font-medium">{row.module || '—'}</span>,
      exportValue: (row) => row.module || '',
    },
    {
      key: 'action', header: 'Action',
      render: (row) => <ActionBadge action={row.action} />,
      exportValue: (row) => row.action || '',
    },
    {
      key: 'ipAddress', header: 'IP Address',
      render: (row) => <span className="text-[11px] font-mono text-muted-foreground">{row.ipAddress || row.ip || '—'}</span>,
    },
    {
      key: 'device', header: 'Device',
      render: (row) => {
        const { icon: Icon, label } = getDevice(row.userAgent || row.ua || '')
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="w-3.5 h-3.5" />{label}
          </div>
        )
      },
    },
    {
      key: 'status', header: 'Status',
      render: (row) => {
        const ok = !row.error && !row.failed
        return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{ok ? 'Success' : 'Failed'}</span>
      },
    },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Activity Logs"
        subtitle={`${total.toLocaleString()} events across all workspaces`}
        icon={Activity}
        breadcrumbs={[{ label: 'Activity Logs' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 p-3 bg-card border border-border rounded-xl space-y-3">
        {/* Date presets */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Period:</span>
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                datePreset === p.label ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:bg-accent'
              }`}
            >{p.label}</button>
          ))}
          {/* Custom range */}
          <div className="flex items-center gap-1.5 ml-1">
            <input type="date" className="px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none"
              value={dateRange.start} max={dateRange.end || today()}
              onChange={e => { setDateRange(r => ({ ...r, start: e.target.value })); setDatePreset('Custom'); setPage(1) }} />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" className="px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none"
              value={dateRange.end} min={dateRange.start} max={today()}
              onChange={e => { setDateRange(r => ({ ...r, end: e.target.value })); setDatePreset('Custom'); setPage(1) }} />
          </div>
        </div>

        {/* Other filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Module */}
          <select className="px-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none capitalize"
            value={module} onChange={e => { setModule(e.target.value); setPage(1) }}>
            {MODULES.map(m => <option key={m} value={m} className="capitalize">{m === 'all' ? 'All Modules' : m}</option>)}
          </select>

          {/* Action */}
          <select className="px-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
            value={action} onChange={e => { setAction(e.target.value); setPage(1) }}>
            <option value="all">All Actions</option>
            {ALL_ACTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
          </select>

          {/* Workspace */}
          <select className="px-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
            value={workspace} onChange={e => { setWorkspace(e.target.value); setPage(1) }}>
            <option value="">All Workspaces</option>
            {tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
              placeholder="Search user, action…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>

          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-accent transition-colors">
            Clear filters
          </button>
        </div>
      </div>

      <PlatformDataTable
        columns={columns}
        data={logs}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search activity…"
        emptyMessage="No activity logs for the selected filters."
        filename="activity-logs"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSort={(k, d) => setSort({ key: k, dir: d })}
        sortKey={sort.key}
        sortDir={sort.dir}
      />
    </div>
  )
}
