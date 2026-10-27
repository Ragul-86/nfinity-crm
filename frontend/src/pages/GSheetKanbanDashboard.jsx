/**
 * GSheetKanbanDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replacement route for /leads/dashboard that correctly scopes pipeline
 * selection to the active spreadsheet.
 *
 * Differences from the protected GSheetLeadsDashboard.jsx:
 *   1. breakdownQS includes spreadsheetId → backend filters by spreadsheet.
 *   2. React Query key: ['gsheet-pipeline-breakdown-v2', spreadsheetId, sheetName]
 *      — distinct prefix avoids cache collision with the original component.
 *   3. autoPipelineId falls back to selectedSS.pipelineId (saved in Integration
 *      config via saveSheetConfig) for zero-lead spreadsheets.
 *
 * The original GSheetLeadsDashboard.jsx is NEVER imported or modified here.
 *
 * Route:  /leads/dashboard
 * URL params:
 *   ?spreadsheetId=XXXX              — selected Google Sheet (drives tab dropdown)
 *   ?sheetName=Performance%20Marketer — selected tab (scopes all data below)
 *
 * Tenant isolation:
 *   sheetName comes from URL but the backend always AND-s it with tenantId from JWT.
 */

import { useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, TableProperties, AlertCircle } from 'lucide-react'
import api from '@/services/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import SalesPipeline from '@/pages/SalesPipeline'

// ── Google Sheet dropdown ──────────────────────────────────────────────────
function SpreadsheetDropdown({ spreadsheets, value, onChange, loading }) {
  if (loading) return <Skeleton className="h-9 w-56" />
  if (!spreadsheets?.length) return null

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
        Google Sheet
      </span>
      <Select
        value={value || ''}
        onValueChange={onChange}
      >
        <SelectTrigger className="h-9 min-w-[200px] max-w-[280px] text-sm font-medium">
          <SelectValue placeholder="Select spreadsheet…" />
        </SelectTrigger>
        <SelectContent>
          {spreadsheets.map(ss => (
            <SelectItem
              key={ss.spreadsheetId ?? '__legacy__'}
              value={ss.spreadsheetId ?? '__legacy__'}
            >
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

// ── Sheet Tab dropdown ─────────────────────────────────────────────────────
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
      <Select
        value={currentValue}
        onValueChange={v => onChange(v === ALL_VALUE ? null : v)}
      >
        <SelectTrigger className="h-9 min-w-[160px] max-w-[240px] text-sm">
          <SelectValue placeholder="All Tabs" />
        </SelectTrigger>
        <SelectContent>
          {tabs.map(tab => (
            <SelectItem
              key={tab.sheetName ?? ALL_VALUE}
              value={tab.sheetName ?? ALL_VALUE}
            >
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

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function GSheetKanbanDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL state — spreadsheetId is display-only; sheetName is the actual API filter
  const spreadsheetId = searchParams.get('spreadsheetId') || null
  const sheetName     = searchParams.get('sheetName')     || null

  // ── 1. Load all Google Sheet contexts (spreadsheets + tabs) ───────────────
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
      // No spreadsheet selected yet — auto-select first
      params.spreadsheetId = first.spreadsheetId || ''
      // Auto-select tab if spreadsheet has exactly one non-"All Tabs" tab
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
    // Auto-select tab if the new spreadsheet has exactly one real tab
    const realTabs = (ss?.tabs || []).filter(t => !t.isAllTabs)
    if (realTabs.length === 1) next.sheetName = realTabs[0].sheetName || ''
    // Otherwise: don't carry over the old sheetName (it may not exist in new SS)
    setSearchParams(next, { replace: true })
  }, [spreadsheets, setSearchParams])

  const handleTabChange = useCallback(sname => {
    const next = {}
    if (spreadsheetId) next.spreadsheetId = spreadsheetId
    if (sname)         next.sheetName     = sname
    setSearchParams(next, { replace: true })
  }, [spreadsheetId, setSearchParams])

  // ── 5. Pipeline breakdown — scoped by BOTH spreadsheetId AND sheetName ────
  // This is the key fix vs GSheetLeadsDashboard: spreadsheetId is included so
  // two sheets with identically-named tabs get correct independent results.
  const breakdownQS = useMemo(() => {
    const p = new URLSearchParams({ externalSource: 'all_sheets' })
    if (sheetName) p.set('sheetName', sheetName)
    if (selectedSS) {
      // Mirror the same __null__ sentinel logic used in sourceFilter below
      const hasLegacyLeads = !selectedSS.leadsHaveSpreadsheetId && (selectedSS.totalLeads || 0) > 0
      const effectiveSpreadsheetId = hasLegacyLeads ? '__null__' : selectedSS.spreadsheetId
      if (effectiveSpreadsheetId) p.set('spreadsheetId', effectiveSpreadsheetId)
    }
    return p.toString()
  }, [sheetName, selectedSS])

  // Distinct React Query key — avoids cache collision with the protected component
  const { data: pipelineBreakdown } = useQuery({
    queryKey:  ['gsheet-pipeline-breakdown-v2', selectedSS?.spreadsheetId ?? null, sheetName],
    queryFn:   () => api.get(`/leads/pipeline-breakdown?${breakdownQS}`).then(r => r.data.data),
    staleTime: 30_000,
    enabled:   !!selectedSS,
  })

  // Top pipeline for the selected sheet context.
  // For zero-lead sheets, fall back to the saved pipelineId from Integration config
  // (returned by getGoogleSheetsContexts as selectedSS.pipelineId).
  const autoPipelineId = useMemo(() => {
    if (pipelineBreakdown && pipelineBreakdown.length > 0) {
      return pipelineBreakdown[0].pipelineId?.toString() || null
    }
    // Zero-lead spreadsheet: use the saved configuration pipeline
    return selectedSS?.pipelineId?.toString() || null
  }, [pipelineBreakdown, selectedSS])

  // ── 6. Source filter passed to SalesPipeline ──────────────────────────────
  // sheetName may be null (= All Tabs) — the backend handles both cases.
  // spreadsheetId scopes the query to the selected spreadsheet:
  //   - real spreadsheetId when leadsHaveSpreadsheetId=true (indexed sync)
  //   - '__null__' sentinel ONLY when leadsHaveSpreadsheetId=false AND totalLeads>0
  //     (sheet consumed the null bucket → confirmed owner of legacy null-ID leads)
  //   - real spreadsheetId when leadsHaveSpreadsheetId=false AND totalLeads=0
  //     (zero-lead sheet — real ID matches nothing, returns empty without leaking)
  const sourceFilter = useMemo(() => {
    const filter = { sheetName: sheetName || null }
    if (selectedSS) {
      const hasLegacyLeads = !selectedSS.leadsHaveSpreadsheetId && (selectedSS.totalLeads || 0) > 0
      filter.spreadsheetId = hasLegacyLeads ? '__null__' : selectedSS.spreadsheetId
    }
    return filter
  }, [sheetName, selectedSS])

  // ── Not connected warning ──────────────────────────────────────────────────
  const noSheets = !loadingContexts && !spreadsheets.length

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Context selector bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-x-4 gap-y-2 mb-4 p-3 bg-card border border-border rounded-xl">

        {noSheets ? (
          /* No Google Sheet connected at all */
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            No Google Sheet connected.{' '}
            <Link to="/settings/integrations" className="text-primary underline underline-offset-2 font-medium">
              Connect one →
            </Link>
          </div>
        ) : (
          <div className="flex items-end gap-3 flex-wrap flex-1">
            {/* ── Google Sheet selector ── */}
            <SpreadsheetDropdown
              spreadsheets={spreadsheets}
              value={spreadsheetId ?? selectedSS?.spreadsheetId ?? '__legacy__'}
              onChange={handleSpreadsheetChange}
              loading={loadingContexts}
            />

            {/* ── Separator ── */}
            {tabs.length > 0 && (
              <span className="text-muted-foreground text-xl pb-1.5 hidden sm:block">›</span>
            )}

            {/* ── Sheet Tab selector ── */}
            {tabs.length > 0 && (
              <TabDropdown
                tabs={tabs}
                value={sheetName}
                onChange={handleTabChange}
                loading={loadingContexts}
              />
            )}

            {/* ── Sync warning ── */}
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

      {/* ── Full Sales Pipeline / Kanban ─────────────────────────────────── */}
      {/*
        sourceFilter → scopes lead query to the selected sheet tab (+ externalSource=all_sheets)
        initialPipelineId → auto-selects the pipeline that has the most leads for this context,
                            or the saved configuration pipeline for zero-lead spreadsheets.
        Both props are optional: SalesPipeline works unchanged when both are null.
      */}
      <SalesPipeline
        sourceFilter={sourceFilter}
        initialPipelineId={autoPipelineId}
      />

    </div>
  )
}
