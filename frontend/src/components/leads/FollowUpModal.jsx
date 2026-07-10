import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'

const MODES = [
  { value: 'phone',      label: '📞 Phone Call' },
  { value: 'whatsapp',   label: '💬 WhatsApp' },
  { value: 'email',      label: '📧 Email' },
  { value: 'meeting',    label: '🤝 Meeting' },
  { value: 'video_call', label: '🎥 Video Call' },
]

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

async function apiFetch(url, opts = {}) {
  const r = await fetch(`${API}${url}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  const d = await r.json()
  if (!r.ok) throw new Error(d.message || 'Request failed')
  return d
}

export default function FollowUpModal({ open, onClose, leadId, leadName, existing }) {
  const qc = useQueryClient()
  const isEdit = !!existing

  const now = new Date()
  now.setHours(now.getHours() + 1, 0, 0, 0)
  const defaultDate = now.toISOString().slice(0, 16)

  const [form, setForm] = useState({
    title:       existing?.title       || '',
    scheduledAt: existing?.scheduledAt ? new Date(existing.scheduledAt).toISOString().slice(0, 16) : defaultDate,
    mode:        existing?.mode        || 'phone',
    notes:       existing?.notes       || '',
    reminder:    existing?.reminder    || false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? apiFetch(`/api/follow-ups/${existing._id}`, { method: 'PUT', body: JSON.stringify(data) })
      : apiFetch('/api/follow-ups', { method: 'POST', body: JSON.stringify({ ...data, leadId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups', leadId] })
      qc.invalidateQueries({ queryKey: ['lead-timeline', leadId] })
      toast.success(isEdit ? 'Follow-up updated' : 'Follow-up scheduled')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.scheduledAt) return toast.error('Please select date and time')
    mutation.mutate({ ...form, scheduledAt: new Date(form.scheduledAt).toISOString() })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Follow-up' : 'Schedule Follow-up'}</DialogTitle>
          {leadName && <p className="text-sm text-muted-foreground">For: {leadName}</p>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title (optional)</Label>
            <Input
              placeholder="e.g. Initial call, Proposal discussion"
              value={form.title}
              onChange={e => set('title', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date & Time <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => set('scheduledAt', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={form.mode} onValueChange={v => set('mode', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes / Agenda</Label>
            <Textarea
              placeholder="What to discuss, agenda, preparation notes..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.reminder}
              onChange={e => set('reminder', e.target.checked)}
            />
            <span className="text-sm">Send me a reminder</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Update' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
