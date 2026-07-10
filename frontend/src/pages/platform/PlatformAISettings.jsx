import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bot, Save, Zap, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

function Field({ label, required, error, type = 'text', helper, ...props }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</label>
      {helper && <p className="text-[11px] text-muted-foreground/70 mb-1">{helper}</p>}
      <input type={type} {...props}
        className={`mt-1 w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${error ? 'border-destructive' : 'border-input'}`}
      />
      {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
    </div>
  )
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic Claude', models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  { value: 'gemini', label: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
]

const FEATURES = [
  { key: 'lead_scoring', label: 'AI Lead Scoring' },
  { key: 'email_drafting', label: 'AI Email Drafting' },
  { key: 'sop_suggestions', label: 'SOP Suggestions' },
  { key: 'campaign_copy', label: 'Campaign Copy Generation' },
  { key: 'chat_assistant', label: 'AI Chat Assistant (Copilot)' },
  { key: 'data_insights', label: 'Data Insights & Summaries' },
]

export default function PlatformAISettings() {
  const [form, setForm] = useState({
    provider: 'openai', model: 'gpt-4o-mini', apiKey: '',
    maxTokensPerRequest: 2000, enabledFeatures: ['chat_assistant'],
    temperature: 0.7, maxMonthlyTokens: 1000000,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data } = useQuery({
    queryKey: ['platform-ai-settings'],
    queryFn: () => api.get('/platform/ai-settings').then(r => r.data),
  })

  useEffect(() => {
    if (data?.settings) setForm(prev => ({ ...prev, ...data.settings }))
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (body) => api.put('/platform/ai-settings', body).then(r => r.data),
    onSuccess: () => toast.success('AI settings saved'),
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const currentProvider = PROVIDERS.find(p => p.value === form.provider) || PROVIDERS[0]

  const toggleFeature = (key) => {
    const current = form.enabledFeatures || []
    set('enabledFeatures', current.includes(key) ? current.filter(f => f !== key) : [...current, key])
  }

  return (
    <div>
      <PlatformPageHeader
        title="AI Settings"
        subtitle="Configure AI provider and feature flags for the platform"
        icon={Bot}
        breadcrumbs={[{ label: 'AI Settings' }]}
        actions={
          <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        }
      />

      <div className="max-w-lg space-y-5">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-medium text-sm">AI Provider</p>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map(p => (
              <button key={p.value} onClick={() => { set('provider', p.value); set('model', p.models[0]) }}
                className={`p-3 rounded-lg border text-xs font-medium text-center transition-all ${form.provider === p.value ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border hover:bg-accent'}`}
              >
                <Bot className="w-4 h-4 mx-auto mb-1" />{p.label}
              </button>
            ))}
          </div>
          <Field label="API Key" type="password" required value={form.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-..." helper="Stored encrypted. Applies to all workspaces." />
          <div>
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
              value={form.model} onChange={e => set('model', e.target.value)}>
              {currentProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-medium text-sm">Parameters</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Temperature</label>
              <div className="flex items-center gap-3 mt-1">
                <input type="range" min={0} max={1} step={0.1} value={form.temperature}
                  onChange={e => set('temperature', parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono w-8 text-right">{form.temperature}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max Tokens / Request</label>
              <input type="number" min={500} max={16000} step={500}
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
                value={form.maxTokensPerRequest} onChange={e => set('maxTokensPerRequest', Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Monthly Token Budget (per workspace)</label>
            <input type="number" min={10000} step={10000}
              className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
              value={form.maxMonthlyTokens} onChange={e => set('maxMonthlyTokens', Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground mt-0.5">Set 0 for unlimited</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-medium text-sm">Enabled AI Features</p>
          {FEATURES.map(f => (
            <div key={f.key} className="flex items-center justify-between">
              <span className="text-sm">{f.label}</span>
              <button onClick={() => toggleFeature(f.key)}
                className={(form.enabledFeatures || []).includes(f.key) ? 'text-primary' : 'text-muted-foreground'}>
                {(form.enabledFeatures || []).includes(f.key)
                  ? <ToggleRight className="w-7 h-7" />
                  : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
