import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, HardDrive, FileImage, FileText, Film, Archive } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, PlatformStatCard } from '@/components/platform/PlatformPageHeader'

function StorageBar({ label, used, total, color }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{formatBytes(used)} / {formatBytes(total)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{pct.toFixed(1)}% used</p>
    </div>
  )
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function PlatformStorage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-storage'],
    queryFn: () => api.get('/platform/storage/stats').then(r => r.data),
    refetchInterval: 30000,
  })

  const stats = data || {}
  const workspaces = stats.workspaces || []

  return (
    <div>
      <PlatformPageHeader
        title="Storage Management"
        subtitle="Track file storage usage across all workspaces"
        icon={HardDrive}
        breadcrumbs={[{ label: 'Storage Management' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <PlatformStatCard title="Total Storage Used" value={formatBytes(stats.totalUsed || 0)} icon={HardDrive} color="bg-primary" loading={isLoading} />
        <PlatformStatCard title="Total Capacity" value={formatBytes(stats.totalCapacity || 0)} icon={Archive} color="bg-blue-500" loading={isLoading} />
        <PlatformStatCard title="Images" value={formatBytes(stats.images || 0)} icon={FileImage} color="bg-violet-500" loading={isLoading} />
        <PlatformStatCard title="Documents" value={formatBytes(stats.documents || 0)} icon={FileText} color="bg-amber-500" loading={isLoading} />
      </div>

      {/* Type breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">Platform Storage Overview</p>
          <div className="space-y-4">
            <StorageBar label="Total Used" used={stats.totalUsed || 0} total={stats.totalCapacity || 1} color="bg-primary" />
            <StorageBar label="Images" used={stats.images || 0} total={stats.totalUsed || 1} color="bg-violet-500" />
            <StorageBar label="Documents" used={stats.documents || 0} total={stats.totalUsed || 1} color="bg-amber-500" />
            <StorageBar label="Videos" used={stats.videos || 0} total={stats.totalUsed || 1} color="bg-blue-500" />
            <StorageBar label="Other" used={stats.other || 0} total={stats.totalUsed || 1} color="bg-gray-400" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">Top Workspaces by Storage</p>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <div className="space-y-3">
              {workspaces.slice(0, 8).map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {(w.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate">{w.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{formatBytes(w.used || 0)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${Math.min(100, ((w.used || 0) / (stats.totalUsed || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
