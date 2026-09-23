import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Users, Zap, Sheet, Globe, Pin, ChevronRight,
  BarChart3, RefreshCw,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { getToken } from '@/services/api'

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

function fmtLabel(s) {
  return s
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()) || ''
}

const SOURCE_ICONS = {
  meta_form:  { icon: '⚡', label: 'Meta Ad Forms',    color: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' },
  sheet_tab:  { icon: '📊', label: 'Google Sheet Tabs', color: 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' },
  source:     { icon: '🌐', label: 'Other Sources',     color: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800' },
}

// ── Stream Card ────────────────────────────────────────────────────────────────
function StreamCard({ stream, filterType, onNavigate }) {
  const meta = SOURCE_ICONS[filterType] || SOURCE_ICONS.source

  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        'w-full text-left rounded-xl border p-4 transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] cursor-pointer',
        meta.color
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl shrink-0 mt-0.5" aria-hidden>
            {stream.icon || meta.icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">
              {stream.name || fmtLabel(stream.filterId)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {filterType === 'meta_form'  && 'Meta Lead Form'}
              {filterType === 'sheet_tab'  && 'Google Sheet Tab'}
              {filterType === 'source'     && fmtLabel(stream.filterId) + ' source'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xl font-bold">{stream.count ?? stream.counts?.total ?? 0}</span>
          <span className="text-xs text-muted-foreground">leads</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {stream.counts && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="text-emerald-600 font-medium">{stream.counts.won} won</span>
            <span className="text-red-500 font-medium">{stream.counts.lost} lost</span>
          </div>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
      </div>
    </button>
  )
}

// ── Section ────────────────────────────────────────────────────────────────────
function StreamSection({ title, streams, filterType, onNavigate }) {
  if (!streams?.length) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base" aria-hidden>{SOURCE_ICONS[filterType]?.icon}</span>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h2>
        <Badge variant="outline" className="ml-auto">{streams.length}</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {streams.map((s) => (
          <StreamCard
            key={`${filterType}-${s.filterId}`}
            stream={s}
            filterType={filterType}
            onNavigate={() => onNavigate(filterType, s)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Saved Streams Section ─────────────────────────────────────────────────────
function SavedStreamsSection({ streams, onNavigate }) {
  if (!streams?.length) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Pin className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Pinned / Saved Dashboards
        </h2>
        <Badge variant="outline" className="ml-auto">{streams.length}</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {streams.map((s) => (
          <StreamCard
            key={s._id}
            stream={{ ...s, filterId: s._id, count: s.counts?.total }}
            filterType={s.filterType}
            onNavigate={() => onNavigate(s.filterType, {
              filterId: s._id,
              name: s.name,
              filter: s.filter,
              savedStreamId: s._id,
            })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LeadSources() {
  const navigate = useNavigate()

  // Saved stream configs
  const { data: savedData, isLoading: savedLoading, refetch: refetchSaved } = useQuery({
    queryKey: ['lead-streams'],
    queryFn: () => apiFetch('/api/lead-streams').then(d => d.data || []),
    staleTime: 30000,
  })

  // Auto-discovered streams from lead data
  const { data: discovered, isLoading: discoverLoading, refetch: refetchDiscover } = useQuery({
    queryKey: ['lead-streams-discover'],
    queryFn: () => apiFetch('/api/lead-streams/discover').then(d => d.data),
    staleTime: 30000,
  })

  const isLoading = savedLoading || discoverLoading

  // Build filter params and navigate to the stream dashboard
  const handleNavigate = (filterType, stream) => {
    // If this is a saved stream with an ID, navigate via savedStreamId
    if (stream.savedStreamId) {
      navigate(`/leads/sources/${filterType}/${encodeURIComponent(stream.savedStreamId)}?saved=1`)
      return
    }
    // Otherwise pass the raw filter criteria as query params
    const params = new URLSearchParams({ name: stream.name || stream.filterId })
    const f = stream.filter || {}
    if (f.metaFormId)  params.set('metaFormId', f.metaFormId)
    if (f.sheetName)   params.set('sheetName', f.sheetName)
    if (f.source)      params.set('source', f.source)
    if (f.campaignId)  params.set('campaignId', f.campaignId)
    navigate(`/leads/sources/${filterType}/${encodeURIComponent(stream.filterId)}?${params}`)
  }

  const handleRefresh = () => {
    refetchSaved()
    refetchDiscover()
  }

  const saved = savedData || []
  const meta  = discovered?.meta_forms || []
  const tabs  = discovered?.sheet_tabs || []
  const srcs  = discovered?.sources    || []

  // Total across all auto-discovered streams
  const totalLeads = [
    ...meta.map(s => s.count),
    ...tabs.map(s => s.count),
    ...srcs.map(s => s.count),
  ].reduce((a, b) => a + b, 0)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Lead Sources
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? 'Loading source dashboards…'
              : `${meta.length + tabs.length + srcs.length} active source${(meta.length + tabs.length + srcs.length) !== 1 ? 's' : ''} · ${totalLeads.toLocaleString()} total leads`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/crm-leads')}
          >
            <Users className="w-4 h-4 mr-1.5" />
            All Leads
          </Button>
          <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh">
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i}>
              <Skeleton className="h-4 w-32 mb-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2].map(j => <Skeleton key={j} className="h-24 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {!isLoading && (
        <div className="space-y-8">
          {/* Pinned / saved streams first */}
          {saved.length > 0 && (
            <SavedStreamsSection streams={saved} onNavigate={handleNavigate} />
          )}

          {/* Auto-discovered sections */}
          <StreamSection
            title="Meta Ad Forms"
            streams={meta}
            filterType="meta_form"
            onNavigate={handleNavigate}
          />
          <StreamSection
            title="Google Sheet Tabs"
            streams={tabs}
            filterType="sheet_tab"
            onNavigate={handleNavigate}
          />
          <StreamSection
            title="Other Sources"
            streams={srcs}
            filterType="source"
            onNavigate={handleNavigate}
          />

          {/* Empty state */}
          {meta.length === 0 && tabs.length === 0 && srcs.length === 0 && saved.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No lead sources found</p>
              <p className="text-sm mt-1">
                Add leads via Meta integration, Google Sheets sync, or manually — they'll appear here automatically.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
