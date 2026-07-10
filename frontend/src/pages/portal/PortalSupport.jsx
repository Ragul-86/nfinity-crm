import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Headphones, Plus, Send, ChevronLeft, MessageCircle } from 'lucide-react'
import portalApi from '@/services/portalApi'
import { usePortal } from '@/contexts/PortalContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting_client: 'bg-purple-100 text-purple-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
}

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '' }

export default function PortalSupport() {
  const { portalUser } = usePortal()
  const qc = useQueryClient()
  const [view, setView] = useState('list') // 'list' | 'ticket' | 'new'
  const [selectedId, setSelectedId] = useState(null)
  const [reply, setReply] = useState('')
  const [newForm, setNewForm] = useState({ title: '', description: '', category: 'general', priority: 'medium' })

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['portal-support'],
    queryFn: () => portalApi.get('/support').then(r => r.data.data),
  })

  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ['portal-ticket', selectedId],
    queryFn: () => portalApi.get(`/support/${selectedId}`).then(r => r.data.data),
    enabled: !!selectedId && view === 'ticket',
  })

  const { mutate: createTicket, isPending: creating } = useMutation({
    mutationFn: (body) => portalApi.post('/support', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Ticket created')
      qc.invalidateQueries({ queryKey: ['portal-support'] })
      setView('list')
      setNewForm({ title: '', description: '', category: 'general', priority: 'medium' })
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const { mutate: sendReply, isPending: replying } = useMutation({
    mutationFn: (msg) => portalApi.post(`/support/${selectedId}/reply`, { message: msg }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-ticket', selectedId] })
      setReply('')
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  })

  if (view === 'new') return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setView('list')}><ChevronLeft className="w-4 h-4" /></Button>
        <h1 className="text-2xl font-bold">New Ticket</h1>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="Brief description of your issue" value={newForm.title} onChange={e => setNewForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={newForm.category} onValueChange={v => setNewForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={newForm.priority} onValueChange={v => setNewForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="Describe your issue in detail..." rows={5} value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
            <Button onClick={() => createTicket(newForm)} disabled={!newForm.title || creating}>
              {creating ? 'Submitting...' : 'Submit Ticket'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  if (view === 'ticket') return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setView('list')}><ChevronLeft className="w-4 h-4" /></Button>
        <h1 className="text-2xl font-bold">{ticket?.ticketNumber || '…'}</h1>
        {ticket && <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLORS[ticket.status] || ''}`}>{ticket.status?.replace('_', ' ')}</span>}
      </div>
      {ticketLoading ? <Skeleton className="h-64" /> : ticket && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">{ticket.title}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {ticket.messages?.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.sender === 'client' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                      <p className={`text-xs font-medium mb-0.5 ${msg.sender === 'client' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {msg.sender === 'client' ? 'You' : msg.senderName || 'Support'}
                      </p>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <p className={`text-xs mt-1 ${msg.sender === 'client' ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'}`}>{fmtDate(msg.timestamp)}</p>
                    </div>
                  </div>
                ))}
                {!ticket.messages?.length && <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>}
              </div>
            </CardContent>
          </Card>
          {!['resolved', 'closed'].includes(ticket.status) && (
            <div className="flex gap-2">
              <Textarea placeholder="Type your reply..." value={reply} onChange={e => setReply(e.target.value)} rows={2} className="flex-1" />
              <Button onClick={() => sendReply(reply)} disabled={!reply.trim() || replying} className="shrink-0 self-end">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Get help from our support team</p>
        </div>
        <Button onClick={() => setView('new')} className="gap-2">
          <Plus className="w-4 h-4" />New Ticket
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !tickets.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Headphones className="w-10 h-10 mb-3 opacity-30" />
            <p>No tickets yet</p>
            <Button className="mt-4 gap-2" onClick={() => setView('new')}><Plus className="w-4 h-4" />Create First Ticket</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <Card key={t._id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => { setSelectedId(t._id); setView('ticket') }}>
              <CardContent className="p-4 flex items-center gap-4">
                <MessageCircle className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{t.ticketNumber}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[t.status] || ''}`}>{t.status?.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{t.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{fmtDate(t.updatedAt)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{t.category}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
