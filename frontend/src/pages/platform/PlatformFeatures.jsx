import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Layers, RefreshCcw, Save, Building2, Search, ChevronDown } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

// ── Feature status badges ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:       { label: 'Active',       class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  disabled:     { label: 'Disabled',     class: 'bg-slate-100 text-slate-500 border-slate-200' },
  beta:         { label: 'Beta',         class: 'bg-blue-100 text-blue-700 border-blue-200' },
  coming_soon:  { label: 'Coming Soon',  class: 'bg-amber-100 text-amber-700 border-amber-200' },
}

const CATEGORY_COLORS = {
  core: 'bg-primary/10 text-primary',
  sales: 'bg-blue-500/10 text-blue-600',
  finance: 'bg-emerald-500/10 text-emerald-600',
  marketing: 'bg-pink-500/10 text-pink-600',
  messaging: 'bg-green-500/10 text-green-600',
  ai: 'bg-violet-500/10 text-violet-600',
  analytics: 'bg-indigo-500/10 text-indigo-600',
  hr: 'bg-amber-500/10 text-amber-600',
  operations: 'bg-orange-500/10 text-orange-600',
  client: 'bg-cyan-500/10 text-cyan-600',
  integrations: 'bg-red-500/10 text-red-600',
  developer: 'bg-slate-500/10 text-slate-600',
  security: 'bg-rose-500/10 text-rose-600',
}

// ── Toggle Switch ──────────────────────────────────────────────────────────────
function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2
        focus-visible:ring-ring focus-visible:ring-offset-2
        ${enabled ? 'bg-primary' : 'bg-input'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// ── Feature Card ───────────────────────────────────────────────────────────────
function FeatureCard({ feature, onToggle, onStatusChange, isSaving }) {
  const statusCfg = STATUS_CONFIG[feature.featureStatus || (feature.enabled ? 'active' : 'disabled')] || STATUS_CONFIG.active
  const catColor  = CATEGORY_COLORS[feature.category] || 'bg-muted text-muted-foreground'
  const [showStatus, setShowStatus] = useState(false)

  return (
    <div className={`flex flex-col p-4 bg-card border rounded-xl hover:shadow-sm transition-all duration-150 ${feature.enabled ? 'border-primary/20' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 transition-colors ${feature.enabled ? catColor : 'bg-muted text-muted-foreground'}`}>
            {feature.icon || '⚙️'}
          </div>
          <div className="min-w-0">
            <p className={`font-medium text-sm truncate ${!feature.enabled ? 'text-muted-foreground' : ''}`}>
              {feature.name || feature.label}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize">{feature.category || feature.key}</p>
          </div>
        </div>
        <ToggleSwitch enabled={feature.enabled} onChange={() => onToggle(feature.key)} disabled={isSaving} />
      </div>

      {/* Status badge + picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowStatus(s => !s)}
          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-medium transition-colors ${statusCfg.class}`}
        >
          {statusCfg.label}
          <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showStatus ? 'rotate-180' : ''}`} />
        </button>
        {showStatus && (
          <div className="absolute left-0 top-7 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-32">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => { onStatusChange(feature.key, key); setShowStatus(false) }}
                className={`w-full flex items-center px-3 py-1.5 text-[11px] font-medium hover:bg-accent transition-colors ${cfg.class.split(' ')[1]}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PlatformFeatures() {
  const qc = useQueryClient()
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [localFeatures, setLocalFeatures] = useState([])
  const [isDirty, setIsDirty] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data: featuresData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-features', selectedWorkspace],
    queryFn: () => {
      const url = selectedWorkspace ? `/platform/features?workspaceId=${selectedWorkspace}` : '/platform/features'
      return api.get(url).then(r => r.data)
    },
  })

  const { data: workspacesData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  useEffect(() => {
    if (featuresData?.features) {
      setLocalFeatures(featuresData.features.map(f => ({
        ...f,
        name: f.name || f.label,
        featureStatus: f.featureStatus || (f.enabled ? 'active' : 'disabled'),
      })))
      setIsDirty(false)
    }
  }, [featuresData])

  useEffect(() => { setIsDirty(false) }, [selectedWorkspace])

  const toggleFeature = useCallback((key) => {
    setLocalFeatures(prev => prev.map(f => {
      if (f.key !== key) return f
      const newEnabled = !f.enabled
      return { ...f, enabled: newEnabled, featureStatus: newEnabled ? (f.featureStatus === 'disabled' ? 'active' : f.featureStatus) : 'disabled' }
    }))
    setIsDirty(true)
  }, [])

  const changeStatus = useCallback((key, status) => {
    setLocalFeatures(prev => prev.map(f => {
      if (f.key !== key) return f
      return { ...f, featureStatus: status, enabled: status !== 'disabled' }
    }))
    setIsDirty(true)
  }, [])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (selectedWorkspace) {
        const enabledKeys = localFeatures.filter(f => f.enabled).map(f => f.key)
        return api.patch(`/platform/tenants/${selectedWorkspace}/features`, { features: enabledKeys })
      }
      return api.put('/platform/features', {
        features: localFeatures.map(f => ({ key: f.key, enabled: f.enabled, featureStatus: f.featureStatus })),
      })
    },
    onSuccess: () => { toast.success('Feature settings saved'); setIsDirty(false); refetch() },
    onError: err => toast.error(err.response?.data?.message || 'Failed to save features'),
  })

  const tenants        = workspacesData?.tenants || []
  const categories     = ['all', ...new Set(localFeatures.map(f => f.category).filter(Boolean))]
  const filtered       = localFeatures.filter(f => {
    const matchSearch = !search || (f.name || f.label || '').toLowerCase().includes(search.toLowerCase()) || f.key.includes(search.toLowerCase())
    const matchCat    = categoryFilter === 'all' || f.category === categoryFilter
    return matchSearch && matchCat
  })
  const enabledCount   = localFeatures.filter(f => f.enabled).length

  return (
    <div>
      <PlatformPageHeader
        title="Feature Management"
        subtitle={`${enabledCount} of ${localFeatures.length} features enabled${isDirty ? ' · Unsaved changes' : ''}`}
        icon={Layers}
        breadcrumbs={[{ label: 'Feature Management' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}>
              <Save className={`w-3.5 h-3.5 mr-1.5 ${saveMutation.isPending ? 'animate-pulse' : ''}`} />
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      {/* Workspace filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            className="px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            value={selectedWorkspace}
            onChange={e => setSelectedWorkspace(e.target.value)}
            disabled={saveMutation.isPending}
          >
            <option value="">Platform Defaults</option>
            {tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          {selectedWorkspace && <span className="text-xs text-muted-foreground">Overrides apply to this workspace only</span>}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="pl-8 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search features…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1 flex-wrap">
          {categories.slice(0, 8).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all capitalize ${
                categoryFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:bg-accent'
              }`}
            >{cat}</button>
          ))}
        </div>
      </div>

      {/* Unsaved changes notice */}
      {isDirty && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 text-xs">
          <Save className="w-3.5 h-3.5 shrink-0" />
          You have unsaved changes. Click <strong className="mx-1">Save Changes</strong> to persist them.
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Layers className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No features found</p>
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {filtered.map((f, i) => (
            <motion.div key={f.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <FeatureCard
                feature={f}
                onToggle={toggleFeature}
                onStatusChange={changeStatus}
                isSaving={saveMutation.isPending}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
