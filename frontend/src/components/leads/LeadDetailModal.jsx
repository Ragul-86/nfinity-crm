import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'react-hot-toast'
import {
  Phone, Mail, Globe, Building2, MapPin, Tag, Calendar,
  Plus, Check, X, Clock, ChevronRight, Pencil, Trash2,
  Activity, MessageSquare, UserCheck, TrendingUp,
  PhoneCall, Video, Users, AtSign,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import FollowUpModal from './FollowUpModal'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

async function apiFetch(url, opts = {}) {
  const r = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.message || 'Request failed')
  return d
}

// ── Status / Priority helpers ──────────────────────────────────────────────────
const STATUS_COLORS = {
  new_lead:      'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  contacted:     'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  discovery_call:'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400',
  proposal_sent: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  negotiation:   'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  won:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  lost:          'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  converted:     'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400',
  archived:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const PRIORITY_COLORS = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const STATUSES = ['new_lead','contacted','discovery_call','proposal_sent','negotiation','won','lost','archived']
const PRIORITIES = ['low','medium','high','urgent']

const MODE_ICONS = {
  phone:      <PhoneCall className="w-3.5 h-3.5" />,
  whatsapp:   <MessageSquare className="w-3.5 h-3.5" />,
  email:      <AtSign className="w-3.5 h-3.5" />,
  meeting:    <Users className="w-3.5 h-3.5" />,
  video_call: <Video className="w-3.5 h-3.5" />,
}

const ACTIVITY_ICONS = {
  lead_created:        <Plus className="w-3 h-3" />,
  status_changed:      <TrendingUp className="w-3 h-3" />,
  priority_changed:    <Tag className="w-3 h-3" />,
  note_added:          <MessageSquare className="w-3 h-3" />,
  follow_up_scheduled: <Calendar className="w-3 h-3" />,
  follow_up_completed: <Check className="w-3 h-3" />,
  follow_up_cancelled: <X className="w-3 h-3" />,
  assigned:            <UserCheck className="w-3 h-3" />,
  value_updated:       <TrendingUp className="w-3 h-3" />,
  converted:           <Check className="w-3 h-3" />,
}

function fmtLabel(s) {
  return s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || ''
}

// ── Timeline tab ───────────────────────────────────────────────────────────────
function TimelineTab({ leadId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-timeline', leadId],
    queryFn: () => apiFetch(`/api/leads/${leadId}/timeline`).then(d => d.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>

  const activities = data?.activities || []

  if (!activities.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Activity className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {activities.map(act => (
          <div key={act._id} className="relative">
            {/* Dot */}
            <div className="absolute -left-4 top-1 w-4 h-4 rounded-full bg-background border-2 border-border flex items-center justify-center text-muted-foreground">
              {ACTIVITY_ICONS[act.type] || <Activity className="w-2.5 h-2.5" />}
            </div>

            <div className="bg-muted/30 rounded-lg p-3 ml-2">
              <p className="text-sm">{act.description}</p>
              {act.oldValue && act.newValue && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <span className="line-through">{fmtLabel(act.oldValue)}</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="font-medium text-foreground">{fmtLabel(act.newValue)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                {act.performedBy && (
                  <span className="flex items-center gap-1">
                    <Avatar className="w-3.5 h-3.5">
                      <AvatarFallback className="text-[8px]">{act.performedBy.name?.[0]}</AvatarFallback>
                    </Avatar>
                    {act.performedBy.name}
                  </span>
                )}
                <Clock className="w-3 h-3" />
                <span>{formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Follow-ups tab ─────────────────────────────────────────────────────────────
function FollowUpsTab({ leadId, leadName }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups', leadId],
    queryFn: () => apiFetch(`/api/follow-ups?leadId=${leadId}`).then(d => d.data),
    refetchInterval: 30000,
  })

  const completeMut = useMutation({
    mutationFn: ({ id, outcome }) => apiFetch(`/api/follow-ups/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups', leadId] })
      qc.invalidateQueries({ queryKey: ['lead-timeline', leadId] })
      toast.success('Follow-up marked complete')
    },
    onError: e => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => apiFetch(`/api/follow-ups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups', leadId] })
      toast.success('Follow-up deleted')
    },
    onError: e => toast.error(e.message),
  })

  const followUps = data || []
  const pending   = followUps.filter(f => f.status === 'pending')
  const done      = followUps.filter(f => f.status === 'completed')

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{pending.length} pending · {done.length} completed</p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Schedule
        </Button>
      </div>

      {!followUps.length && (
        <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
          <Calendar className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No follow-ups scheduled</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowAdd(true)}>
            Schedule first follow-up
          </Button>
        </div>
      )}

      {pending.map(fu => {
        const overdue = isPast(new Date(fu.scheduledAt)) && fu.status === 'pending'
        return (
          <div
            key={fu._id}
            className={cn(
              'border rounded-lg p-3 space-y-2',
              overdue ? 'border-destructive/50 bg-destructive/5' : 'border-border'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{MODE_ICONS[fu.mode]}</span>
                <div>
                  <p className="text-sm font-medium">{fu.title || fmtLabel(fu.mode)}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(fu.scheduledAt), 'MMM d, yyyy • h:mm a')}
                    {overdue && <span className="ml-2 text-destructive font-medium">Overdue</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditItem(fu)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6 text-emerald-600"
                  onClick={() => completeMut.mutate({ id: fu._id })}
                  disabled={completeMut.isPending}
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                  onClick={() => deleteMut.mutate(fu._id)}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {fu.notes && <p className="text-xs text-muted-foreground border-t pt-2">{fu.notes}</p>}
          </div>
        )
      })}

      {done.length > 0 && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
            {done.length} completed
          </summary>
          <div className="mt-2 space-y-2">
            {done.map(fu => (
              <div key={fu._id} className="border rounded-lg p-3 opacity-60">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <div>
                    <p className="text-xs font-medium line-through">{fu.title || fmtLabel(fu.mode)}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(fu.scheduledAt), 'MMM d, yyyy')}</p>
                  </div>
                </div>
                {fu.outcome && <p className="text-xs text-muted-foreground mt-1 ml-5">{fu.outcome}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {showAdd && (
        <FollowUpModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          leadId={leadId}
          leadName={leadName}
        />
      )}
      {editItem && (
        <FollowUpModal
          open={!!editItem}
          onClose={() => setEditItem(null)}
          leadId={leadId}
          leadName={leadName}
          existing={editItem}
        />
      )}
    </div>
  )
}

// ── Notes tab ──────────────────────────────────────────────────────────────────
function NotesTab({ lead, onUpdate }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')

  const addMut = useMutation({
    mutationFn: () => apiFetch(`/api/leads/${lead._id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content: text }),
    }),
    onSuccess: (d) => {
      onUpdate(d.data)
      setText('')
      qc.invalidateQueries({ queryKey: ['lead-timeline', lead._id] })
      toast.success('Note added')
    },
    onError: e => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (noteId) => apiFetch(`/api/leads/${lead._id}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (d) => { onUpdate(d.data); toast.success('Note deleted') },
    onError: e => toast.error(e.message),
  })

  const notes = lead.notes || []

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add a note about this lead…"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!text.trim() || addMut.isPending}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? 'Adding…' : 'Add Note'}
          </Button>
        </div>
      </div>

      {/* Notes list */}
      {!notes.length ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...notes].reverse().map(note => (
            <div key={note._id} className="group bg-muted/40 rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {note.createdBy?.name || 'Unknown'} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                </span>
                <Button
                  size="icon" variant="ghost"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                  onClick={() => deleteMut.mutate(note._id)}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function LeadDetailModal({ open, onClose, leadId, onUpdated }) {
  const qc = useQueryClient()
  const [localLead, setLocalLead] = useState(null)

  const { data: fetchedLead, isLoading } = useQuery({
    queryKey: ['lead-detail', leadId],
    queryFn: () => apiFetch(`/api/leads/${leadId}`).then(d => d.data),
    enabled: !!leadId && open,
    refetchInterval: 30000,
    onSuccess: (d) => setLocalLead(d),
  })

  const lead = localLead || fetchedLead

  const updateMut = useMutation({
    mutationFn: (patch) => apiFetch(`/api/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
    onSuccess: (d) => {
      setLocalLead(d.data)
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      onUpdated?.(d.data)
    },
    onError: e => toast.error(e.message),
  })

  if (!open) return null

  const handleStatusChange = (status) => {
    updateMut.mutate({ status })
    toast.success(`Status updated to ${fmtLabel(status)}`)
  }

  const handlePriorityChange = (priority) => {
    updateMut.mutate({ priority })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {isLoading || !lead ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Loading lead…
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {lead.leadId && (
                      <span className="text-xs text-muted-foreground font-mono">{lead.leadId}</span>
                    )}
                    <Badge className={cn('text-xs', STATUS_COLORS[lead.status])}>
                      {fmtLabel(lead.status)}
                    </Badge>
                    <Badge className={cn('text-xs', PRIORITY_COLORS[lead.priority])}>
                      {fmtLabel(lead.priority)}
                    </Badge>
                    {lead.source && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {lead.source.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  <DialogTitle className="text-lg leading-snug">{lead.name}</DialogTitle>
                  {lead.company && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3.5 h-3.5" /> {lead.company}
                    </p>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={lead.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="h-8 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => (
                        <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={lead.priority} onValueChange={handlePriorityChange}>
                    <SelectTrigger className="h-8 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map(p => (
                        <SelectItem key={p} value={p}>{fmtLabel(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact pills */}
              <div className="flex flex-wrap gap-3 mt-3">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Phone className="w-3.5 h-3.5" /> {lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="w-3.5 h-3.5" /> {lead.email}
                  </a>
                )}
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Globe className="w-3.5 h-3.5" /> {lead.website}
                  </a>
                )}
                {(lead.city || lead.state || lead.country) && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}
                  </span>
                )}
                {lead.value > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    ₹{lead.value.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Tags */}
              {lead.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {lead.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Assigned to */}
              {lead.assignedTo?.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="flex -space-x-1">
                    {lead.assignedTo.map(u => (
                      <Avatar key={u._id} className="w-5 h-5 border border-background" title={u.name}>
                        <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                          {u.name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {lead.assignedTo.map(u => u.name).join(', ')}
                  </span>
                </div>
              )}
            </DialogHeader>

            {/* ── Tabs ── */}
            <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="shrink-0 mx-6 mt-3 justify-start h-9 w-auto bg-muted/50">
                <TabsTrigger value="overview"   className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="timeline"   className="text-xs">Timeline</TabsTrigger>
                <TabsTrigger value="followups"  className="text-xs">Follow-ups</TabsTrigger>
                <TabsTrigger value="notes"      className="text-xs">Notes {lead.notes?.length > 0 && `(${lead.notes.length})`}</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Overview */}
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {lead.industry && (
                      <InfoRow label="Industry" value={lead.industry} />
                    )}
                    {lead.serviceRequired && (
                      <InfoRow label="Service Required" value={lead.serviceRequired} />
                    )}
                    {lead.budget > 0 && (
                      <InfoRow label="Budget" value={`₹${lead.budget.toLocaleString()}`} />
                    )}
                    {lead.expectedCloseDate && (
                      <InfoRow label="Expected Close" value={format(new Date(lead.expectedCloseDate), 'MMM d, yyyy')} />
                    )}
                    {lead.campaign && (
                      <InfoRow label="Campaign" value={lead.campaign.name} />
                    )}
                    {lead.followUpDate && (
                      <InfoRow
                        label="Next Follow-up"
                        value={format(new Date(lead.followUpDate), 'MMM d, yyyy • h:mm a')}
                        className={isPast(new Date(lead.followUpDate)) ? 'text-destructive' : ''}
                      />
                    )}
                    {lead.createdAt && (
                      <InfoRow label="Created" value={format(new Date(lead.createdAt), 'MMM d, yyyy')} />
                    )}
                    {lead.createdBy && (
                      <InfoRow label="Created by" value={lead.createdBy.name} />
                    )}
                  </div>

                  {lead.lostReason && (
                    <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                      <p className="text-xs font-medium text-destructive mb-1">Lost Reason</p>
                      <p className="text-sm">{lead.lostReason}</p>
                    </div>
                  )}

                  {lead.convertedClientId && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Converted to Client</p>
                      <p className="text-sm">{lead.convertedClientId.companyName || lead.convertedClientId.contactPerson}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Timeline */}
                <TabsContent value="timeline" className="mt-0">
                  <TimelineTab leadId={lead._id} />
                </TabsContent>

                {/* Follow-ups */}
                <TabsContent value="followups" className="mt-0">
                  <FollowUpsTab leadId={lead._id} leadName={lead.name} />
                </TabsContent>

                {/* Notes */}
                <TabsContent value="notes" className="mt-0">
                  <NotesTab
                    lead={lead}
                    onUpdate={(updated) => setLocalLead(updated)}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value, className }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-medium', className)}>{value}</p>
    </div>
  )
}
