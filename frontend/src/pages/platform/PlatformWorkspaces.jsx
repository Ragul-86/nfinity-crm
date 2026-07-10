import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Building2, Plus, MoreVertical, Eye, Ban, CheckCircle2, Trash2,
  LogIn, RefreshCcw, Edit, Key, ArrowUpDown, Download, Copy,
  Shield, BarChart3, Database, Settings2, Upload, Check, X,
  ChevronRight, ChevronLeft, Users, Globe, CreditCard, Zap,
  AlertTriangle, Info, Lock, Unlock, ExternalLink, ClipboardCopy,
  Server, Calendar, Activity, Package, ShieldCheck,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, StatusBadge, PlanBadge, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const AUTO_REFRESH = 30_000

const PLAN_OPTIONS = [
  { value: 'trial',        label: 'Trial (Free)',    color: 'bg-gray-100 text-gray-700',     price: '₹0/mo'     },
  { value: 'starter',      label: 'Starter',         color: 'bg-blue-100 text-blue-700',     price: '₹4,999/mo' },
  { value: 'professional', label: 'Professional',    color: 'bg-purple-100 text-purple-700', price: '₹9,999/mo' },
  { value: 'enterprise',   label: 'Enterprise',      color: 'bg-amber-100 text-amber-700',   price: 'Custom'     },
]

const INDUSTRY_OPTIONS = [
  'Digital Marketing','Software / IT','E-Commerce','Real Estate','Education',
  'Healthcare','Finance','Manufacturing','Retail','Consulting','Legal','Other',
]

const MODULES = [
  { key: 'crm',          label: 'CRM & Leads'   },
  { key: 'finance',      label: 'Finance'        },
  { key: 'campaigns',    label: 'Campaigns'      },
  { key: 'ai',           label: 'AI Copilot'     },
  { key: 'sop',          label: 'SOP Management' },
  { key: 'client_portal',label: 'Client Portal'  },
  { key: 'whatsapp',     label: 'WhatsApp'       },
  { key: 'reports',      label: 'Reports'        },
]

const CURRENCY_OPTIONS = ['INR','USD','EUR','GBP','AED','SGD']
const TIMEZONE_OPTIONS = ['Asia/Kolkata','UTC','America/New_York','America/Los_Angeles','Europe/London','Asia/Singapore','Asia/Dubai']

// ── Step wizard constants ──────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Company',      icon: Building2  },
  { id: 2, label: 'Owner',        icon: Users      },
  { id: 3, label: 'Subscription', icon: CreditCard },
  { id: 4, label: 'Workspace',    icon: Globe      },
  { id: 5, label: 'Review',       icon: Check      },
]

// ── Small UI helpers ───────────────────────────────────────────────────────────
function FieldError({ error }) {
  return error ? <p className="text-xs text-destructive mt-0.5">{error}</p> : null
}

function FInput({ label, required, error, ...props }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</label>
      <input
        {...props}
        className={`mt-1 w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${error ? 'border-destructive' : 'border-input'}`}
      />
      <FieldError error={error} />
    </div>
  )
}

function FSelect({ label, required, error, children, ...props }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</label>
      <select
        {...props}
        className={`mt-1 w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${error ? 'border-destructive' : 'border-input'}`}
      >
        {children}
      </select>
      <FieldError error={error} />
    </div>
  )
}

function Modal({ open, onClose, title, icon: Icon, size = 'md', children, footer }) {
  if (!open) return null
  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
  }[size] || 'max-w-md'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className={`relative bg-card border border-border rounded-2xl shadow-2xl w-full ${sizeClass} z-10 max-h-[92vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-primary" />}
            <p className="font-semibold text-sm">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">{footer}</div>}
      </motion.div>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between text-sm gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-xs font-medium w-36 shrink-0">{label}</span>
      <span className={`text-xs text-right break-all ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

// ── 1. Workspace Details Modal ─────────────────────────────────────────────────
function WorkspaceDetailsModal({ open, onClose, tenantId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-tenant-detail', tenantId],
    queryFn: () => api.get(`/platform/tenants/${tenantId}`).then(r => r.data),
    enabled: open && !!tenantId,
  })
  const t = data?.data

  return (
    <AnimatePresence>
      {open && (
        <Modal open={open} onClose={onClose} title="Workspace Details" icon={Eye} size="xl">
          {isLoading ? (
            <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : t ? (
            <div className="space-y-5">
              {/* Status + Plan row */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={t.status} />
                <PlanBadge plan={t.plan} />
                {t.suspendedAt && (
                  <span className="text-xs text-muted-foreground">Suspended {format(new Date(t.suspendedAt), 'MMM d, yyyy')}</span>
                )}
              </div>

              {/* Company */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Company</p>
                <InfoRow label="Workspace Name" value={t.name} />
                <InfoRow label="Slug" value={t.slug} mono />
                <InfoRow label="Industry" value={t.company?.industry} />
                <InfoRow label="Website" value={t.company?.website} />
                <InfoRow label="GST" value={t.company?.gstNumber} mono />
              </div>

              {/* Owner */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Owner</p>
                <InfoRow label="Name" value={t.owner?.name} />
                <InfoRow label="Email" value={t.owner?.email} mono />
                <InfoRow label="Role" value={t.owner?.role?.replace(/_/g, ' ')} />
              </div>

              {/* Subscription */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Subscription</p>
                <InfoRow label="Plan" value={PLAN_OPTIONS.find(p => p.value === t.plan)?.label || t.plan} />
                <InfoRow label="Currency" value={t.subscription?.currency} />
                <InfoRow label="Timezone" value={t.subscription?.timezone} />
                <InfoRow label="Max Users" value={t.subscription?.maxUsers} />
                <InfoRow label="Max Storage" value={t.subscription?.maxStorage ? `${t.subscription.maxStorage} MB` : '—'} />
                <InfoRow label="Start Date" value={t.subscription?.startDate ? format(new Date(t.subscription.startDate), 'MMM d, yyyy') : '—'} />
                <InfoRow label="End Date" value={t.subscription?.endDate ? format(new Date(t.subscription.endDate), 'MMM d, yyyy') : '—'} />
              </div>

              {/* Stats */}
              {t.stats && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Usage</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Users', value: t.users?.length ?? 0, icon: Users },
                      { label: 'Leads', value: t.stats.leads ?? 0, icon: Activity },
                      { label: 'Clients', value: t.stats.clients ?? 0, icon: Building2 },
                    ].map(stat => (
                      <div key={stat.label} className="p-3 rounded-xl border border-border bg-muted/30 text-center">
                        <p className="text-lg font-bold">{stat.value}</p>
                        <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enabled Modules */}
              {t.subscription?.features?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Enabled Modules</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.subscription.features.map(f => (
                      <Badge key={f} variant="secondary" className="text-xs capitalize">{f.replace(/_/g, ' ')}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Timeline</p>
                <InfoRow label="Created" value={t.createdAt ? format(new Date(t.createdAt), 'MMM d, yyyy HH:mm') : '—'} />
                <InfoRow label="Last Updated" value={t.updatedAt ? format(new Date(t.updatedAt), 'MMM d, yyyy HH:mm') : '—'} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Workspace not found.</p>
          )}
        </Modal>
      )}
    </AnimatePresence>
  )
}

// ── 2. Edit Workspace Modal ────────────────────────────────────────────────────
function buildEditForm(tenant) {
  return {
    name: tenant?.name || '',
    company: {
      industry: tenant?.company?.industry || '',
      website: tenant?.company?.website || '',
      gstNumber: tenant?.company?.gstNumber || '',
      phone: tenant?.company?.phone || '',
    },
    plan: tenant?.plan || 'trial',
    subscription: {
      maxUsers: tenant?.subscription?.maxUsers || 5,
      maxStorage: tenant?.subscription?.maxStorage || 1024,
      currency: tenant?.subscription?.currency || 'INR',
      timezone: tenant?.subscription?.timezone || 'Asia/Kolkata',
      endDate: tenant?.subscription?.endDate
        ? format(new Date(tenant.subscription.endDate), 'yyyy-MM-dd')
        : '',
    },
    status: tenant?.status || 'active',
  }
}

function EditWorkspaceModal({ open, onClose, tenant, onSaved }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(() => buildEditForm(tenant))

  // Sync form whenever the selected tenant changes (modal opens for a different workspace)
  useEffect(() => {
    if (open && tenant) setForm(buildEditForm(tenant))
  }, [open, tenant?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (path, val) => setForm(prev => {
    const keys = path.split('.')
    if (keys.length === 1) return { ...prev, [keys[0]]: val }
    return { ...prev, [keys[0]]: { ...prev[keys[0]], [keys[1]]: val } }
  })

  const mutation = useMutation({
    mutationFn: () => api.put(`/platform/tenants/${tenant._id}`, form).then(r => r.data),
    onSuccess: () => {
      toast.success('Workspace updated successfully')
      qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })
      qc.invalidateQueries({ queryKey: ['platform-tenant-detail', tenant._id] })
      onSaved?.()
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Update failed'),
  })

  return (
    <AnimatePresence>
      {open && (
        <Modal
          open={open}
          onClose={onClose}
          title="Edit Workspace"
          icon={Edit}
          size="lg"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Workspace Identity */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workspace Identity</p>
              <FInput label="Workspace Name" required value={form.name} onChange={e => set('name', e.target.value)} />
            </div>

            {/* Company Details */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company</p>
              <div className="grid grid-cols-2 gap-3">
                <FSelect label="Industry" value={form.company.industry} onChange={e => set('company.industry', e.target.value)}>
                  <option value="">Select industry</option>
                  {INDUSTRY_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                </FSelect>
                <FInput label="GST Number" value={form.company.gstNumber} onChange={e => set('company.gstNumber', e.target.value)} placeholder="22AAAAA0000A1Z5" />
              </div>
              <FInput label="Website" type="url" value={form.company.website} onChange={e => set('company.website', e.target.value)} placeholder="https://example.com" />
            </div>

            {/* Plan & Status */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plan & Status</p>
              <div className="grid grid-cols-2 gap-3">
                <FSelect label="Plan" value={form.plan} onChange={e => set('plan', e.target.value)}>
                  {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </FSelect>
                <FSelect label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspended</option>
                </FSelect>
              </div>
              <FInput label="Plan End Date" type="date" value={form.subscription.endDate} onChange={e => set('subscription.endDate', e.target.value)} />
            </div>

            {/* Limits */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Limits</p>
              <div className="grid grid-cols-2 gap-3">
                <FInput label="Max Users" type="number" min={1} value={form.subscription.maxUsers} onChange={e => set('subscription.maxUsers', Number(e.target.value))} />
                <FInput label="Storage Limit (MB)" type="number" min={256} value={form.subscription.maxStorage} onChange={e => set('subscription.maxStorage', Number(e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FSelect label="Currency" value={form.subscription.currency} onChange={e => set('subscription.currency', e.target.value)}>
                  {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </FSelect>
                <FSelect label="Timezone" value={form.subscription.timezone} onChange={e => set('subscription.timezone', e.target.value)}>
                  {TIMEZONE_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </FSelect>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  )
}

// ── 3. Upgrade Plan Modal ──────────────────────────────────────────────────────
function UpgradePlanModal({ open, onClose, tenant, onUpgraded }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(tenant?.plan || 'starter')
  const [endDate, setEndDate] = useState('')
  const [maxUsers, setMaxUsers] = useState(tenant?.subscription?.maxUsers || 20)
  const [maxStorage, setMaxStorage] = useState(tenant?.subscription?.maxStorage || 5120)

  // Sync when tenant changes
  useEffect(() => {
    if (open && tenant) {
      setSelected(tenant.plan || 'starter')
      setMaxUsers(tenant.subscription?.maxUsers || 20)
      setMaxStorage(tenant.subscription?.maxStorage || 5120)
      setEndDate('')
    }
  }, [open, tenant?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: () => api.patch(`/platform/tenants/${tenant._id}/upgrade`, {
      plan: selected,
      endDate: endDate || undefined,
      maxUsers,
      maxStorage,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success(`Plan upgraded to ${PLAN_OPTIONS.find(p => p.value === selected)?.label}`)
      qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })
      onUpgraded?.()
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Upgrade failed'),
  })

  const PLAN_FEATURES = {
    trial:        ['5 Users', '1 GB Storage', 'Basic CRM', '14-day trial'],
    starter:      ['20 Users', '5 GB Storage', 'CRM + Pipeline', 'Email Support'],
    professional: ['50 Users', '20 GB Storage', 'All Modules', 'Priority Support', 'AI Copilot'],
    enterprise:   ['Unlimited Users', 'Unlimited Storage', 'All Modules + Custom', 'Dedicated Support', 'SLA Guarantee'],
  }

  return (
    <AnimatePresence>
      {open && (
        <Modal
          open={open}
          onClose={onClose}
          title="Upgrade / Change Plan"
          icon={ArrowUpDown}
          size="xl"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || selected === tenant?.plan}
              >
                {mutation.isPending ? 'Upgrading…' : `Upgrade to ${PLAN_OPTIONS.find(p => p.value === selected)?.label}`}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Current plan banner */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-xs">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Current plan: <strong className="text-foreground capitalize">{tenant?.plan}</strong></span>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-2 gap-3">
              {PLAN_OPTIONS.map(plan => {
                const isCurrent = plan.value === tenant?.plan
                const isSelected = plan.value === selected
                return (
                  <button
                    key={plan.value}
                    type="button"
                    onClick={() => setSelected(plan.value)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${plan.color}`}>{plan.label}</span>
                      {isCurrent && <Badge variant="outline" className="text-[10px]">Current</Badge>}
                      {isSelected && !isCurrent && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="font-bold text-sm mb-2">{plan.price}</p>
                    <ul className="space-y-1">
                      {(PLAN_FEATURES[plan.value] || []).map(f => (
                        <li key={f} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Check className="w-2.5 h-2.5 text-primary shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            {/* Advanced config */}
            <div className="border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Override Limits (optional)</p>
              <div className="grid grid-cols-3 gap-3">
                <FInput label="Max Users" type="number" min={1} value={maxUsers} onChange={e => setMaxUsers(Number(e.target.value))} />
                <FInput label="Storage (MB)" type="number" min={256} value={maxStorage} onChange={e => setMaxStorage(Number(e.target.value))} />
                <FInput label="Expires On" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  )
}

// ── 4. Reset Owner Password Modal ──────────────────────────────────────────────
function ResetPasswordModal({ open, onClose, tenant }) {
  const [mode, setMode] = useState('generate')          // 'generate' | 'manual'
  const [password, setPassword] = useState('')
  const [generatedPw, setGeneratedPw] = useState('')
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState(false)

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  const mutation = useMutation({
    mutationFn: (newPassword) => api.post(`/platform/tenants/${tenant._id}/reset-password`, { newPassword }).then(r => r.data),
    onSuccess: () => {
      toast.success('Owner password reset successfully')
      setDone(true)
    },
    onError: err => toast.error(err.response?.data?.message || 'Password reset failed'),
  })

  const handleSubmit = () => {
    const pw = mode === 'generate' ? generatedPw : password
    if (!pw || pw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    mutation.mutate(pw)
  }

  const handleGenerate = () => {
    setGeneratedPw(generatePassword())
    setCopied(false)
    setDone(false)
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setDone(false); setGeneratedPw(''); setPassword(''); setCopied(false); setMode('generate')
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <Modal
          open={open}
          onClose={handleClose}
          title="Reset Owner Password"
          icon={Key}
          size="sm"
          footer={
            done ? (
              <Button size="sm" onClick={handleClose}>Close</Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending}>
                  {mutation.isPending ? 'Resetting…' : 'Reset Password'}
                </Button>
              </>
            )
          }
        >
          {done ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="font-medium text-sm">Password reset successfully</p>
              <p className="text-xs text-muted-foreground">The owner of <strong>{tenant?.name}</strong> can now log in with the new password.</p>
              {generatedPw && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted font-mono text-sm">
                  <span className="flex-1 break-all">{generatedPw}</span>
                  <button type="button" onClick={() => copyToClipboard(generatedPw)} className="shrink-0 p-1 hover:bg-accent rounded">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-amber-700 dark:text-amber-400">
                  Resetting the password for <strong>{tenant?.name}</strong>'s owner. This action is logged.
                </span>
              </div>

              {/* Mode tabs */}
              <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
                {[['generate', 'Auto Generate'], ['manual', 'Set Manually']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setMode(v)}
                    className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${mode === v ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >{l}</button>
                ))}
              </div>

              {mode === 'generate' ? (
                <div className="space-y-2">
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={handleGenerate}>
                    <RefreshCcw className="w-3.5 h-3.5" /> Generate Secure Password
                  </Button>
                  {generatedPw && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border">
                      <span className="flex-1 font-mono text-sm break-all">{generatedPw}</span>
                      <button type="button" onClick={() => copyToClipboard(generatedPw)} className="shrink-0 p-1 hover:bg-accent rounded transition-colors">
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">Copy and share this password securely with the workspace owner.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <FInput
                    label="New Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                  />
                  <p className="text-[11px] text-muted-foreground">Share this password securely with the workspace owner.</p>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </AnimatePresence>
  )
}

// ── 5. Delete Workspace with name confirmation ─────────────────────────────────
function DeleteWorkspaceDialog({ open, onClose, tenant, onDeleted }) {
  const qc = useQueryClient()
  const [inputName, setInputName] = useState('')
  const matches = inputName.trim().toLowerCase() === tenant?.name?.trim().toLowerCase()

  const mutation = useMutation({
    mutationFn: () => api.patch(`/platform/tenants/${tenant._id}/status`, { status: 'deleted', reason: 'Platform admin deletion' }).then(r => r.data),
    onSuccess: () => {
      toast.success(`Workspace "${tenant?.name}" deleted`)
      qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })
      qc.invalidateQueries({ queryKey: ['platform-stats-v2'] })
      setInputName('')
      onDeleted?.()
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Deletion failed'),
  })

  const handleClose = () => { setInputName(''); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <Modal open={open} onClose={handleClose} title="Delete Workspace" icon={Trash2} size="sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={!matches || mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Deleting…' : 'Delete Workspace'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-medium text-destructive">This action is irreversible</p>
                <p className="text-muted-foreground">Deleting <strong className="text-foreground">{tenant?.name}</strong> will immediately disable all access for workspace users. All data will be soft-deleted and retained for 30 days before permanent removal.</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Type <strong className="text-foreground">{tenant?.name}</strong> to confirm
              </label>
              <input
                type="text"
                value={inputName}
                onChange={e => setInputName(e.target.value)}
                placeholder={tenant?.name}
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>
            {inputName && !matches && (
              <p className="text-xs text-destructive">Name doesn't match. Please type the exact workspace name.</p>
            )}
          </div>
        </Modal>
      )}
    </AnimatePresence>
  )
}

// ── 6. Suspend Workspace with reason ──────────────────────────────────────────
function SuspendWorkspaceDialog({ open, onClose, tenant, onSuspended }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.patch(`/platform/tenants/${tenant._id}/status`, { status: 'suspended', reason }).then(r => r.data),
    onSuccess: () => {
      toast.success(`Workspace "${tenant?.name}" suspended`)
      qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })
      setReason('')
      onSuspended?.()
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Suspend failed'),
  })

  const handleClose = () => { setReason(''); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <Modal open={open} onClose={handleClose} title="Suspend Workspace" icon={Ban} size="sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button variant="default" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Suspending…' : 'Suspend Workspace'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <Ban className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Suspending <strong>{tenant?.name}</strong> will immediately lock out all workspace users. The workspace data remains intact and can be reactivated.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reason for suspension (optional)</label>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Non-payment, Terms violation…"
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  )
}

// ── 5-Step Create Wizard ───────────────────────────────────────────────────────
function WizardStepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-between mb-6">
      {STEPS.map((step, i) => {
        const done = currentStep > step.id
        const active = currentStep === step.id
        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                done ? 'bg-primary border-primary text-white'
                : active ? 'bg-primary/10 border-primary text-primary'
                : 'bg-muted border-border text-muted-foreground'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : <step.icon className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap hidden sm:block ${active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 transition-all ${done ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CreateWorkspaceWizard({ open, onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    companyName: '', industry: '', gstNumber: '', website: '',
    adminName: '', adminEmail: '', adminMobile: '', adminDesignation: '', adminPassword: '', adminPasswordConfirm: '',
    plan: 'trial', trialDays: 14, maxUsers: 5, maxStorage: 1024, modulesEnabled: ['crm','reports'],
    workspaceName: '', currency: 'INR', timezone: 'Asia/Kolkata', language: 'en',
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggleModule = (key) => set('modulesEnabled', form.modulesEnabled.includes(key)
    ? form.modulesEnabled.filter(m => m !== key)
    : [...form.modulesEnabled, key]
  )

  const mutation = useMutation({
    mutationFn: (body) => api.post('/platform/tenants', body).then(r => r.data),
    onSuccess: (data) => {
      toast.success(`Workspace "${data.tenant?.name}" created!`)
      onCreated?.()
      onClose()
      setStep(1)
      setForm({ companyName:'',industry:'',gstNumber:'',website:'',adminName:'',adminEmail:'',adminMobile:'',adminDesignation:'',adminPassword:'',adminPasswordConfirm:'',plan:'trial',trialDays:14,maxUsers:5,maxStorage:1024,modulesEnabled:['crm','reports'],workspaceName:'',currency:'INR',timezone:'Asia/Kolkata',language:'en' })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create workspace'),
  })

  const validate = (s) => {
    const e = {}
    if (s === 1) { if (!form.companyName.trim()) e.companyName = 'Required' }
    if (s === 2) {
      if (!form.adminName.trim()) e.adminName = 'Required'
      if (!form.adminEmail.trim() || !form.adminEmail.includes('@')) e.adminEmail = 'Valid email required'
      if (form.adminPassword && form.adminPassword.length < 8) e.adminPassword = 'Min 8 characters'
      if (form.adminPassword !== form.adminPasswordConfirm) e.adminPasswordConfirm = 'Passwords do not match'
    }
    if (s === 4) { if (!form.workspaceName.trim() && !form.companyName.trim()) e.workspaceName = 'Required' }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => { if (validate(step)) setStep(s => s + 1) }
  const back = () => setStep(s => s - 1)
  const submit = () => {
    if (!validate(4)) { setStep(4); return }
    mutation.mutate({ ...form, workspaceName: form.workspaceName || form.companyName })
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl z-10 max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <p className="font-semibold text-sm">Create New Workspace</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 pt-4 shrink-0"><WizardStepIndicator currentStep={step} /></div>
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-1 mb-2"><p className="font-medium text-sm">Company Information</p><p className="text-xs text-muted-foreground">Tell us about the client company</p></div>
                <FInput label="Company Name" required error={errors.companyName} value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Acme Digital Agency" />
                <div className="grid grid-cols-2 gap-3">
                  <FSelect label="Industry" value={form.industry} onChange={e => set('industry', e.target.value)}>
                    <option value="">Select industry</option>
                    {INDUSTRY_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                  </FSelect>
                  <FInput label="GST Number" value={form.gstNumber} onChange={e => set('gstNumber', e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </div>
                <FInput label="Website" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://acme.com" type="url" />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-1 mb-2"><p className="font-medium text-sm">Owner / Client Super Admin</p><p className="text-xs text-muted-foreground">This person will manage the workspace</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Full Name" required error={errors.adminName} value={form.adminName} onChange={e => set('adminName', e.target.value)} placeholder="John Doe" />
                  <FInput label="Designation" value={form.adminDesignation} onChange={e => set('adminDesignation', e.target.value)} placeholder="CEO" />
                </div>
                <FInput label="Email" required type="email" error={errors.adminEmail} value={form.adminEmail} onChange={e => set('adminEmail', e.target.value)} placeholder="john@acme.com" />
                <FInput label="Mobile" value={form.adminMobile} onChange={e => set('adminMobile', e.target.value)} placeholder="+91 9999999999" />
                <div className="border-t border-border pt-3">
                  <p className="text-[11px] text-muted-foreground mb-2">Leave password blank to send a setup email link</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FInput label="Password" type="password" error={errors.adminPassword} value={form.adminPassword} onChange={e => set('adminPassword', e.target.value)} placeholder="Min 8 characters" />
                    <FInput label="Confirm Password" type="password" error={errors.adminPasswordConfirm} value={form.adminPasswordConfirm} onChange={e => set('adminPasswordConfirm', e.target.value)} placeholder="Repeat password" />
                  </div>
                </div>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-1 mb-2"><p className="font-medium text-sm">Subscription Plan</p><p className="text-xs text-muted-foreground">Set plan, limits, and enabled modules</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <FSelect label="Plan" value={form.plan} onChange={e => set('plan', e.target.value)}>
                    {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </FSelect>
                  {form.plan === 'trial' && (
                    <FInput label="Trial Days" type="number" min={1} max={90} value={form.trialDays} onChange={e => set('trialDays', Number(e.target.value))} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Max Users" type="number" min={1} value={form.maxUsers} onChange={e => set('maxUsers', Number(e.target.value))} />
                  <FInput label="Storage Limit (MB)" type="number" min={256} value={form.maxStorage} onChange={e => set('maxStorage', Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Enabled Modules</label>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {MODULES.map(m => (
                      <button key={m.key} type="button" onClick={() => toggleModule(m.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${form.modulesEnabled.includes(m.key) ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:bg-accent'}`}
                      >
                        {form.modulesEnabled.includes(m.key) ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-1 mb-2"><p className="font-medium text-sm">Workspace Configuration</p><p className="text-xs text-muted-foreground">Configure locale and workspace identity</p></div>
                <FInput label="Workspace Name" error={errors.workspaceName} value={form.workspaceName} onChange={e => set('workspaceName', e.target.value)} placeholder={form.companyName || 'Workspace name'} />
                <div className="grid grid-cols-2 gap-3">
                  <FSelect label="Currency" value={form.currency} onChange={e => set('currency', e.target.value)}>
                    {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </FSelect>
                  <FSelect label="Language" value={form.language} onChange={e => set('language', e.target.value)}>
                    <option value="en">English</option><option value="ta">Tamil</option><option value="hi">Hindi</option>
                  </FSelect>
                </div>
                <FSelect label="Timezone" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONE_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </FSelect>
              </motion.div>
            )}
            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="space-y-1 mb-2"><p className="font-medium text-sm">Review & Create</p><p className="text-xs text-muted-foreground">Confirm all details before provisioning</p></div>
                <div className="space-y-3">
                  {[
                    { label: 'Company', value: form.companyName },
                    { label: 'Industry', value: form.industry || '—' },
                    { label: 'Owner', value: `${form.adminName} (${form.adminEmail})` },
                    { label: 'Plan', value: PLAN_OPTIONS.find(p => p.value === form.plan)?.label },
                    { label: 'Workspace', value: form.workspaceName || form.companyName },
                    { label: 'Currency', value: form.currency },
                    { label: 'Timezone', value: form.timezone },
                    { label: 'Modules', value: form.modulesEnabled.join(', ') || 'None' },
                  ].map(r => (
                    <div key={r.label} className="flex items-start justify-between text-sm border-b border-border pb-2 last:border-0">
                      <span className="text-muted-foreground text-xs font-medium w-28 shrink-0">{r.label}</span>
                      <span className="text-right text-xs">{r.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-200 rounded-lg">
                  <p className="text-xs font-medium text-emerald-700 mb-1.5">Will be auto-provisioned:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {['✓ Workspace','✓ Client Super Admin','✓ Default Roles','✓ Permissions','✓ Dashboard','✓ Pipelines','✓ SOP Templates','✓ Lead Forms','✓ Login Credentials'].map(item => (
                      <span key={item} className="text-[11px] text-emerald-700">{item}</span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={step === 1 ? onClose : back}>
            {step === 1 ? 'Cancel' : <><ChevronLeft className="w-3.5 h-3.5 mr-1" />Back</>}
          </Button>
          {step < 5 ? (
            <Button size="sm" onClick={next}>Next <ChevronRight className="w-3.5 h-3.5 ml-1" /></Button>
          ) : (
            <Button size="sm" onClick={submit} disabled={mutation.isPending} className="bg-primary">
              {mutation.isPending ? 'Creating…' : '🚀 Create Workspace'}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PlatformWorkspaces() {
  const qc = useQueryClient()

  // Modal / dialog state — single source per action
  const [showCreate, setShowCreate] = useState(false)
  const [detailsTenant, setDetailsTenant] = useState(null)
  const [editTenant, setEditTenant] = useState(null)
  const [upgradeTenant, setUpgradeTenant] = useState(null)
  const [resetPwTenant, setResetPwTenant] = useState(null)
  const [suspendTenant, setSuspendTenant] = useState(null)
  const [deleteTenant, setDeleteTenant] = useState(null)
  const [activateConfirm, setActivateConfirm] = useState(null)

  // Table state
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: 'all', plan: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['platform-tenants-v2', page, pageSize, search, filters, sort],
    queryFn: () => {
      const params = new URLSearchParams({
        page, limit: pageSize, sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search && { search }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.plan !== 'all' && { plan: filters.plan }),
      })
      return api.get(`/platform/tenants?${params}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: AUTO_REFRESH,
  })

  const tenants = data?.tenants || []
  const total = data?.total || 0

  // ── Impersonate ──────────────────────────────────────────────────────────────
  const impersonateMutation = useMutation({
    mutationFn: (id) => api.post(`/platform/tenants/${id}/impersonate`).then(r => r.data),
    onSuccess: (d) => {
      // Save platform token so we can return later
      const existingToken = localStorage.getItem('token')
      if (existingToken) localStorage.setItem('platform_token', existingToken)
      localStorage.setItem('impersonating_workspace', JSON.stringify({
        _id: d.tenant._id,
        name: d.tenant.name,
        slug: d.tenant.slug,
      }))
      localStorage.setItem('token', d.token)
      toast.success(`Switching to "${d.tenant?.name}" as ${d.user?.name}`)
      setTimeout(() => { window.location.href = '/' }, 800)
    },
    onError: err => toast.error(err.response?.data?.message || 'Impersonation failed'),
  })

  // ── Activate ─────────────────────────────────────────────────────────────────
  const activateMutation = useMutation({
    mutationFn: (id) => api.patch(`/platform/tenants/${id}/status`, { status: 'active' }).then(r => r.data),
    onSuccess: () => {
      toast.success('Workspace activated')
      qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })
      setActivateConfirm(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Activation failed'),
  })

  // ── Download Backup (authenticated fetch) ────────────────────────────────────
  const [downloadingId, setDownloadingId] = useState(null)
  const downloadBackup = async (tenant) => {
    setDownloadingId(tenant._id)
    const toastId = toast.loading(`Preparing backup for ${tenant.name}…`)
    try {
      const response = await api.get(`/platform/tenants/${tenant._id}/backup`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${tenant.slug || tenant._id}-${format(new Date(), 'yyyy-MM-dd')}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded!', { id: toastId })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Backup failed', { id: toastId })
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Table helpers ────────────────────────────────────────────────────────────
  const handleFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1) }
  const handleSort   = (key, dir) => { setSort({ key, dir }); setPage(1) }

  // ── Columns ──────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name', header: 'Workspace', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {row.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.slug}</p>
          </div>
        </div>
      ),
      exportValue: (row) => row.name,
    },
    {
      key: 'owner', header: 'Owner', sortable: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm truncate">{row.owner?.name || '—'}</p>
          <p className="text-xs text-muted-foreground truncate">{row.owner?.email || ''}</p>
        </div>
      ),
      exportValue: (row) => row.owner?.email || '',
    },
    {
      key: 'company', header: 'Industry',
      render: (row) => <span className="text-xs text-muted-foreground">{row.company?.industry || '—'}</span>,
      exportValue: (row) => row.company?.industry || '',
    },
    {
      key: 'plan', header: 'Plan', sortable: true,
      render: (row) => <PlanBadge plan={row.plan} />,
      exportValue: (row) => row.plan,
    },
    {
      key: 'userCount', header: 'Users', sortable: true,
      render: (row) => <span className="text-sm font-medium">{row.userCount ?? 0}</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
      exportValue: (row) => row.status,
    },
    {
      key: 'createdAt', header: 'Created', sortable: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}
        </span>
      ),
      exportValue: (row) => row.createdAt ? format(new Date(row.createdAt), 'yyyy-MM-dd') : '',
    },
    {
      key: 'storageUsed', header: 'Storage', sortable: false,
      render: (row) => {
        const used = row.storageUsedMB ?? row.subscription?.storageUsed ?? 0
        const max  = row.subscription?.maxStorage ?? 1024
        const pct  = Math.min(100, Math.round((used / max) * 100))
        return (
          <div className="min-w-[80px]">
            <p className="text-xs font-medium">{used >= 1024 ? `${(used/1024).toFixed(1)} GB` : `${used} MB`}</p>
            <div className="mt-0.5 h-1 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% used</p>
          </div>
        )
      },
    },
    {
      key: 'expiryDate', header: 'Expiry', sortable: true,
      render: (row) => {
        const d = row.subscription?.endDate
        if (!d) return <span className="text-xs text-muted-foreground">No Expiry</span>
        const daysLeft = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24))
        return (
          <div>
            <p className="text-xs">{format(new Date(d), 'MMM d, yyyy')}</p>
            <p className={`text-[10px] ${daysLeft < 7 ? 'text-red-500' : daysLeft < 30 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {daysLeft > 0 ? `${daysLeft}d left` : 'Expired'}
            </p>
          </div>
        )
      },
      exportValue: (row) => row.subscription?.endDate ? format(new Date(row.subscription.endDate), 'yyyy-MM-dd') : '',
    },
    {
      key: 'lastLogin', header: 'Last Login', sortable: true,
      render: (row) => {
        const d = row.lastLoginAt ?? row.owner?.lastLoginAt
        return d ? (
          <div>
            <p className="text-xs">{format(new Date(d), 'MMM d')}</p>
            <p className="text-[10px] text-muted-foreground">{format(new Date(d), 'HH:mm')}</p>
          </div>
        ) : <span className="text-xs text-muted-foreground">Never</span>
      },
    },
    {
      key: 'actions', header: '', exportable: false,
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-7 h-7">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Workspace Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Login as Client Super Admin */}
            <DropdownMenuItem
              onClick={() => impersonateMutation.mutate(row._id)}
              disabled={row.status !== 'active' || impersonateMutation.isPending}
              className="gap-2"
            >
              <LogIn className="w-3.5 h-3.5 text-primary" />
              <span>Login as Super Admin</span>
              {impersonateMutation.isPending && <span className="ml-auto text-[10px] text-muted-foreground">…</span>}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* View Details */}
            <DropdownMenuItem onClick={() => setDetailsTenant(row)} className="gap-2">
              <Eye className="w-3.5 h-3.5" /> View Details
            </DropdownMenuItem>

            {/* Edit Workspace */}
            <DropdownMenuItem onClick={() => setEditTenant(row)} className="gap-2">
              <Edit className="w-3.5 h-3.5" /> Edit Workspace
            </DropdownMenuItem>

            {/* Upgrade Plan */}
            <DropdownMenuItem onClick={() => setUpgradeTenant(row)} className="gap-2">
              <ArrowUpDown className="w-3.5 h-3.5" /> Upgrade Plan
            </DropdownMenuItem>

            {/* Downgrade Plan */}
            {row.plan && row.plan !== 'trial' && (
              <DropdownMenuItem
                onClick={() => { setUpgradeTenant(row); toast('Select a lower plan in the plan modal') }}
                className="gap-2 text-amber-700 focus:text-amber-700"
              >
                <ArrowUpDown className="w-3.5 h-3.5 rotate-180" /> Downgrade Plan
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* View sub-sections */}
            <DropdownMenuItem onClick={() => setDetailsTenant({ ...row, _defaultTab: 'users' })} className="gap-2">
              <Users className="w-3.5 h-3.5" /> View Users
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDetailsTenant({ ...row, _defaultTab: 'billing' })} className="gap-2">
              <CreditCard className="w-3.5 h-3.5" /> View Billing
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDetailsTenant({ ...row, _defaultTab: 'reports' })} className="gap-2">
              <BarChart3 className="w-3.5 h-3.5" /> View Reports
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDetailsTenant({ ...row, _defaultTab: 'audit' })} className="gap-2">
              <Activity className="w-3.5 h-3.5" /> View Audit Logs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDetailsTenant({ ...row, _defaultTab: 'storage' })} className="gap-2">
              <Database className="w-3.5 h-3.5" /> View Storage
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Reset Owner Password */}
            <DropdownMenuItem onClick={() => setResetPwTenant(row)} className="gap-2">
              <Key className="w-3.5 h-3.5" /> Reset Owner Password
            </DropdownMenuItem>

            {/* Download Backup */}
            <DropdownMenuItem
              onClick={() => downloadBackup(row)}
              disabled={downloadingId === row._id}
              className="gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingId === row._id ? 'Downloading…' : 'Download Backup'}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Suspend */}
            {row.status !== 'suspended' && row.status !== 'deleted' && (
              <DropdownMenuItem
                className="text-amber-700 focus:text-amber-700 gap-2"
                onClick={() => setSuspendTenant(row)}
              >
                <Ban className="w-3.5 h-3.5" /> Suspend Workspace
              </DropdownMenuItem>
            )}

            {/* Activate */}
            {row.status === 'suspended' && (
              <DropdownMenuItem
                className="text-emerald-600 focus:text-emerald-600 gap-2"
                onClick={() => setActivateConfirm(row)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Activate Workspace
              </DropdownMenuItem>
            )}

            {/* Delete */}
            {row.status !== 'deleted' && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive gap-2"
                onClick={() => setDeleteTenant(row)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Workspace
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const tableFilters = [
    { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'suspended', label: 'Suspended' }, { value: 'deleted', label: 'Deleted' }] },
    { key: 'plan',   label: 'Plan',   options: PLAN_OPTIONS.map(p => ({ value: p.value, label: p.label })) },
  ]

  const bulkActions = [
    { label: 'Suspend All', icon: Ban, variant: 'outline', action: () => toast('Use individual actions for safety') },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Workspaces"
        subtitle={`${total.toLocaleString()} total workspaces`}
        icon={Building2}
        breadcrumbs={[{ label: 'Workspaces' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Workspace
            </Button>
          </>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={tenants}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search workspaces…"
        emptyMessage="No workspaces found."
        filename="workspaces"
        filters={tableFilters}
        filterValues={filters}
        onFilterChange={handleFilter}
        search={search}
        onSearchChange={setSearch}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        bulkActions={bulkActions}
        onSort={handleSort}
        sortKey={sort.key}
        sortDir={sort.dir}
      />

      {/* ── Create Wizard ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateWorkspaceWizard
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={() => qc.invalidateQueries({ queryKey: ['platform-tenants-v2'] })}
          />
        )}
      </AnimatePresence>

      {/* ── View Details ── */}
      <WorkspaceDetailsModal
        open={!!detailsTenant}
        onClose={() => setDetailsTenant(null)}
        tenantId={detailsTenant?._id}
      />

      {/* ── Edit Workspace ── */}
      <EditWorkspaceModal
        open={!!editTenant}
        onClose={() => setEditTenant(null)}
        tenant={editTenant}
        onSaved={() => setEditTenant(null)}
      />

      {/* ── Upgrade Plan ── */}
      <UpgradePlanModal
        open={!!upgradeTenant}
        onClose={() => setUpgradeTenant(null)}
        tenant={upgradeTenant}
        onUpgraded={() => setUpgradeTenant(null)}
      />

      {/* ── Reset Owner Password ── */}
      <ResetPasswordModal
        open={!!resetPwTenant}
        onClose={() => setResetPwTenant(null)}
        tenant={resetPwTenant}
      />

      {/* ── Suspend Workspace ── */}
      <SuspendWorkspaceDialog
        open={!!suspendTenant}
        onClose={() => setSuspendTenant(null)}
        tenant={suspendTenant}
        onSuspended={() => setSuspendTenant(null)}
      />

      {/* ── Delete Workspace ── */}
      <DeleteWorkspaceDialog
        open={!!deleteTenant}
        onClose={() => setDeleteTenant(null)}
        tenant={deleteTenant}
        onDeleted={() => setDeleteTenant(null)}
      />

      {/* ── Activate confirmation ── */}
      <ConfirmDialog
        open={!!activateConfirm}
        onClose={() => setActivateConfirm(null)}
        title={`Activate "${activateConfirm?.name}"?`}
        description="This workspace and all its users will regain full access immediately."
        confirmLabel="Activate"
        confirmVariant="default"
        onConfirm={() => activateMutation.mutate(activateConfirm._id)}
        loading={activateMutation.isPending}
      />
    </div>
  )
}
