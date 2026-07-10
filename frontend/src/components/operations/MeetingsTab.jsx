import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MoreHorizontal, Edit, Trash2, Eye, CalendarDays, Clock, Users, RefreshCcw, Search } from 'lucide-react'
import { format, isPast } from 'date-fns'
import { useForm } from 'react-hook-form'
import api from '@/services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import toast from 'react-hot-toast'

const REFRESH_MS = 30_000

const STATUS_COLORS = {
  scheduled:  'bg-blue-500/10 text-blue-400',
  completed:  'bg-green-500/10 text-green-400',
  cancelled:  'bg-muted text-muted-foreground',
}

// ─── Meeting Modal ────────────────────────────────────────────────────────────
function MeetingModal({ open, onClose, editMeeting, clients }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: editMeeting || { status: 'scheduled', duration: 60 },
  })

  const mutation = useMutation({
    mutationFn: d => editMeeting
      ? api.put(`/operations/meetings/${editMeeting._id}`, d)
      : api.post('/operations/meetings', d),
    onSuccess: () => {
      qc.invalidateQueries(['ops-meetings'])
      qc.invalidateQueries(['ops-calendar'])
      toast.success(editMeeting ? 'Meeting updated' : 'Meeting created')
      onClose(); reset()
    },
    onError: e => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMeeting ? 'Edit Meeting' : 'New Meeting'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Meeting Title *</Label>
            <Input {...register('title', { required: true })} placeholder="e.g. Onboarding call with Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="datetime-local" {...register('date', { required: true })}
                defaultValue={editMeeting?.date ? editMeeting.date.slice(0,16) : ''} />
            </div>
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" min="5" step="5" {...register('duration')} placeholder="60" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Customer</Label>
              <select {...register('client')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— None —</option>
                {(clients || []).map(c => <option key={c._id} value={c._id}>{c.companyName}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...register('status')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Agenda</Label>
            <Textarea {...register('agenda')} placeholder="Meeting agenda..." rows={3} />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea {...register('notes')} placeholder="Meeting notes..." rows={3} />
          </div>
          <div className="space-y-1">
            <Label>Outcome</Label>
            <Textarea {...register('outcome')} placeholder="Meeting outcome..." rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Next Action</Label>
            <Input {...register('nextAction')} placeholder="What happens after this meeting?" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : editMeeting ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Meeting View Modal ────────────────────────────────────────────────────────
function MeetingViewModal({ meeting, open, onClose }) {
  if (!meeting) return null
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{meeting.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${STATUS_COLORS[meeting.status] || ''}`}>
              {meeting.status}
            </span>
            <span className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
              <CalendarDays className="w-3 h-3" />{format(new Date(meeting.date), 'PPp')}
            </span>
            {meeting.duration && (
              <span className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
                <Clock className="w-3 h-3" />{meeting.duration} min
              </span>
            )}
          </div>

          {meeting.client && (
            <div className="text-sm"><span className="text-muted-foreground">Customer: </span>{meeting.client.companyName}</div>
          )}

          {meeting.attendees?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Attendees</p>
              <div className="flex flex-wrap gap-1.5">
                {meeting.attendees.map((a, i) => (
                  <span key={i} className="text-xs bg-muted px-2 py-1 rounded-full">{a.name || a.email}</span>
                ))}
              </div>
            </div>
          )}

          {meeting.agenda && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Agenda</p>
              <p className="text-sm">{meeting.agenda}</p>
            </div>
          )}
          {meeting.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{meeting.notes}</p>
            </div>
          )}
          {meeting.outcome && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Outcome</p>
              <p className="text-sm">{meeting.outcome}</p>
            </div>
          )}
          {meeting.nextAction && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Next Action</p>
              <p className="text-sm text-primary">{meeting.nextAction}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main MeetingsTab ─────────────────────────────────────────────────────────
export default function MeetingsTab() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [filterStatus, setStatus]   = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editMeeting, setEdit]      = useState(null)
  const [viewMeeting, setView]      = useState(null)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['ops-meetings', filterStatus],
    queryFn: () => api.get('/operations/meetings', { params: { status: filterStatus || undefined, limit: 100 } }).then(r => r.data),
    refetchInterval: REFRESH_MS,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { limit: 200 } }).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/operations/meetings/${id}`),
    onSuccess: () => { qc.invalidateQueries(['ops-meetings']); toast.success('Meeting deleted') },
  })

  const meetings = (data?.data || []).filter(m =>
    !search || m.title?.toLowerCase().includes(search.toLowerCase()) || m.client?.companyName?.toLowerCase().includes(search.toLowerCase())
  )
  const clients = clientsData?.data || []

  const handleClose = () => { setShowModal(false); setEdit(null) }

  // Grouped by month
  const byMonth = meetings.reduce((acc, m) => {
    const key = format(new Date(m.date), 'MMMM yyyy')
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8 w-52 h-9 text-sm" placeholder="Search meetings…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={e => setStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={() => refetch()} className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCcw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEdit(null); setShowModal(true) }}>
          <Plus className="w-3.5 h-3.5" />New Meeting
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Total', value: meetings.length,                                              color: 'text-foreground' },
          { label: 'Scheduled', value: meetings.filter(m => m.status === 'scheduled').length,    color: 'text-blue-400' },
          { label: 'Completed', value: meetings.filter(m => m.status === 'completed').length,    color: 'text-green-400' },
          { label: 'Upcoming (7d)', value: meetings.filter(m => { const d = new Date(m.date); const now = new Date(); return d >= now && d <= new Date(now.getTime() + 7*86400000) }).length, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-3 py-2">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Meeting List */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16">
          <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No meetings found</p>
          <Button size="sm" className="mt-3 gap-1.5" onClick={() => { setEdit(null); setShowModal(true) }}>
            <Plus className="w-3.5 h-3.5" />Schedule Meeting
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byMonth).map(([month, monthMeetings]) => (
            <div key={month}>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{month}</p>
              <div className="space-y-2">
                {monthMeetings.map(m => {
                  const past = isPast(new Date(m.date)) && m.status === 'scheduled'
                  return (
                    <div key={m._id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow">
                      <div className={`w-1.5 h-12 rounded-full shrink-0 ${m.status === 'completed' ? 'bg-green-500' : m.status === 'cancelled' ? 'bg-muted' : 'bg-blue-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{format(new Date(m.date), 'MMM d, yyyy h:mm a')}</span>
                          {m.duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.duration}min</span>}
                          {m.client && <span>{m.client.companyName}</span>}
                          {m.attendees?.length > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{m.attendees.length} attendees</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[m.status] || ''} ${past ? 'border border-orange-500/30' : ''}`}>
                          {past ? 'Overdue' : m.status}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded hover:bg-muted"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setView(m)}><Eye className="w-3.5 h-3.5 mr-2" />View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setEdit(m); setShowModal(true) }}><Edit className="w-3.5 h-3.5 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate(m._id)}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <MeetingModal open={showModal} onClose={handleClose} editMeeting={editMeeting} clients={clients} />
      <MeetingViewModal meeting={viewMeeting} open={!!viewMeeting} onClose={() => setView(null)} />
    </div>
  )
}
