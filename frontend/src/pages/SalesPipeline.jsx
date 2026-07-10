import { useState, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Download, UserPlus, X, ChevronDown, ChevronRight,
  Phone, Mail, Building2, IndianRupee, Calendar, Tag, MoreVertical,
  Eye, Edit2, StickyNote, Clock, PhoneCall, MessageCircle,
  TrendingUp, TrendingDown, BarChart2, Filter, CheckSquare2, Square,
  Archive, Trash2, Users, AlertCircle, CheckCheck,
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
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format, isPast, isToday } from 'date-fns'
import LeadDetailModal from '@/components/leads/LeadDetailModal'
import FollowUpModal from '@/components/leads/FollowUpModal'

const STAGES = [
  { key: 'new_lead',       label: 'New Lead',        color: 'bg-indigo-500',  light: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', probability: 5 },
  { key: 'contacted',      label: 'Contacted',       color: 'bg-blue-500',    light: 'bg-blue-500/10 text-blue-400 border-blue-500/30', probability: 15 },
  { key: 'discovery_call', label: 'Discovery Call',  color: 'bg-cyan-500',    light: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30', probability: 30 },
  { key: 'proposal_sent',  label: 'Proposal Sent',   color: 'bg-amber-500',   light: 'bg-amber-500/10 text-amber-400 border-amber-500/30', probability: 50 },
  { key: 'negotiation',    label: 'Negotiation',     color: 'bg-orange-500',  light: 'bg-orange-500/10 text-orange-400 border-orange-500/30', probability: 70 },
  { key: 'won',            label: '✅ Won',           color: 'bg-green-500',   light: 'bg-green-500/10 text-green-400 border-green-500/30', probability: 100 },
  { key: 'lost',           label: '❌ Lost',          color: 'bg-red-500',     light: 'bg-red-500/10 text-red-400 border-red-500/30', probability: 0 },
]

const LOST_REASONS = [
  { value: 'budget',       label: 'Budget / Price' },
  { value: 'no_response',  label: 'No Response' },
  { value: 'competitor',   label: 'Chose Competitor' },
  { value: 'duplicate',    label: 'Duplicate Lead' },
  { value: 'invalid',      label: 'Invalid Lead' },
  { value: 'timing',       label: 'Bad Timing' },
  { value: 'other',        label: 'Other' },
]

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

function fmt(n) {
  if (!n || n === 0) return '₹0'
  if (n >= 1000000) return `₹${(n / 1000000).toFixed(1)}M`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`
  return `₹${n.toLocaleString()}`
}

// ── Analytics KPI Bar ─────────────────────────────────────────────────────────
function AnalyticsBar({ analytics, forecast }) {
  const a = analytics?.data || {}
  const f = forecast?.data || {}
  const kpis = [
    { label: 'Total Leads',     value: a.totalLeads || 0,           color: 'text-blue-400',   icon: Users },
    { label: 'Pipeline Value',  value: fmt(a.pipelineValue),         color: 'text-emerald-400', icon: IndianRupee },
    { label: 'Avg Deal Size',   value: fmt(a.avgDealSize),           color: 'text-amber-400',  icon: TrendingUp },
    { label: 'Conversion Rate', value: `${a.conversionRate || 0}%`, color: 'text-green-400',  icon: CheckCheck },
    { label: 'Won Revenue',     value: fmt(a.wonRevenue),            color: 'text-green-400',  icon: TrendingUp },
    { label: 'Projected',       value: fmt(f.projectedRevenue),      color: 'text-purple-400', icon: BarChart2 },
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

// ── Lost Reason Dialog ────────────────────────────────────────────────────────
function LostReasonDialog({ open, onClose, onConfirm, leadName, loading }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
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
                {LOST_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Any additional context…"
              rows={2}
              className="resize-none"
            />
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

// ── Won Dialog ────────────────────────────────────────────────────────────────
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

// ── Quick Note Dialog ─────────────────────────────────────────────────────────
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
      qc.invalidateQueries(['pipeline-kanban'])
      setContent(''); onClose()
    } catch { toast.error('Failed to add note') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setContent(''); onClose() } }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add Note — {leadName}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Type your note here…"
          rows={4}
          className="resize-none"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!content.trim() || loading}>
            {loading ? 'Saving…' : 'Save Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Kanban Card ───────────────────────────────────────────────────────────────
function KanbanCard({
  lead, stageKey, selected, onSelect,
  onView, onEdit, onDelete, onMoveToLost, onMoveToWon,
  onAddNote, onFollowUp, onArchive, onConvert,
  dragging, onDragStart,
}) {
  const isDragging = dragging?.lead._id === lead._id

  const nextFU = lead.nextFollowUp
  const fuOverdue = nextFU && isPast(new Date(nextFU.scheduledAt)) && nextFU.status === 'pending'
  const fuToday = nextFU && isToday(new Date(nextFU.scheduledAt))

  const closeOverdue = lead.expectedCloseDate
    && isPast(new Date(lead.expectedCloseDate))
    && !['won', 'lost'].includes(lead.status)

  const handleCall = e => { e.stopPropagation(); if (lead.phone) window.open(`tel:${lead.phone}`); else toast.error('No phone number') }
  const handleWhatsApp = e => { e.stopPropagation(); const p = lead.phone?.replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); else toast.error('No phone number') }
  const handleEmail = e => { e.stopPropagation(); if (lead.email) window.open(`mailto:${lead.email}`); else toast.error('No email') }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={() => onDragStart(lead, stageKey)}
      className={`bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all select-none relative group ${
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      }`}
    >
      {/* Selection checkbox */}
      <button
        className={`absolute top-2 left-2 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={e => { e.stopPropagation(); onSelect(lead._id) }}
        title="Select"
      >
        {selected
          ? <CheckSquare2 className="w-3.5 h-3.5 text-primary" />
          : <Square className="w-3.5 h-3.5 text-muted-foreground/50" />
        }
      </button>

      {/* Header row */}
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
            <DropdownMenuItem onClick={() => onView(lead)}>
              <Eye className="w-3.5 h-3.5 mr-2" />View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(lead)}>
              <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAddNote(lead)}>
              <StickyNote className="w-3.5 h-3.5 mr-2" />Add Note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFollowUp(lead)}>
              <Clock className="w-3.5 h-3.5 mr-2" />Schedule Follow-up
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCall}>
              <PhoneCall className="w-3.5 h-3.5 mr-2" />Call
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleWhatsApp}>
              <MessageCircle className="w-3.5 h-3.5 mr-2" />WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleEmail}>
              <Mail className="w-3.5 h-3.5 mr-2" />Email
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {stageKey !== 'won' && stageKey !== 'lost' && (
              <DropdownMenuItem className="text-green-500" onClick={() => onMoveToWon(lead)}>
                <CheckCheck className="w-3.5 h-3.5 mr-2" />Mark as Won
              </DropdownMenuItem>
            )}
            {stageKey !== 'lost' && (
              <DropdownMenuItem className="text-red-400" onClick={() => onMoveToLost(lead)}>
                <TrendingDown className="w-3.5 h-3.5 mr-2" />Mark as Lost
              </DropdownMenuItem>
            )}
            {stageKey === 'won' && !lead.convertedClientId && (
              <DropdownMenuItem className="text-green-500" onClick={() => onConvert(lead)}>
                <UserPlus className="w-3.5 h-3.5 mr-2" />Convert to Client
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onArchive(lead)}>
              <Archive className="w-3.5 h-3.5 mr-2" />Archive
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(lead._id)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Company */}
      {lead.company && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1.5">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{lead.company}</span>
        </div>
      )}

      {/* Phone + Source */}
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        {lead.phone && (
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleCall}
          >
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
        {lead.value > 0 && (
          <span className="text-[11px] font-semibold">{fmt(lead.value)}</span>
        )}
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

      {/* Footer: assigned user + converted badge */}
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

// ── Bulk Action Bar ───────────────────────────────────────────────────────────
function BulkBar({ selectedIds, onClear, onBulk, employees }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-primary/40 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-primary whitespace-nowrap">{selectedIds.length} selected</span>
      <div className="h-4 w-px bg-border" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5 h-8">Move Stage <ChevronDown className="w-3.5 h-3.5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {STAGES.filter(s => !['won', 'lost'].includes(s.key)).map(s => (
            <DropdownMenuItem key={s.key} onClick={() => onBulk('stage', s.key)}>{s.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5 h-8">Priority <ChevronDown className="w-3.5 h-3.5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PRIORITIES.map(p => (
            <DropdownMenuItem key={p} onClick={() => onBulk('priority', p)} className="capitalize">{p}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5 h-8">Assign <ChevronDown className="w-3.5 h-3.5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-48 overflow-y-auto">
          {(employees || []).map(e => (
            <DropdownMenuItem key={e._id} onClick={() => onBulk('assign', e._id)}>{e.name}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="outline" className="h-8" onClick={() => onBulk('archive')}>
        <Archive className="w-3.5 h-3.5 mr-1.5" />Archive
      </Button>
      <Button size="sm" variant="destructive" className="h-8" onClick={() => {
        if (confirm(`Delete ${selectedIds.length} leads? This cannot be undone.`)) onBulk('delete')
      }}>
        <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onClear}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SalesPipeline() {
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editLead, setEditLead] = useState(null)
  const [detailLead, setDetailLead] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [lostDialog, setLostDialog] = useState(null)
  const [wonDialog, setWonDialog] = useState(null)
  const [convertConfirm, setConvertConfirm] = useState(null)
  const [noteDialog, setNoteDialog] = useState(null)
  const [followUpLead, setFollowUpLead] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const queryClient = useQueryClient()

  const kanbanParams = useMemo(() => {
    const p = {}
    if (search) p.search = search
    if (filterSource) p.source = filterSource
    if (filterPriority) p.priority = filterPriority
    if (filterAssigned) p.assignedTo = filterAssigned
    return p
  }, [search, filterSource, filterPriority, filterAssigned])

  const { data: kanbanData, isLoading } = useQuery({
    queryKey: ['pipeline-kanban', kanbanParams],
    queryFn: () => api.get('/pipeline/kanban', { params: kanbanParams }).then(r => r.data.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: analyticsData } = useQuery({
    queryKey: ['pipeline-analytics'],
    queryFn: () => api.get('/pipeline/analytics').then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: forecastData } = useQuery({
    queryKey: ['pipeline-forecast'],
    queryFn: () => api.get('/pipeline/forecast').then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm()

  const invalidate = () => {
    queryClient.invalidateQueries(['pipeline-kanban'])
    queryClient.invalidateQueries(['pipeline-analytics'])
    queryClient.invalidateQueries(['pipeline-forecast'])
  }

  const mutation = useMutation({
    mutationFn: d => editLead ? api.put(`/pipeline/${editLead._id}`, d) : api.post('/pipeline', d),
    onSuccess: () => {
      invalidate()
      toast.success(editLead ? 'Lead updated' : 'Lead created')
      setShowModal(false); setEditLead(null); reset()
    },
    onError: err => toast.error(err.response?.data?.message || 'Error saving lead'),
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, status, lostReason }) => api.put(`/pipeline/${id}/move`, { status, lostReason }),
    onSuccess: () => invalidate(),
    onError: err => toast.error(err.response?.data?.message || 'Failed to move lead'),
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/pipeline/${id}`),
    onSuccess: () => { invalidate(); toast.success('Lead deleted'); setDetailLead(null) },
    onError: () => toast.error('Delete failed'),
  })

  const convertMutation = useMutation({
    mutationFn: id => api.post(`/pipeline/${id}/convert`),
    onSuccess: data => {
      invalidate()
      queryClient.invalidateQueries(['clients'])
      toast.success(`✅ Converted: ${data.data?.data?.client?.companyName || 'New Client'}`)
      setConvertConfirm(null); setWonDialog(null); setDetailLead(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Conversion failed'),
  })

  const archiveMutation = useMutation({
    mutationFn: id => api.put(`/pipeline/${id}/move`, { status: 'archived' }),
    onSuccess: () => { invalidate(); toast.success('Lead archived') },
    onError: () => toast.error('Archive failed'),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ action, value }) => api.post('/pipeline/bulk', { action, ids: selectedIds, value }),
    onSuccess: () => { invalidate(); setSelectedIds([]); toast.success('Bulk action applied') },
    onError: err => toast.error(err.response?.data?.message || 'Bulk action failed'),
  })

  const openAdd = (stageKey = 'new_lead') => {
    setEditLead(null)
    reset({ status: stageKey, priority: 'medium', source: 'other' })
    setShowModal(true)
  }
  const openEdit = lead => {
    setEditLead(lead)
    reset({ ...lead, assignedTo: lead.assignedTo?.[0]?._id || lead.assignedTo?.[0] })
    setShowModal(true)
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/pipeline/export', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url; a.download = 'pipeline.csv'; a.click()
    } catch { toast.error('Export failed') }
  }

  const onDragStart = useCallback((lead, stageKey) => {
    setDragging({ lead, fromStage: stageKey })
  }, [])

  const onDragEnd = useCallback(() => {
    if (dragging && dragOver && dragOver !== dragging.fromStage) {
      if (dragOver === 'lost') {
        setLostDialog({ lead: dragging.lead })
      } else {
        moveMutation.mutate({ id: dragging.lead._id, status: dragOver })
        if (dragOver === 'won') setWonDialog(dragging.lead)
      }
    }
    setDragging(null); setDragOver(null)
  }, [dragging, dragOver, moveMutation])

  const handleMoveToLost = lead => setLostDialog({ lead })
  const handleMoveToWon = lead => {
    moveMutation.mutate({ id: lead._id, status: 'won' })
    setWonDialog(lead)
  }

  const confirmLost = (reason, note) => {
    const lead = lostDialog?.lead
    if (!lead) return
    moveMutation.mutate(
      { id: lead._id, status: 'lost', lostReason: note ? `${reason}: ${note}` : reason },
      { onSuccess: () => setLostDialog(null) }
    )
  }

  const toggleSelect = id => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  const hasFilters = filterSource || filterPriority || filterAssigned

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales Pipeline</h1>
          <p className="text-muted-foreground text-sm">Drag cards to update stages</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 w-48 h-9"
              placeholder="Search leads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={hasFilters ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter className="w-4 h-4" />
            Filters{hasFilters ? ` (${[filterSource, filterPriority, filterAssigned].filter(Boolean).length})` : ''}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="w-4 h-4" />Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openAdd()}>
            <Plus className="w-4 h-4" />Add Lead
          </Button>
        </div>
      </div>

      {/* Filters Row */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-4"
          >
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
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => {
                  setFilterSource(''); setFilterPriority(''); setFilterAssigned('')
                }}>
                  <X className="w-3.5 h-3.5 mr-1" />Clear
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analytics KPI Bar */}
      <AnalyticsBar analytics={analyticsData} forecast={forecastData} />

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4 flex-1" style={{ minHeight: 0 }}>
        {STAGES.map(stage => {
          const colData = kanbanData?.[stage.key] || {}
          const leads = colData.leads || []
          const totalValue = colData.totalValue || 0
          const isDropTarget = dragOver === stage.key
          return (
            <div
              key={stage.key}
              className={`flex flex-col rounded-xl border transition-colors shrink-0 w-[268px] ${
                isDropTarget ? 'border-primary bg-primary/5' : 'border-border bg-card/50'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.key) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); onDragEnd() }}
            >
              {/* Column header */}
              <div className="px-3 py-2.5 border-b border-border rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                    <span className="text-sm font-semibold">{stage.label}</span>
                  </div>
                  <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-medium">{leads.length}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5 pl-4">
                  {totalValue > 0 ? (
                    <p className="text-[11px] text-muted-foreground">{fmt(totalValue)}</p>
                  ) : <span />}
                  {stage.probability > 0 && stage.probability < 100 && (
                    <span className="text-[10px] text-muted-foreground">{stage.probability}% likely</span>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {isLoading && (
                  <div className="space-y-2">
                    {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
                  </div>
                )}
                <AnimatePresence>
                  {leads.map(lead => (
                    <KanbanCard
                      key={lead._id}
                      lead={lead}
                      stageKey={stage.key}
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
                {!isLoading && leads.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-xs">Drop leads here</div>
                )}
                <button
                  onClick={() => openAdd(stage.key)}
                  className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <BulkBar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds([])}
            onBulk={(action, value) => bulkMutation.mutate({ action, value })}
            employees={employees}
          />
        )}
      </AnimatePresence>

      {/* Lead Detail Modal */}
      {detailLead && (
        <LeadDetailModal
          open={!!detailLead}
          onClose={() => setDetailLead(null)}
          leadId={detailLead._id}
          onUpdated={() => invalidate()}
        />
      )}

      {/* Lost Reason Dialog */}
      <LostReasonDialog
        open={!!lostDialog}
        onClose={() => setLostDialog(null)}
        onConfirm={confirmLost}
        leadName={lostDialog?.lead?.name}
        loading={moveMutation.isPending}
      />

      {/* Won Dialog */}
      <WonDialog
        open={!!wonDialog && !convertMutation.isPending}
        onClose={() => setWonDialog(null)}
        onConvert={() => convertMutation.mutate(wonDialog._id)}
        onSkip={() => setWonDialog(null)}
        leadName={wonDialog?.name}
        loading={convertMutation.isPending}
      />

      {/* Quick Note Dialog */}
      {noteDialog && (
        <QuickNoteDialog
          open={!!noteDialog}
          onClose={() => setNoteDialog(null)}
          leadId={noteDialog._id}
          leadName={noteDialog.name}
        />
      )}

      {/* Follow-up Modal */}
      {followUpLead && (
        <FollowUpModal
          open={!!followUpLead}
          onClose={() => setFollowUpLead(null)}
          leadId={followUpLead._id}
          leadName={followUpLead.name}
        />
      )}

      {/* Convert to Client Confirm */}
      <Dialog open={!!convertConfirm} onOpenChange={() => setConvertConfirm(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Convert to Client?</DialogTitle>
          </DialogHeader>
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

      {/* Create/Edit Lead Modal */}
      <Dialog open={showModal} onOpenChange={v => { setShowModal(v); if (!v) { setEditLead(null); reset() } }}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editLead ? 'Edit Lead' : 'Add Lead to Pipeline'}</DialogTitle>
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
                <Label>Brand Name</Label>
                <Input {...register('brandName')} placeholder="Brand name" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} type="email" placeholder="email@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select onValueChange={v => setValue('status', v)} defaultValue={editLead?.status || watch('status') || 'new_lead'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
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
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input {...register('website')} placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Input {...register('industry')} placeholder="e.g. E-commerce" />
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
              <Button type="submit" disabled={isSubmitting}>
                {editLead ? 'Update Lead' : 'Add to Pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
