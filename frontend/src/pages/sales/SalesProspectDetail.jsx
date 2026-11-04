'use client'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, TrendingUp, Building2, Phone, Mail, Globe,
  Calendar, DollarSign, User, MapPin, Tag, Edit3, Save,
  X, Plus, RefreshCw, CheckCircle2, XCircle, Clock,
  MessageSquare, PhoneCall, Users, FileText, Zap, ChevronDown,
  AlertCircle, ArrowRight,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'react-hot-toast'
import api from '@/services/api'

// ─── constants (mirrors SalesHub) ────────────────────────────────────────────
const STAGES = [
  { key: 'new_prospect',      label: 'New Prospect',      color: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700'  },
  { key: 'contacted',         label: 'Contacted',         color: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700'    },
  { key: 'meeting_scheduled', label: 'Meeting Scheduled', color: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700'},
  { key: 'proposal_sent',     label: 'Proposal Sent',     color: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700'},
  { key: 'negotiation',       label: 'Negotiation',       color: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700'  },
  { key: 'won',               label: 'Won',               color: 'bg-green-500',  badge: 'bg-green-100 text-green-700'  },
  { key: 'lost',              label: 'Lost',              color: 'bg-red-500',    badge: 'bg-red-100 text-red-700'      },
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

const PROPOSAL_STATUSES = [
  { value: 'draft',    label: 'Draft',    color: 'text-muted-foreground' },
  { value: 'sent',     label: 'Sent',     color: 'text-blue-600'         },
  { value: 'accepted', label: 'Accepted', color: 'text-green-600'        },
  { value: 'rejected', label: 'Rejected', color: 'text-red-600'          },
]

const ACTIVITY_ICONS = {
  call:         PhoneCall,
  meeting:      Users,
  email:        Mail,
  note:         MessageSquare,
  stage_change: ArrowRight,
  proposal:     FileText,
  follow_up:    Clock,
}

const FOLLOWUP_MODES = [
  { value: 'phone',      label: 'Phone'      },
  { value: 'whatsapp',   label: 'WhatsApp'   },
  { value: 'email',      label: 'Email'      },
  { value: 'meeting',    label: 'Meeting'    },
  { value: 'video_call', label: 'Video Call' },
]

const SERVICES_LABELS = {
  ads_management: 'Ads Management', website_development: 'Website Development',
  digital_marketing: 'Digital Marketing', seo: 'SEO',
  social_media_management: 'Social Media Management', performance_marketing: 'Performance Marketing',
}

function fmt(n) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0) }
function fmtCur(n) { return `₹${fmt(n)}` }

function StageBadge({ stage }) {
  const s = STAGE_MAP[stage]
  if (!s) return null
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.badge}`}>{s.label}</span>
}

function InfoRow({ label, value, icon: Icon }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', required, className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  )
}

function Textarea({ label, value, onChange, rows = 3, className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-foreground">{label}</label>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </div>
  )
}

function Select({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-foreground">{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── Stage change bar ─────────────────────────────────────────────────────────
function StageBar({ currentStage, onChangeStage }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {STAGES.map(s => (
        <button
          key={s.key}
          onClick={() => s.key !== currentStage && onChangeStage(s.key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border
            ${currentStage === s.key
              ? `${s.color} text-white border-transparent`
              : 'bg-muted text-muted-foreground border-border hover:border-primary hover:text-primary'
            }`}
        >
          {s.label}
          {currentStage === s.key && <CheckCircle2 className="w-3.5 h-3.5" />}
        </button>
      ))}
    </div>
  )
}

// ─── Activity feed ────────────────────────────────────────────────────────────
function ActivityFeed({ prospectId }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ type: 'note', description: '', outcome: '' })
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['sales-activities', prospectId],
    queryFn: () => api.get(`/sales/${prospectId}/activities`).then(r => r.data.data),
    staleTime: 30_000,
  })

  const add = useMutation({
    mutationFn: (body) => api.post(`/sales/${prospectId}/activities`, body).then(r => r.data),
    onSuccess: () => { toast.success('Activity logged'); qc.invalidateQueries({ queryKey: ['sales-activities', prospectId] }); setShowAdd(false); setForm({ type: 'note', description: '', outcome: '' }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  if (isLoading) return <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
        <button onClick={() => setShowAdd(o => !o)} className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Log Activity
        </button>
      </div>

      {showAdd && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4 space-y-3">
          <Select label="Type" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))}
            options={[
              { value: 'call', label: 'Call' }, { value: 'meeting', label: 'Meeting' },
              { value: 'email', label: 'Email' }, { value: 'note', label: 'Note' },
              { value: 'follow_up', label: 'Follow-up' },
            ]} />
          <Textarea label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} rows={2} />
          <Textarea label="Outcome" value={form.outcome} onChange={v => setForm(f => ({ ...f, outcome: v }))} rows={2} />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 border border-border rounded-lg py-1.5 text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
            <button onClick={() => add.mutate(form)} disabled={add.isPending} className="flex-1 bg-primary text-primary-foreground rounded-lg py-1.5 text-sm hover:bg-primary/90 transition-colors disabled:opacity-60">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No activities yet</p>}
        {data.map(a => {
          const Icon = ACTIVITY_ICONS[a.type] || MessageSquare
          return (
            <div key={a._id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="p-1.5 rounded-full bg-muted border border-border">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 w-px bg-border mt-1" />
              </div>
              <div className="pb-3 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-semibold text-foreground capitalize">{a.type.replace('_', ' ')}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{a.createdAt ? format(parseISO(a.createdAt), 'dd MMM, hh:mm a') : ''}</span>
                </div>
                {a.description && <p className="text-sm text-foreground mt-0.5">{a.description}</p>}
                {a.outcome && <p className="text-xs text-muted-foreground mt-0.5">Outcome: {a.outcome}</p>}
                {a.type === 'stage_change' && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <StageBadge stage={a.fromStage} /> → <StageBadge stage={a.toStage} />
                  </p>
                )}
                {a.createdBy?.name && <p className="text-xs text-muted-foreground mt-0.5">by {a.createdBy.name}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Follow-ups panel ─────────────────────────────────────────────────────────
function FollowUpsPanel({ prospectId }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ scheduledAt: '', mode: 'phone', title: '', notes: '' })

  const { data = [], isLoading } = useQuery({
    queryKey: ['sales-followups', prospectId],
    queryFn: () => api.get(`/sales/${prospectId}/follow-ups`).then(r => r.data.data),
    staleTime: 30_000,
  })

  const add = useMutation({
    mutationFn: body => api.post(`/sales/${prospectId}/follow-ups`, body).then(r => r.data),
    onSuccess: () => { toast.success('Follow-up scheduled'); qc.invalidateQueries({ queryKey: ['sales-followups', prospectId] }); setShowAdd(false); setForm({ scheduledAt: '', mode: 'phone', title: '', notes: '' }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateFu = useMutation({
    mutationFn: ({ fuId, status }) => api.patch(`/sales/${prospectId}/follow-ups/${fuId}`, { status }).then(r => r.data),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['sales-followups', prospectId] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const statusColor = { pending: 'text-amber-600', completed: 'text-green-600', cancelled: 'text-muted-foreground', overdue: 'text-red-600' }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Follow-ups</h3>
        <button onClick={() => setShowAdd(o => !o)} className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Schedule
        </button>
      </div>

      {showAdd && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Scheduled At" type="datetime-local" value={form.scheduledAt} onChange={v => setForm(f => ({ ...f, scheduledAt: v }))} required />
            <Select label="Mode" value={form.mode} onChange={v => setForm(f => ({ ...f, mode: v }))} options={FOLLOWUP_MODES} />
          </div>
          <Input label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
          <Textarea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={2} />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 border border-border rounded-lg py-1.5 text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
            <button onClick={() => add.mutate(form)} disabled={add.isPending} className="flex-1 bg-primary text-primary-foreground rounded-lg py-1.5 text-sm hover:bg-primary/90 transition-colors disabled:opacity-60">Save</button>
          </div>
        </div>
      )}

      {isLoading
        ? <div className="flex justify-center py-6"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        : data.length === 0
          ? <p className="text-sm text-muted-foreground">No follow-ups scheduled</p>
          : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.map(f => (
                <div key={f._id} className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card">
                  <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${statusColor[f.status] || 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{f.title || 'Follow-up'}</span>
                      <span className={`text-xs capitalize ${statusColor[f.status] || ''}`}>{f.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{f.scheduledAt ? format(parseISO(f.scheduledAt), 'dd MMM yyyy, hh:mm a') : ''} · {f.mode}</p>
                    {f.notes && <p className="text-xs text-muted-foreground mt-0.5">{f.notes}</p>}
                  </div>
                  {f.status === 'pending' && (
                    <button onClick={() => updateFu.mutate({ fuId: f._id, status: 'completed' })} className="text-xs text-green-600 hover:text-green-700 font-medium shrink-0">
                      Complete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}

// ─── Proposal panel ───────────────────────────────────────────────────────────
function ProposalPanel({ prospectId, proposal = {}, onUpdated }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    status: proposal.status || 'draft',
    sentDate: proposal.sentDate ? proposal.sentDate.substring(0, 10) : '',
    amount: proposal.amount || '',
    notes: proposal.notes || '',
  })

  const save = useMutation({
    mutationFn: body => api.patch(`/sales/${prospectId}/proposal`, body).then(r => r.data),
    onSuccess: (d) => {
      toast.success('Proposal updated')
      qc.invalidateQueries({ queryKey: ['sales-prospect', prospectId] })
      setEditing(false)
      onUpdated?.()
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const statusMeta = PROPOSAL_STATUSES.find(s => s.value === (proposal.status || 'draft'))

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Proposal</h3>
        <button onClick={() => setEditing(o => !o)} className="text-xs text-primary hover:underline">
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing
        ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))}
                options={PROPOSAL_STATUSES.map(s => ({ value: s.value, label: s.label }))} />
              <Input label="Sent Date" type="date" value={form.sentDate} onChange={v => setForm(f => ({ ...f, sentDate: v }))} />
              <Input label="Amount (₹)" type="number" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} className="col-span-2" />
            </div>
            <Textarea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} />
            <button
              onClick={() => save.mutate({ ...form, amount: form.amount ? +form.amount : 0, sentDate: form.sentDate || undefined })}
              disabled={save.isPending}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {save.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
              Save Proposal
            </button>
          </div>
        )
        : (
          <div className="space-y-2 p-3 bg-muted/40 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Status:</span>
              <span className={`text-sm font-semibold ${statusMeta?.color || ''}`}>{statusMeta?.label || 'Draft'}</span>
            </div>
            {proposal.amount > 0 && <div className="text-sm"><span className="text-muted-foreground">Amount: </span><span className="font-medium text-foreground">{fmtCur(proposal.amount)}</span></div>}
            {proposal.sentDate && <div className="text-sm"><span className="text-muted-foreground">Sent: </span><span className="font-medium text-foreground">{format(parseISO(proposal.sentDate), 'dd MMM yyyy')}</span></div>}
            {proposal.notes && <p className="text-sm text-muted-foreground">{proposal.notes}</p>}
          </div>
        )
      }
    </div>
  )
}

// ─── Convert to Client modal ──────────────────────────────────────────────────
function ConvertModal({ open, prospectId, onClose, onConverted }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')

  const convert = useMutation({
    mutationFn: () => api.post(`/sales/${prospectId}/convert`, { notes }).then(r => r.data),
    onSuccess: (d) => {
      toast.success(d.message || 'Converted to client')
      qc.invalidateQueries({ queryKey: ['sales-prospect', prospectId] })
      onConverted?.()
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Convert failed'),
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-base font-semibold text-foreground mb-2">Convert to Client</h3>
        <p className="text-sm text-muted-foreground mb-4">This will create a new Client record from this prospect. If a client with the same email already exists, the prospect will be linked to the existing client.</p>
        <Textarea label="Notes" value={notes} onChange={setNotes} rows={3} />
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 border border-border rounded-lg py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">Cancel</button>
          <button onClick={() => convert.mutate()} disabled={convert.isPending} className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {convert.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
            Convert
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main detail page ─────────────────────────────────────────────────────────
export default function SalesProspectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [convertOpen, setConvertOpen] = useState(false)
  const [lostModalOpen, setLostModalOpen] = useState(false)
  const [pendingStage, setPendingStage] = useState(null)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})

  const { data: prospect, isLoading, isError } = useQuery({
    queryKey: ['sales-prospect', id],
    queryFn: () => api.get(`/sales/${id}`).then(r => r.data.data),
    staleTime: 30_000,
    onSuccess: (d) => {
      if (!editMode) setEditForm({ ...d, assignedSalesperson: d.assignedSalesperson?._id || '' })
    },
  })

  const changeStage = useMutation({
    mutationFn: ({ stage, lostReason, lostNotes }) => api.patch(`/sales/${id}/stage`, { stage, lostReason, lostNotes }).then(r => r.data),
    onSuccess: () => { toast.success('Stage updated'); qc.invalidateQueries({ queryKey: ['sales-prospect', id] }); qc.invalidateQueries({ queryKey: ['sales-kanban'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Stage change failed'),
  })

  const updateProspect = useMutation({
    mutationFn: (body) => api.put(`/sales/${id}`, body).then(r => r.data),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['sales-prospect', id] }); setEditMode(false) },
    onError: err => toast.error(err.response?.data?.message || 'Save failed'),
  })

  function handleStageClick(stage) {
    if (stage === 'lost') {
      setPendingStage(stage)
      setLostReason('')
      setLostNotes('')
      setLostModalOpen(true)
      return
    }
    changeStage.mutate({ stage })
  }

  function confirmLost() {
    if (!lostReason) { toast.error('Select a lost reason'); return }
    changeStage.mutate({ stage: 'lost', lostReason, lostNotes })
    setLostModalOpen(false)
  }

  if (isLoading) return <div className="flex justify-center py-24"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  if (isError || !prospect) return <div className="flex flex-col items-center py-24 gap-3"><AlertCircle className="w-8 h-8 text-red-500" /><p className="text-muted-foreground">Prospect not found</p></div>

  const isWon = prospect.stage === 'won'
  const isLost = prospect.stage === 'lost'

  return (
    <div className="p-4 md:p-6 max-w-screen-xl space-y-5">
      {/* header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/sales')} className="p-2 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{prospect.companyName}</h1>
            <p className="text-xs text-muted-foreground">{prospect.contactPerson}</p>
          </div>
        </div>
        <StageBadge stage={prospect.stage} />
        <div className="flex gap-2">
          {isWon && !prospect.convertedClientId && (
            <button onClick={() => setConvertOpen(true)} className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Convert to Client
            </button>
          )}
          {prospect.convertedClientId && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium border border-green-200 bg-green-50 px-2.5 py-1.5 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" /> Converted
            </span>
          )}
          <button onClick={() => { setEditMode(o => !o); if (!editMode && prospect) setEditForm({ ...prospect, assignedSalesperson: prospect.assignedSalesperson?._id || '' }) }} className="flex items-center gap-2 border border-border px-3 py-1.5 rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors">
            {editMode ? <><X className="w-4 h-4" /> Cancel</> : <><Edit3 className="w-4 h-4" /> Edit</>}
          </button>
          {editMode && (
            <button onClick={() => updateProspect.mutate(editForm)} disabled={updateProspect.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
              {updateProspect.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
          )}
        </div>
      </div>

      {/* stage bar */}
      {!isWon && !isLost && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Move to stage:</p>
          <StageBar currentStage={prospect.stage} onChangeStage={handleStageClick} />
        </div>
      )}

      {/* lost/won banner */}
      {isLost && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Deal Lost</p>
            {prospect.lostReason && <p className="text-xs text-red-600">{LOST_REASONS.find(r => r.value === prospect.lostReason)?.label} {prospect.lostNotes && `· ${prospect.lostNotes}`}</p>}
          </div>
        </div>
      )}
      {isWon && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <p className="text-sm font-semibold text-green-700">Deal Won{prospect.wonAt ? ` on ${format(parseISO(prospect.wonAt), 'dd MMM yyyy')}` : ''}</p>
        </div>
      )}

      {/* main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* left: info + edit */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Company Info</h2>
            {editMode
              ? (
                <div className="space-y-3">
                  <Input label="Company Name *" value={editForm.companyName} onChange={v => setEditForm(f => ({ ...f, companyName: v }))} required />
                  <Input label="Contact Person *" value={editForm.contactPerson} onChange={v => setEditForm(f => ({ ...f, contactPerson: v }))} required />
                  <Input label="Phone" value={editForm.phone} onChange={v => setEditForm(f => ({ ...f, phone: v }))} />
                  <Input label="Email" type="email" value={editForm.email} onChange={v => setEditForm(f => ({ ...f, email: v }))} />
                  <Input label="Website" value={editForm.website} onChange={v => setEditForm(f => ({ ...f, website: v }))} />
                  <Input label="Industry" value={editForm.industry} onChange={v => setEditForm(f => ({ ...f, industry: v }))} />
                  <Input label="Location" value={editForm.businessLocation} onChange={v => setEditForm(f => ({ ...f, businessLocation: v }))} />
                </div>
              )
              : (
                <div className="space-y-2">
                  <InfoRow label="Contact" value={prospect.contactPerson} icon={User} />
                  <InfoRow label="Phone" value={prospect.phone} icon={Phone} />
                  <InfoRow label="Email" value={prospect.email} icon={Mail} />
                  <InfoRow label="Website" value={prospect.website} icon={Globe} />
                  <InfoRow label="Industry" value={prospect.industry} icon={Tag} />
                  <InfoRow label="Location" value={prospect.businessLocation} icon={MapPin} />
                </div>
              )
            }
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Deal Info</h2>
            {editMode
              ? (
                <div className="space-y-3">
                  <Select label="Deal Type" value={editForm.dealType} onChange={v => setEditForm(f => ({ ...f, dealType: v }))}
                    options={[{ value: 'monthly_retainer', label: 'Monthly Retainer' }, { value: 'one_time_project', label: 'One-time Project' }]} />
                  <Input label="Est. Deal Value (₹)" type="number" value={editForm.estimatedDealValue} onChange={v => setEditForm(f => ({ ...f, estimatedDealValue: +v }))} />
                  <Input label="Expected Closing" type="date" value={editForm.expectedClosingDate ? editForm.expectedClosingDate.substring(0, 10) : ''} onChange={v => setEditForm(f => ({ ...f, expectedClosingDate: v }))} />
                </div>
              )
              : (
                <div className="space-y-2">
                  <InfoRow label="Deal Type" value={prospect.dealType === 'monthly_retainer' ? 'Monthly Retainer' : 'One-time Project'} icon={DollarSign} />
                  <InfoRow label="Est. Value" value={fmtCur(prospect.estimatedDealValue)} icon={DollarSign} />
                  {prospect.expectedClosingDate && <InfoRow label="Closing" value={format(parseISO(prospect.expectedClosingDate), 'dd MMM yyyy')} icon={Calendar} />}
                  <InfoRow label="Salesperson" value={prospect.assignedSalesperson?.name} icon={User} />
                  <InfoRow label="Lead Source" value={prospect.leadSource} icon={Tag} />
                </div>
              )
            }
            {!editMode && prospect.interestedServices?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {prospect.interestedServices.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">{SERVICES_LABELS[s] || s}</span>
                ))}
              </div>
            )}
          </div>

          {!editMode && (prospect.notes || prospect.remarks) && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Notes & Remarks</h2>
              {prospect.notes && <p className="text-sm text-muted-foreground">{prospect.notes}</p>}
              {prospect.remarks && <p className="text-sm text-muted-foreground">{prospect.remarks}</p>}
            </div>
          )}

          {editMode && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <Textarea label="Notes" value={editForm.notes} onChange={v => setEditForm(f => ({ ...f, notes: v }))} rows={3} />
              <Textarea label="Remarks" value={editForm.remarks} onChange={v => setEditForm(f => ({ ...f, remarks: v }))} rows={3} />
            </div>
          )}

          {/* Stage history */}
          {!editMode && prospect.stageHistory?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Stage History</h2>
              <div className="space-y-2">
                {[...prospect.stageHistory].reverse().map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${STAGE_MAP[h.toStage]?.color || 'bg-muted'}`} />
                    <div className="flex-1">
                      {h.fromStage && <><StageBadge stage={h.fromStage} />{' → '}</>}<StageBadge stage={h.toStage} />
                    </div>
                    <span className="text-muted-foreground shrink-0">{h.changedAt ? format(parseISO(h.changedAt), 'dd MMM yy') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right: activities, follow-ups, proposal */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <ProposalPanel prospectId={id} proposal={prospect.proposal} />
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <FollowUpsPanel prospectId={id} />
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <ActivityFeed prospectId={id} />
          </div>
        </div>
      </div>

      {/* Lost reason modal */}
      {lostModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-4">Mark as Lost</h3>
            <div className="space-y-3">
              <Select label="Lost Reason *" value={lostReason} onChange={setLostReason}
                options={[{ value: '', label: 'Select reason…' }, ...LOST_REASONS]} />
              <Textarea label="Notes" value={lostNotes} onChange={setLostNotes} rows={3} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setLostModalOpen(false)} className="flex-1 border border-border rounded-lg py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={confirmLost} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 transition-colors">Confirm Lost</button>
            </div>
          </div>
        </div>
      )}

      {/* Convert modal */}
      <ConvertModal open={convertOpen} prospectId={id} onClose={() => setConvertOpen(false)} onConverted={() => qc.invalidateQueries({ queryKey: ['sales-prospect', id] })} />
    </div>
  )
}
