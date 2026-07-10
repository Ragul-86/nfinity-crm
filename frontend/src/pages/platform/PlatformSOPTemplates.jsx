import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  BookOpen, RefreshCcw, Plus, Copy, Trash2, Eye, X,
  Pencil, Send, GripVertical, ChevronDown, Check,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const DEPARTMENTS = ['Sales','Marketing','Operations','Finance','HR','Customer Support','IT','Management','Design','All']

function buildDefaultForm() {
  return { title: '', category: '', description: '', department: 'All', steps: [{ title: '', description: '', dueDays: 1 }] }
}

function SOPFormModal({ open, onClose, initial, onSave, loading, workspaces }) {
  const [form, setForm] = useState(buildDefaultForm())
  const [pushTarget, setPushTarget] = useState('all') // 'all' | tenant._id

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          title: initial.title || '',
          category: initial.category || '',
          description: initial.description || '',
          department: initial.department || 'All',
          steps: (initial.steps || []).map(s => ({
            title: typeof s === 'string' ? s : (s.title || ''),
            description: typeof s === 'string' ? '' : (s.description || ''),
            dueDays: s.dueDays || 1,
          })),
        })
      } else {
        setForm(buildDefaultForm())
      }
    }
  }, [open, initial?._id])

  if (!open) return null

  const addStep = () => setForm(f => ({ ...f, steps: [...f.steps, { title: '', description: '', dueDays: 1 }] }))
  const removeStep = (i) => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))
  const updateStep = (i, key, val) => setForm(f => ({ ...f, steps: f.steps.map((s, j) => j === i ? { ...s, [key]: val } : s) }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-10 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">{initial ? 'Edit SOP Template' : 'Create SOP Template'}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Client Onboarding" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Onboarding" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Default Department</label>
              <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
                value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea rows={2} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none resize-none"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          {/* Steps / Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Steps / Checklist</label>
              <Button variant="outline" size="sm" onClick={addStep}><Plus className="w-3.5 h-3.5 mr-1" />Add Step</Button>
            </div>
            <div className="space-y-2">
              {form.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border border-border/50">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-2" />
                  <div className="flex-1 space-y-1.5">
                    <input
                      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none"
                      value={step.title} onChange={e => updateStep(i, 'title', e.target.value)} placeholder={`Step ${i + 1} title`}
                    />
                    <input
                      className="w-full px-2.5 py-1 text-xs rounded-md border border-input bg-background focus:outline-none"
                      value={step.description} onChange={e => updateStep(i, 'description', e.target.value)} placeholder="Description (optional)"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-muted-foreground whitespace-nowrap">Due in</label>
                      <input type="number" min={1} max={365}
                        className="w-16 px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none"
                        value={step.dueDays} onChange={e => updateStep(i, 'dueDays', Number(e.target.value))} />
                      <label className="text-[10px] text-muted-foreground">day(s)</label>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeStep(i)} className="text-destructive mt-1.5 hover:text-red-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.title.trim() || loading}
            onClick={() => onSave(form)}>
            {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Create Template')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PreviewModal({ template, onClose }) {
  if (!template) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md z-10 p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-1 shrink-0">
          <p className="font-semibold text-sm">{template.title}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-1">{template.category || 'General'} · {template.department || 'All Departments'}</p>
        {template.description && <p className="text-xs text-muted-foreground mb-3">{template.description}</p>}
        <div className="overflow-y-auto flex-1">
          <ol className="space-y-2">
            {(template.steps || []).map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 p-2.5 bg-muted/50 rounded-lg">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-bold">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{typeof s === 'string' ? s : s.title}</p>
                  {typeof s !== 'string' && s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                  {typeof s !== 'string' && s.dueDays && <p className="text-[10px] text-muted-foreground mt-0.5">Due in {s.dueDays} day(s)</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function PushModal({ template, workspaces, onClose, onPush, loading }) {
  const [target, setTarget] = useState('all')
  if (!template) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm z-10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Push "{template.title}"</p>
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
          <Button size="sm" disabled={loading} onClick={() => onPush(template._id, target === 'all' ? null : [target])}>
            <Send className="w-3.5 h-3.5 mr-1.5" />{loading ? 'Pushing…' : 'Push Template'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformSOPTemplates() {
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
    queryKey: ['platform-sop-templates', page, pageSize, search],
    queryFn: () => {
      const p = new URLSearchParams({ page, limit: pageSize, ...(search && { search }) })
      return api.get(`/platform/sop-templates?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    staleTime: 15000,
  })

  const { data: wsData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  const templates = data?.templates || data?.sops || []
  const total     = data?.total     || 0
  const workspaces = wsData?.tenants || []

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/platform/sop-templates', body).then(r => r.data),
    onSuccess: () => { toast.success('Template created'); qc.invalidateQueries({ queryKey: ['platform-sop-templates'] }); setShowCreate(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/platform/sop-templates/${id}`, body).then(r => r.data),
    onSuccess: () => { toast.success('Template updated'); qc.invalidateQueries({ queryKey: ['platform-sop-templates'] }); setEditTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/platform/sop-templates/${id}`),
    onSuccess: () => { toast.success('Template deleted'); qc.invalidateQueries({ queryKey: ['platform-sop-templates'] }); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const duplicateMutation = useMutation({
    mutationFn: async (template) => {
      const { _id, createdAt, updatedAt, ...rest } = template
      return api.post('/platform/sop-templates', { ...rest, title: `${rest.title} (Copy)` }).then(r => r.data)
    },
    onSuccess: () => { toast.success('Template duplicated'); qc.invalidateQueries({ queryKey: ['platform-sop-templates'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const pushMutation = useMutation({
    mutationFn: ({ id, workspaceIds }) => api.post(`/platform/sop-templates/${id}/push`, { workspaceIds }).then(r => r.data),
    onSuccess: (d) => { toast.success(`Pushed to ${d.pushedTo || 'all workspaces'}`); setPushTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const columns = [
    {
      key: 'title', header: 'Template', sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-sm">{row.title}</p>
          <p className="text-xs text-muted-foreground">{row.category || 'General'} · {row.department || 'All Depts'}</p>
        </div>
      ),
      exportValue: (row) => row.title,
    },
    {
      key: 'steps', header: 'Steps',
      render: (row) => <span className="text-sm text-muted-foreground">{row.stepsCount ?? row.steps?.length ?? 0} steps</span>,
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
        title="Global SOP Templates"
        subtitle={`${total} templates — push to any workspace`}
        icon={BookOpen}
        breadcrumbs={[{ label: 'SOP Templates' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />New Template
            </Button>
          </>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={templates}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search SOP templates…"
        emptyMessage="No SOP templates created yet."
        filename="sop-templates"
        search={search}
        onSearchChange={setSearch}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <SOPFormModal open={showCreate} onClose={() => setShowCreate(false)} onSave={(form) => createMutation.mutate(form)} loading={createMutation.isPending} workspaces={workspaces} />
      <SOPFormModal open={!!editTarget} initial={editTarget} onClose={() => setEditTarget(null)} onSave={(form) => updateMutation.mutate({ id: editTarget._id, ...form })} loading={updateMutation.isPending} workspaces={workspaces} />
      <PreviewModal template={previewTarget} onClose={() => setPreviewTarget(null)} />
      <PushModal template={pushTarget} workspaces={workspaces} onClose={() => setPushTarget(null)} loading={pushMutation.isPending} onPush={(id, ids) => pushMutation.mutate({ id, workspaceIds: ids })} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This template will be permanently removed."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
