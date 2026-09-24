/**
 * GSheetLeadsDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE dashboard for all Google Sheets leads.
 * A selector at the top lets the user choose which spreadsheet / tab to view.
 * ALL sections (KPIs, pipeline, charts, lead list) use the SAME selected filter.
 *
 * Route:  /leads/dashboard
 * Query params (set by selector, stored in URL for shareability):
 *   ?spreadsheetId=XXXX        — stable Google spreadsheet ID
 *   ?sheetName=Performance%20Marketer  — optional tab name (absent = all tabs)
 *
 * Tenant isolation: spreadsheetId + sheetName come from URL but the backend
 * always AND them with tenantId from the JWT. A user can never see another
 * tenant's leads by manipulating URL params.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Users, TrendingUp, PhoneCall, CheckCircle2, XCircle, Clock,
  RefreshCcw, ExternalLink, FileSpreadsheet, Layers, AlertCircle,
  ArrowRight, SlidersHorizontal, TableProperties,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'

// ── Status display config ──────────────────────────────────────────────────
const STATUS_CONFIG = {
  new_lead:       { label: 'New',        color: '#6366f1', bg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' },
  contacted:      { label: 'Contacted',  color: '#3b82f6', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  discovery_call: { label: 'Discovery',  color: '#06b6d4', bg: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400' },
  proposal_sent:  { label: 'Proposal',   color: '#f59e0b', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  negotiation:    { label: 'Negotiation',color: '#f97316', bg: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
  won:            { label: 'Won',        color: '#10b981', bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  lost:           { label: 'Lost',       color: '#ef4444', bg: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  converted:      { label: 'Converted',  color: '#8b5cf6', bg: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  archived:       { label: 'Archived',   color: '#6b7280', bg: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
}

const PIE_COLORS = ['#6366f1','#3b82f6','#06b6d4','#f59e0b','#f97316','#10b981','#ef4444','#8b5cf6']

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
}

// ── Helpers ────────────────────────────────────────────────────────────────
function kpiCount(byStatus, status) {
  return byStatus?.find(s => s._id === status)?.count || 0
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ title, value, icon: Icon, color, loading, sub }) {
  return (
    <Card>
      <CardContent className="pt-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">{title}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sheet / Tab Selector ───────────────────────────────────────────────────
// Renders a compact selector that encodes selection into URL search params.
function SheetSelector({ contexts, spreadsheetId, sheetName, onSelect }) {
  const { spreadsheets = [], isConnected, legacyLeadsCount = 0 } = contexts || {}

  if (!contexts) {
    return <Skeleton className="h-9 w-72" />
  }

  if (!isConnected && spreadsheets.length === 0 && legacyLeadsCount === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        <FileSpreadsheet className="w-4 h-4" />
        No Google Sheet connected.{' '}
        <Link to="/settings/integrations" className="text-primary underline underline-offset-2">
          Connect one →
        </Link>
      </div>
    )
  }

  // Build flat list of selector options
  const options = []

  for (const ss of spreadsheets) {
    // Spreadsheet-level "All Tabs" option
    if (ss.tabs.some(t => t.isAllTabs)) {
      const allTabsEntry = ss.tabs.find(t => t.isAllTabs)
      options.push({
        value:         `${ss.spreadsheetId}||`,
        label:         `${ss.displayName} — All Tabs`,
        spreadsheetId: ss.spreadsheetId,
        sheetName:     null,
        count:         allTabsEntry.count,
        isSpreadsheet: true,
      })
    }
    // Individual tabs
    for (const tab of ss.tabs) {
      if (tab.isAllTabs) continue
      options.push({
        value:         `${ss.spreadsheetId}||${tab.sheetName}`,
        label:         `${ss.displayName} › ${tab.sheetName}`,
        spreadsheetId: ss.spreadsheetId,
        sheetName:     tab.sheetName,
        count:         tab.count,
        isSpreadsheet: false,
      })
    }
    // If spreadsheet has no all-tabs entry but has tabs, show spreadsheet-level option
    if (!ss.tabs.some(t => t.isAllTabs) && ss.tabs.length > 1) {
      options.unshift({
        value:         `${ss.spreadsheetId}||`,
        label:         `${ss.displayName} — All Tabs`,
        spreadsheetId: ss.spreadsheetId,
        sheetName:     null,
        count:         ss.totalLeads,
        isSpreadsheet: true,
      })
    }
    // Single-tab spreadsheet with no "All Tabs" entry
    if (!ss.tabs.some(t => t.isAllTabs) && ss.tabs.length === 1 && !ss.tabs[0].isAllTabs) {
      // tab already added above
    }
  }

  // Legacy leads (synced before spreadsheetId field was added)
  if (legacyLeadsCount > 0) {
    options.push({
      value:         '__legacy__||',
      label:         `Legacy Google Sheet Leads (${legacyLeadsCount})`,
      spreadsheetId: null,
      sheetName:     null,
      count:         legacyLeadsCount,
      isSpreadsheet: true,
    })
  }

  const currentValue = spreadsheetId
    ? `${spreadsheetId}||${sheetName || ''}`
    : (options[0]?.value || '')

  const handleChange = (val) => {
    if (val === '__legacy__||') {
      onSelect({ spreadsheetId: null, sheetName: null })
      return
    }
    const [sid, sname] = val.split('||')
    onSelect({ spreadsheetId: sid || null, sheetName: sname || null })
  }

  return (
    <div className="flex items-center gap-2">
      <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="h-9 min-w-[220px] max-w-xs text-sm">
          <SelectValue placeholder="Select Google Sheet…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt, i) => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-2">
                {opt.isSpreadsheet
                  ? <Layers className="w-3 h-3 text-muted-foreground" />
                  : <TableProperties className="w-3 h-3 text-muted-foreground" />
                }
                <span className="truncate">{opt.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto pl-2 shrink-0">{opt.count}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function GSheetLeadsDashboard() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Read filter from URL ────────────────────────────────────────────────
  const spreadsheetId = searchParams.get('spreadsheetId') || null
  const sheetName     = searchParams.get('sheetName')     || null

  // ── Handle selector change → update URL params ─────────────────────────
  const handleSelect = useCallback(({ spreadsheetId: sid, sheetName: sname }) => {
    const next = {}
    if (sid)    next.spreadsheetId = sid
    if (sname)  next.sheetName     = sname
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  // ── Build query params for API calls ───────────────────────────────────
  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (spreadsheetId) p.set('spreadsheetId', spreadsheetId)
    if (sheetName)     p.set('sheetName', sheetName)
    // Always scope to Google Sheets externalSource (covers both integration types)
    p.set('externalSource', 'all_sheets')
    return p.toString()
  }, [spreadsheetId, sheetName])

  // When legacy is selected (no spreadsheetId), filter without spreadsheetId
  // but still scope to google_sheets source
  const leadsFilterParams = useMemo(() => {
    const p = new URLSearchParams()
    if (spreadsheetId) p.set('spreadsheetId', spreadsheetId)
    if (sheetName)     p.set('sheetName', sheetName)
    p.set('externalSource', 'google_sheets')
    p.set('limit', '15')
    p.set('sort', '-createdAt')
    return p.toString()
  }, [spreadsheetId, sheetName])

  // ── Queries ─────────────────────────────────────────────────────────────

  // 1. Sheet contexts for the selector
  const { data: contextsData } = useQuery({
    queryKey: ['gsheet-contexts'],
    queryFn: () => api.get('/integrations/google_sheets/contexts').then(r => r.data.data),
    staleTime: 60_000,
  })

  // Auto-select first available context on initial load (if no params in URL)
  useEffect(() => {
    if (!spreadsheetId && contextsData?.spreadsheets?.length > 0) {
      const first = contextsData.spreadsheets[0]
      if (first.spreadsheetId) {
        const firstTab = first.tabs.find(t => !t.isAllTabs)
        const nextParams = { spreadsheetId: first.spreadsheetId }
        if (!first.tabs.some(t => t.isAllTabs) && firstTab) {
          nextParams.sheetName = firstTab.sheetName
        }
        setSearchParams(nextParams, { replace: true })
      }
    }
  }, [contextsData, spreadsheetId, setSearchParams])

  // 2. Lead stats for KPIs
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['gsheet-lead-stats', filterParams],
    queryFn: () => api.get(`/leads/stats?${filterParams}`).then(r => r.data.data),
    enabled: true,
    staleTime: 30_000,
  })

  // 3. Recent leads list
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['gsheet-recent-leads', leadsFilterParams],
    queryFn: () => api.get(`/leads?${leadsFilterParams}`).then(r => r.data),
    staleTime: 30_000,
  })

  // 4. Pipeline / stage breakdown (using lead-streams stats-by-filter)
  const { data: streamStats, isLoading: streamStatsLoading } = useQuery({
    queryKey: ['gsheet-stream-stats', filterParams],
    queryFn: () => api.get(`/lead-streams/stats-by-filter?${filterParams}`).then(r => r.data.data),
    staleTime: 30_000,
  })

  const handleRefresh = () => {
    qc.invalidateQueries({ predicate: q =>
      ['gsheet-lead-stats', 'gsheet-recent-leads', 'gsheet-stream-stats', 'gsheet-contexts'].some(
        k => q.queryKey[0] === k
      )
    })
  }

  // ── Derived data ────────────────────────────────────────────────────────
  const byStatus    = statsData?.byStatus || []
  const totals      = statsData?.totals   || { count: 0, total: 0 }
  const recentLeads = leadsData?.data     || []

  const totalLeads   = totals.count || 0
  const newLeads     = kpiCount(byStatus, 'new_lead')
  const contacted    = kpiCount(byStatus, 'contacted')
  const won          = kpiCount(byStatus, 'won')
  const lost         = kpiCount(byStatus, 'lost')

  // Pipeline bar chart data (all statuses with counts)
  const pipelineChartData = Object.entries(STATUS_CONFIG)
    .map(([key, cfg]) => ({
      name:  cfg.label,
      count: kpiCount(byStatus, key),
      fill:  cfg.color,
    }))
    .filter(d => d.count > 0)

  // Status pie chart data
  const pieData = pipelineChartData.map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length] }))

  // ── Context label for subtitle ──────────────────────────────────────────
  const contextLabel = useMemo(() => {
    if (!contextsData?.spreadsheets?.length) return 'Google Sheets Leads'
    const ss = contextsData.spreadsheets.find(s => s.spreadsheetId === spreadsheetId)
    if (!ss) return 'Google Sheets Leads'
    return sheetName
      ? `${ss.displayName} › ${sheetName}`
      : `${ss.displayName} — All Tabs`
  }, [contextsData, spreadsheetId, sheetName])

  // ── "View All Leads" URL — passes same filter to Leads page ────────────
  const viewAllLeadsUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (spreadsheetId) p.set('spreadsheetId', spreadsheetId)
    if (sheetName)     p.set('sheetName', sheetName)
    p.set('streamName', contextLabel)
    p.set('streamType', 'sheet_tab')
    return `/crm-leads?${p.toString()}`
  }, [spreadsheetId, sheetName, contextLabel])

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
            Leads Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {contextLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh}>
            <RefreshCcw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to={viewAllLeadsUrl}>
              <ExternalLink className="w-3.5 h-3.5" />
              View All Leads
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Google Sheet Selector ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div>
              <p className="text-sm font-medium mb-1">Google Sheet</p>
              <SheetSelector
                contexts={contextsData}
                spreadsheetId={spreadsheetId}
                sheetName={sheetName}
                onSelect={handleSelect}
              />
            </div>
            {contextLabel !== 'Google Sheets Leads' && (
              <div className="sm:ml-auto flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                All metrics below are filtered to: <span className="font-medium text-foreground">{contextLabel}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title="Total Leads"
          value={totalLeads}
          icon={Users}
          color="bg-indigo-500"
          loading={statsLoading}
          sub={totals.total ? `₹${totals.total.toLocaleString()} value` : undefined}
        />
        <KPICard
          title="New"
          value={newLeads}
          icon={TrendingUp}
          color="bg-blue-500"
          loading={statsLoading}
        />
        <KPICard
          title="Contacted"
          value={contacted}
          icon={PhoneCall}
          color="bg-cyan-500"
          loading={statsLoading}
        />
        <KPICard
          title="Won"
          value={won}
          icon={CheckCircle2}
          color="bg-emerald-500"
          loading={statsLoading}
        />
        <KPICard
          title="Lost"
          value={lost}
          icon={XCircle}
          color="bg-red-500"
          loading={statsLoading}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Pipeline Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : pipelineChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No leads in this context yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pipelineChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {pipelineChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status distribution pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={9}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Leads ── */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Recent Leads
            {!leadsLoading && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {leadsData?.total || 0} total in this context
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs gap-1" asChild>
            <Link to={viewAllLeadsUrl}>
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {leadsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No leads found for the selected context.{' '}
              {contextsData?.isConnected
                ? 'Sync your Google Sheet to import leads.'
                : <Link to="/settings/integrations" className="text-primary underline underline-offset-2">Connect Google Sheets →</Link>
              }
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentLeads.map(lead => {
                const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new_lead
                return (
                  <div
                    key={lead._id}
                    className="flex items-center gap-3 py-3 hover:bg-accent/50 -mx-6 px-6 transition-colors cursor-pointer"
                    onClick={() => navigate(`/crm-leads?lead=${lead._id}`)}
                  >
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                      {lead.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>

                    {/* Name + company */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{lead.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {lead.company || lead.phone || lead.email || '—'}
                      </p>
                    </div>

                    {/* Sheet tab badge */}
                    {lead.sheetName && (
                      <span className="hidden sm:inline-flex items-center text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                        {lead.sheetName}
                      </span>
                    )}

                    {/* Status badge */}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCfg.bg}`}>
                      {statusCfg.label}
                    </span>

                    {/* Time */}
                    <span className="hidden md:block text-[11px] text-muted-foreground shrink-0 min-w-[70px] text-right">
                      {lead.createdAt ? formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true }) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Status breakdown table ── */}
      {!statsLoading && byStatus.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {byStatus
                .filter(s => s.count > 0)
                .sort((a, b) => b.count - a.count)
                .map(s => {
                  const cfg = STATUS_CONFIG[s._id] || { label: s._id, bg: 'bg-muted text-muted-foreground', color: '#6b7280' }
                  const pct = totalLeads > 0 ? Math.round((s.count / totalLeads) * 100) : 0
                  return (
                    <div key={s._id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border">
                      <div>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{s.count.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">{pct}%</p>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Connect prompt if not connected ── */}
      {contextsData && !contextsData.isConnected && (
        <Card className="border-dashed border-border">
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="font-semibold">Connect Google Sheets</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Connect your Google Sheet to import leads and see them here with live filtering.
              </p>
            </div>
            <Button size="sm" className="gap-1.5" asChild>
              <Link to="/settings/integrations">
                <ExternalLink className="w-3.5 h-3.5" />
                Go to Integrations
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
