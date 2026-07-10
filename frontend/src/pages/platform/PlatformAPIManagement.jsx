import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Key, RefreshCcw, Plus, Copy, Trash2, Eye, EyeOff,
  BarChart2, AlertTriangle, ExternalLink, RefreshCw, X,
  Activity, Clock, Shield,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, StatusBadge, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const SCOPES = ['read', 'write', 'admin', 'webhook']
const EXPIRY = [
  { value: 'never', label: 'Never' },
  { value: '30d',   label: '30 Days' },
  { value: '90d',   label: '90 Days' },
  { value: '1y',    label: '1 Year' },
]
const RATE_LIMIT_OPTIONS = [100, 500, 1000, 5000, 10000]

function NewKeyModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState(['read'])
  const [expiry, setExpiry] = useState('never')
  const [rateLimit, setRateLimit] = useState(1000)

  const mutation = useMutation({
    mutationFn: () => api.post('/platform/api-keys', { name, scopes, expiry, rateLimit }).then(r => r.data),
    onSuccess: (d) => { toast.success('API key created!'); onCreate?.(d); onClose(); setName(''); setScopes(['read']) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm z-10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Generate API Key</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Key Name *</label>
          <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production CRM" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Scopes</label>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {SCOPES.map(s => (
              <button key={s} type="button" onClick={() => setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium capitalize transition-all ${scopes.includes(s) ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-accent'}`}
              >{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Expiry</label>
          <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
            value={expiry} onChange={e => setExpiry(e.target.value)}>
            {EXPIRY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Rate Limit (requests/hour)</label>
          <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
            value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))}>
            {RATE_LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n.toLocaleString()} req/hr</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Creating…' : 'Generate Key'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function RateLimitModal({ apiKey, open, onClose, onSave }) {
  const [limit, setLimit] = useState(apiKey?.rateLimit || 1000)

  const mutation = useMutation({
    mutationFn: () => api.patch(`/platform/api-keys/${apiKey?._id}/rate-limit`, { rateLimit: limit }).then(r => r.data),
    onSuccess: () => { toast.success('Rate limit updated'); onSave?.(); onClose() },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-xs z-10 p-5 space-y-4">
        <p className="font-semibold text-sm">Rate Limit — {apiKey?.name}</p>
        <div>
          <label className="text-xs text-muted-foreground">Requests per hour</label>
          <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
            value={limit} onChange={e => setLimit(Number(e.target.value))}>
            {RATE_LIMIT_OPTIONS.map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Update'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function APILogsDrawer({ apiKey, open, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['api-key-logs', apiKey?._id],
    queryFn: () => api.get(`/platform/api-keys/${apiKey?._id}/logs?limit=50`).then(r => r.data),
    enabled: open && !!apiKey?._id,
  })

  const logs = data?.logs || []

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-10 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">API Logs — {apiKey?.name}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No API calls recorded yet</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Time</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Method</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Endpoint</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Latency</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-muted-foreground">{log.createdAt ? format(new Date(log.createdAt), 'HH:mm:ss') : '—'}</td>
                    <td className="py-2 px-3">
                      <span className={`font-bold ${log.method === 'GET' ? 'text-blue-500' : log.method === 'POST' ? 'text-emerald-500' : log.method === 'DELETE' ? 'text-red-500' : 'text-amber-500'}`}>
                        {log.method || 'GET'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-foreground max-w-xs truncate">{log.endpoint || '/'}</td>
                    <td className="py-2 px-3">
                      <span className={`font-medium ${log.status < 300 ? 'text-emerald-500' : log.status < 400 ? 'text-amber-500' : 'text-red-500'}`}>{log.status || 200}</span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{log.latencyMs ? `${log.latencyMs}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function KeyReveal({ value }) {
  const [show, setShow] = useState(false)
  if (!value) return <span className="text-xs text-muted-foreground font-mono">sk_••••••••••••••••</span>
  return (
    <div className="flex items-center gap-2">
      <code className="text-xs font-mono">{show ? value : value.slice(0, 8) + '••••••••••••••'}</code>
      <button type="button" onClick={() => setShow(s => !s)} className="text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied!') }} className="text-muted-foreground hover:text-foreground transition-colors">
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export default function PlatformAPIManagement() {
  const qc = useQueryClient()
  const [showCreate,   setShowCreate]   = useState(false)
  const [newKey,       setNewKey]       = useState(null)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [rateLimitKey, setRateLimitKey] = useState(null)
  const [logsKey,      setLogsKey]      = useState(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-api-keys'],
    queryFn: () => api.get('/platform/api-keys').then(r => r.data),
  })

  const keys       = data?.keys || []
  const totalCalls = data?.totalCallsToday || 0

  const revokeMutation = useMutation({
    mutationFn: (id) => api.delete(`/platform/api-keys/${id}`),
    onSuccess: () => { toast.success('API key revoked'); qc.invalidateQueries({ queryKey: ['platform-api-keys'] }); setRevokeTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const regenMutation = useMutation({
    mutationFn: (id) => api.post(`/platform/api-keys/${id}/regenerate`).then(r => r.data),
    onSuccess: (d) => { toast.success('Key regenerated — copy it now!'); setNewKey(d); qc.invalidateQueries({ queryKey: ['platform-api-keys'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  return (
    <div>
      <PlatformPageHeader
        title="API Management"
        subtitle={`${keys.length} API keys · ${totalCalls.toLocaleString()} calls today`}
        icon={Key}
        breadcrumbs={[{ label: 'API Management' }]}
        actions={
          <>
            <a
              href="https://docs.teamupcrm.com/api"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />API Docs
            </a>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Generate Key
            </Button>
          </>
        }
      />

      {/* One-time reveal banner */}
      {newKey?.key && (
        <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-200 rounded-xl">
          <p className="text-sm font-medium text-emerald-700 mb-1">⚠️ Copy this key now — it won't be shown again</p>
          <div className="flex items-center gap-3">
            <code className="text-xs font-mono bg-background px-2 py-1 rounded border border-border flex-1 break-all">{newKey.key}</code>
            <button type="button" onClick={() => { navigator.clipboard.writeText(newKey.key); toast.success('Copied!') }} className="shrink-0 text-emerald-700">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button type="button" className="text-xs text-emerald-600 mt-2 hover:underline" onClick={() => setNewKey(null)}>Dismiss</button>
        </div>
      )}

      {/* Usage summary */}
      {keys.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total Keys', value: keys.length, icon: Key, color: 'text-primary' },
            { label: 'Active Keys', value: keys.filter(k => !k.revoked && k.status !== 'revoked').length, icon: Shield, color: 'text-emerald-500' },
            { label: 'Calls Today', value: totalCalls.toLocaleString(), icon: Activity, color: 'text-blue-500' },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-semibold text-sm">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Key className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm mb-3">No API keys generated</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5 mr-1.5" />Generate First Key</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k._id || k.id} className="flex items-start gap-4 p-4 bg-card border border-border rounded-xl hover:shadow-sm transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Key className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-medium text-sm">{k.name}</p>
                  <StatusBadge status={k.status || (k.revoked ? 'revoked' : 'active')} />
                  {(k.scopes || []).map(s => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground capitalize">{s}</span>
                  ))}
                </div>
                <KeyReveal value={k.key || k.maskedKey} />
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Created {k.createdAt ? format(new Date(k.createdAt), 'MMM d, yyyy') : '—'}</span>
                  {k.expiresAt && <span>Expires {format(new Date(k.expiresAt), 'MMM d, yyyy')}</span>}
                  {k.usageCount !== undefined && <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />{k.usageCount?.toLocaleString() || 0} calls</span>}
                  {k.rateLimit && <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{k.rateLimit.toLocaleString()} req/hr</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="w-7 h-7" title="API Logs" onClick={() => setLogsKey(k)}>
                  <Activity className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7" title="Rate Limit" onClick={() => setRateLimitKey(k)}>
                  <BarChart2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7" title="Regenerate Key" disabled={k.revoked || regenMutation.isPending}
                  onClick={() => { if (confirm('Regenerate this key? The old key will stop working immediately.')) regenMutation.mutate(k._id || k.id) }}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" disabled={k.revoked} onClick={() => setRevokeTarget(k)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewKeyModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={d => { setNewKey(d); qc.invalidateQueries({ queryKey: ['platform-api-keys'] }) }} />
      <RateLimitModal apiKey={rateLimitKey} open={!!rateLimitKey} onClose={() => setRateLimitKey(null)} onSave={() => qc.invalidateQueries({ queryKey: ['platform-api-keys'] })} />
      <APILogsDrawer apiKey={logsKey} open={!!logsKey} onClose={() => setLogsKey(null)} />
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={`Revoke "${revokeTarget?.name}"?`}
        description="This API key will stop working immediately. This cannot be undone."
        confirmLabel="Revoke Key"
        confirmVariant="destructive"
        onConfirm={() => revokeMutation.mutate(revokeTarget._id || revokeTarget.id)}
        loading={revokeMutation.isPending}
      />
    </div>
  )
}
