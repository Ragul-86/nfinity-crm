import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, CalendarDays, Edit2, Trash2, Users, MoreVertical } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  scheduled:  { label: 'Scheduled',  color: 'bg-blue-500/10 text-blue-400' },
  completed:  { label: 'Completed',  color: 'bg-green-500/10 text-green-400' },
  cancelled:  { label: 'Cancelled',  color: 'bg-muted text-muted-foreground' },
}

function MeetingFormDialog({ open, onClose, clientId, meeting, onSaved }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: meeting ? {
      title: meeting.title,
      date: meeting.date ? new Date(meeting.date).toISOString().slice(0, 16) : '',
      attendees: meeting.attendees?.join(', ') || '',
      agenda: meeting.agenda || '',
      summary: meeting.summary || '',
      nextAction: meeting.nextAction || '',
      status: meeting.status || 'scheduled',
    } : { title: '', date: '', attendees: '', agenda: '', summary: '', nextAction: '', status: 'scheduled' },
  })

  const onSubmit = async (data) => {
    const payload = {
      ...data,
      attendees: data.attendees ? data.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
    }
    try {
      if (meeting) {
        await api.put(`/customers/meetings/${meeting._id}`, payload)
        toast.success('Meeting updated')
      } else {
        await api.post(`/customers/${clientId}/meetings`, payload)
        toast.success('Meeting saved')
      }
      onSaved()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{meeting ? 'Edit Meeting' : 'Log Meeting'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input {...register('title', { required: true })} placeholder="Meeting title" />
          </div>
          <div className="space-y-1.5">
            <Label>Date & Time</Label>
            <Input type="datetime-local" {...register('date')} />
          </div>
          <div className="space-y-1.5">
            <Label>Attendees</Label>
            <Input {...register('attendees')} placeholder="Name1, Name2, …" />
          </div>
          <div className="space-y-1.5">
            <Label>Agenda</Label>
            <Textarea {...register('agenda')} placeholder="Meeting agenda…" className="min-h-[60px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Summary / Notes</Label>
            <Textarea {...register('summary')} placeholder="What was discussed…" className="min-h-[80px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Next Action</Label>
            <Input {...register('nextAction')} placeholder="Follow-up action…" />
          </div>
          {meeting && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select {...register('status')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {['scheduled', 'completed', 'cancelled'].map(s => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{meeting ? 'Update' : 'Save Meeting'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function MeetingsTab({ clientId }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editMeeting, setEditMeeting] = useState(null)

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['customer-meetings', clientId],
    queryFn: () => api.get(`/customers/${clientId}/meetings`).then(r => r.data.data),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/meetings/${id}`),
    onSuccess: () => { qc.invalidateQueries(['customer-meetings', clientId]); toast.success('Deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const invalidate = () => qc.invalidateQueries(['customer-meetings', clientId])

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Log Meeting
        </Button>
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No meetings recorded</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>Log Meeting</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map(m => {
            const s = STATUS_CONFIG[m.status] || STATUS_CONFIG.scheduled
            return (
              <div key={m._id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{m.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                    </div>
                    {m.date && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {format(new Date(m.date), 'EEE, MMM d, yyyy — h:mm a')}
                      </p>
                    )}
                    {m.attendees?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {m.attendees.join(', ')}
                      </p>
                    )}
                    {m.agenda && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Agenda</p>
                        <p className="text-xs leading-relaxed">{m.agenda}</p>
                      </div>
                    )}
                    {m.summary && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Summary</p>
                        <p className="text-xs leading-relaxed">{m.summary}</p>
                      </div>
                    )}
                    {m.nextAction && (
                      <div className="mt-2 bg-primary/5 border border-primary/20 rounded-lg p-2">
                        <p className="text-xs text-primary font-medium">Next Action: {m.nextAction}</p>
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditMeeting(m)}>
                        <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-400 focus:text-red-400"
                        onClick={() => { if (confirm('Delete meeting?')) deleteMut.mutate(m._id) }}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <MeetingFormDialog open={showCreate} onClose={() => setShowCreate(false)} clientId={clientId} onSaved={invalidate} />
      {editMeeting && (
        <MeetingFormDialog open={!!editMeeting} onClose={() => setEditMeeting(null)} clientId={clientId}
          meeting={editMeeting} onSaved={() => { invalidate(); setEditMeeting(null) }} />
      )}
    </div>
  )
}
