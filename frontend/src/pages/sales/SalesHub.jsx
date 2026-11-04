'use client'
import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Plus, Search, Filter, LayoutGrid, List,
  RefreshCw, ChevronDown, X, DollarSign, Users, Target,
  CheckCircle2, XCircle, Clock, AlertCircle, BarChart3,
  ArrowUpRight, Calendar, Building2, Phone, Mail,
  MoreVertical, Edit3, Trash2, Eye,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { toast } from 'react-hot-toast'
import api from '@/services/api'

// ─── constants ────────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'new_prospect',      label: 'New Prospect',       color: 'bg-slate-500',  text: 'text-slate-700',   badge: 'bg-slate-100' },
  { key: 'contacted',         label: 'Contacted',          color: 'bg-blue-500',   text: 'text-blue-700',    badge: 'bg-blue-100'  },
  { key: 'meeting_scheduled', label: 'Meeting Scheduled',  color: 'bg-indigo-500', text: 'text-indigo-700',  badge: 'bg-indigo-100'},
  { key: 'proposal_sent',     label: 'Proposal Sent',      color: 'bg-violet-500', text: 'text-violet-700',  badge: 'bg-violet-100'},
  { key: 'negotiation',       label: 'Negotiation',        color: 'bg-amber-500',  text: 'text-amber-700',   badge: 'bg-amber-100' },
  { key: 'won',               label: 'Won',                color: 'bg-green-500',  text: 'text-green-700',   badge: 'bg-green-100' },
  { key: 'lost',              label: 'Lost',               color: 'bg-red-500',    text: 'text-red-700',     badge: 'bg-red-100'   },
]

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))

const LOST_REASONS = [
  { value: 'budget_constraints',   label: 'Budget Constraints' },
  { value: 'went_with_competitor', label: 'Went with Competitor' },
  { value: 'no_response',          label: 'No Response' },
  { value: 'service_mismatch',     label: 'Service Mismatch' },
  { value: 'project_delayed',      label: 'Project Delayed' },
  { value: 'out_of_scope',         label: 'Out of Scope' },
  { value: 'other',                label: 'Other' },
]

const SERVICES = [
  { value: 'ads_management',        label: 'Ads Management' },
  { value: 'website_development',   label: 'Website Development' },
  { value: 'digital_marketing',     label: 'Digital Marketing' },
  { value: 'seo',                   label: 'SEO' },
  { value: 'social_media_management', label: 'Social Media Management' },
  { value: 'performance_marketing', label: 'Performance Marketing' },
]

const LEAD_SOURCES = [
  { value: 'website',          label: 'Website' },
  { value: 'referral',         label: 'Referral' },
  { value: 'social_media',     label: 'Social Media' },
  { value: 'cold_call',        label: 'Cold Call' },
  { value: 'email',            label: 'Email' },
  { value: 'event',            label: 'Event' },
  { value: 'whatsapp',         label: 'WhatsApp' },
  { value: 'networking',       label: 'Networking' },
  { value: 'existing_client',  label: 'Existing Client' },
  { value: 'other',            label: 'Other' },
]

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(n) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0) }
function fmtCur(n) { return `₹${fmt(n)}` }

function StageBadge({ stage }) {
  const s = STAGE_MAP[stage]
  if (!s) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.badge} ${s.text}`}>
      {s.label}
    </span>
  )
}

// ─── API calls ────────────────────────────────────────────────────────────────
const fetchDashboard  = () => api.get('/sales/dashboard').then(r => r.data.data)
const fetchKanban     = () => api.get('/sales/kanban').then(r => r.data.data)
const fetchProspects  = (params) => api.get('/sales', { params }).then(r => r.data)
const fetchReports    = (params) => api.get('/sales/reports', { params }).then(r => r.data.data)
const fetchSalespeople = () => api.get('/sales/salespeople').then(r => r.data.data)

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon: Icon, color = 'text-primary' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-muted ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading } = useQuery({ queryKey: ['sales-dashboard'], queryFn: fetchDashboard, staleTime: 60_000 })

  if (isLoading) return <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  if (!data) return null

  const kpis = data.kpis || {}
  const stageDistrib = (data.stageDistribution || []).map(s => ({
    name: STAGE_MAP[s._id]?.label || s._id,
    count: s.count,
    value: s.totalValue,
  }))
  const monthlyTrend = (data.monthlyTrend || []).map(m => ({
    name: `${m._id?.month}/${m._id?.year}`,
    prospects: m.count,
    value: m.totalValue,
  }))
  const sourceBreakdown = (data.sourceBreakdown || []).map(s => ({
    name: LEAD_SOURCES.find(l => l.value === s._id)?.label || s._id,
    count: s.count,
  }))
  const upcoming = data.upcomingFollowUps || []
  const overdueCount = data.overdueFollowUps || 0

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total Prospects" value={fmt(kpis.totalProspects)} icon={Users} />
        <KpiCard title="Active Deals" value={fmt(kpis.activeDeals)} sub="In pipeline" icon={Target} color="text-blue-600" />
        <KpiCard title="Total Pipeline Value" value={fmtCur(kpis.totalPipelineValue)} icon={DollarSign} color="text-violet-600" />
        <KpiCard title="Won This Month" value={fmt(kpis.wonThisMonth)} sub={fmtCur(kpis.wonValueThisMonth)} icon={CheckCircle2} color="text-green-600" />
        <KpiCard title="Lost This Month" value={fmt(kpis.lostThisMonth)} icon={XCircle} color="text-red-600" />
        <KpiCard title="Avg Deal Value" value={fmtCur(kpis.avgDealValue)} icon={BarChart3} color="text-amber-600" />
        <KpiCard title="Win Rate" value={`${kpis.winRate || 0}%`} icon={TrendingUp} color="text-indigo-600" />
        <KpiCard title="Overdue Follow-ups" value={fmt(overdueCount)} icon={AlertCircle} color="text-orange-600" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stage distribution bar */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Pipeline Stage Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stageDistrib} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, n) => [n === 'value' ? fmtCur(v) : v, n === 'value' ? 'Value' : 'Count']} />
              <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly trend area */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Monthly Prospect Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gProspect" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="prospects" stroke="#6366f1" fill="url(#gProspect)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Source breakdown pie */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Lead Source Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={sourceBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {sourceBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming follow-ups */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming Follow-ups</h3>
          {upcoming.length === 0
            ? <p className="text-sm text-muted-foreground">No upcoming follow-ups</p>
            : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {upcoming.map(f => (
                  <div key={f._id} className="flex items-start gap-2 text-xs">
                    <Clock className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-foreground">{f.prospectId?.companyName || '—'}</span>
                      <span className="text-muted-foreground ml-1">· {f.title}</span>
                      <div className="text-muted-foreground">{f.scheduledAt ? format(parseISO(f.scheduledAt), 'dd MMM, hh:mm a') : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

// ─── Kanban card ─────────────────────────────────────────────────────────────
function KanbanCard({ prospect, onDragStart, onNavigate }) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, prospect._id)}
      className="bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="text-sm font-semibold text-foreground leading-tight truncate">{prospect.companyName}</span>
        <button
          onClick={() => onNavigate(prospect._id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-opacity shrink-0"
        >
          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{prospect.contactPerson}</p>
      {prospect.estimatedDealValue > 0 && (
        <div className="flex items-center gap-1 text-xs font-medium text-green-600 mb-1.5">
          <DollarSign className="w-3 h-3" />
          {fmtCur(prospect.estimatedDealValue)}
        </div>
      )}
      {prospect.nextFollowUpDate && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <Clock className="w-3 h-3" />
          {format(parseISO(prospect.nextFollowUpDate), 'dd MMM')}
        </div>
      )}
    </div>
  )
}

// ─── Kanban Tab ───────────────────────────────────────────────────────────────
function KanbanTab({ onNavigate }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['sales-kanban'], queryFn: fetchKanban, staleTime: 30_000 })

  const dragItem = useRef(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  const changeStage = useMutation({
    mutationFn: ({ id, stage, lostReason }) =>
      api.patch(`/sales/${id}/stage`, { stage, lostReason }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-kanban'] }); qc.invalidateQueries({ queryKey: ['sales-dashboard'] }) },
    onError: (err) => toast.error(err.response?.data?.message || 'Stage change failed'),
  })

  const [pendingMove, setPendingMove] = useState(null) // { id, toStage }
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')

  function handleDragStart(e, id) {
    dragItem.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e, toStage) {
    e.preventDefault()
    const id = dragItem.current
    dragItem.current = null
    setDragOverStage(null)
    if (!id) return
    if (toStage === 'lost') {
      setPendingMove({ id, toStage })
      setLostReason('')
      setLostNotes('')
      return
    }
    changeStage.mutate({ id, stage: toStage })
  }

  function confirmLost() {
    if (!lostReason) { toast.error('Select a lost reason'); return }
    changeStage.mutate({ id: pendingMove.id, stage: 'lost', lostReason, lostNotes })
    setPendingMove(null)
  }

  if (isLoading) return <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  const columns = data || {}

  return (
    <>
      {/* Lost reason modal */}
      {pendingMove && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-4">Mark as Lost</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Lost Reason *</label>
                <select
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select reason…</option>
                  {LOST_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Notes</label>
                <textarea
                  value={lostNotes}
                  onChange={e => setLostNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Optional notes…"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setPendingMove(null)} className="flex-1 border border-border rounded-lg py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={confirmLost} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 transition-colors">Confirm Lost</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
        {STAGES.map(stage => {
          const cards = columns[stage.key] || []
          const isDragOver = dragOverStage === stage.key
          return (
            <div
              key={stage.key}
              className={`flex-shrink-0 w-64 rounded-xl border flex flex-col transition-colors ${isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/40'}`}
              onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key) }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={e => handleDrop(e, stage.key)}
            >
              {/* column header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <span className="text-sm font-semibold text-foreground">{stage.label}</span>
                </div>
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">{cards.length}</span>
              </div>
              {/* cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                {cards.map(p => (
                  <KanbanCard key={p._id} prospect={p} onDragStart={handleDragStart} onNavigate={onNavigate} />
                ))}
                {cards.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Drop here</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Prospect row (list view) ─────────────────────────────────────────────────
function ProspectRow({ prospect, onNavigate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-foreground text-sm">{prospect.companyName}</div>
        <div className="text-xs text-muted-foreground">{prospect.contactPerson}</div>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="w-3 h-3" />{prospect.phone || '—'}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <Mail className="w-3 h-3" />{prospect.email || '—'}
        </div>
      </td>
      <td className="px-4 py-3"><StageBadge stage={prospect.stage} /></td>
      <td className="px-4 py-3 hidden md:table-cell text-sm text-foreground">{fmtCur(prospect.estimatedDealValue)}</td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
        {prospect.nextFollowUpDate ? format(parseISO(prospect.nextFollowUpDate), 'dd MMM yyyy') : '—'}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
        {prospect.assignedSalesperson?.name || '—'}
      </td>
      <td className="px-4 py-3 text-right relative">
        <button onClick={() => setMenuOpen(o => !o)} className="p-1.5 rounded hover:bg-accent transition-colors">
          <MoreVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        {menuOpen && (
          <div className="absolute right-4 top-10 z-20 bg-popover border border-border rounded-lg shadow-lg w-36 py-1" onMouseLeave={() => setMenuOpen(false)}>
            <button onClick={() => { setMenuOpen(false); onNavigate(prospect._id) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-foreground">
              <Eye className="w-4 h-4" /> View
            </button>
            <button onClick={() => { setMenuOpen(false); onNavigate(prospect._id) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-foreground">
              <Edit3 className="w-4 h-4" /> Edit
            </button>
            <button onClick={() => { setMenuOpen(false); onDelete(prospect._id) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-red-600">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Prospects Tab ────────────────────────────────────────────────────────────
function ProspectsTab({ onNavigate, onCreate }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [page, setPage] = useState(1)

  const params = { search: search || undefined, stage: stageFilter || undefined, page, limit: 20 }
  const { data, isLoading } = useQuery({
    queryKey: ['sales-prospects', params],
    queryFn: () => fetchProspects(params),
    staleTime: 30_000,
  })

  const deleteProspect = useMutation({
    mutationFn: id => api.delete(`/sales/${id}`),
    onSuccess: () => { toast.success('Prospect deleted'); qc.invalidateQueries({ queryKey: ['sales-prospects'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Delete failed'),
  })

  const prospects = data?.data || []
  const pagination = data?.pagination || {}

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search company or contact…"
              className="pl-9 pr-3 py-1.5 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-56"
            />
          </div>
          <select
            value={stageFilter}
            onChange={e => { setStageFilter(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Prospect
        </button>
      </div>

      {/* table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading
          ? <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-border">
                  <tr className="bg-muted/50">
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Company</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Contact</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Stage</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Deal Value</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Follow-up</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Salesperson</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {prospects.length === 0
                    ? (
                      <tr><td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">No prospects found</td></tr>
                    )
                    : prospects.map(p => (
                      <ProspectRow
                        key={p._id}
                        prospect={p}
                        onNavigate={onNavigate}
                        onDelete={id => { if (window.confirm('Delete this prospect?')) deleteProspect.mutate(id) }}
                      />
                    ))
                  }
                </tbody>
              </table>
            </div>
          )
        }
        {/* pagination */}
        {pagination.total > 20 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">
              {pagination.total} prospects · page {page} of {Math.ceil(pagination.total / 20)}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border border-border rounded-lg disabled:opacity-40 hover:bg-accent transition-colors">Prev</button>
              <button disabled={page * 20 >= pagination.total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border border-border rounded-lg disabled:opacity-40 hover:bg-accent transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reports Tab ──────────────────────────────────────────────────────────────
function ReportsTab() {
  const [period, setPeriod] = useState('month')
  const [year, setYear] = useState(new Date().getFullYear())

  const { data, isLoading } = useQuery({
    queryKey: ['sales-reports', period, year],
    queryFn: () => fetchReports({ period, year }),
    staleTime: 60_000,
  })

  const summary = data?.summary || {}
  const wonDeals = data?.wonDeals || []
  const lostBreakdown = data?.lostBreakdown || []
  const salespersonPerf = data?.salespersonPerformance || []
  const serviceBreakdown = data?.serviceBreakdown || []

  return (
    <div className="space-y-6">
      {/* filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={period} onChange={e => setPeriod(e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="year">This Year</option>
          <option value="all">All Time</option>
        </select>
        {period === 'year' && (
          <input type="number" value={year} onChange={e => setYear(+e.target.value)} className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-24" />
        )}
      </div>

      {isLoading
        ? <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        : (
          <>
            {/* summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard title="Total Prospects" value={fmt(summary.total)} icon={Users} />
              <KpiCard title="Won" value={`${fmt(summary.won)} (${summary.winRate || 0}%)`} icon={CheckCircle2} color="text-green-600" />
              <KpiCard title="Lost" value={fmt(summary.lost)} icon={XCircle} color="text-red-600" />
              <KpiCard title="Won Revenue" value={fmtCur(summary.wonRevenue)} icon={DollarSign} color="text-violet-600" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Salesperson performance */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Salesperson Performance</h3>
                {salespersonPerf.length === 0
                  ? <p className="text-sm text-muted-foreground">No data</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={salespersonPerf} layout="vertical" margin={{ left: 30, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="won" fill="#22c55e" name="Won" radius={[0,4,4,0]} stackId="a" />
                        <Bar dataKey="lost" fill="#ef4444" name="Lost" radius={[0,4,4,0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>

              {/* Lost reason breakdown */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Lost Reason Breakdown</h3>
                {lostBreakdown.length === 0
                  ? <p className="text-sm text-muted-foreground">No lost deals in this period</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={lostBreakdown.map(l => ({ name: LOST_REASONS.find(r => r.value === l._id)?.label || l._id, value: l.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                          {lostBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                }
              </div>

              {/* Service popularity */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Most Interested Services</h3>
                {serviceBreakdown.length === 0
                  ? <p className="text-sm text-muted-foreground">No data</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={serviceBreakdown.map(s => ({ name: SERVICES.find(sv => sv.value === s._id)?.label || s._id, count: s.count }))} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>

              {/* Won deals table */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Won Deals</h3>
                {wonDeals.length === 0
                  ? <p className="text-sm text-muted-foreground">No won deals in this period</p>
                  : (
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border">
                          <th className="pb-1 text-left text-muted-foreground font-medium">Company</th>
                          <th className="pb-1 text-right text-muted-foreground font-medium">Value</th>
                          <th className="pb-1 text-right text-muted-foreground font-medium">Won</th>
                        </tr></thead>
                        <tbody className="divide-y divide-border">
                          {wonDeals.map(d => (
                            <tr key={d._id}>
                              <td className="py-1.5 font-medium text-foreground">{d.companyName}</td>
                              <td className="py-1.5 text-right text-green-600 font-medium">{fmtCur(d.estimatedDealValue)}</td>
                              <td className="py-1.5 text-right text-muted-foreground">{d.wonAt ? format(parseISO(d.wonAt), 'dd MMM yy') : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </div>
            </div>
          </>
        )
      }
    </div>
  )
}

// ─── Create Prospect Form (modal) ──────────────────────────────────────────────
function CreateProspectModal({ open, onClose, onCreated }) {
  const qc = useQueryClient()
  const { data: salespeople = [] } = useQuery({ queryKey: ['salespeople'], queryFn: fetchSalespeople, staleTime: 300_000 })

  const [form, setForm] = useState({
    companyName: '', contactPerson: '', phone: '', email: '', website: '',
    industry: '', businessLocation: '', interestedServices: [],
    dealType: 'monthly_retainer', estimatedDealValue: '', expectedClosingDate: '',
    assignedSalesperson: '', leadSource: 'other',
    nextFollowUpDate: '', followUpTime: '', followUpNotes: '',
    notes: '', remarks: '',
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleService(val) {
    setForm(f => ({
      ...f,
      interestedServices: f.interestedServices.includes(val)
        ? f.interestedServices.filter(s => s !== val)
        : [...f.interestedServices, val],
    }))
  }

  const create = useMutation({
    mutationFn: (body) => api.post('/sales', body).then(r => r.data),
    onSuccess: (d) => {
      toast.success('Prospect created')
      qc.invalidateQueries({ queryKey: ['sales-kanban'] })
      qc.invalidateQueries({ queryKey: ['sales-prospects'] })
      qc.invalidateQueries({ queryKey: ['sales-dashboard'] })
      onCreated?.(d.data?._id)
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to create prospect'),
  })

  function submit(e) {
    e.preventDefault()
    const body = {
      ...form,
      estimatedDealValue: form.estimatedDealValue ? +form.estimatedDealValue : 0,
      assignedSalesperson: form.assignedSalesperson || undefined,
      expectedClosingDate: form.expectedClosingDate || undefined,
      nextFollowUpDate: form.nextFollowUpDate || undefined,
    }
    create.mutate(body)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">New Prospect</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-accent transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-5">
          {/* Company info */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Company Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Company Name *', key: 'companyName', required: true },
                { label: 'Contact Person *', key: 'contactPerson', required: true },
                { label: 'Phone', key: 'phone' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Website', key: 'website' },
                { label: 'Industry', key: 'industry' },
                { label: 'Location', key: 'businessLocation' },
              ].map(f => (
                <div key={f.key} className={f.key === 'businessLocation' ? 'sm:col-span-2' : ''}>
                  <label className="text-xs font-medium text-foreground">{f.label}</label>
                  <input
                    type={f.type || 'text'}
                    value={form[f.key]}
                    onChange={e => set(f.key, e.target.value)}
                    required={f.required}
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Sales info */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sales Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Deal Type</label>
                <select value={form.dealType} onChange={e => set('dealType', e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="monthly_retainer">Monthly Retainer</option>
                  <option value="one_time_project">One-time Project</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Lead Source</label>
                <select value={form.leadSource} onChange={e => set('leadSource', e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  {LEAD_SOURCES.map(ls => <option key={ls.value} value={ls.value}>{ls.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Est. Deal Value (₹)</label>
                <input type="number" value={form.estimatedDealValue} onChange={e => set('estimatedDealValue', e.target.value)} min="0" className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Expected Closing Date</label>
                <input type="date" value={form.expectedClosingDate} onChange={e => set('expectedClosingDate', e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Assigned Salesperson</label>
                <select value={form.assignedSalesperson} onChange={e => set('assignedSalesperson', e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Unassigned</option>
                  {salespeople.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {/* services */}
            <div className="mt-3">
              <label className="text-xs font-medium text-foreground">Interested Services</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SERVICES.map(svc => (
                  <button
                    key={svc.value}
                    type="button"
                    onClick={() => toggleService(svc.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.interestedServices.includes(svc.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}
                  >
                    {svc.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Follow-up info */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Follow-up</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Next Follow-up Date</label>
                <input type="date" value={form.nextFollowUpDate} onChange={e => set('nextFollowUpDate', e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Follow-up Time</label>
                <input type="time" value={form.followUpTime} onChange={e => set('followUpTime', e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-foreground">Follow-up Notes</label>
                <textarea value={form.followUpNotes} onChange={e => set('followUpNotes', e.target.value)} rows={2} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Remarks</label>
                <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)} rows={3} className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-border rounded-lg py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">Cancel</button>
            <button type="submit" disabled={create.isPending} className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {create.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
              Create Prospect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main SalesHub ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'kanban',    label: 'Kanban Board' },
  { key: 'prospects', label: 'All Prospects' },
  { key: 'reports',   label: 'Reports' },
]

export default function SalesHub() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [createOpen, setCreateOpen] = useState(false)

  const goToProspect = useCallback(id => navigate(`/sales/prospects/${id}`), [navigate])

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-screen-2xl">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">B2B Sales Pipeline</h1>
            <p className="text-xs text-muted-foreground">Manage business prospects and deals</p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Prospect
        </button>
      </div>

      {/* tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'kanban'    && <KanbanTab onNavigate={goToProspect} />}
      {tab === 'prospects' && <ProspectsTab onNavigate={goToProspect} onCreate={() => setCreateOpen(true)} />}
      {tab === 'reports'   && <ReportsTab />}

      {/* create modal */}
      <CreateProspectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => { if (id) goToProspect(id) }}
      />
    </div>
  )
}
