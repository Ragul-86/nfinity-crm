import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  KanbanSquare, RefreshCcw, Plus, Copy, Trash2, Eye, X,
  Pencil, Send, GripVertical, Star, StarOff,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const STAGE_COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899']
const DEFAULT_STAGES = [
  { name: 'New',        color: '#6366f1', probability: 10 },
  { name: 'Contacted',  color: '#3b82f6', probability: 30 },
  { name: 'Proposal',   color: '#f59e0b', probability: 60 },
  { name: 'Negotiation',color: '#10b981', probability: 80 },
  { name: 'Won',        color: '#10b981', probability: 100 },
  { name: 'Lost',       color: '#ef4444', probability: 0  },
]

function buildDefaultPipeline() {
  return { title: '', description: '', isDefault: false, stages: DEFAULT_STAGES.map(s => ({ ...s })) }
}

function PipelineModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState(buildDefaultPipeline())

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          title: initial.title || '',
          description: initial.description || '',
          isDefault: !!initial.isDefault,
          stages: (initial.stages || []).map(s => ({ name: s.name || '', color: s.color || '#6366f1', probability: s.probability ?? 50 })),
        })
      } else {
        setForm(buildDefaultPipeline())
      }
    }
  }, [open, initial?._id])

  if (!open) return null

  const addStage = () => setForm(f => ({ ...f, stages: [...f.stages, { name: '', color: '#6366f1', probability: 50 }] }))
  const removeStage = (i) => setForm(f => ({ ...f, stages: f.stages.filter((_, j) => j !== i) }))
  const updateStage = (i, key, val) => setForm(f => ({ ...f, stages: f.stages.map((s, j) => j === i ? { ...s, [key]: val } : s) }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-10 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">{initial ? 'Edit Pipeline' : 'Create Pipeline'}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Pipeline Name *</label>
              <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Sales Pipeline" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea rows={2} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none resize-none"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm col-span-2">
              <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
              <span className="text-muted-foreground">Set as default pipeline for new workspaces</span>
            </label>
          </div>

          {/* Stage editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Pipeline Stages</label>
              <Button variant="outline" size="sm" onClick={addStage}><Plus className="w-3.5 h-3.5 mr-1" />Add Stage</Button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">Drag to reorder (visual indicator only — submit to save order)</p>
            <div className="space-y-2">
              {form.stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg border border-border/50">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0 cursor-grab" />
                  <div
                    className="w-4 h-4 rounded shrink-0 border border-border/50 cursor-pointer"
                    style={{ background: stage.color }}
                    title="Click to cycle color"
                    onClick={() => {
                      const idx = STAGE_COLORS.indexOf(stage.color)
                      updateStage(i, 'color', STAGE_COLORS[(idx + 1) % STAGE_COLORS.length])
                    }}
                  />
                  <input className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none"
                    value={stage.name} onChange={e => updateStage(i, 'name', e.target.value)} placeholder="Stage name" />
                  <div className="flex items-center gap-1 shrink-0">
                    <input type="number" min={0} max={100}
                      className="w-16 px-2 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none text-center"
                      value={stage.probability} onChange={e => updateStage(i, 'probability', Number(e.target.value))} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <button type="button" onClick={() => removeStage(i)} className="text-destructive hover:text-red-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.title.trim() || loading} onClick={() => onSave(form)}>
            {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Create Pipeline')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PreviewModal({ pipeline, onClose }) {
  if (!pipeline) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg z-10 p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-1 shrink-0">
          <div>
            <p className="font-semibold text-sm">{pipeline.title}</p>
            {pipeline.isDefault && <span className="text-[10px] text-amber-600 font-medium">Default Pipeline</span>}
          </div>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {pipeline.description && <p className="text-xs text-muted-foreground mb-4">{pipeline.description}</p>}
        <div className="overflow-y-auto flex-1">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(pipeline.stages || []).map((stage, i) => (
              <div key={i} className="flex flex-col items-center min-w-[80px]">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mb-1"
                  style={{ background: stage.color || '#6366f1' }}>{i + 1}</div>
                <p className="text-[10px] font-medium text-center leading-tight">{stage.name}</p>
                {stage.probability !== undefined && <p className="text-[9px] text-muted-foreground">{stage.probability}%</p>}
                {i < (pipeline.stages?.length || 0) - 1 && (
                  <div className="absolute" style={{ display: 'none' }} />
                )}
              </div>
            ))}
          </div>
          {/* Arrow view */}
          <div className="mt-4 flex flex-wrap gap-1 items-center">
            {(pipeline.stages || []).map((stage, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="px-2.5 py-1 rounded text-xs text-white font-medium" style={{ background: stage.color || '#6366f1' }}>{stage.name}</span>
                {i < (pipeline.stages?.length || 0) - 1 && <span className="text-muted-foreground text-sm">→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PushModal({ pipeline, workspaces, onClose, onPush, loading }) {
  const [target, setTarget] = useState('all')
  if (!pipeline) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm z-10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Push "{pipeline.title}"</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Target Workspace</label>
          <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
            value={target} onChange={e => setTarget(e.target.value)}>
            <option value="all">All Active Workspaces</option>
            {workspaces.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={loading} onClick={() => onPush(pipeline._id, target === 'all' ? null : [target])}>
            <Send className="w-3.5 h-3.5 mr-1.5" />{loading ? 'Pushing…' : 'Push Pipeline'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformPipelines() {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(20)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [previewTarget, setPreviewTarget] = useState(null)
  const [pushTarget, setPushTarget] = useState(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-pipelines', page, pageSize, search],
    queryFn: () => {
      const p = new URLSearchParams({ page, limit: pageSize, ...(search && { search }) })
      return api.get(`/platform/pipeline-templates?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    staleTime: 15000,
  })

  const { data: wsData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  const pipelines  = data?.pipelines || data?.templates || []
  const total      = data?.total || 0
  const workspaces = wsData?.tenants || []

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/platform/pipeline-templates', body).then(r => r.data),
    onSuccess: () => { toast.success('Pipeline created'); qc.invalidateQueries({ queryKey: ['platform-pipelines'] }); setShowCreate(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/platform/pipeline-templates/${id}`, body).then(r => r.data),
    onSuccess: () => { toast.success('Pipeline updated'); qc.invalidateQueries({ queryKey: ['platform-pipelines'] }); setEditTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/platform/pipeline-templates/${id}`),
    onSuccess: () => { toast.success('Pipeline deleted'); qc.invalidateQueries({ queryKey: ['platform-pipelines'] }); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const duplicateMutation = useMutation({
    mutationFn: async (pl) => {
      const { _id, createdAt, updatedAt, ...rest } = pl
      return api.post('/platform/pipeline-templates', { ...rest, title: `${rest.title} (Copy)`, isDefault: false }).then(r => r.data)
    },
    onSuccess: () => { toast.success('Pipeline duplicated'); qc.invalidateQueries({ queryKey: ['platform-pipelines'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const pushMutation = useMutation({
    mutationFn: ({ id, workspaceIds }) => api.post(`/platform/pipeline-templates/${id}/push`, { workspaceIds }).then(r => r.data),
    onSuccess: (d) => { toast.success(`Pushed to ${d.pushedTo || 'all workspaces'}`); setPushTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const columns = [
    {
      key: 'title', header: 'Pipeline Name', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.isDefault && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="currentColor" />}
          <div>
            <p className="font-medium text-sm">{row.title}</p>
            {row.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{row.description}</p>}
          </div>
        </div>
      ),
      exportValue: (row) => row.title,
    },
    {
      key: 'stages', header: 'Stages',
      render: (row) => (
        <div className="flex items-center gap-1">
          {(row.stages || []).slice(0, 4).map((s, i) => (
            <span key={i} className="inline-block w-3 h-3 rounded-full border border-white/50" style={{ background: s.color || '#6366f1' }} title={s.name} />
          ))}
          {(row.stages || []).length > 4 && <span className="text-xs text-muted-foreground">+{row.stages.length - 4}</span>}
          <span className="text-xs text-muted-foreground ml-1">{row.stagesCount ?? row.stages?.length ?? 0} stages</span>
        </div>
      ),
    },
    {
      key: 'createdAt', header: 'Created', sortable: true,
      render: (row) => <span className="text-xs text-muted-foreground">{row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}</span>,
    },
    {
      key: 'actions', header: '', exportable: false,
      render: (row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="w-7 h-7" title="Preview" onClick={() => setPreviewTarget(row)}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" title="Edit" onClick={() => setEditTarget(row)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" title="Duplicate" onClick={() => duplicateMutation.mutate(row)} disabled={duplicateMutation.isPending}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" title="Push to workspace" onClick={() => setPushTarget(row)}>
            <Send className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" title="Delete" onClick={() => setDeleteTarget(row)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Pipeline Templates"
        subtitle={`${total} pipelines — ${pipelines.filter(p => p.isDefault).length} default`}
        icon={KanbanSquare}
        breadcrumbs={[{ label: 'Pipeline Templates' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />New Pipeline
            </Button>
          </>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={pipelines}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search pipelines…"
        emptyMessage="No pipeline templates yet."
        filename="pipeline-templates"
        search={search}
        onSearchChange={setSearch}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <PipelineModal open={showCreate} onClose={() => setShowCreate(false)} onSave={createMutation.mutate} loading={createMutation.isPending} />
      <PipelineModal open={!!editTarget} initial={editTarget} onClose={() => setEditTarget(null)}
        onSave={(form) => updateMutation.mutate({ id: editTarget._id, ...form })} loading={updateMutation.isPending} />
      <PreviewModal pipeline={previewTarget} onClose={() => setPreviewTarget(null)} />
      <PushModal pipeline={pushTarget} workspaces={workspaces} onClose={() => setPushTarget(null)}
        loading={pushMutation.isPending} onPush={(id, ids) => pushMutation.mutate({ id, workspaceIds: ids })} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This pipeline template will be permanently removed."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
