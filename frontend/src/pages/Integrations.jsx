import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { RefreshCcw, Search, PlugZap, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'

import PageHeader from '@/components/common/PageHeader'
import IntegrationCard from '@/components/integrations/IntegrationCard'
import ConnectModal from '@/components/integrations/ConnectModal'
import DisconnectDialog from '@/components/integrations/DisconnectDialog'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
  getIntegrationsByCategory,
} from '@/data/integrationConfig'

const AUTO_REFRESH_MS = 30_000

// ── Access guard component ───────────────────────────────────────────────────
function AccessDeniedInline() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldAlert className="w-7 h-7 text-destructive" />
      </div>
      <div>
        <p className="font-semibold text-base">Access Restricted</p>
        <p className="text-sm text-muted-foreground mt-1">
          Only Platform Super Admin and Client Super Admin can manage integrations.
        </p>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Integrations() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()

  const canAccess = ['platform_super_admin', 'client_super_admin', 'super_admin'].includes(user?.role)
  const readOnly  = user?.role === 'platform_super_admin' // Platform admin views, doesn't manage

  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [connectModalConfig, setConnectModalConfig]   = useState(null) // integration config
  const [connectModalIntegration, setConnectModalIntegration] = useState(null) // live data
  const [disconnectConfig, setDisconnectConfig] = useState(null)
  const [syncingId, setSyncingId]   = useState(null)
  const [testingId,  setTestingId]  = useState(null)

  // Handle OAuth callback result (redirect returns ?oauth=success/error&provider=...)
  useEffect(() => {
    const oauthStatus   = searchParams.get('oauth')
    const oauthProvider = searchParams.get('provider')
    const oauthReason   = searchParams.get('reason')

    if (oauthStatus && oauthProvider) {
      if (oauthStatus === 'success') {
        toast.success(`${oauthProvider.replace(/_/g, ' ')} connected successfully`)
        qc.invalidateQueries(['integrations'])
      } else {
        toast.error(`Connection failed${oauthReason ? `: ${decodeURIComponent(oauthReason)}` : ''}`)
      }
      // Clean up URL params
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line

  // Load all integrations for this tenant
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get('/integrations').then(r => r.data),
    refetchInterval: AUTO_REFRESH_MS,
    enabled: canAccess,
  })

  // Map live data by provider id for O(1) lookup
  const integrationMap = useCallback(() => {
    const map = {}
    for (const int of data?.data || []) {
      map[int.provider] = int
    }
    return map
  }, [data])()

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: (id) => api.post(`/integrations/${id}/sync`).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.message || 'Synced successfully')
      qc.invalidateQueries(['integrations'])
      setSyncingId(null)
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Sync failed')
      setSyncingId(null)
    },
  })

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (id) => api.post(`/integrations/${id}/test`).then(r => r.data),
    onSuccess: (res, id) => {
      if (res.passed) {
        toast.success(res.message || 'Connection verified')
      } else {
        toast.error(res.message || 'Connection test failed')
      }
      qc.invalidateQueries(['integrations'])
      setTestingId(null)
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Test failed')
      setTestingId(null)
    },
  })

  const handleConnect = (config, integration) => {
    setConnectModalConfig(config)
    setConnectModalIntegration(integration || null)
  }

  const handleDisconnect = (config) => {
    setDisconnectConfig(config)
  }

  const handleSync = (id) => {
    setSyncingId(id)
    syncMutation.mutate(id)
  }

  const handleTest = (id) => {
    setTestingId(id)
    testMutation.mutate(id)
  }

  // Filter integrations by category + search
  const filteredIntegrations = INTEGRATIONS.filter(int => {
    const matchesCategory = activeCategory === 'all' || int.category === activeCategory
    const matchesSearch = !search || (
      int.name.toLowerCase().includes(search.toLowerCase()) ||
      int.description.toLowerCase().includes(search.toLowerCase())
    )
    return matchesCategory && matchesSearch
  })

  // Connected count
  const connectedCount = (data?.data || []).filter(i => i.status === 'connected').length

  if (!canAccess) {
    return (
      <div>
        <PageHeader title="Integrations" description="Connect third-party services" />
        <AccessDeniedInline />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        description={`${connectedCount} of ${INTEGRATIONS.length} connected`}
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCcw className={cn('w-3.5 h-3.5', isRefetching && 'animate-spin')} />
          Refresh
        </Button>
      </PageHeader>

      {/* Category tabs + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        {/* Category tabs */}
        <div className="flex gap-1 bg-muted/40 p-1 rounded-lg flex-wrap">
          {INTEGRATION_CATEGORIES.map(cat => {
            const count = cat.key === 'all'
              ? INTEGRATIONS.length
              : INTEGRATIONS.filter(i => i.category === cat.key).length
            const connectedInCat = cat.key === 'all'
              ? connectedCount
              : (data?.data || []).filter(i => i.category === cat.key && i.status === 'connected').length

            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors whitespace-nowrap',
                  activeCategory === cat.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                {connectedInCat > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold leading-none">
                    {connectedInCat}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search integrations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Integration cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <PlugZap className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No integrations found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIntegrations.map(intConfig => {
            const liveData = integrationMap[intConfig.id]
            return (
              <IntegrationCard
                key={intConfig.id}
                config={intConfig}
                integration={liveData}
                readOnly={readOnly}
                isSyncing={syncingId === intConfig.id}
                isTesting={testingId === intConfig.id}
                onConnect={() => handleConnect(intConfig, liveData)}
                onDisconnect={() => handleDisconnect(intConfig)}
                onTest={() => handleTest(intConfig.id)}
                onSync={() => handleSync(intConfig.id)}
                onSettings={() => handleConnect(intConfig, liveData)}
              />
            )
          })}
        </div>
      )}

      {/* Platform admin read-only notice */}
      {readOnly && (
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-4 py-3">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          You are viewing this workspace as Platform Super Admin. Integrations cannot be modified from this view.
          Use impersonation to manage integrations on behalf of the workspace.
        </div>
      )}

      {/* Connect modal */}
      <ConnectModal
        open={!!connectModalConfig}
        onClose={() => { setConnectModalConfig(null); setConnectModalIntegration(null) }}
        config={connectModalConfig}
        integration={connectModalIntegration}
      />

      {/* Disconnect dialog */}
      <DisconnectDialog
        open={!!disconnectConfig}
        onClose={() => setDisconnectConfig(null)}
        config={disconnectConfig}
      />
    </div>
  )
}
