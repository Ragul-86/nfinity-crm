/**
 * GoogleSheetsCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Specialized integration card for the google_sheets provider.
 * Shows ONE card with MULTIPLE connected spreadsheets listed inside it,
 * each with their own Sync / Change / Remove actions.
 *
 * Architecture:
 *   ONE Google Sheets card
 *   └─ Sheet A: [Sync] [Change] [Remove]
 *   └─ Sheet B: [Sync] [Change] [Remove]
 *   [+ Connect Another Sheet]  [Sync All]
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileSpreadsheet,
  RefreshCw,
  Settings2,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Unplug,
  Clock,
  GitBranch,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/utils/cn'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateVal) {
  if (!dateVal) return null
  const diff = Date.now() - new Date(dateVal).getTime()
  if (diff < 60_000)        return 'just now'
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} min ago`
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)} hr ago`
  return `${Math.floor(diff / 86_400_000)} days ago`
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'connected') {
    return (
      <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 text-[10px] font-medium gap-1 py-0">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Connected
      </Badge>
    )
  }
  if (status === 'expired') {
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 text-[10px] font-medium gap-1 py-0">
        <AlertCircle className="w-2.5 h-2.5" />
        Token Expired
      </Badge>
    )
  }
  if (status === 'sync_error') {
    return (
      <Badge variant="outline" className="text-red-600 border-red-500/30 bg-red-500/10 text-[10px] font-medium gap-1 py-0">
        <AlertCircle className="w-2.5 h-2.5" />
        Sync Error
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-[10px] font-medium py-0">
      Not Connected
    </Badge>
  )
}

// ── Individual spreadsheet row ────────────────────────────────────────────────
function SheetRow({ sheet, isSyncing, isRemoving, readOnly, pipelines, isSavingPipeline, onSync, onChange, onRemove, onPipelineChange }) {
  const [pendingRemove, setPendingRemove] = useState(false)
  const lastSynced = relativeTime(sheet.updatedAt)

  return (
    <div className={cn(
      'flex flex-col gap-2 p-2.5 rounded-lg border transition-colors',
      isRemoving
        ? 'border-destructive/30 bg-destructive/5'
        : 'border-border/60 bg-muted/30 hover:bg-muted/50'
    )}>
      <div className="flex items-start gap-2.5">
        <FileSpreadsheet className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />

        {/* Sheet info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate leading-snug">
            {sheet.displayName || sheet.spreadsheetId}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {sheet.syncMode === 'all' ? 'All Tabs' : `Tab: ${sheet.sheetName}`}
          </p>
          {lastSynced && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 shrink-0" />
              Synced {lastSynced}
            </p>
          )}
        </div>

        {/* Per-sheet actions */}
        {!readOnly && (
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Sync */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Sync this sheet"
              disabled={isSyncing || isRemoving}
              onClick={onSync}
            >
              <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
            </Button>

            {/* Change (reconfigure) */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Reconfigure sync settings"
              disabled={isSyncing || isRemoving}
              onClick={onChange}
            >
              <Settings2 className="w-3 h-3" />
            </Button>

            {/* Remove — two-tap confirm */}
            {pendingRemove ? (
              <div className="flex items-center gap-0.5 ml-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] text-muted-foreground"
                  onClick={() => setPendingRemove(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                  disabled={isRemoving}
                  onClick={() => { setPendingRemove(false); onRemove() }}
                >
                  {isRemoving ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                title="Remove this sheet"
                disabled={isSyncing || isRemoving}
                onClick={() => setPendingRemove(true)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Pipeline picker ───────────────────────────────────────────────── */}
      {!readOnly && pipelines && pipelines.length > 0 && (
        <div className="flex items-center gap-1.5 pl-6">
          <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
          <select
            className="flex-1 text-[10px] bg-background border border-border/60 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            value={sheet.pipelineId || ''}
            disabled={isSavingPipeline || isRemoving}
            title="Pipeline for new leads from this spreadsheet"
            onChange={e => onPipelineChange(e.target.value || null)}
          >
            <option value="">— No pipeline override —</option>
            {pipelines.map(p => (
              <option key={p._id} value={p._id}>
                {p.name}{p.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
          {isSavingPipeline && (
            <span className="text-[10px] text-muted-foreground shrink-0">Saving…</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main card ────────────────────────────────────────────────────────────────
export default function GoogleSheetsCard({
  config,
  integration,
  readOnly = false,
  onAddSheet,
  onChangeSheet,
  onDisconnect,
}) {
  const qc = useQueryClient()
  const [syncingSheetId,   setSyncingSheetId]   = useState(null)
  const [removingSheetId,  setRemovingSheetId]  = useState(null)
  const [savingPipelineId, setSavingPipelineId] = useState(null)
  const [syncingAll,       setSyncingAll]       = useState(false)

  // ── Load pipelines for the picker ─────────────────────────────────────────
  const { data: pipelinesRaw } = useQuery({
    queryKey: ['pipelines-list'],
    queryFn:  () => api.get('/pipeline-defs').then(r => r.data.data || []),
    staleTime: 5 * 60 * 1000,
    enabled:  !readOnly,
  })
  const pipelines = pipelinesRaw || []

  const isConnected = integration?.status === 'connected'
  const isExpired   = integration?.status === 'expired'
  const isSyncError = integration?.status === 'sync_error'

  // Build the list of configured spreadsheets
  // Source of truth: config.spreadsheets array → fall back to single spreadsheetId → empty
  const configuredSheets = (() => {
    if (!integration) return []
    const cfg = integration.config || {}
    if (Array.isArray(cfg.spreadsheets) && cfg.spreadsheets.length > 0) {
      return cfg.spreadsheets
    }
    if (cfg.spreadsheetId) {
      return [{
        spreadsheetId: cfg.spreadsheetId,
        displayName:   cfg.selectedFileName || cfg.spreadsheetId,
        syncMode:      cfg.syncMode  || 'single',
        sheetName:     cfg.sheetName || '',
        updatedAt:     integration.syncSettings?.lastSyncAt || null,
      }]
    }
    return []
  })()

  // ── Per-sheet sync ─────────────────────────────────────────────────────────
  const syncOneMutation = useMutation({
    mutationFn: (targetSpreadsheetId) =>
      api.post('/integrations/google_sheets/sync', { targetSpreadsheetId }).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.message || 'Sheet synced')
      qc.invalidateQueries(['integrations'])
      qc.invalidateQueries(['gsheet-contexts'])
      setSyncingSheetId(null)
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || 'Sync failed')
      setSyncingSheetId(null)
    },
  })

  // ── Per-sheet remove ───────────────────────────────────────────────────────
  const removeOneMutation = useMutation({
    mutationFn: (spreadsheetId) =>
      api.delete(`/integrations/google_sheets/config/${encodeURIComponent(spreadsheetId)}`).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.message || 'Spreadsheet removed')
      qc.invalidateQueries(['integrations'])
      qc.invalidateQueries(['gsheet-contexts'])
      setRemovingSheetId(null)
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || 'Remove failed')
      setRemovingSheetId(null)
    },
  })

  const handleSyncOne = (spreadsheetId) => {
    setSyncingSheetId(spreadsheetId)
    syncOneMutation.mutate(spreadsheetId)
  }

  const handleRemoveOne = (spreadsheetId) => {
    setRemovingSheetId(spreadsheetId)
    removeOneMutation.mutate(spreadsheetId)
  }

  // ── Per-sheet pipeline assignment ──────────────────────────────────────────
  const pipelineMutation = useMutation({
    mutationFn: ({ sheet, pipelineId }) =>
      api.post('/integrations/google_sheets/config', {
        spreadsheetId:    sheet.spreadsheetId,
        sheetName:        sheet.sheetName,
        selectedFileName: sheet.displayName,
        syncMode:         sheet.syncMode,
        // Pass the new pipelineId (or undefined to preserve existing if cleared)
        ...(pipelineId ? { pipelineId } : { pipelineId: null }),
      }).then(r => r.data),
    onSuccess: (_, { sheet }) => {
      toast.success('Pipeline saved')
      qc.invalidateQueries(['integrations'])
      qc.invalidateQueries(['gsheet-contexts'])
      setSavingPipelineId(null)
    },
    onError: (e, { sheet }) => {
      toast.error(e?.response?.data?.message || 'Failed to save pipeline')
      setSavingPipelineId(null)
    },
  })

  const handlePipelineChange = (sheet, pipelineId) => {
    setSavingPipelineId(sheet.spreadsheetId)
    pipelineMutation.mutate({ sheet, pipelineId })
  }

  // ── Sync all (sequential) ──────────────────────────────────────────────────
  const handleSyncAll = async () => {
    if (!configuredSheets.length) return
    setSyncingAll(true)
    let failed = 0
    for (const sheet of configuredSheets) {
      try {
        await api.post('/integrations/google_sheets/sync', { targetSpreadsheetId: sheet.spreadsheetId })
      } catch {
        failed++
      }
    }
    setSyncingAll(false)
    qc.invalidateQueries(['integrations'])
    qc.invalidateQueries(['gsheet-contexts'])
    if (failed === 0) toast.success('All sheets synced successfully')
    else toast.error(`${failed} sheet(s) failed to sync`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3.5">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: '#0F9D5818', border: '1px solid #0F9D5830' }}
        >
          📗
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold leading-snug">
              {config?.name || 'Google Sheets'}
            </h3>
            <StatusBadge status={integration?.status} />
          </div>
          {integration?.config?.connectedEmail ? (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {integration.config.connectedEmail}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
              {config?.description || 'Import leads directly from Google Sheets'}
            </p>
          )}
        </div>

        {/* Three-dot menu for disconnect */}
        {!readOnly && integration && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-0.5">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm min-w-[180px]">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                onClick={() => onDisconnect?.()}
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect Google Sheets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Not connected / disconnected / failed → connect / reconnect button ──
           Covers: no document, status=disconnected, status=failed, status=pending.
           Note: status=expired is handled separately below (shows sheets + reconnect). ── */}
      {!isConnected && !isExpired && !readOnly && (
        <Button className="w-full gap-2 h-8 text-sm" onClick={() => onAddSheet?.()}>
          <Plus className="w-3.5 h-3.5" />
          {integration ? 'Reconnect Google Sheets' : 'Connect Google Sheets'}
        </Button>
      )}

      {/* ── Token expired warning + reconnect button ── */}
      {isExpired && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Google token expired. Please reconnect to resume syncing.
          </div>
          {!readOnly && (
            <Button className="w-full gap-2 h-8 text-sm" onClick={() => onAddSheet?.()}>
              <Plus className="w-3.5 h-3.5" />
              Reconnect Google Sheets
            </Button>
          )}
        </div>
      )}

      {/* ── Sync error warning ── */}
      {isSyncError && !isExpired && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Last sync encountered errors. Try syncing again.
        </div>
      )}

      {/* ── Connected spreadsheets list ── */}
      {configuredSheets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
            Connected Spreadsheets
          </p>
          <div className="space-y-1.5">
            {configuredSheets.map(sheet => (
              <SheetRow
                key={sheet.spreadsheetId}
                sheet={sheet}
                isSyncing={syncingSheetId === sheet.spreadsheetId}
                isRemoving={removingSheetId === sheet.spreadsheetId}
                isSavingPipeline={savingPipelineId === sheet.spreadsheetId}
                readOnly={readOnly}
                pipelines={pipelines}
                onSync={() => handleSyncOne(sheet.spreadsheetId)}
                onChange={() => onChangeSheet?.(sheet)}
                onRemove={() => handleRemoveOne(sheet.spreadsheetId)}
                onPipelineChange={(pipelineId) => handlePipelineChange(sheet, pipelineId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom actions (only when connected) ── */}
      {isConnected && !readOnly && (
        <div className="flex flex-col gap-1.5 pt-0.5 border-t border-border/60 mt-0.5">
          <Button
            variant="outline"
            className="w-full gap-2 h-8 text-xs"
            onClick={() => onAddSheet?.()}
          >
            <Plus className="w-3 h-3" />
            Connect Another Sheet
          </Button>
          {configuredSheets.length > 1 && (
            <Button
              variant="ghost"
              className="w-full gap-1.5 h-7 text-[10px] text-muted-foreground"
              disabled={syncingAll}
              onClick={handleSyncAll}
            >
              <RefreshCw className={cn('w-3 h-3', syncingAll && 'animate-spin')} />
              {syncingAll ? 'Syncing All…' : 'Sync All Sheets'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
