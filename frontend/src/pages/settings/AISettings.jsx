/**
 * AISettings.jsx — AI CRM Copilot settings tab (inside Settings page).
 * Allows admins to configure provider, API key, model, limits, role permissions.
 * API key is never shown in full — only last 4 chars displayed.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Save, Loader2, Eye, EyeOff, RefreshCcw,
  CheckCircle, AlertCircle, BarChart3, Users, Zap, Shield,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import api from '@/services/api'
import toast from 'react-hot-toast'

const PROVIDERS = [
  { id: 'claude', label: 'Claude (Anthropic)', models: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'] },
  { id: 'openai', label: 'OpenAI',             models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'gemini', label: 'Google Gemini',       models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'] },
]

const ROLES = [
  { key: 'super_admin',        label: 'Super Admin' },
  { key: 'admin',              label: 'Admin' },
  { key: 'manager',            label: 'Manager' },
  { key: 'employee',           label: 'Employee' },
]

function mask(lastFour) {
  if (!lastFour) return ''
  return '••••••••••••' + lastFour
}

export default function AISettings() {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api.get('/ai/settings').then(r => r.data.data),
    staleTime: 30_000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['ai-usage-stats'],
    queryFn: () => api.get('/ai/usage-stats').then(r => r.data.data),
    staleTime: 60_000,
  })

  const [form, setForm] = useState({
    enabled: false, provider: 'claude', apiKey: '', model: '',
    temperature: 0.7, maxTokens: 1024,
    dailyLimitPerUser: 50, monthlyLimitPerUser: 500,
    rolePermissions: { super_admin: true, admin: true, manager: true, employee: false },
  })
  const [showKey, setShowKey] = useState(false)
  const [keyDirty, setKeyDirty] = useState(false)

  // Populate form from fetched settings
  useEffect(() => {
    if (!data) return
    setForm(prev => ({
      ...prev,
      enabled:              data.enabled ?? false,
      provider:             data.provider ?? 'claude',
      apiKey:               '',            // don't pre-fill the key
      model:                data.model ?? '',
      temperature:          data.temperature ?? 0.7,
      maxTokens:            data.maxTokens ?? 1024,
      dailyLimitPerUser:    data.dailyLimitPerUser ?? 50,
      monthlyLimitPerUser:  data.monthlyLimitPerUser ?? 500,
      rolePermissions:      data.rolePermissions ?? prev.rolePermissions,
    }))
    setKeyDirty(false)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (payload) => api.put('/ai/settings', payload).then(r => r.data),
    onSuccess: () => {
      toast.success('AI Copilot settings saved')
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] })
      queryClient.invalidateQueries({ queryKey: ['ai-copilot-status'] })
      setKeyDirty(false)
      refetch()
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save settings'),
  })

  const handleSave = () => {
    const payload = { ...form }
    // Only send key if user has typed a new one
    if (!keyDirty) delete payload.apiKey
    saveMutation.mutate(payload)
  }

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))
  const setRole = (key, val) => setForm(prev => ({ ...prev, rolePermissions: { ...prev.rolePermissions, [key]: val } }))

  const providerModels = PROVIDERS.find(p => p.id === form.provider)?.models || []
  const currentModel = form.model || providerModels[0] || ''

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${data?.enabled && data?.hasKey ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
        {data?.enabled && data?.hasKey
          ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {data?.enabled && data?.hasKey ? 'AI Copilot is active' : 'AI Copilot needs configuration'}
          </p>
          <p className="text-xs text-muted-foreground">
            {data?.hasKey
              ? `Using ${PROVIDERS.find(p => p.id === data.provider)?.label || data.provider} · Key ending in ${data.keyLastFour}`
              : 'Add an API key below to enable the AI Copilot.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => refetch()} title="Refresh">
          <RefreshCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Usage stats */}
      {statsData && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Today',      value: statsData.today,     icon: Zap,      color: 'text-blue-400' },
            { label: 'This Month', value: statsData.thisMonth, icon: BarChart3, color: 'text-purple-400' },
            { label: 'Total',      value: statsData.total,     icon: Sparkles, color: 'text-primary' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 flex items-center gap-2">
                <s.icon className={`w-4 h-4 ${s.color} shrink-0`} />
                <div>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value?.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main settings card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">AI Provider & Key</CardTitle>
              <CardDescription>Connect your preferred AI provider</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ai-enabled" className="text-sm">Enable AI Copilot</Label>
              <Switch id="ai-enabled" checked={form.enabled} onCheckedChange={v => set('enabled', v)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Provider */}
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(p => (
                <button key={p.id} onClick={() => { set('provider', p.id); set('model', p.models[0]) }}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${form.provider === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40 hover:bg-accent'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                placeholder={data?.hasKey ? mask(data.keyLastFour) : 'Paste your API key here'}
                value={form.apiKey}
                onChange={e => { set('apiKey', e.target.value); setKeyDirty(true) }}
                className="pr-10 font-mono text-sm"
              />
              <button type="button" onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data?.hasKey
                ? `Current key: ${mask(data.keyLastFour)} · Enter a new key to replace it · Leave blank to keep existing`
                : 'Your key is encrypted and never exposed in the UI.'}
            </p>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label>Default Model</Label>
            <select value={currentModel} onChange={e => set('model', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              {providerModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <Separator />

          {/* Generation config */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="temperature">Temperature <span className="text-muted-foreground font-normal">({form.temperature})</span></Label>
              <input id="temperature" type="range" min={0} max={2} step={0.1} value={form.temperature}
                onChange={e => set('temperature', parseFloat(e.target.value))}
                className="w-full accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Precise (0)</span><span>Creative (2)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-tokens">Max Tokens</Label>
              <Input id="max-tokens" type="number" min={100} max={8000} value={form.maxTokens}
                onChange={e => set('maxTokens', Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage Limits</CardTitle>
          <CardDescription>Control how many AI requests each user can make</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="daily-limit">Daily Limit (per user)</Label>
            <Input id="daily-limit" type="number" min={0} max={1000} value={form.dailyLimitPerUser}
              onChange={e => set('dailyLimitPerUser', Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">0 = unlimited</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monthly-limit">Monthly Limit (per user)</Label>
            <Input id="monthly-limit" type="number" min={0} max={10000} value={form.monthlyLimitPerUser}
              onChange={e => set('monthlyLimitPerUser', Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">0 = unlimited</p>
          </div>
        </CardContent>
      </Card>

      {/* Role permissions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Role Permissions
          </CardTitle>
          <CardDescription>Choose which roles can access the AI Copilot</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Always-on roles */}
            {['platform_super_admin', 'client_super_admin'].map(r => (
              <div key={r} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium capitalize">{r.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">Always has AI access</p>
                </div>
                <Badge variant="secondary" className="text-xs">Always On</Badge>
              </div>
            ))}
            <Separator />
            {ROLES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {form.rolePermissions[key] ? 'AI access enabled' : 'AI access disabled'}
                  </p>
                </div>
                <Switch
                  checked={form.rolePermissions[key] ?? false}
                  onCheckedChange={v => setRole(key, v)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top modules this month */}
      {statsData?.byModule?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Usage by Module (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statsData.byModule.slice(0, 6).map(({ _id, count }) => {
                const max = statsData.byModule[0]?.count || 1
                return (
                  <div key={_id} className="flex items-center gap-3">
                    <span className="text-xs capitalize w-20 shrink-0">{_id}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save button */}
      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2 min-w-[120px]">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
