import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Database, RefreshCcw, Plus, Download } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, StatusBadge, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

export default function PlatformBackup() {
  const qc = useQueryClient()
  const [showConfirm, setShowConfirm] = useState(false)
  const [selectedWorkspace, setSelectedWorkspace] = useState('')

  const { data: backupsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-backups'],
    queryFn: () => api.get('/platform/backups').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: workspacesData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  const backups = backupsData?.backups || []
  const tenants = workspacesData?.tenants || []

  const createMutation = useMutation({
    mutationFn: () => api.post('/platform/backups', { workspaceId: selectedWorkspace || undefined }).then(r => r.data),
    onSuccess: () => { toast.success('Backup started!'); qc.invalidateQueries({ queryKey: ['platform-backups'] }); setShowConfirm(false) },
    onError: err => toast.error(err.response?.data?.message || 'Backup failed'),
  })

  const formatBytes = (bytes = 0) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const STATUS_COLORS = {
    completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
    running: 'bg-blue-500/10 text-blue-600 border-blue-200',
    failed: 'bg-red-500/10 text-red-600 border-red-200',
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
  }

  return (
    <div>
      <PlatformPageHeader
        title="Backup & Restore"
        subtitle={`${backups.length} backups available`}
        icon={Database}
        breadcrumbs={[{ label: 'Backup & Restore' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowConfirm(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Create Backup
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : backups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Database className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm mb-3">No backups yet</p>
          <Button size="sm" onClick={() => setShowConfirm(true)}><Plus className="w-3.5 h-3.5 mr-1.5" />Create First Backup</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((b, i) => (
            <div key={b._id || i} className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:shadow-sm transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Database className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm">{b.name || `Backup ${format(new Date(b.createdAt || Date.now()), 'MMM d, yyyy HH:mm')}`}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${STATUS_COLORS[b.status] || 'bg-muted text-muted-foreground border-border'}`}>
                    {b.status || 'completed'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.workspace || 'Full Platform'} · {b.size ? formatBytes(b.size) : '—'}
                  {b.createdAt ? ` · ${format(new Date(b.createdAt), 'MMM d, yyyy HH:mm')}` : ''}
                </p>
              </div>
              {b.downloadUrl || b.status === 'completed' ? (
                <Button variant="outline" size="sm" className="shrink-0"
                  onClick={() => {
                    const url = b.downloadUrl || `/api/platform/tenants/${b.workspaceId}/backup`
                    window.open(url, '_blank')
                  }}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />Download
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Create backup?"
        description={
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">This will create a full backup. Large workspaces may take a few minutes.</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Workspace (optional)</label>
              <select
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background"
                value={selectedWorkspace}
                onChange={e => setSelectedWorkspace(e.target.value)}
              >
                <option value="">Full Platform</option>
                {tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        }
        confirmLabel="Start Backup"
        confirmVariant="default"
        onConfirm={() => createMutation.mutate()}
        loading={createMutation.isPending}
      />
    </div>
  )
}
