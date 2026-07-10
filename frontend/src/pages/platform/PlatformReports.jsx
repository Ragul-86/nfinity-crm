import { useState, useCallback } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  FileBarChart, RefreshCcw, Download, Printer, Search, Filter,
  Building2, FileText, Users, CreditCard, TrendingUp, BarChart2,
  CheckSquare, BookOpen, Globe, Activity,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

const today = () => format(new Date(), 'yyyy-MM-dd')
const daysAgo = (n) => format(subDays(new Date(), n), 'yyyy-MM-dd')

const DATE_PRESETS = [
  { label: 'Today',       start: () => today(),       end: () => today() },
  { label: 'Yesterday',   start: () => format(subDays(new Date(),1),'yyyy-MM-dd'), end: () => format(subDays(new Date(),1),'yyyy-MM-dd') },
  { label: 'Last 7 Days', start: () => daysAgo(6),    end: () => today() },
  { label: 'Last 30 Days',start: () => daysAgo(29),   end: () => today() },
  { label: 'This Month',  start: () => format(startOfMonth(new Date()),'yyyy-MM-dd'), end: () => today() },
  { label: 'Last Month',  start: () => format(startOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd'), end: () => format(endOfMonth(subMonths(new Date(),1)),'yyyy-MM-dd') },
]

const REPORT_TYPES = [
  { value: 'workspace_summary',  label: 'Workspace Report',    icon: Building2,    color: 'text-primary' },
  { value: 'user_activity',      label: 'User Report',         icon: Users,        color: 'text-blue-500' },
  { value: 'subscription_report',label: 'Subscription Report', icon: CreditCard,   color: 'text-violet-500' },
  { value: 'revenue_report',     label: 'Revenue Report',      icon: TrendingUp,   color: 'text-emerald-500' },
  { value: 'lead_performance',   label: 'Lead Report',         icon: BarChart2,    color: 'text-pink-500' },
  { value: 'client_report',      label: 'Client Report',       icon: Globe,        color: 'text-cyan-500' },
  { value: 'task_report',        label: 'Task Report',         icon: CheckSquare,  color: 'text-amber-500' },
  { value: 'sop_report',         label: 'SOP Report',          icon: BookOpen,     color: 'text-indigo-500' },
  { value: 'integration_report', label: 'Integration Report',  icon: Activity,     color: 'text-red-500' },
  { value: 'activity_report',    label: 'Activity Report',     icon: FileText,     color: 'text-teal-500' },
]

export default function PlatformReports() {
  const [reportType, setReportType]   = useState('workspace_summary')
  const [datePreset, setDatePreset]   = useState('Last 30 Days')
  const [dateRange, setDateRange]     = useState({ start: daysAgo(29), end: today() })
  const [search,     setSearch]       = useState('')
  const [workspace,  setWorkspace]    = useState('')
  const [page,       setPage]         = useState(1)
  const [pageSize,   setPageSize]     = useState(20)

  const applyPreset = (p) => {
    setDatePreset(p.label)
    setDateRange({ start: p.start(), end: p.end() })
    setPage(1)
  }

  const { data: wsData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-report', reportType, dateRange, workspace, page, pageSize],
    queryFn: () => {
      const p = new URLSearchParams({
        type: reportType,
        start: dateRange.start,
        end: dateRange.end,
        page,
        limit: pageSize,
        ...(workspace && { tenantId: workspace }),
      })
      return api.get(`/platform/reports?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    keepPreviousData: true,
  })

  const rows    = data?.rows    || []
  const total   = data?.total   || 0
  const columns = data?.columns || []
  const tenants = wsData?.tenants || []

  const currentReport = REPORT_TYPES.find(r => r.value === reportType)

  const handlePrint = () => window.print()

  const tableColumns = columns.length > 0
    ? columns.map(col => ({
        key:         col.key,
        header:      col.header,
        render:      (row) => {
          const val = row[col.key]
          if (val instanceof Date || (typeof val === 'string' && /^\d{4}-\d{2}/.test(val))) {
            try { return <span className="text-sm text-muted-foreground">{format(new Date(val), 'MMM d, yyyy')}</span> } catch { /* fall through */ }
          }
          return <span className="text-sm">{String(val ?? '—')}</span>
        },
        exportValue: (row) => row[col.key] ?? '',
        sortable:    col.sortable,
      }))
    : []

  return (
    <div>
      <PlatformPageHeader
        title="Reports"
        subtitle={`${currentReport?.label || 'Reports'} — ${datePreset}`}
        icon={FileBarChart}
        breadcrumbs={[{ label: 'Reports' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5 mr-1.5" />Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
          </div>
        }
      />

      <div className="flex gap-4">
        {/* Left sidebar — report type selector */}
        <div className="w-48 shrink-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Report Type</p>
          {REPORT_TYPES.map(r => (
            <button
              key={r.value}
              onClick={() => { setReportType(r.value); setPage(1) }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                reportType === r.value
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <r.icon className={`w-3.5 h-3.5 shrink-0 ${reportType === r.value ? 'text-primary' : r.color}`} />
              {r.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-card border border-border rounded-xl">
            {/* Date presets */}
            <div className="flex gap-0.5 bg-muted/60 p-0.5 rounded-lg">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap ${
                    datePreset === p.label ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >{p.label}</button>
              ))}
            </div>

            {/* Custom date range */}
            <div className="flex items-center gap-2">
              <input type="date" className="px-2 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
                value={dateRange.start} max={dateRange.end}
                onChange={e => { setDateRange(r => ({ ...r, start: e.target.value })); setDatePreset('Custom'); setPage(1) }} />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" className="px-2 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
                value={dateRange.end} min={dateRange.start} max={today()}
                onChange={e => { setDateRange(r => ({ ...r, end: e.target.value })); setDatePreset('Custom'); setPage(1) }} />
            </div>

            {/* Workspace filter */}
            <select
              className="px-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
              value={workspace}
              onChange={e => { setWorkspace(e.target.value); setPage(1) }}
            >
              <option value="">All Workspaces</option>
              {tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>

          {/* Data table */}
          {tableColumns.length > 0 ? (
            <PlatformDataTable
              columns={tableColumns}
              data={rows}
              total={total}
              loading={isLoading}
              searchPlaceholder={`Search ${currentReport?.label}…`}
              emptyMessage={isLoading ? 'Loading…' : 'No data for the selected filters.'}
              filename={`platform-${reportType}-${dateRange.start}-${dateRange.end}`}
              search={search}
              onSearchChange={(v) => { setSearch(v); setPage(1) }}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border border-border rounded-xl">
              {isLoading ? (
                <>
                  <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
                  <p className="text-sm">Loading report…</p>
                </>
              ) : (
                <>
                  <FileBarChart className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">{currentReport?.label}</p>
                  <p className="text-xs mt-1">No data found for this date range.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
