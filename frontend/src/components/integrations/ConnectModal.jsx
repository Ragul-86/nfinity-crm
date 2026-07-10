import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, ExternalLink, PlugZap, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/utils/cn'

// ── Password field with show/hide ────────────────────────────────────────────
function PasswordField({ label, fieldKey, value, onChange, placeholder, hint, required }) {
  const [show, setShow] = useState(false)
  const isMasked = value && value.startsWith('••')

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value || ''}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={isMasked ? 'Leave blank to keep existing' : placeholder || ''}
          className="pr-10"
          autoComplete="new-password"
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShow(s => !s)}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── Field renderer ───────────────────────────────────────────────────────────
function FieldRenderer({ field, value, onChange, readOnly }) {
  const handleChange = (key, val) => onChange(key, val)

  if (field.type === 'password') {
    return (
      <PasswordField
        key={field.key}
        label={field.label}
        fieldKey={field.key}
        value={value}
        onChange={handleChange}
        placeholder={field.placeholder}
        hint={field.hint}
        required={field.required}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <div key={field.key} className="space-y-1.5">
        <Label>
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Select
          value={value || field.defaultValue || ''}
          onValueChange={(v) => handleChange(field.key, v)}
          disabled={readOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}…`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.type === 'toggle') {
    return (
      <div key={field.key} className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">{field.label}</p>
          {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
        </div>
        <Switch
          checked={!!value}
          onCheckedChange={(v) => handleChange(field.key, v)}
          disabled={readOnly}
        />
      </div>
    )
  }

  if (field.type === 'readonly') {
    return (
      <div key={field.key} className="space-y-1.5">
        <Label className="text-muted-foreground">{field.label}</Label>
        <div className="text-sm px-3 py-2 bg-muted/40 rounded-md border border-border">
          {value || '—'}
        </div>
      </div>
    )
  }

  // Default: text input
  return (
    <div key={field.key} className="space-y-1.5">
      <Label>
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        type="text"
        value={value || ''}
        onChange={e => handleChange(field.key, e.target.value)}
        placeholder={field.placeholder || ''}
        readOnly={readOnly}
        className={readOnly ? 'bg-muted/40' : ''}
      />
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
    </div>
  )
}

// ── Main ConnectModal ────────────────────────────────────────────────────────
export default function ConnectModal({ open, onClose, config, integration }) {
  const qc = useQueryClient()
  const isConnected = integration?.status === 'connected'

  // Form state: credentials (sensitive) + configFields (non-sensitive)
  const [creds, setCreds] = useState({})
  const [configData, setConfigData] = useState({})
  const [autoSync, setAutoSync] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(config?.syncIntervalMinutes || 60)
  const [tab, setTab] = useState('credentials') // 'credentials' | 'settings'

  // Reset form when modal opens
  useEffect(() => {
    if (open && config) {
      // Pre-fill with existing (masked) credentials — user must re-enter to update
      const initCreds = {}
      for (const f of config.fields || []) {
        const val = integration?.credentials?.[f.key]
        initCreds[f.key] = val || ''
      }
      setCreds(initCreds)

      const initConfig = {}
      for (const f of config.configFields || []) {
        initConfig[f.key] = integration?.config?.[f.key] || f.defaultValue || ''
      }
      setConfigData(initConfig)

      setAutoSync(integration?.syncSettings?.autoSync || false)
      setIntervalMinutes(integration?.syncSettings?.intervalMinutes || config?.syncIntervalMinutes || 60)
      setTab('credentials')
    }
  }, [open, config, integration])

  const mutation = useMutation({
    mutationFn: (body) => api.post(`/integrations/${config.id}`, body).then(r => r.data),
    onSuccess: (data) => {
      toast.success(data.message || `${config.name} connected successfully`)
      qc.invalidateQueries(['integrations'])
      onClose()
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Connection failed'),
  })

  const handleCredsChange = (key, val) => setCreds(p => ({ ...p, [key]: val }))
  const handleConfigChange = (key, val) => setConfigData(p => ({ ...p, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()

    // Validate required credential fields
    for (const f of config.fields || []) {
      if (f.required && !creds[f.key] && !integration?.credentials?.[f.key]) {
        toast.error(`${f.label} is required`)
        return
      }
    }

    // Filter out empty password fields (don't override existing if blank)
    const finalCreds = {}
    for (const [k, v] of Object.entries(creds)) {
      if (v && !v.startsWith('••')) {
        finalCreds[k] = v
      }
    }

    // Include plain-text keyId from configFields if present for Razorpay etc.
    const credentialKeys = new Set((config.fields || []).map(f => f.key))
    const configKeys = new Set((config.configFields || []).map(f => f.key))

    // Move any credential-type configFields (keyId etc.) to credentials
    for (const f of config.configFields || []) {
      if (f.type !== 'password' && configData[f.key]) {
        // Keep non-sensitive config in config
      }
    }

    mutation.mutate({
      category: config.category,
      name: config.name,
      credentials: finalCreds,
      config: configData,
      syncSettings: { autoSync, intervalMinutes: parseInt(intervalMinutes) || 60 },
    })
  }

  const handleOAuthConnect = () => {
    // Open OAuth flow in popup window
    const width = 600, height = 700
    const left = (window.screen.width - width) / 2
    const top = (window.screen.height - height) / 2
    const popup = window.open(
      `/api/integrations/oauth/${config.id}/init`,
      `oauth_${config.id}`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0`
    )

    // Listen for OAuth completion message
    const handler = (event) => {
      if (event.data?.type === 'oauth_complete' && event.data?.provider === config.id) {
        window.removeEventListener('message', handler)
        qc.invalidateQueries(['integrations'])
        onClose()
        if (event.data.success) {
          toast.success(`${config.name} connected successfully`)
        } else {
          toast.error(`Connection failed: ${event.data.reason || 'Unknown error'}`)
        }
      }
    }
    window.addEventListener('message', handler)

    // Fallback: poll for popup close + check URL for oauth param
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener('message', handler)
        qc.invalidateQueries(['integrations'])
        onClose()
      }
    }, 500)
  }

  if (!config) return null

  const hasOAuth = config.authType === 'oauth'
  const hasCredentialFields = (config.fields || []).length > 0
  const hasConfigFields = (config.configFields || []).length > 0
  const hasSyncSettings = config.syncIntervalMinutes !== null && config.syncIntervalMinutes !== undefined

  const tabs = [
    hasCredentialFields && { key: 'credentials', label: 'Credentials' },
    hasConfigFields     && { key: 'config',       label: 'Configuration' },
    hasSyncSettings     && { key: 'sync',         label: 'Sync' },
  ].filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center text-base"
              style={{ backgroundColor: `${config.color}18` }}
            >
              {config.icon}
            </span>
            {isConnected ? `Update ${config.name}` : `Connect ${config.name}`}
          </DialogTitle>
        </DialogHeader>

        {/* OAuth button for OAuth providers */}
        {hasOAuth && !isConnected && (
          <div className="space-y-3">
            <Button
              className="w-full gap-2"
              onClick={handleOAuthConnect}
            >
              <ExternalLink className="w-4 h-4" />
              {config.oauthLabel || `Connect with ${config.name}`}
            </Button>
            {hasCredentialFields && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or enter manually</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab navigation */}
        {tabs.length > 1 && (
          <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit">
            {tabs.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                  tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Credentials tab ── */}
          {(tab === 'credentials' || tabs.length <= 1) && hasCredentialFields && (
            <div className="space-y-3">
              {isConnected && (
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Leave credential fields blank to keep existing values. Only fill fields you want to update.
                </div>
              )}
              {(config.fields || []).map(field => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={creds[field.key]}
                  onChange={handleCredsChange}
                />
              ))}
            </div>
          )}

          {/* ── Configuration tab ── */}
          {tab === 'config' && hasConfigFields && (
            <div className="space-y-3">
              {(config.configFields || []).map(field => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={configData[field.key]}
                  onChange={handleConfigChange}
                />
              ))}
              {(config.services || []).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Services included</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {config.services.map(s => (
                      <span key={s} className="text-xs px-2 py-1 bg-muted rounded-md">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Sync settings tab ── */}
          {tab === 'sync' && hasSyncSettings && (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Auto Sync</p>
                  <p className="text-xs text-muted-foreground">
                    {config.syncLabel || 'Automatically sync data on schedule'}
                  </p>
                </div>
                <Switch
                  checked={autoSync}
                  onCheckedChange={setAutoSync}
                />
              </div>
              {autoSync && config.syncIntervalMinutes > 0 && (
                <div className="space-y-1.5">
                  <Label>Sync Interval (minutes)</Label>
                  <Select
                    value={String(intervalMinutes)}
                    onValueChange={(v) => setIntervalMinutes(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 15, 30, 60, 120, 360, 720, 1440].map(v => (
                        <SelectItem key={v} value={String(v)}>
                          {v < 60 ? `${v} minutes` : `${v / 60} hour${v / 60 > 1 ? 's' : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="gap-1.5"
            >
              <PlugZap className="w-3.5 h-3.5" />
              {mutation.isPending ? 'Saving…' : isConnected ? 'Update' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
