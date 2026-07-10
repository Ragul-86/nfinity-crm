import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Mail, Save, Send, CheckCircle2, AlertCircle, RefreshCcw,
  Wifi, WifiOff, ExternalLink,
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
  { value: 'smtp',      label: 'Custom SMTP',    host: '' },
  { value: 'sendgrid',  label: 'SendGrid',        host: 'smtp.sendgrid.net' },
  { value: 'mailgun',   label: 'Mailgun',         host: 'smtp.mailgun.org' },
  { value: 'ses',       label: 'Amazon SES',      host: 'email-smtp.us-east-1.amazonaws.com' },
  { value: 'gmail',     label: 'Gmail (App Pwd)', host: 'smtp.gmail.com' },
  { value: 'outlook',   label: 'Outlook/Office365', host: 'smtp.office365.com' },
]

function ConnectionStatus({ status }) {
  if (!status) return null
  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <Wifi className="w-3.5 h-3.5" />Connected
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-red-500">
      <WifiOff className="w-3.5 h-3.5" />Not Connected
    </div>
  )
}

export default function PlatformEmail() {
  const [form, setForm] = useState({
    host: '', port: 587, user: '', pass: '',
    fromName: '', fromEmail: '', secure: false, provider: 'smtp',
  })
  const [testEmail, setTestEmail] = useState('')
  const [connStatus, setConnStatus] = useState(null) // 'connected' | 'error'
  const [errors, setErrors] = useState({})
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-email-settings'],
    queryFn: () => api.get('/platform/email-settings').then(r => r.data),
  })

  useEffect(() => {
    if (data?.settings) {
      setForm(prev => ({ ...prev, ...data.settings }))
      setConnStatus(data.settings.connectionStatus || null)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (body) => api.put('/platform/email-settings', body).then(r => r.data),
    onSuccess: (d) => { toast.success('Email settings saved'); setConnStatus(d.connectionStatus || null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const testConnMutation = useMutation({
    mutationFn: () => api.post('/platform/email-settings/test-connection', form).then(r => r.data),
    onSuccess: () => { toast.success('Connection verified!'); setConnStatus('connected') },
    onError: (err) => { toast.error(err.response?.data?.message || 'Connection failed'); setConnStatus('error') },
  })

  const testMutation = useMutation({
    mutationFn: (email) => api.post('/platform/email-settings/test', { email }).then(r => r.data),
    onSuccess: () => toast.success('Test email sent — check your inbox'),
    onError: err => toast.error(err.response?.data?.message || 'Failed to send test email'),
  })

  const validate = () => {
    const e = {}
    if (!form.host.trim()) e.host = 'Required'
    if (!form.user.trim()) e.user = 'Required'
    if (!form.fromEmail.trim()) e.fromEmail = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleProviderChange = (val) => {
    const p = PROVIDERS.find(x => x.value === val)
    set('provider', val)
    if (p?.host) set('host', p.host)
    if (val === 'ses') set('port', 587)
    if (val === 'gmail') { set('port', 587); set('secure', false) }
  }

  return (
    <div>
      <PlatformPageHeader
        title="Email (SMTP) Settings"
        subtitle="Configure outbound email for all platform notifications"
        icon={Mail}
        breadcrumbs={[{ label: 'Email (SMTP)' }]}
        actions={
          <div className="flex items-center gap-2">
            <ConnectionStatus status={connStatus} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => testConnMutation.mutate()} disabled={testConnMutation.isPending}>
              <Wifi className="w-3.5 h-3.5 mr-1.5" />{testConnMutation.isPending ? 'Testing…' : 'Test Connection'}
            </Button>
            <Button size="sm" onClick={() => { if (validate()) saveMutation.mutate(form) }} disabled={saveMutation.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="max-w-lg space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="max-w-lg space-y-5">
          {/* Provider selection */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <p className="font-medium text-sm">Email Provider</p>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(p => (
                <button key={p.value} type="button" onClick={() => handleProviderChange(p.value)}
                  className={`p-2.5 rounded-lg border text-xs font-medium transition-all text-center ${form.provider === p.value ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-accent'}`}
                >{p.label}</button>
              ))}
            </div>
          </div>

          {/* Connection */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <p className="font-medium text-sm">Server Settings</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="SMTP Host" required error={errors.host} value={form.host} onChange={e => set('host', e.target.value)} placeholder="smtp.example.com" />
              </div>
              <Field label="Port" type="number" value={form.port} onChange={e => set('port', Number(e.target.value))} />
            </div>
            <Field label="SMTP Username / API Key" required error={errors.user} value={form.user} onChange={e => set('user', e.target.value)} placeholder="user@example.com" />
            <Field label="SMTP Password" type="password" value={form.pass} onChange={e => set('pass', e.target.value)} placeholder="App password or API key" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.secure} onChange={e => set('secure', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm">Use SSL/TLS (port 465)</span>
            </label>
            {form.provider === 'gmail' && (
              <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg border border-blue-200 text-xs text-blue-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Gmail requires an <strong>App Password</strong>, not your regular password. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">Create one <ExternalLink className="w-2.5 h-2.5" /></a></span>
              </div>
            )}
          </div>

          {/* Sender */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <p className="font-medium text-sm">Sender Identity</p>
            <Field label="From Name" value={form.fromName} onChange={e => set('fromName', e.target.value)} placeholder="DMAX CRM" />
            <Field label="From Email" required error={errors.fromEmail} value={form.fromEmail} onChange={e => set('fromEmail', e.target.value)} placeholder="noreply@yourplatform.com" type="email" />
          </div>

          {/* Test email */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <p className="font-medium text-sm">Send Test Email</p>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Button variant="outline" size="sm" disabled={!testEmail || testMutation.isPending} onClick={() => testMutation.mutate(testEmail)}>
                <Send className="w-3.5 h-3.5 mr-1.5" />{testMutation.isPending ? 'Sending…' : 'Send Test'}
              </Button>
            </div>
            {testMutation.isSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />Test email sent successfully
              </div>
            )}
            {testMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <AlertCircle className="w-3.5 h-3.5" />Test failed — check credentials and try again
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
