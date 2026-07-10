import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Wrench, Save } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

function SectionTitle({ children }) {
  return <p className="font-medium text-sm mb-4 pt-2 first:pt-0">{children}</p>
}

function Field({ label, helper, error, children, required }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</label>
      {helper && <p className="text-[11px] text-muted-foreground/70 mb-1">{helper}</p>}
      {children}
      {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
    </div>
  )
}

function Input({ ...props }) {
  return <input {...props} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
}

function Select({ children, ...props }) {
  return <select {...props} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring">{children}</select>
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <button onClick={() => onChange(!checked)} className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

export default function PlatformSystemSettings() {
  const [form, setForm] = useState({
    platformName: 'NFINITY CRM',
    supportEmail: '',
    defaultCurrency: 'INR',
    defaultTimezone: 'Asia/Kolkata',
    defaultLanguage: 'en',
    maintenanceMode: false,
    allowSignup: true,
    requireEmailVerification: true,
    sessionTimeoutMinutes: 60,
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireMFA: false,
    dataRetentionDays: 365,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data } = useQuery({
    queryKey: ['platform-system-settings'],
    queryFn: () => api.get('/platform/settings').then(r => r.data),
  })

  useEffect(() => {
    if (data?.settings) setForm(prev => ({ ...prev, ...data.settings }))
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (body) => api.put('/platform/settings', body).then(r => r.data),
    onSuccess: () => toast.success('System settings saved'),
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const CURRENCIES = ['INR','USD','EUR','GBP','AED','SGD','AUD']
  const TIMEZONES = ['Asia/Kolkata','UTC','America/New_York','America/Los_Angeles','Europe/London','Asia/Singapore']
  const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' }, { value: 'ta', label: 'Tamil' }]

  return (
    <div>
      <PlatformPageHeader
        title="System Settings"
        subtitle="Global platform configuration"
        icon={Wrench}
        breadcrumbs={[{ label: 'System Settings' }]}
        actions={
          <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        }
      />

      <div className="max-w-lg space-y-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <SectionTitle>Platform Identity</SectionTitle>
          <Field label="Platform Name">
            <Input value={form.platformName} onChange={e => set('platformName', e.target.value)} />
          </Field>
          <Field label="Support Email">
            <Input type="email" value={form.supportEmail} onChange={e => set('supportEmail', e.target.value)} placeholder="support@yourplatform.com" />
          </Field>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <SectionTitle>Locale Defaults</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Currency">
              <Select value={form.defaultCurrency} onChange={e => set('defaultCurrency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Timezone" className="col-span-2">
              <Select value={form.defaultTimezone} onChange={e => set('defaultTimezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Language">
            <Select value={form.defaultLanguage} onChange={e => set('defaultLanguage', e.target.value)}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <SectionTitle>Access Control</SectionTitle>
          <Toggle label="Maintenance Mode (blocks all workspace logins)" checked={form.maintenanceMode} onChange={v => set('maintenanceMode', v)} />
          <Toggle label="Allow New Workspace Signups" checked={form.allowSignup} onChange={v => set('allowSignup', v)} />
          <Toggle label="Require Email Verification" checked={form.requireEmailVerification} onChange={v => set('requireEmailVerification', v)} />
          <Toggle label="Require MFA for Platform Admins" checked={form.requireMFA} onChange={v => set('requireMFA', v)} />
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <SectionTitle>Security Limits</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Session Timeout (minutes)">
              <Input type="number" min={5} max={1440} value={form.sessionTimeoutMinutes} onChange={e => set('sessionTimeoutMinutes', Number(e.target.value))} />
            </Field>
            <Field label="Max Login Attempts">
              <Input type="number" min={3} max={20} value={form.maxLoginAttempts} onChange={e => set('maxLoginAttempts', Number(e.target.value))} />
            </Field>
            <Field label="Min Password Length">
              <Input type="number" min={6} max={32} value={form.passwordMinLength} onChange={e => set('passwordMinLength', Number(e.target.value))} />
            </Field>
            <Field label="Data Retention (days)">
              <Input type="number" min={30} value={form.dataRetentionDays} onChange={e => set('dataRetentionDays', Number(e.target.value))} />
            </Field>
          </div>
        </div>

        {form.maintenanceMode && (
          <div className="p-3 bg-red-500/10 border border-red-200 rounded-lg">
            <p className="text-xs font-medium text-red-700">⚠️ Maintenance mode is ON — all workspace logins will be blocked until you turn it off.</p>
          </div>
        )}
      </div>
    </div>
  )
}
