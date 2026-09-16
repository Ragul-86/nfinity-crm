/**
 * SalesPipeline.jsx — Dynamic Pipeline Kanban
 *
 * Replaces the old hardcoded "Sales Pipeline" view.
 *
 * Architecture:
 *   1. Loads all tenant pipelines from /api/pipeline-defs
 *   2. Lets the user select a pipeline via a dropdown (persisted in localStorage)
 *   3. Renders the selected pipeline's actual stages from MongoDB
 *   4. Fetches leads filtered by pipelineId + groups by stageId client-side
 *   5. Drag-and-drop calls PUT /api/pipeline-defs/leads/:id/move
 *
 * No stage names, stage orders, or pipeline names are hard-coded.
 * Adding / renaming / reordering stages in Settings → Pipelines is
 * immediately reflected here on next load.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Download, UserPlus, X, ChevronDown,
  Phone, Mail, Building2, IndianRupee, Calendar, Tag, MoreVertical,
  Eye, Edit2, StickyNote, Clock, PhoneCall, MessageCircle,
  TrendingUp, TrendingDown, BarChart2, Filter, CheckSquare2, Square,
  Archive, Trash2, Users, AlertCircle, CheckCheck, GitBranch,
  RefreshCw,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format, isPast, isToday } from 'date-fns'
import LeadDetailModal from '@/components/leads/LeadDetailModal'
import FollowUpModal from '@/components/leads/FollowUpModal'

// ─── localStorage key to persist selected pipeline across page reloads ────────
const LS_PIPELINE_KEY = 'crm_selected_pipeline_id'

// ─── Static lookup data ───────────────────────────────────────────────────────
const SOURCES = [
  'website', 'referral', 'social_media', 'cold_call', 'email', 'event',
  'meta_ads', 'lead_form', 'facebook_ads', 'instagram_ads', 'whatsapp',
  'google_ads', 'landing_page', 'import', 'api', 'webhook', 'manual', 'other',
]
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const PRIORITY_COLORS = {
  urgent: 'bg-red-500/10 text-red-400 border-red-500/30',
  high:   'bg-orange-500/10 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
}
const LOST_REASONS = [
  { value: 'budget',      label: 'Budget / Price' },
  { value: 'no_response', label: 'No Response' },
  { value: 'competitor',  label: 'Chose Competitor' },
  { value: 'duplicate',   label: 'Duplicate Lead' },
  { value: 'invalid',     label: 'Invalid Lead' },
  { value: 'timing',      label: 'Bad Timing' },
  { value: 'other',       label: 'Other' },
]

function fmt(n) {
  if (!n) return '₹0'
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`
  if (n >= 100_000)   return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toLocaleString()}`
}

// ─── Stage type → display styles ─────────────────────────────────────────────
function stageTypeStyle(type) {
  if (type === 'won')  return 'bg-green-500'
  if (type === 'lost') return 'bg-red-500'
  return 'bg-indigo-500'
}

// ─── KPI Bar (computed from fetched leads) ────────────────────────────────────
function KpiBar({ leads, pipelineName }) {
  const all = leads || []
  const won  = all.filter(l => l.stageType === 'won')
  const lost = all.filter(l => l.stageType === 'lost')
  const open = all.filter(l => l.stageType === 'open')
  const wonRevenue  = won.reduce((s, l) => s + (l.value || 0), 0)
  const openValue   = open.reduce((s, l) => s + (l.value || 0), 0)
  const convRate    = won.length + lost.length
    ? Math.round(won.length / (won.length + lost.length) * 100)
    : 0

  const kpis = [
    { label: 'Total Leads',     value: all.length,         color: 'text-blue-400',    icon: Users },
    { label: 'Open Value',      value: fmt(openValue),     color: 'text-emerald-400', icon: IndianRupee },
    { label: 'Won Leads',       value: won.length,         color: 'text-green-400',   icon: CheckCheck },
    { label: 'Won Revenue',     value: fmt(wonRevenue),    color: 'text-green-400',   icon: TrendingUp },
    { label: 'Lost Leads',      value: lost.length,        color: 'text-red-400',     icon: TrendingDown },
    { label: 'Conversion Rate', value: `${convRate}%`,     color: 'text-purple-400',  icon: BarChart2 },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
      {kpis.map(k => (
        <div key={k.label} className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center gap-2">
          <k.icon className={`w-4 h-4 shrink-0 ${k.color}`} />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
            <p className="text-sm font-semibold">{k.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Lost Reason Dialog ───────────────────────────────────────────────────────
function LostReasonDialog({ open, onClose, onConfirm, leadName, loading }) {
  const [reason, setReason] = useState('')
  const [note,   setNote  ] = useState('')
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" /> Mark as Lost
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-1">
          Why was <strong>{leadName}</strong> lost?
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional context…" rows={2} className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={!reason || loading}
            onClick={() => onConfirm(reason, note)}
          >
            {loading ? 'Saving…' : 'Mark as Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Won Dialog ───────────────────────────────────────────────────────────────
function WonDialog({ open, onClose, onConvert, onSkip, leadName, loading }) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-400">
            <CheckCheck className="w-4 h-4" /> 🎉 Lead Won!
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Congratulations! Would you like to convert <strong>{leadName}</strong> to a Client?
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onSkip}>Not Now</Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
            disabled={loading}
            onClick={onConvert}
          >
            <UserPlus className="w-4 h-4" />
            {loading ? 'Converting…' : 'Convert to Client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Quick Note Dialog ────────────────────────────────────────────────────────
function QuickNoteDialog({ open, onClose, leadId, leadName }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()
  const save = async () => {
    if (!content.trim()) return
    setLoading(true)
    try {
      await api.post(`/leads/${leadId}/notes`, { content })
      toast.success('Note added')
      qc.invalidateQueries({ queryKey: ['pipeline-kanban'] })
      setContent(''); onClose()
    } catch { toast.error('Failed to add note') }
    finally { setLoading(false) }
  }
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setContent(''); onClose() } }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Add Note — {leadName}</DialogTitle></DialogHeader>
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Type your note here…" rows={4} className="resize-none" autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!content.trim() || loading}>{loading ? 'Saving…' : 'Save Note'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pipeline Empty State ─────────────────────────────────────────────────────
function NoPipelineState({ loading }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center gap-3">
      <GitBranch className="w-10 h-10 text-muted-foreground/40" />
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading pipelines…</p>
      ) : (
        <>
          <p className="font-medium">No pipelines found</p>
          <p className="text-sm text-muted-foreground">
            Go to Settings → Pipelines to create your first pipeline.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({
  lead, stageType, stage,
  selected, onSelect,
  onView, onEdit, onDelete, onMoveToLost, onMoveToWon,
  onAddNote, onFollowUp, onArchive, onConvert,
  dragging, onDragStart,
}) {
  const isDragging = dragging?.lead._id === lead._id
  const nextFU = lead.nextFollowUp
  const fuOverdue = nextFU && isPast(new Date(nextFU.scheduledAt)) && nextFU.status === 'pending'
  const fuToday   = nextFU && isToday(new Date(nextFU.scheduledAt))
  const closeOverdue = lead.expectedCloseDate
    && isPast(new Date(lead.expectedCloseDate))
    && stageType === 'open'

  const handleCall      = e => { e.stopPropagation(); if (lead.phone) window.open(`tel:${lead.phone}`); else toast.error('No phone number') }
  const handleWhatsApp  = e => { e.stopPropagation(); const p = lead.phone?.replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); else toast.error('No phone number') }
  const handleEmail     = e => { e.stopPropagation(); if (lead.email) window.open(`mailto:${lead.email}`); else toast.error('No email') }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={() => onDragStart(lead, stage)}
      className={`bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all select-none relative group ${
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      }`}
    >
      {/* Checkbox */}
      <button
        className={`absolute top-2 left-2 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={e => { e.stopPropagation(); onSelect(lead._id) }}
      >
        {selected
          ? <CheckSquare2 className="w-3.5 h-3.5 text-primary" />
          : <Square className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2 pl-5">
        <button
          className="text-sm font-medium leading-tight line-clamp-1 text-left hover:text-primary transition-colors"
          onClick={e => { e.stopPropagation(); onView(lead) }}
        >
          {lead.name}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <button className="p-0.5 rounded hover:bg-accent shrink-0">
              <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onView(lead)}><Eye className="w-3.5 h-3.5 mr-2" />View Details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(lead)}><Edit2 className="w-3.5 h-3.5 mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAddNote(lead)}><StickyNote className="w-3.5 h-3.5 mr-2" />Add Note</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFollowUp(lead)}><Clock className="w-3.5 h-3.5 mr-2" />Schedule Follow-up</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCall}><PhoneCall className="w-3.5 h-3.5 mr-2" />Call</DropdownMenuItem>
            <DropdownMenuItem onClick={handleWhatsApp}><MessageCircle className="w-3.5 h-3.5 mr-2" />WhatsApp</DropdownMenuItem>
            <DropdownMenuItem onClick={handleEmail}><Mail className="w-3.5 h-3.5 mr-2" />Email</DropdownMenuItem>
            <DropdownMenuSeparator />
            {stageType !== 'won' && stageType !== 'lost' && (
              <DropdownMenuItem className="text-green-500" onClick={() => onMoveToWon(lead)}>
                <CheckCheck className="w-3.5 h-3.5 mr-2" />Mark as Won
              </DropdownMenuItem>
            )}
            {stageType !== 'lost' && (
              <DropdownMenuItem className="text-red-400" onClick={() => onMoveToLost(lead)}>
                <TrendingDown className="w-3.5 h-3.5 mr-2" />Mark as Lost
              </DropdownMenuItem>
            )}
            {stageType === 'won' && !lead.convertedClientId && (
              <DropdownMenuItem className="text-green-500" onClick={() => onConvert(lead)}>
                <UserPlus className="w-3.5 h-3.5 mr-2" />Convert to Client
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onArchive(lead)}><Archive className="w-3.5 h-3.5 mr-2" />Archive</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(lead._id)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Company */}
      {lead.company && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1.5">
          <Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{lead.company}</span>
        </div>
      )}

      {/* Phone + Source */}
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        {lead.phone && (
          <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors" onClick={handleCall}>
            <Phone className="w-2.5 h-2.5" />{lead.phone}
          </button>
        )}
        {lead.source && lead.source !== 'other' && (
          <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded capitalize">
            {lead.source.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Priority + Value */}
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${PRIORITY_COLORS[lead.priority] || ''}`}>
          {lead.priority}
        </span>
        {lead.value > 0 && <span className="text-[11px] font-semibold">{fmt(lead.value)}</span>}
      </div>

      {/* Expected Close */}
      {lead.expectedCloseDate && (
        <div className={`flex items-center gap-1 text-[10px] mt-1.5 ${closeOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
          <Calendar className="w-2.5 h-2.5" />
          Close: {format(new Date(lead.expectedCloseDate), 'MMM d')}
          {closeOverdue && ' (overdue)'}
        </div>
      )}

      {/* Next Follow-up */}
      {nextFU && (
        <div className={`flex items-center gap-1 text-[10px] mt-1 rounded px-1 py-0.5 -mx-1 ${
          fuOverdue ? 'bg-red-500/10 text-red-400'
          : fuToday ? 'bg-amber-500/10 text-amber-400'
          : 'text-muted-foreground'
        }`}>
          <Clock className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">
            {fuOverdue ? 'Overdue: ' : fuToday ? 'Today: ' : 'Follow-up: '}
            {format(new Date(nextFU.scheduledAt), 'MMM d, h:mm a')}
          </span>
        </div>
      )}

      {/* Tags */}
      {lead.tags?.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1.5">
          {lead.tags.slice(0, 3).map(t => (
            <span key={t} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{t}</span>
          ))}
          {lead.tags.length > 3 && <span className="text-[9px] text-muted-foreground">+{lead.tags.length - 3}</span>}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-1.5">
        {lead.assignedTo?.length > 0 ? (
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
              {lead.assignedTo[0]?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-[10px] text-muted-foreground truncate">{lead.assignedTo[0]?.name}</span>
            {lead.assignedTo.length > 1 && <span className="text-[9px] text-muted-foreground">+{lead.assignedTo.length - 1}</span>}
          </div>
        ) : <div />}
        {lead.convertedClientId && (
          <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded shrink-0">
            ✓ Client
          </span>
        )}
      </div>
    </motion.div>
  )
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkBar({ selectedIds, onClear, onBulkArchive, onBulkDelete, onBulkStage, stages, employees }) {
  const openStages = (stages || []).filter(s => s.type === 'open')
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-primary/40 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-primary whitespace-nowrap">{selectedIds.length} selected</span>
      <div className="h-4 w-px bg-border" />

      {openStages.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5 h-8">Move Stage <ChevronDown className="w-3.5 h-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {openStages.map(s => (
              <DropdownMenuItem key={String(s._id)} onClick={() => onBulkStage(s)}>
                <span className="w-2 h-2 rounded-full mr-2 inline-block" style={{ background: s.color || '#6366f1' }} />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button size="sm" variant="outline" className="h-8" onClick={onBulkArchive}>
        <Archive className="w-3.5 h-3.5 mr-1.5" />Archive
      </Button>
      <Button size="sm" variant="destructive" className="h-8" onClick={() => {
        if (confirm(`Delete ${selectedIds.length} leads? This cannot be undone.`)) onBulkDelete()
      }}>
        <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onClear}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SalesPipeline() {
  const queryClient = useQueryClient()

  // ── UI state ────────────────────────────────────────────────────────────────
  const [search,         setSearch        ] = useState('')
  const [filterSource,   setFilterSource  ] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [showFilters,    setShowFilters   ] = useState(false)
  const [showModal,      setShowModal     ] = useState(false)
  const [editLead,       setEditLead      ] = useState(null)
  const [detailLead,     setDetailLead    ] = useState(null)
  const [dragging,       setDragging      ] = useState(null)   // { lead, fromStage }
  const [dragOver,       setDragOver      ] = useState(null)   // stageId string
  const [lostDialog,     setLostDialog    ] = useState(null)   // { lead, targetStageId }
  const [wonDialog,      setWonDialog     ] = useState(null)   // lead
  const [convertConfirm, setConvertConfirm] = useState(null)
  const [noteDialog,     setNoteDialog    ] = useState(null)
  const [followUpLead,   setFollowUpLead  ] = useState(null)
  const [selectedIds,    setSelectedIds   ] = useState([])
  const [addToStage,     setAddToStage    ] = useState(null)   // stage obj for "Add Lead" prefill

  // ── Pipeline selection (persisted) ──────────────────────────────────────────
  const [selectedPipelineId, _setSelectedPipelineId] = useState(
    () => localStorage.getItem(LS_PIPELINE_KEY) || ''
  )
  const setSelectedPipelineId = id => {
    _setSelectedPipelineId(id)
    if (id) localStorage.setItem(LS_PIPELINE_KEY, id)
    else    localStorage.removeItem(LS_PIPELINE_KEY)
    setSelectedIds([])
  }

  // ── Load pipelines ──────────────────────────────────────────────────────────
  const { data: pipelinesRaw, isLoading: loadingPipelines } = useQuery({
    queryKey: ['pipelines-list'],
    queryFn: () => api.get('/pipeline-defs').then(r => r.data.data || []),
    staleTime: 5 * 60 * 1000,
  })
  const pipelines = pipelinesRaw || []

  // Auto-select default pipeline when list first loads
  useEffect(() => {
    if (pipelines.length === 0) return
    // If saved ID is still valid, keep it
    if (selectedPipelineId && pipelines.find(p => p._id === selectedPipelineId)) return
    // Otherwise pick the default (or first)
    const fallback = pipelines.find(p => p.isDefault) || pipelines[0]
    if (fallback) setSelectedPipelineId(fallback._id)
  }, [pipelines]) // eslint-disable-line

  const activePipeline = pipelines.find(p => p._id === selectedPipelineId) || null
  const stages = activePipeline
    ? [...activePipeline.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : []
  const wonStage  = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

  // ── Load leads for selected pipeline ───────────────────────────────────────
  const kanbanParams = useMemo(() => {
    const p = {}
    if (search)         p.search   = search
    if (filterSource)   p.source   = filterSource
    if (filterPriority) p.priority = filterPriority
    if (filterAssigned) p.assignedTo = filterAssigned
    return p
  }, [search, filterSource, filterPriority, filterAssigned])

  const { data: leadsData, isLoading: loadingLeads } = useQuery({
    queryKey: ['pipeline-kanban', selectedPipelineId, kanbanParams],
    queryFn: () => selectedPipelineId
      ? api.get('/leads', {
          params: { pipelineId: selectedPipelineId, limit: 1000, ...kanbanParams },
        }).then(r => r.data.data || [])
      : Promise.resolve([]),
    enabled: !!selectedPipelineId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const isLoading = loadingPipelines || loadingLeads

  // ── Group leads by stageId ──────────────────────────────────────────────────
  const kanbanData = useMemo(() => {
    const map = {}
    stages.forEach(s => {
      map[String(s._id)] = { leads: [], count: 0, totalValue: 0 }
    })
    ;(leadsData || []).forEach(lead => {
      const key = lead.stageId ? String(lead.stageId) : '__unassigned'
      if (!map[key]) map[key] = { leads: [], count: 0, totalValue: 0 }
      map[key].leads.push(lead)
      map[key].count++
      map[key].totalValue += lead.value || 0
    })
    return map
  }, [leadsData, stages])

  // ── Employees ───────────────────────────────────────────────────────────────
  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data.data),
  })

  // ── Invalidate helpers ──────────────────────────────────────────────────────
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-kanban'] })
    queryClient.invalidateQueries({ queryKey: ['pipelines-list'] })
    queryClient.invalidateQueries({ queryKey: ['leads'] })
  }, [queryClient])

  // ── Create / Edit Lead ──────────────────────────────────────────────────────
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm()

  const openAdd = (stage = null) => {
    setEditLead(null)
    setAddToStage(stage)
    reset({ priority: 'medium', source: 'other' })
    setShowModal(true)
  }
  const openEdit = lead => {
    setEditLead(lead)
    setAddToStage(null)
    reset({ ...lead, assignedTo: lead.assignedTo?.[0]?._id || lead.assignedTo?.[0] })
    setShowModal(true)
  }

  const mutation = useMutation({
    mutationFn: d => {
      if (editLead) {
        return api.put(`/leads/${editLead._id}`, d)
      }
      // Create with pipeline assignment
      const payload = {
        ...d,
        pipelineId: selectedPipelineId || undefined,
        stageId:    addToStage?._id   || stages.find(s => s.type === 'open')?._id || undefined,
        stageName:  addToStage?.name  || stages.find(s => s.type === 'open')?.name || undefined,
        stageType:  addToStage?.type  || 'open',
      }
      return api.post('/leads', payload)
    },
    onSuccess: () => {
      invalidate()
      toast.success(editLead ? 'Lead updated' : 'Lead created')
      setShowModal(false); setEditLead(null); setAddToStage(null); reset()
    },
    onError: err => toast.error(err.response?.data?.message || 'Error saving lead'),
  })

  // ── Move Lead (pipeline-aware) ──────────────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: ({ id, stageId, pipelineId }) =>
      api.put(`/pipeline-defs/leads/${id}/move`, { stageId, pipelineId }),
    onSuccess: () => invalidate(),
    onError: err => toast.error(err.response?.data?.message || 'Failed to move lead'),
  })

  const moveToStage = useCallback((lead, targetStage) => {
    if (!targetStage) return
    moveMutation.mutate({
      id:         lead._id,
      stageId:    String(targetStage._id),
      pipelineId: selectedPipelineId,
    })
  }, [moveMutation, selectedPipelineId])

  // ── Mark as Won ─────────────────────────────────────────────────────────────
  const handleMoveToWon = lead => {
    if (!wonStage) { toast.error('This pipeline has no "Won" stage'); return }
    moveToStage(lead, wonStage)
    setWonDialog(lead)
  }

  // ── Mark as Lost ────────────────────────────────────────────────────────────
  const handleMoveToLost = (lead, targetStageId) => {
    setLostDialog({ lead, targetStageId: targetStageId || lostStage?._id })
  }

  const confirmLost = (reason, note) => {
    const { lead, targetStageId } = lostDialog || {}
    if (!lead || !targetStageId) return
    const stage = stages.find(s => String(s._id) === String(targetStageId)) || lostStage
    if (!stage) { toast.error('No lost stage found in this pipeline'); return }
    moveMutation.mutate(
      { id: lead._id, stageId: String(stage._id), pipelineId: selectedPipelineId },
      {
        onSuccess: async () => {
          // Also record lost reason as a note
          if (reason) {
            try {
              await api.post(`/leads/${lead._id}/notes`, {
                content: `Lost reason: ${reason}${note ? ` — ${note}` : ''}`,
              })
            } catch (_) {}
          }
          setLostDialog(null)
        },
      }
    )
  }

  // ── Convert to Client ───────────────────────────────────────────────────────
  const convertMutation = useMutation({
    mutationFn: id => api.post(`/pipeline/${id}/convert`),
    onSuccess: data => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`✅ Converted: ${data.data?.data?.client?.companyName || 'New Client'}`)
      setConvertConfirm(null); setWonDialog(null); setDetailLead(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Conversion failed'),
  })

  // ── Archive / Delete ────────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: id => api.put(`/leads/${id}`, { status: 'archived' }),
    onSuccess: () => { invalidate(); toast.success('Lead archived') },
    onError: () => toast.error('Archive failed'),
  })
  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/leads/${id}`),
    onSuccess: () => { invalidate(); toast.success('Lead deleted'); setDetailLead(null) },
    onError: () => toast.error('Delete failed'),
  })

  // ── Bulk actions ────────────────────────────────────────────────────────────
  const bulkMutation = useMutation({
    mutationFn: ({ action, value }) => api.post('/leads/bulk', { action, ids: selectedIds, value }),
    onSuccess: () => { invalidate(); setSelectedIds([]); toast.success('Bulk action applied') },
    onError: err => toast.error(err.response?.data?.message || 'Bulk action failed'),
  })

  const handleBulkStage = async targetStage => {
    if (!targetStage) return
    let success = 0
    for (const id of selectedIds) {
      try {
        await api.put(`/pipeline-defs/leads/${id}/move`, {
          stageId:    String(targetStage._id),
          pipelineId: selectedPipelineId,
        })
        success++
      } catch (_) {}
    }
    invalidate()
    setSelectedIds([])
    toast.success(`Moved ${success} lead(s) to "${targetStage.name}"`)
  }

  // ── Drag and Drop ───────────────────────────────────────────────────────────
  const onDragStart = useCallback((lead, fromStage) => {
    setDragging({ lead, fromStage })
  }, [])

  const onDragEnd = useCallback(() => {
    if (dragging && dragOver && dragOver !== String(dragging.fromStage?._id)) {
      const targetStage = stages.find(s => String(s._id) === dragOver)
      if (!targetStage) { setDragging(null); setDragOver(null); return }

      if (targetStage.type === 'lost') {
        handleMoveToLost(dragging.lead, dragOver)
      } else {
        moveToStage(dragging.lead, targetStage)
        if (targetStage.type === 'won') setWonDialog(dragging.lead)
      }
    }
    setDragging(null); setDragOver(null)
  }, [dragging, dragOver, stages, moveToStage]) // eslint-disable-line

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await api.get('/pipeline/export', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url; a.download = 'pipeline.csv'; a.click()
    } catch { toast.error('Export failed') }
  }

  const toggleSelect = id => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )
  const hasFilters = filterSource || filterPriority || filterAssigned

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pipeline selector */}
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-muted-foreground shrink-0" />
            {loadingPipelines ? (
              <Skeleton className="h-9 w-48" />
            ) : pipelines.length === 0 ? (
              <span className="text-sm text-muted-foreground">No pipelines — go to Settings → Pipelines</span>
            ) : (
              <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                <SelectTrigger className="h-9 min-w-[200px] font-semibold text-sm">
                  <SelectValue placeholder="Select pipeline…" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => (
                    <SelectItem key={p._id} value={p._id}>
                      <div className="flex items-center gap-2">
                        {p.name}
                        {p.isDefault && <span className="text-[10px] text-muted-foreground">(default)</span>}
                        {p.leadCount > 0 && (
                          <span className="text-[10px] bg-muted rounded-full px-1.5">{p.leadCount}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {activePipeline && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              {stages.length} stages · {(leadsData || []).length} lead{(leadsData || []).length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8 w-44 h-9" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button
            variant={hasFilters ? 'default' : 'outline'}
            size="sm" className="gap-1.5"
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter className="w-4 h-4" />
            Filters{hasFilters ? ` (${[filterSource, filterPriority, filterAssigned].filter(Boolean).length})` : ''}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="w-4 h-4" />Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openAdd()} disabled={!activePipeline}>
            <Plus className="w-4 h-4" />Add Lead
          </Button>
        </div>
      </div>

      {/* ── Filters Row ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
            <div className="flex flex-wrap gap-2 p-3 bg-card border border-border rounded-xl">
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Sources" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Sources</SelectItem>
                  {SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Priorities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Priorities</SelectItem>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize text-xs">{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Assigned</SelectItem>
                  {(employees || []).map(e => <SelectItem key={e._id} value={e._id} className="text-xs">{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFilterSource(''); setFilterPriority(''); setFilterAssigned('') }}>
                  <X className="w-3.5 h-3.5 mr-1" />Clear
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── KPI Bar ────────────────────────────────────────────────────────── */}
      {activePipeline && <KpiBar leads={leadsData} pipelineName={activePipeline.name} />}

      {/* ── No pipeline state ───────────────────────────────────────────────── */}
      {!loadingPipelines && pipelines.length === 0 && (
        <NoPipelineState loading={false} />
      )}

      {/* ── Kanban Board ───────────────────────────────────────────────────── */}
      {activePipeline && (
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1" style={{ minHeight: 0 }}>
          {stages.map(stage => {
            const stageKey = String(stage._id)
            const colData  = kanbanData[stageKey] || { leads: [], count: 0, totalValue: 0 }
            const isDropTarget = dragOver === stageKey

            return (
              <div
                key={stageKey}
                className={`flex flex-col rounded-xl border transition-colors shrink-0 w-[268px] ${
                  isDropTarget ? 'border-primary bg-primary/5' : 'border-border bg-card/50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(stageKey) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); onDragEnd() }}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-border rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: stage.color || '#6366f1' }}
                      />
                      <span className="text-sm font-semibold">{stage.name}</span>
                      {stage.type === 'won'  && <span className="text-[10px]">✅</span>}
                      {stage.type === 'lost' && <span className="text-[10px]">❌</span>}
                    </div>
                    <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-medium">{colData.count}</span>
                  </div>
                  {colData.totalValue > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 pl-4">{fmt(colData.totalValue)}</p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {isLoading && (
                    <div className="space-y-2">
                      {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
                    </div>
                  )}
                  <AnimatePresence>
                    {colData.leads.map(lead => (
                      <KanbanCard
                        key={lead._id}
                        lead={lead}
                        stageType={stage.type}
                        stage={stage}
                        selected={selectedIds.includes(lead._id)}
                        onSelect={toggleSelect}
                        onView={l => setDetailLead(l)}
                        onEdit={openEdit}
                        onDelete={id => { if (confirm('Delete this lead?')) deleteMutation.mutate(id) }}
                        onMoveToLost={handleMoveToLost}
                        onMoveToWon={handleMoveToWon}
                        onAddNote={l => setNoteDialog(l)}
                        onFollowUp={l => setFollowUpLead(l)}
                        onArchive={l => archiveMutation.mutate(l._id)}
                        onConvert={l => setConvertConfirm(l)}
                        dragging={dragging}
                        onDragStart={onDragStart}
                      />
                    ))}
                  </AnimatePresence>
                  {!isLoading && colData.leads.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">Drop leads here</div>
                  )}
                  <button
                    onClick={() => openAdd(stage)}
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bulk Bar ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <BulkBar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds([])}
            stages={stages}
            employees={employees}
            onBulkStage={handleBulkStage}
            onBulkArchive={() => bulkMutation.mutate({ action: 'archive' })}
            onBulkDelete={() => bulkMutation.mutate({ action: 'delete' })}
          />
        )}
      </AnimatePresence>

      {/* ── Modals & Dialogs ────────────────────────────────────────────────── */}

      {detailLead && (
        <LeadDetailModal
          open={!!detailLead}
          onClose={() => setDetailLead(null)}
          leadId={detailLead._id}
          onUpdated={invalidate}
        />
      )}

      <LostReasonDialog
        open={!!lostDialog}
        onClose={() => setLostDialog(null)}
        onConfirm={confirmLost}
        leadName={lostDialog?.lead?.name}
        loading={moveMutation.isPending}
      />

      <WonDialog
        open={!!wonDialog && !convertMutation.isPending}
        onClose={() => setWonDialog(null)}
        onConvert={() => convertMutation.mutate(wonDialog._id)}
        onSkip={() => setWonDialog(null)}
        leadName={wonDialog?.name}
        loading={convertMutation.isPending}
      />

      {noteDialog && (
        <QuickNoteDialog
          open={!!noteDialog}
          onClose={() => setNoteDialog(null)}
          leadId={noteDialog._id}
          leadName={noteDialog.name}
        />
      )}

      {followUpLead && (
        <FollowUpModal
          open={!!followUpLead}
          onClose={() => setFollowUpLead(null)}
          leadId={followUpLead._id}
          leadName={followUpLead.name}
        />
      )}

      <Dialog open={!!convertConfirm} onOpenChange={() => setConvertConfirm(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Convert to Client?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will create a new Client profile for <strong>{convertConfirm?.name}</strong>
            {convertConfirm?.company ? ` (${convertConfirm.company})` : ''}. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertConfirm(null)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => convertMutation.mutate(convertConfirm._id)}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending ? 'Converting…' : 'Yes, Convert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Lead Modal ─────────────────────────────────────────── */}
      <Dialog open={showModal} onOpenChange={v => { setShowModal(v); if (!v) { setEditLead(null); setAddToStage(null); reset() } }}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editLead ? 'Edit Lead' : `Add Lead${addToStage ? ` → ${addToStage.name}` : ''}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Name *</Label>
                <Input {...register('name', { required: true })} placeholder="Contact name" />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input {...register('company')} placeholder="Company name" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} type="email" placeholder="email@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select onValueChange={v => setValue('priority', v)} defaultValue={editLead?.priority || 'medium'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select onValueChange={v => setValue('source', v)} defaultValue={editLead?.source || 'other'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deal Value (₹)</Label>
                <Input {...register('value', { valueAsNumber: true })} type="number" placeholder="50000" />
              </div>
              <div className="space-y-1.5">
                <Label>Expected Close Date</Label>
                <Input {...register('expectedCloseDate')} type="date" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Assign To</Label>
                <Select onValueChange={v => setValue('assignedTo', v)} defaultValue={editLead?.assignedTo?.[0]?._id || editLead?.assignedTo?.[0]}>
                  <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
                  <SelectContent>
                    {(employees || []).map(e => <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                {editLead ? 'Update Lead' : 'Add to Pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}
