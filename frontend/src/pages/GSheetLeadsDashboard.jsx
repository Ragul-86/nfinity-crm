/**
 * GSheetLeadsDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Sheet context selector + full Sales Pipeline / Kanban UI.
 *
 * Architecture:
 *   1. Google Sheet selector at the top (reads from /api/integrations/google_sheets/contexts)
 *   2. Selected sheet → auto-resolves the matching Pipeline via /api/leads/pipeline-breakdown
 *   3. Renders the existing <SalesPipeline> component with:
 *        sourceFilter = { sheetName }   — scopes leads to the selected tab
 *        initialPipelineId              — auto-selects the tab's pipeline
 *   4. All existing pipeline functionality is preserved: drag-drop, actions,
 *      KPI bar, search, filters, export, bulk ops, modals.
 *
 * Route:  /leads/dashboard
 * URL params (for shareability / deep-linking):
 *   ?spreadsheetId=XXXX        — display-only, drives the selector dropdown
 *   ?sheetName=Performance%20Marketer  — tab filter (absent = all Google Sheets tabs)
 *
 * Filter strategy:
 *   API calls use sheetName + externalSource=all_sheets.
 *   spreadsheetId is NOT sent to the backend because existing leads have
 *   spreadsheetId: null (synced before the field was added to the Lead model).
 *
 * Tenant isolation: sheetName comes from URL but the backend always AND-s it
 *   with tenantId from the JWT — never trusted from the client.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileSpreadsheet, Layers, TableProperties, SlidersHorizontal,
} from 'lucide-react'
import api from '@/services/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import SalesPipeline from '@/pages/SalesPipeline'

// ── Sheet / Tab Selector ───────────────────────────────────────────────────
// Same selector used in the previous dashboard version.
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
    // All-Tabs option (when present)
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
        label:         ss.tabs.some(t => t.isAllTabs)
                         ? `${ss.displayName} › ${tab.sheetName}`
                         : tab.sheetName,
        spreadsheetId: ss.spreadsheetId,
        sheetName:     tab.sheetName,
        count:         tab.count,
        isSpreadsheet: false,
      })
    }
    // Spreadsheet with multiple tabs but no isAllTabs → add an All-Tabs option
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
  }

  // Legacy leads not claimed by a connected spreadsheet
  if (legacyLeadsCount > 0 && spreadsheets.length === 0) {
    options.push({
      value:         '__legacy__||',
      label:         `Google Sheet Leads (${legacyLeadsCount})`,
      spreadsheetId: null,
      sheetName:     null,
      count:         legacyLeadsCount,
      isSpreadsheet: true,
    })
  }

  const currentValue = spreadsheetId
    ? `${spreadsheetId}||${sheetName || ''}`
    : (options[0]?.value || '')

  const handleChange = val => {
    if (val === '__legacy__||') {
      onSelect({ spreadsheetId: null, sheetName: null })
      return
    }
    const [sid, sname] = val.split('||')
    onSelect({ spreadsheetId: sid || null, sheetName: sname || null })
  }

  return (
    <div className="flex items-center gap-2">
      <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="h-9 min-w-[240px] max-w-sm text-sm font-medium">
          <SelectValue placeholder="Select Google Sheet…" />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-2">
                {opt.isSpreadsheet
                  ? <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <TableProperties className="w-3 h-3 text-muted-foreground shrink-0" />
                }
                <span className="truncate">{opt.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto pl-2 shrink-0">
                  {opt.count}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function GSheetLeadsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  // spreadsheetId drives the selector dropdown display only (not sent to API)
  const spreadsheetId = searchParams.get('spreadsheetId') || null
  const sheetName     = searchParams.get('sheetName')     || null

  // ── Handle selector change ─────────────────────────────────────────────
  const handleSelect = useCallback(({ spreadsheetId: sid, sheetName: sname }) => {
    const next = {}
    if (sid)   next.spreadsheetId = sid
    if (sname) next.sheetName     = sname
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  // ── 1. Google Sheet contexts for the selector ──────────────────────────
  const { data: contextsData } = useQuery({
    queryKey: ['gsheet-contexts'],
    queryFn:  () => api.get('/integrations/google_sheets/contexts').then(r => r.data.data),
    staleTime: 60_000,
  })

  // Auto-select first available context on initial load (when URL has no params)
  useEffect(() => {
    if (!spreadsheetId && contextsData?.spreadsheets?.length > 0) {
      const first = contextsData.spreadsheets[0]
      if (!first?.spreadsheetId) return
      const nextParams = { spreadsheetId: first.spreadsheetId }
      // For single-tab mode also set sheetName so the filter scopes to the tab
      if (!first.tabs.some(t => t.isAllTabs)) {
        const firstRealTab = first.tabs.find(t => !t.isAllTabs)
        if (firstRealTab?.sheetName) nextParams.sheetName = firstRealTab.sheetName
      }
      setSearchParams(nextParams, { replace: true })
    }
  }, [contextsData, spreadsheetId, setSearchParams])

  // ── 2. Determine which pipeline belongs to the selected sheet ──────────
  // /api/leads/pipeline-breakdown returns pipelines sorted by lead count.
  // We pick the first (dominant) pipeline to auto-select in SalesPipeline.
  const breakdownParams = useMemo(() => {
    const p = new URLSearchParams()
    if (sheetName) p.set('sheetName', sheetName)
    p.set('externalSource', 'all_sheets')
    return p.toString()
  }, [sheetName])

  const { data: pipelineBreakdown } = useQuery({
    queryKey: ['gsheet-pipeline-breakdown', sheetName],
    queryFn:  () => api.get(`/leads/pipeline-breakdown?${breakdownParams}`).then(r => r.data.data),
    staleTime: 30_000,
  })

  // The pipeline ID to auto-select (top pipeline for the selected sheet)
  const autoPipelineId = pipelineBreakdown?.[0]?.pipelineId?.toString() || null

  // ── Source filter passed to SalesPipeline ─────────────────────────────
  // sheetName may be null (= All Tabs) — the backend handles both cases.
  const sourceFilter = useMemo(() => ({
    sheetName: sheetName || null,
  }), [sheetName])

  // ── Context label for the info strip ──────────────────────────────────
  const contextLabel = useMemo(() => {
    if (!contextsData?.spreadsheets?.length) return null
    const ss = contextsData.spreadsheets.find(s => s.spreadsheetId === spreadsheetId)
    if (!ss) return sheetName || 'All Google Sheets Leads'
    return sheetName
      ? `${ss.displayName} › ${sheetName}`
      : `${ss.displayName} — All Tabs`
  }, [contextsData, spreadsheetId, sheetName])

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Google Sheet context selector strip ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 p-3 bg-card border border-border rounded-xl">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium mb-1 uppercase tracking-wide">
              Google Sheet
            </p>
            <SheetSelector
              contexts={contextsData}
              spreadsheetId={spreadsheetId}
              sheetName={sheetName}
              onSelect={handleSelect}
            />
          </div>

          {contextsData && !contextsData.isConnected && (
            <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
              Google Sheets not connected.{' '}
              <Link to="/settings/integrations" className="underline underline-offset-2">
                Connect →
              </Link>
            </div>
          )}
        </div>

        {/* Context breadcrumb */}
        {contextLabel && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Showing:</span>
            <span className="font-medium text-foreground truncate max-w-[200px]">{contextLabel}</span>
          </div>
        )}
      </div>

      {/* ── Full Pipeline / Kanban — the existing SalesPipeline component ── */}
      {/*
        sourceFilter → adds sheetName + externalSource=all_sheets to lead query
        initialPipelineId → auto-selects the tab's matching pipeline
        Both props are optional — SalesPipeline works unchanged when they're null.
      */}
      <SalesPipeline
        sourceFilter={sourceFilter}
        initialPipelineId={autoPipelineId}
      />

    </div>
  )
}
