import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ShieldCheck, RefreshCcw, AlertTriangle, Lock, UserX, Globe } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, PlatformStatCard } from '@/components/platform/PlatformPageHeader'

export default function PlatformSecurity() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-security'],
    queryFn: () => api.get('/platform/security/stats').then(r => r.data),
    refetchInterval: 60000,
  })

  const stats = data || {}
  const recentEvents = stats.recentEvents || []

  const SEVERITY_COLORS = {
    critical: 'text-red-600 bg-red-500/10',
    high: 'text-orange-600 bg-orange-500/10',
    medium: 'text-yellow-600 bg-yellow-500/10',
    low: 'text-blue-600 bg-blue-500/10',
  }

  return (
    <div>
      <PlatformPageHeader
        title="Security Center"
        subtitle="Platform-wide security monitoring"
        icon={ShieldCheck}
        breadcrumbs={[{ label: 'Security Center' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <PlatformStatCard title="Failed Logins (24h)" value={stats.failedLogins24h || 0} icon={Lock} color="bg-red-500" loading={isLoading} />
        <PlatformStatCard title="Suspicious IPs" value={stats.suspiciousIPs || 0} icon={Globe} color="bg-orange-500" loading={isLoading} />
        <PlatformStatCard title="Suspended Users" value={stats.suspendedUsers || 0} icon={UserX} color="bg-yellow-500" loading={isLoading} />
        <PlatformStatCard title="Security Events" value={stats.totalEvents || 0} icon={AlertTriangle} color="bg-primary" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent security events */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">Recent Security Events</p>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : recentEvents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <ShieldCheck className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No security events detected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${SEVERITY_COLORS[e.severity] || 'bg-muted text-muted-foreground'}`}>
                    {e.severity || 'info'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{e.description || e.event}</p>
                    <p className="text-[11px] text-muted-foreground">{e.ip || ''} · {e.timestamp ? format(new Date(e.timestamp), 'MMM d HH:mm') : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security settings summary */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-medium text-sm">Security Configuration</p>
          {[
            { label: 'Two-Factor Auth (Platform Admin)', value: stats.mfaEnabled ? 'Enabled' : 'Disabled', ok: stats.mfaEnabled },
            { label: 'Session Timeout', value: stats.sessionTimeout ? `${stats.sessionTimeout} minutes` : '60 minutes' },
            { label: 'Max Login Attempts', value: stats.maxLoginAttempts || '5' },
            { label: 'IP Allowlist', value: stats.ipAllowlist?.length ? `${stats.ipAllowlist.length} IPs` : 'Not configured' },
            { label: 'SSL Certificate', value: stats.sslValid ? 'Valid' : 'Not verified', ok: stats.sslValid },
            { label: 'Password Policy', value: stats.passwordPolicy || 'Standard' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">{item.label}</span>
              <span className={`text-xs font-medium ${item.ok === true ? 'text-emerald-600' : item.ok === false ? 'text-red-500' : ''}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
