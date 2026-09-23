import { useMemo } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Users, TrendingUp, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getToken } from '@/services/api'

// ── Inline Leads list via iframe-like component or embed
// We reuse Leads.jsx logic by rendering a filtered version of the lead list
// using the same API calls with stream filter params passed via searchParams.
// The actual lead table/cards are rendered by EmbeddedLeadsList below.

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
  return s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || ''
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function KpiCards({ stats, loading }) {
  const kpis = [
    {
      label: 'Total Leads',
      value: stats?.total ?? 0,
      icon: Users,
      color: 'text-foreground',
      bg: 'bg-muted/50',
    },
    {
      label: 'New',
      value: stats?.new ?? 0,
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Contacted',
      value: stats?.contacted ?? 0,
      icon: BarChart3,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
    {
      label: 'Won',
      value: stats?.won ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      label: 'Lost',
      value: stats?.lost ?? 0,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50 dark:bg-red-950/30',
    },
    {
      label: 'Pipeline Value',
      value: stats?.totalValue
        ? `₹${(stats.totalValue / 100000).toFixed(1)}L`
        : '₹0',
      icon: BarChart3,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.label} className={cn('border', kpi.bg)}>
            <CardContent className="p-3">
              {loading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <p className={cn('text-xl font-bold', kpi.color)}>{kpi.value}</p>
              )}
              <div className="flex items-center gap-1 mt-0.5">
                <Icon className={cn('w-3 h-3', kpi.color)} />
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Status Breakdown ──────────────────────────────────────────────────────────
function StatusBreakdown({ byStatus }) {
  if (!byStatus?.length) return null

  const STATUS_COLORS = {
    new_lead:       'bg-blue-500',
    contacted:      'bg-purple-500',
    discovery_call: 'bg-indigo-500',
    proposal_sent:  'bg-yellow-500',
    negotiation:    'bg-orange-500',
    won:            'bg-emerald-500',
    lost:           'bg-red-500',
    archived:       'bg-gray-400',
  }

  const total = byStatus.reduce((s, b) => s + b.count, 0)

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold mb-3">Status Breakdown</p>
        <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
          {byStatus.map((b) => (
            <div
              key={b._id}
              className={cn('rounded-full', STATUS_COLORS[b._id] || 'bg-gray-400')}
              style={{ width: `${((b.count / total) * 100).toFixed(1)}%` }}
              title={`${fmtLabel(b._id)}: ${b.count}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {byStatus.map((b) => (
            <div key={b._id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_COLORS[b._id] || 'bg-gray-400')} />
                <span className="text-muted-foreground">{fmtLabel(b._id)}</span>
              </div>
              <span className="font-medium">{b.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LeadStreamDashboard() {
  const { streamType, streamKey } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Resolve display name
  const streamName = searchParams.get('name') || fmtLabel(decodeURIComponent(streamKey || ''))

  // Build filter query string to pass down to the embedded leads view
  const filterParams = useMemo(() => {
    const p = new URLSearchParams()
    const metaFormId     = searchParams.get('metaFormId')
    const sheetName      = searchParams.get('sheetName')
    const source         = searchParams.get('source')
    const campaignId     = searchParams.get('campaignId')
    const externalSource = searchParams.get('externalSource')

    if (metaFormId)     p.set('metaFormId', metaFormId)
    if (sheetName)      p.set('sheetName', sheetName)
    if (source)         p.set('source', source)
    if (campaignId)     p.set('campaignId', campaignId)
    if (externalSource) p.set('externalSource', externalSource)

    return p
  }, [searchParams])

  // Fetch stream-level stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stream-stats-by-filter', filterParams.toString()],
    queryFn: () =>
      apiFetch(`/api/lead-streams/stats-by-filter?${filterParams}`).then(d => d.data),
    staleTime: 30000,
    enabled: filterParams.toString().length > 0,
  })

  // Build URL for "View Leads" — opens Leads page with stream filter pre-applied
  const leadsUrl = `/crm-leads?${filterParams}&streamName=${encodeURIComponent(streamName)}&streamType=${streamType}`

  // Type badge
  const TYPE_LABELS = {
    meta_form: { label: 'Meta Ad Form', icon: '⚡', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
    sheet_tab: { label: 'Google Sheet Tab', icon: '📊', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
    source:    { label: 'Source', icon: '🌐', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
    campaign:  { label: 'Campaign', icon: '📢', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
    custom:    { label: 'Custom', icon: '🔧', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  }
  const typeMeta = TYPE_LABELS[streamType] || TYPE_LABELS.custom

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link
          to="/leads/sources"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Lead Sources
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl" aria-hidden>{typeMeta.icon}</span>
              <h1 className="text-xl font-bold">{streamName}</h1>
              <Badge className={typeMeta.color}>{typeMeta.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {statsLoading
                ? 'Loading…'
                : `${stats?.total ?? 0} leads in this source`}
            </p>
          </div>
          <Button onClick={() => navigate(leadsUrl)} size="sm">
            <Users className="w-4 h-4 mr-1.5" />
            Manage Leads
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards stats={stats} loading={statsLoading} />

      {/* Status breakdown */}
      {!statsLoading && stats?.byStatus?.length > 0 && (
        <StatusBreakdown byStatus={stats.byStatus} />
      )}

      {/* CTA to open the full leads list filtered to this stream */}
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            View and manage all <strong>{stats?.total ?? '…'}</strong> leads from{' '}
            <strong>{streamName}</strong> — with full filters, pipeline, stages, notes, and follow-ups.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate(leadsUrl)}>
              <Users className="w-4 h-4 mr-1.5" />
              View All Leads
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/pipeline?${filterParams}&streamName=${encodeURIComponent(streamName)}`)}
            >
              View Pipeline
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter summary (debug / transparency) */}
      {filterParams.toString() && (
        <div className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">
          <span className="font-medium">Active filter: </span>
          {Array.from(filterParams.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join(' · ')}
        </div>
      )}
    </div>
  )
}
