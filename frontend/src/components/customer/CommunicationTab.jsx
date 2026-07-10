import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Phone, Mail, MessageCircle, Smartphone, MessageSquare } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

const COMM_TYPES = [
  { key: 'call',      label: 'Call',      icon: Phone,          color: 'text-green-400',  bg: 'bg-green-500/10' },
  { key: 'email',     label: 'Email',     icon: Mail,           color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle,  color: 'text-green-400',  bg: 'bg-green-500/10' },
  { key: 'sms',       label: 'SMS',       icon: Smartphone,     color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  { key: 'meeting',   label: 'Meeting',   icon: MessageSquare,  color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { key: 'other',     label: 'Other',     icon: MessageSquare,  color: 'text-muted-foreground', bg: 'bg-muted/20' },
]

function getTypeConfig(type) {
  return COMM_TYPES.find(t => t.key === type) || COMM_TYPES[COMM_TYPES.length - 1]
}

function AddCommDialog({ open, onClose, clientId, onSaved }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { type: 'call', direction: 'outbound', summary: '', duration: '', subject: '' },
  })

  const onSubmit = async (data) => {
    try {
      await api.post(`/customers/${clientId}/communication`, data)
      toast.success('Communication logged')
      onSaved()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select {...register('type')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {COMM_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <select {...register('direction')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Subject / Title</Label>
            <Input {...register('subject')} placeholder="Brief subject" />
          </div>
          <div className="space-y-1.5">
            <Label>Summary / Notes</Label>
            <Textarea {...register('summary')} placeholder="What was discussed…" className="min-h-[80px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (minutes)</Label>
            <Input type="number" {...register('duration')} min="0" placeholder="e.g. 15" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Log Communication</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function CommunicationTab({ clientId }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['customer-communication', clientId],
    queryFn: () => api.get(`/customers/${clientId}/communication`).then(r => r.data.data),
  })

  const filtered = typeFilter === 'all' ? entries : entries.filter(e => e.type === typeFilter)

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Type filters */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setTypeFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            All ({entries.length})
          </button>
          {COMM_TYPES.filter(t => t.key !== 'other').map(t => {
            const count = entries.filter(e => e.type === t.key).length
            if (count === 0) return null
            return (
              <button key={t.key} onClick={() => setTypeFilter(t.key)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${typeFilter === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {t.label} ({count})
              </button>
            )
          })}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Log Comm
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No communication logged yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowAdd(true)}>Log First Entry</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry, i) => {
            const cfg = getTypeConfig(entry.type)
            const Icon = cfg.icon
            return (
              <div key={entry._id || i} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium capitalize">
                          {entry.direction === 'inbound' ? 'Incoming' : 'Outgoing'} {cfg.label}
                        </span>
                        {entry.subject && <span className="text-sm text-muted-foreground">— {entry.subject}</span>}
                      </div>
                      {entry.summary && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{entry.summary}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {entry.duration && <span>{entry.duration} min</span>}
                        {entry.performedBy?.name && <span>by {entry.performedBy.name}</span>}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground shrink-0">
                      {entry.createdAt ? format(new Date(entry.createdAt), 'MMM d, h:mm a') : ''}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddCommDialog open={showAdd} onClose={() => setShowAdd(false)} clientId={clientId}
        onSaved={() => qc.invalidateQueries(['customer-communication', clientId])} />
    </div>
  )
}
