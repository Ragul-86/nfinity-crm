/**
 * GSheetLeadsTable.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Sheets leads in a table view — mirrors Leads.jsx UI but scoped to a
 * selected spreadsheet and tab via the contexts API.
 *
 * Route: /leads/sheet-table
 * URL params:
 *   ?spreadsheetId=XXXX          — selected Google Sheet
 *   ?sheetName=SomeTab           — selected tab (null = All Tabs)
 *
 * Filter strategy (mirrors GSheetLeadsDashboard):
 *   Always sends externalSource=all_sheets.
 *   Uses __null__ sentinel for legacy leads (leadsHaveSpreadsheetId=false + totalLeads>0).
 *   Zero-lead sheets get their real spreadsheetId → returns empty without leaking.
 *
 * PROTECTED: Do NOT import from or modify GSheetLeadsDashboard.jsx / Leads.jsx / SalesPipeline.jsx.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search, Download, X, ChevronLeft, ChevronRight, Eye, Calendar,
  MoreVertical, FileSpreadsheet, TableProperties, AlertCircle,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'
import LeadDetailModal from '@/components/leads/LeadDetailModal'
import { getToken } from '@/services/api'
import api from '@/services/api'
import { useQueryClient } from '@tanstack/react-query'

// ── API helper (same pattern as Leads.jsx) ────────────────────────────────────
const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '')

async function apiFetch(url, opts = {}) {
  const token = getToken()
  const r = await fetch(`${API_ORIGIN}${url}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.message || 'Request failed')
  return d
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'new_lead',       label: 'New Lead',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  { value: 'contacted',      label: 'Contacted',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
  { value: 'discovery_call', label: 'Discovery Call', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' },
  { value: 'proposal_sent',  label: 'Proposal Sent',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400' },
  { value: 'negotiation',    label: 'Negotiation',    color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
  { value: 'won',            label: 'Won',            color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  { value: 'lost',           label: 'Lost',           color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  { value: 'archived',       label: 'Archived',       color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
]
const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'text-red-600' },
  { value: 'high',   label: 'High',   color: 'text-orange-600' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600' },
  { value: 'low',    label: 'Low',    color: 'text-gray-500' },
]

function statusInfo(val) { return STATUSES.find(s => s.value === val) || { label: val || '—', color: '' } }
function priorityInfo(val) { return PRIORITIES.find(p => p.value === val) || { label: val || '—', color: '' } }

// ── KPI bar ───────────────────────────────────────────────────────────────────
function KpiBar({ stats }) {
  if (!stats) return null
  const totals   = stats.totals   || {}
  const byStatus = stats.byStatus || []
  const kpis = [
    { label: 'Total',    value: totals.count || 0,                                color: 'text-foreground' },
    { label: 'Won',      value: byStatus.find(s => s._id === 'won')?.count  || 0, color: 'text-emerald-600' },
    { label: 'Lost',     value: byStatus.find(s => s._id === 'lost')?.count || 0, color: 'text-red-600' },
    { label: 'Pipeline', value: `₹${((totals.total || 0) / 100000).toFixed(1)}L`, color: 'text-blue-600' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map(k => (
        <Card key={k.label}>
          <CardContent className="p-3">
            <p className={cn('text-xl font-bold', k.color)}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Google Sheet dropdown (replicated from GSheetLeadsDashboard) ──────────────
function SpreadsheetDropdown({ spreadsheets, value, onChange, loading }) {
  if (loading) return <Skeleton className="h-9 w-56" />
  if (!spreadsheets?.length) return null

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
        Google Sheet
      </span>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="h-9 min-w-[200px] max-w-[280px] text-sm font-medium">
          <SelectValue placeholder="Select spreadsheet…" />
        </SelectTrigger>
        <SelectContent>
          {spreadsheets.map(ss => (
            <SelectItem key={ss.spreadsheetId ?? '__legacy__'} value={ss.spreadsheetId ?? '__legacy__'}>
              <span className="flex items-center gap-2 w-full">
                <FileSpreadsheet className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span className="truncate flex-1">{ss.displayName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums ml-2">
                  {ss.totalLeads}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Sheet Tab dropdown (replicated from GSheetLeadsDashboard) ─────────────────
function TabDropdown({ tabs, value, onChange, loading }) {
  if (loading) return <Skeleton className="h-9 w-44" />
  if (!tabs?.length) return null

  const ALL_VALUE = '__all__'
  const currentValue = value || ALL_VALUE

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
        Sheet Tab
      </span>
      <Select value={currentValue} onValueChange={v => onChange(v === ALL_VALUE ? null : v)}>
        <SelectTrigger className="h-9 min-w-[160px] max-w-[240px] text-sm">
          <SelectValue placeholder="All Tabs" />
        </SelectTrigger>
        <SelectContent>
          {tabs.map(tab => (
            <SelectItem key={tab.sheetName ?? ALL_VALUE} value={tab.sheetName ?? ALL_VALUE}>
              <span className="flex items-center gap-2 w-full">
                <TableProperties className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{tab.label || tab.sheetName || 'All Tabs'}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums ml-2">
                  {tab.count}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const LIMIT = 20

export default function GSheetLeadsTable() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── URL state ──────────────────────────────────────────────────────────────
  const spreadsheetId = searchParams.get('spreadsheetId') || null
  const sheetName     = searchParams.get('sheetName')     || null

  // ── Local filter state ─────────────────────────────────────────────────────
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [detailId, setDetailId]   = useState(null)

  // Reset page when filters change
  const resetPage = () => setPage(1)

  // ── 1. Load Google Sheet contexts ─────────────────────────────────────────
  const { data: contextsData, isLoading: loadingContexts } = useQuery({
    queryKey: ['gsheet-contexts'],
    queryFn:  () => api.get('/integrations/google_sheets/contexts').then(r => r.data.data),
    staleTime: 60_000,
  })

  const spreadsheets = contextsData?.spreadsheets || []
  const isConnected  = contextsData?.isConnected   ?? false

  // ── 2. Resolve selected spreadsheet object ────────────────────────────────
  const selectedSS = useMemo(() => {
    if (!spreadsheets.length) return null
    if (spreadsheetId) {
      return spreadsheets.find(ss => (ss.spreadsheetId ?? '__legacy__') === spreadsheetId)
        || spreadsheets[0]
    }
    return spreadsheets[0]
  }, [spreadsheets, spreadsheetId])

  const tabs = selectedSS?.tabs || []

  // ── 3. Auto-select first spreadsheet + tab on initial load ────────────────
  useEffect(() => {
    if (!contextsData || !spreadsheets.length) return
    const first = spreadsheets[0]
    if (!first) return
    const params = Object.fromEntries(searchParams)
    if (!spreadsheetId) {
      params.spreadsheetId = first.spreadsheetId || ''
      const realTabs = (first.tabs || []).filter(t => !t.isAllTabs)
      if (realTabs.length === 1 && !params.sheetName) {
        params.sheetName = realTabs[0].sheetName || ''
      }
      setSearchParams(params, { replace: true })
    }
  }, [contextsData]) // eslint-disable-line

  // ── 4. Handlers ───────────────────────────────────────────────────────────
  const handleSpreadsheetChange = useCallback(sid => {
    const ss = spreadsheets.find(s => (s.spreadsheetId ?? '__legacy__') === sid)
    const next = { spreadsheetId: ss?.spreadsheetId || '' }
    const realTabs = (ss?.tabs || []).filter(t => !t.isAllTabs)
    if (realTabs.length === 1) next.sheetName = realTabs[0].sheetName || ''
    setSearchParams(next, { replace: true })
    resetPage()
  }, [spreadsheets, setSearchParams])

  const handleTabChange = useCallback(sname => {
    const next = {}
    if (spreadsheetId) next.spreadsheetId = spreadsheetId
    if (sname)         next.sheetName     = sname
    setSearchParams(next, { replace: true })
    resetPage()
  }, [spreadsheetId, setSearchParams])

  // ── 5. Source filter (mirrors GSheetLeadsDashboard sentinel logic) ─────────
  const sourceFilter = useMemo(() => {
    const filter = {}
    if (selectedSS) {
      const hasLegacyLeads = !selectedSS.leadsHaveSpreadsheetId && (selectedSS.totalLeads || 0) > 0
      filter.spreadsheetId = hasLegacyLeads ? '__null__' : selectedSS.spreadsheetId
    }
    return filter
  }, [selectedSS])

  // ── 6. Build leads query params ───────────────────────────────────────────
  const leadsQp = useMemo(() => {
    const p = new URLSearchParams({ page, limit: LIMIT, externalSource: 'all_sheets' })
    if (sourceFilter.spreadsheetId) p.set('spreadsheetId', sourceFilter.spreadsheetId)
    if (sheetName)      p.set('sheetName', sheetName)
    if (search)         p.set('search', search)
    if (filterStatus)   p.set('status', filterStatus)
    if (filterPriority) p.set('priority', filterPriority)
    return p.toString()
  }, [page, search, filterStatus, filterPriority, sourceFilter, sheetName])

  // ── 7. Fetch leads ────────────────────────────────────────────────────────
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['gsheet-table-leads', leadsQp],
    queryFn:  () => apiFetch(`/api/leads?${leadsQp}`),
    keepPreviousData: true,
    refetchInterval: 30_000,
    enabled: !!selectedSS,
  })

  // ── 8. Build stats query params ───────────────────────────────────────────
  const statsQp = useMemo(() => {
    const p = new URLSearchParams({ externalSource: 'all_sheets' })
    if (sheetName) p.set('sheetName', sheetName)
    if (selectedSS) {
      // Stats endpoint does not handle __null__ sentinel, so only send real spreadsheetId
      const hasLegacyLeads = !selectedSS.leadsHaveSpreadsheetId && (selectedSS.totalLeads || 0) > 0
      if (!hasLegacyLeads && selectedSS.spreadsheetId) {
        p.set('spreadsheetId', selectedSS.spreadsheetId)
      }
    }
    return p.toString()
  }, [sheetName, selectedSS])

  // ── 9. Fetch stats ────────────────────────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['gsheet-table-stats', statsQp],
    queryFn:  () => apiFetch(`/api/leads/stats?${statsQp}`).then(d => d.data),
    refetchInterval: 60_000,
    enabled: !!selectedSS,
  })

  // ── Derived values ────────────────────────────────────────────────────────
  const leads  = leadsData?.data  || []
  const total  = leadsData?.total || 0
  const pages  = Math.ceil(total / LIMIT)
  const hasFilters = search || filterStatus || filterPriority

  const noSheets = !loadingContexts && !spreadsheets.length

  const clearFilters = () => {
    setSearch('')
    setFilterStatus('')
    setFilterPriority('')
    setPage(1)
  }

  // ── Display name for the selected sheet + tab ─────────────────────────────
  const contextLabel = useMemo(() => {
    if (!selectedSS) return 'Sheet Leads'
    const base = selectedSS.displayName || 'Sheet'
    if (!sheetName) return base
    const tab = tabs.find(t => t.sheetName === sheetName)
    return tab ? `${base} › ${tab.label || sheetName}` : base
  }, [selectedSS, sheetName, tabs])

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* ── Context selector bar ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-x-4 gap-y-2 p-3 bg-card border border-border rounded-xl">
        {noSheets ? (
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <FileSpreadsheet className="w-4 h-4" />
            No Google Sheet connected.{' '}
            <Link to="/settings/integrations" className="text-primary underline underline-offset-2 font-medium">
              Connect one →
            </Link>
          </div>
        ) : (
          <div className="flex items-end gap-3 flex-wrap flex-1">
            <SpreadsheetDropdown
              spreadsheets={spreadsheets}
              value={spreadsheetId ?? selectedSS?.spreadsheetId ?? '__legacy__'}
              onChange={handleSpreadsheetChange}
              loading={loadingContexts}
            />
            {tabs.length > 0 && (
              <span className="text-muted-foreground text-xl pb-1.5 hidden sm:block">›</span>
            )}
            {tabs.length > 0 && (
              <TabDropdown
                tabs={tabs}
                value={sheetName}
                onChange={handleTabChange}
                loading={loadingContexts}
              />
            )}
            {contextsData && !isConnected && spreadsheets.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 mb-0.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Sync paused.{' '}
                <Link to="/settings/integrations" className="underline underline-offset-2 font-medium">
                  Reconnect →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{contextLabel}</h1>
          <p className="text-sm text-muted-foreground">{total} lead{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${API_ORIGIN}/api/leads/export?externalSource=all_sheets${leadsQp.replace(/^.*?(?=&|$)/, '').replace('page=1&limit=20&', '').replace('&page=1&limit=20', '')}`
              window.open(url, '_blank')
            }}
          >
            <Download className="w-4 h-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      {/* ── KPI bar ───────────────────────────────────────────────────────── */}
      <KpiBar stats={statsData} />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, email, lead ID…"
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select value={filterStatus || 'all'} onValueChange={v => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority || 'all'} onValueChange={v => { setFilterPriority(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Lead', 'Contact', 'Status', 'Priority', 'Source', 'Value', 'Assigned', 'Follow-up', 'Created', ''].map(h => (
                  <th
                    key={h}
                    className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Loading skeletons */}
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {[...Array(10)].map((_, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}

              {/* Empty state */}
              {!isLoading && !leads.length && (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-muted-foreground">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      {!selectedSS
                        ? 'Select a spreadsheet above to view leads'
                        : hasFilters
                          ? 'No leads match your filters'
                          : 'No leads found for this selection'}
                    </p>
                  </td>
                </tr>
              )}

              {/* Lead rows */}
              {leads.map(lead => {
                const si = statusInfo(lead.status)
                const pi = priorityInfo(lead.priority)
                return (
                  <tr
                    key={lead._id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    {/* Lead name + company */}
                    <td className="px-3 py-3 cursor-pointer" onClick={() => setDetailId(lead._id)}>
                      <p className="font-medium hover:text-primary transition-colors">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.company || lead.leadId || ''}</p>
                    </td>

                    {/* Contact */}
                    <td className="px-3 py-3">
                      <p className="text-xs">{lead.phone || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{lead.email || ''}</p>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', si.color)}>
                        {si.label}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-3 py-3">
                      <span className={cn('text-xs font-semibold', pi.color)}>{pi.label}</span>
                    </td>

                    {/* Source */}
                    <td className="px-3 py-3 text-xs text-muted-foreground capitalize">
                      {lead.source?.replace(/_/g, ' ') || '—'}
                    </td>

                    {/* Value */}
                    <td className="px-3 py-3 text-xs font-medium">
                      {lead.value > 0 ? `₹${lead.value.toLocaleString()}` : '—'}
                    </td>

                    {/* Assigned */}
                    <td className="px-3 py-3">
                      {lead.assignedTo?.length > 0 ? (
                        <div className="flex -space-x-1">
                          {lead.assignedTo.slice(0, 3).map(u => (
                            <Avatar key={u._id} className="w-5 h-5 border border-background" title={u.name}>
                              <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                                {u.name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>

                    {/* Follow-up */}
                    <td className="px-3 py-3">
                      {lead.followUpDate ? (
                        <span className={cn(
                          'text-xs flex items-center gap-1',
                          new Date(lead.followUpDate) < new Date() ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          <Calendar className="w-3 h-3" />
                          {format(new Date(lead.followUpDate), 'MMM d')}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => setDetailId(lead._id)}>
                            <Eye className="w-4 h-4 mr-2" /> View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">{total} leads</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">{page} / {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Lead detail modal */}
      {detailId && (
        <LeadDetailModal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          leadId={detailId}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['gsheet-table-leads'] })}
        />
      )}
    </div>
  )
}
