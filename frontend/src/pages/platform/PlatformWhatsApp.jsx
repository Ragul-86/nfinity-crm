import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  MessageSquare, Save, CheckCircle2, AlertCircle, RefreshCcw,
  Send, Wifi, WifiOff, LayoutTemplate, Activity, X,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

function Field({ label, required, error, type = 'text', helper, ...props }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</label>
      {helper && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{helper}</p>}
      <input type={type} {...props}
        className={`mt-1 w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${error ? 'border-destructive' : 'border-input'}`}
      />
      {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
    </div>
  )
}

const PROVIDERS = [
  { value: 'meta',      label: 'Meta Cloud API' },
  { value: 'twilio',    label: 'Twilio' },
  { value: 'wati',      label: 'WATI' },
  { value: 'interakt',  label: 'Interakt' },
]

function ConnectionBadge({ status }) {
  if (!status) return null
  return status === 'connected' ? (
    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Wifi className="w-3.5 h-3.5" />Connected</div>
  ) : (
    <div className="flex items-center gap-1.5 text-xs font-medium text-red-500"><WifiOff className="w-3.5 h-3.5" />Not Connected</div>
  )
}

function MessageLogsPanel({ open, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-message-logs'],
    queryFn: () => api.get('/platform/whatsapp-settings/logs?limit=50').then(r => r.data),
    enabled: open,
  })
  const logs = data?.logs || []

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-10 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">WhatsApp Message Logs</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No messages sent yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50 text-xs">
                  {log.status === 'delivered' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : log.status === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-amber-400/50 shrink-0" />
                  )}
                  <span className="font-mono text-muted-foreground w-32 shrink-0">
                    {log.sentAt ? format(new Date(log.sentAt), 'MMM d HH:mm') : '—'}
                  </span>
                  <span className="font-medium">{log.to || '—'}</span>
                  <span className="text-muted-foreground flex-1 truncate">{log.template || log.message || '—'}</span>
                  <span className={`capitalize font-medium ${log.status === 'delivered' ? 'text-emerald-500' : log.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`}>
                    {log.status || 'sent'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlatformWhatsApp() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    provider: 'meta',
    accessToken: '', businessAccountId: '', phoneNumberId: '',
    accountSid: '', authToken: '', phoneNumber: '',
  })
  const [errors, setErrors]     = useState({})
  const [connStatus, setConn]   = useState(null)
  const [testPhone, setTestPhone] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [templates, setTemplates] = useState([])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-whatsapp-settings'],
    queryFn: () => api.get('/platform/whatsapp-settings').then(r => r.data),
  })

  useEffect(() => {
    if (data?.settings) {
      setForm(prev => ({ ...prev, ...data.settings }))
      setConn(data.settings.connectionStatus || null)
    }
    if (data?.templates) setTemplates(data.templates)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (body) => api.put('/platform/whatsapp-settings', body).then(r => r.data),
    onSuccess: (d) => { toast.success('WhatsApp settings saved'); setConn(d.connectionStatus || null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const testConnMutation = useMutation({
    mutationFn: () => api.post('/platform/whatsapp-settings/test-connection', form).then(r => r.data),
    onSuccess: (d) => { toast.success('Connection verified!'); setConn('connected') },
    onError: (err) => { toast.error(err.response?.data?.message || 'Connection failed'); setConn('error') },
  })

  const syncTemplatesMutation = useMutation({
    mutationFn: () => api.post('/platform/whatsapp-settings/sync-templates').then(r => r.data),
    onSuccess: (d) => { toast.success(`${d.count || 0} templates synced`); setTemplates(d.templates || []); refetch() },
    onError: err => toast.error(err.response?.data?.message || 'Sync failed'),
  })

  const testMsgMutation = useMutation({
    mutationFn: (phone) => api.post('/platform/whatsapp-settings/test-message', { phone }).then(r => r.data),
    onSuccess: () => toast.success('Test message sent'),
    onError: err => toast.error(err.response?.data?.message || 'Failed to send test message'),
  })

  const validate = () => {
    const e = {}
    if (form.provider === 'meta') {
      if (!form.accessToken.trim()) e.accessToken = 'Required'
      if (!form.businessAccountId.trim()) e.businessAccountId = 'Required'
      if (!form.phoneNumberId.trim()) e.phoneNumberId = 'Required'
    } else if (form.provider === 'twilio') {
      if (!form.accountSid.trim()) e.accountSid = 'Required'
      if (!form.authToken.trim()) e.authToken = 'Required'
      if (!form.phoneNumber.trim()) e.phoneNumber = 'Required'
    } else {
      if (!form.accessToken.trim()) e.accessToken = 'Required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  return (
    <div>
      <PlatformPageHeader
        title="WhatsApp Integration"
        subtitle="Configure WhatsApp Business API for all workspaces"
        icon={MessageSquare}
        breadcrumbs={[{ label: 'WhatsApp' }]}
        actions={
          <div className="flex items-center gap-2">
            <ConnectionBadge status={connStatus} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowLogs(true)}>
              <Activity className="w-3.5 h-3.5 mr-1.5" />Message Logs
            </Button>
            <Button variant="outline" size="sm" onClick={() => testConnMutation.mutate()} disabled={testConnMutation.isPending}>
              <Wifi className="w-3.5 h-3.5 mr-1.5" />{testConnMutation.isPending ? 'Testing…' : 'Test Connection'}
            </Button>
            <Button size="sm" onClick={() => { if (validate()) saveMutation.mutate(form) }} disabled={saveMutation.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" />{saveMutation.isPending ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="max-w-lg space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="max-w-lg space-y-5">
          {/* Provider */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <p className="font-medium text-sm">Provider</p>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button key={p.value} type="button" onClick={() => set('provider', p.value)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all text-left ${form.provider === p.value ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border hover:bg-accent'}`}
                >
                  <MessageSquare className="w-4 h-4" />{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meta Cloud API */}
          {form.provider === 'meta' && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="font-medium text-sm">Meta Cloud API Credentials</p>
              <Field label="Access Token" required type="password" error={errors.accessToken}
                value={form.accessToken} onChange={e => set('accessToken', e.target.value)}
                placeholder="EAAxxxxxx…" helper="System user access token from Meta Business Suite" />
              <Field label="WhatsApp Business Account ID" required error={errors.businessAccountId}
                value={form.businessAccountId} onChange={e => set('businessAccountId', e.target.value)}
                placeholder="1234567890" helper="Found in Meta Business Suite → WhatsApp Accounts" />
              <Field label="Phone Number ID" required error={errors.phoneNumberId}
                value={form.phoneNumberId} onChange={e => set('phoneNumberId', e.target.value)}
                placeholder="1234567890" helper="Found in Meta Business Suite → Phone Numbers" />
            </div>
          )}

          {/* Twilio */}
          {form.provider === 'twilio' && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="font-medium text-sm">Twilio Credentials</p>
              <Field label="Account SID" required error={errors.accountSid} value={form.accountSid} onChange={e => set('accountSid', e.target.value)} placeholder="ACxxxxxxxxxxxxxxxx" />
              <Field label="Auth Token" required type="password" error={errors.authToken} value={form.authToken} onChange={e => set('authToken', e.target.value)} placeholder="Auth token" />
              <Field label="WhatsApp Phone Number" required error={errors.phoneNumber} value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} placeholder="+1415xxxxxxx" helper="Must be WhatsApp-enabled Twilio number" />
            </div>
          )}

          {/* WATI / Interakt */}
          {['wati', 'interakt'].includes(form.provider) && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="font-medium text-sm">{form.provider === 'wati' ? 'WATI' : 'Interakt'} Credentials</p>
              <Field label="API Key" required type="password" error={errors.accessToken} value={form.accessToken} onChange={e => set('accessToken', e.target.value)} placeholder="API key" />
              <Field label="API Endpoint" value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} placeholder={form.provider === 'wati' ? 'https://live-server.wati.io' : 'https://api.interakt.ai'} />
            </div>
          )}

          {/* Template Sync */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Message Templates</p>
              <Button variant="outline" size="sm" onClick={() => syncTemplatesMutation.mutate()} disabled={syncTemplatesMutation.isPending}>
                <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" />{syncTemplatesMutation.isPending ? 'Syncing…' : 'Sync Templates'}
              </Button>
            </div>
            {templates.length > 0 ? (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {templates.map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
                    <span className="font-medium">{t.name || t.id}</span>
                    <span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                      t.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                      'bg-muted text-muted-foreground'
                    }`}>{t.status?.toLowerCase() || 'active'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No templates synced. Click "Sync Templates" to fetch from your WhatsApp Business account.</p>
            )}
          </div>

          {/* Test Message */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <p className="font-medium text-sm">Send Test Message</p>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="+91 98765 43210 (with country code)"
              />
              <Button variant="outline" size="sm" disabled={!testPhone || testMsgMutation.isPending} onClick={() => testMsgMutation.mutate(testPhone)}>
                <Send className="w-3.5 h-3.5 mr-1.5" />{testMsgMutation.isPending ? 'Sending…' : 'Send Test'}
              </Button>
            </div>
            {testMsgMutation.isSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />Test message sent successfully
              </div>
            )}
            {testMsgMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <AlertCircle className="w-3.5 h-3.5" />Failed — check your credentials and try again
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="p-3 bg-yellow-500/10 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700">Changes affect all workspaces on this platform. Test thoroughly before saving in production.</p>
            </div>
          </div>
        </div>
      )}

      <MessageLogsPanel open={showLogs} onClose={() => setShowLogs(false)} />
    </div>
  )
}
