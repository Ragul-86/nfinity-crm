import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Award, RefreshCcw, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, PlatformStatCard } from '@/components/platform/PlatformPageHeader'

export default function PlatformLicense() {
  const [licenseKey, setLicenseKey] = useState('')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-license'],
    queryFn: () => api.get('/platform/license').then(r => r.data),
  })

  const license = data?.license || {}
  const plans = data?.plans || []

  const activateMutation = useMutation({
    mutationFn: (key) => api.post('/platform/license/activate', { key }).then(r => r.data),
    onSuccess: () => { toast.success('License activated'); refetch() },
    onError: err => toast.error(err.response?.data?.message || 'Invalid license key'),
  })

  const isValid = license.status === 'active'
  const isExpiringSoon = license.expiresAt && (new Date(license.expiresAt) - new Date()) < 30 * 24 * 60 * 60 * 1000

  return (
    <div>
      <PlatformPageHeader
        title="License Management"
        subtitle="Manage your platform license and plan configuration"
        icon={Award}
        breadcrumbs={[{ label: 'License Management' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <div className="max-w-lg space-y-5">
        {/* License status card */}
        <div className={`bg-card border rounded-xl p-5 ${isExpiringSoon ? 'border-yellow-300' : isValid ? 'border-emerald-300' : 'border-border'}`}>
          <div className="flex items-center gap-3 mb-4">
            {isValid ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
            <div>
              <p className="font-semibold text-sm">{isValid ? 'License Active' : 'No Active License'}</p>
              {license.plan && <p className="text-xs text-muted-foreground capitalize">{license.plan} Plan</p>}
            </div>
            {license.status && (
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium capitalize ${isValid ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {license.status}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              {[80, 60, 70].map(w => <div key={w} className={`h-3 bg-muted rounded w-${w}`} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'License Key', value: license.key ? `${license.key.slice(0, 8)}••••••••` : '—' },
                { label: 'Max Workspaces', value: license.maxWorkspaces || 'Unlimited' },
                { label: 'Max Users/Workspace', value: license.maxUsersPerWorkspace || 'Unlimited' },
                { label: 'Issued To', value: license.issuedTo || '—' },
                { label: 'Issued On', value: license.issuedAt ? new Date(license.issuedAt).toLocaleDateString('en-IN') : '—' },
                { label: 'Expires On', value: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('en-IN') : 'Never' },
              ].map(r => (
                <div key={r.label}>
                  <p className="text-muted-foreground">{r.label}</p>
                  <p className="font-medium mt-0.5">{r.value}</p>
                </div>
              ))}
            </div>
          )}

          {isExpiringSoon && (
            <div className="mt-4 p-2.5 bg-yellow-500/10 border border-yellow-200 rounded-lg text-xs text-yellow-700">
              ⚠️ Your license expires in less than 30 days. Contact support to renew.
            </div>
          )}
        </div>

        {/* Activate new key */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-medium text-sm">Activate License Key</p>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            />
            <Button size="sm" disabled={!licenseKey.trim() || activateMutation.isPending} onClick={() => activateMutation.mutate(licenseKey)}>
              {activateMutation.isPending ? 'Activating…' : 'Activate'}
            </Button>
          </div>
        </div>

        {/* Plan tiers */}
        {plans.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="font-medium text-sm mb-4">Platform Plans</p>
            <div className="space-y-3">
              {plans.map(p => (
                <div key={p.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm capitalize">{p.name || p.key}</p>
                    <p className="text-xs text-muted-foreground">
                      Max {p.maxUsers || '∞'} users · {p.maxStorage || '∞'} MB storage
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">₹{p.price?.toLocaleString('en-IN') || '0'}</p>
                    <p className="text-xs text-muted-foreground">{p.billingCycle || 'month'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
