import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Webhook, RefreshCcw, Plus, Trash2, Globe, Pencil,
  Play, Power, RotateCcw, Activity, X, CheckCircle2, AlertCircle,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, StatusBadge, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const WEBHOOK_EVENTS = [
  'workspace.created',  'workspace.suspended',  'workspace.activated',  'workspace.deleted',
  'user.created',       'user.updated',          'user.suspended',       'user.deleted',
  'subscription.created','subscription.updated', 'subscription.expired', 'subscription.cancelled',
  'payment.received',   'payment.failed',        'invoice.created',      'invoice.overdue',
  'lead.created',       'lead.converted',        'lead.deleted',
  'sop.completed',      'task.completed',
]

function WebhookFormModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState({ url: '', events: [], secret: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ url: initial.url || '', events: initial.events || [], secret: initial.secret || '' })
      } else {
        setForm({ url: '', events: [], secret: '' })
      }
    }
  }, [open, initial?._id])

  if (!open) return null

  const toggleEvent = (ev) => set('events', form.events.includes(ev) ? form.events.filter(x => x !== ev) : [...form.events, ev])
  const selectAll = () => set('events', [...WEBHOOK_EVENTS])
  const clearAll  = () => set('events', [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg z-10 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">{initial ? 'Edit Webhook' : 'Create Webhook'}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Endpoint URL *</label>
            <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://your-server.com/webhook" type="url" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Secret (HMAC signing key)</label>
            <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.secret} onChange={e => set('secret', e.target.value)} placeholder="Leave blank for no signature" type="password" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Subscribe to Events ({form.events.length}/{WEBHOOK_EVENTS.length})</label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-[10px] text-primary hover:underline">Select All</button>
                <button type="button" onClick={clearAll}  className="text-[10px] text-muted-foreground hover:underline">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto border border-border rounded-lg p-2">
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer">
                  <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} className="w-3 h-3 rounded" />
                  <span className="text-[11px] font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.url.trim() || form.events.length === 0 || loading} onClick={() => onSave(form)}>
            {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Create Webhook')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function WebhookLogsDrawer({ webhook, open, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['webhook-logs', webhook?._id],
    queryFn: () => api.get(`/platform/webhooks/${webhook?._id}/logs?limit=50`).then(r => r.data),
    enabled: open && !!webhook?._id,
  })
  const logs = data?.logs || []

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-10 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <p className="font-semibold text-sm">Delivery Logs</p>
            <p className="text-xs text-muted-foreground truncate">{webhook?.url}</p>
          </div>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No delivery logs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50 text-xs">
                  {log.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className="font-mono text-muted-foreground w-36 shrink-0">
                    {log.deliveredAt ? format(new Date(log.deliveredAt), 'MMM d HH:mm:ss') : '—'}
                  </span>
                  <span className="font-mono">{log.event || '—'}</span>
                  <span className={`ml-auto font-medium ${log.statusCode < 300 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {log.statusCode || '—'}
                  </span>
                  {log.duration && <span className="text-muted-foreground">{log.duration}ms</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlatformWebhooks() {
  const qc = useQueryClient()
  const [showCreate,    setShowCreate]    = useState(false)
  const [editTarget,    setEditTarget]    = useState(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [logsTarget,    setLogsTarget]    = useState(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-webhooks'],
    queryFn: () => api.get('/platform/webhooks').then(r => r.data),
  })

  const webhooks = data?.webhooks || []

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/platform/webhooks', body).then(r => r.data),
    onSuccess: () => { toast.success('Webhook created'); qc.invalidateQueries({ queryKey: ['platform-webhooks'] }); setShowCreate(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/platform/webhooks/${id}`, body).then(r => r.data),
    onSuccess: () => { toast.success('Webhook updated'); qc.invalidateQueries({ queryKey: ['platform-webhooks'] }); setEditTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/platform/webhooks/${id}`),
    onSuccess: () => { toast.success('Webhook deleted'); qc.invalidateQueries({ queryKey: ['platform-webhooks'] }); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.patch(`/platform/webhooks/${id}/toggle`, { enabled }).then(r => r.data),
    onSuccess: (_, vars) => { toast.success(vars.enabled ? 'Webhook enabled' : 'Webhook disabled'); qc.invalidateQueries({ queryKey: ['platform-webhooks'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const testMutation = useMutation({
    mutationFn: (id) => api.post(`/platform/webhooks/${id}/test`).then(r => r.data),
    onSuccess: (d) => toast.success(d.message || 'Test event sent successfully'),
    onError: err => toast.error(err.response?.data?.message || 'Test delivery failed'),
  })

  return (
    <div>
      <PlatformPageHeader
        title="Webhook Management"
        subtitle={`${webhooks.length} webhooks · ${webhooks.filter(w => w.status !== 'disabled').length} active`}
        icon={Webhook}
        breadcrumbs={[{ label: 'Webhook Management' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add Webhook
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Webhook className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm mb-3">No webhooks configured</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5 mr-1.5" />Add First Webhook</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(w => (
            <div key={w._id || w.id} className={`bg-card border rounded-xl p-4 ${w.status === 'disabled' ? 'border-border opacity-70' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe className={`w-4 h-4 ${w.status === 'disabled' ? 'text-muted-foreground' : 'text-primary'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-medium text-sm font-mono truncate max-w-xs">{w.url}</p>
                      <StatusBadge status={w.status || 'active'} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {w.createdAt ? format(new Date(w.createdAt), 'MMM d, yyyy') : '—'}
                      {w.lastDeliveryAt ? ` · Last delivery: ${format(new Date(w.lastDeliveryAt), 'MMM d HH:mm')}` : ''}
                      {w.successRate !== undefined ? ` · ${w.successRate}% success` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-7 h-7" title="View Logs" onClick={() => setLogsTarget(w)}>
                    <Activity className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7" title="Send Test Event"
                    disabled={testMutation.isPending || w.status === 'disabled'}
                    onClick={() => testMutation.mutate(w._id || w.id)}>
                    <Play className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7" title="Edit" onClick={() => setEditTarget(w)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7" title={w.status === 'disabled' ? 'Enable' : 'Disable'}
                    onClick={() => toggleMutation.mutate({ id: w._id || w.id, enabled: w.status === 'disabled' })}>
                    <Power className={`w-3.5 h-3.5 ${w.status === 'disabled' ? 'text-muted-foreground' : 'text-emerald-500'}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => setDeleteTarget(w)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(w.events || []).map(ev => (
                  <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-muted-foreground">{ev}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <WebhookFormModal open={showCreate}  onClose={() => setShowCreate(false)} onSave={createMutation.mutate} loading={createMutation.isPending} />
      <WebhookFormModal open={!!editTarget} initial={editTarget} onClose={() => setEditTarget(null)}
        onSave={(form) => updateMutation.mutate({ id: editTarget._id || editTarget.id, ...form })} loading={updateMutation.isPending} />
      <WebhookLogsDrawer webhook={logsTarget} open={!!logsTarget} onClose={() => setLogsTarget(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete webhook?"
        description={`Remove webhook for ${deleteTarget?.url}? All delivery history will be lost.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
