import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ClipboardList, RefreshCcw, Plus, Copy, Trash2, Eye, X,
  Pencil, Send, GripVertical,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const FIELD_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'email',    label: 'Email' },
  { value: 'phone',    label: 'Phone' },
  { value: 'number',   label: 'Number' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'date',     label: 'Date' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio',    label: 'Radio' },
  { value: 'file',     label: 'File Upload' },
]

function buildField() { return { label: '', type: 'text', required: false, placeholder: '' } }
function buildDefaultForm() {
  return {
    title: '', description: '',
    fields: [
      { label: 'Full Name', type: 'text', required: true, placeholder: 'Enter name' },
      { label: 'Email', type: 'email', required: true, placeholder: 'Enter email' },
    ],
  }
}

function LeadFormModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState(buildDefaultForm())

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          title: initial.title || '',
          description: initial.description || '',
          fields: (initial.fields || []).map(f => ({
            label: f.label || '', type: f.type || 'text', required: !!f.required, placeholder: f.placeholder || '',
          })),
        })
      } else {
        setForm(buildDefaultForm())
      }
    }
  }, [open, initial?._id])

  if (!open) return null

  const addField = () => setForm(f => ({ ...f, fields: [...f.fields, buildField()] }))
  const removeField = (i) => setForm(f => ({ ...f, fields: f.fields.filter((_, j) => j !== i) }))
  const updateField = (i, key, val) => setForm(f => ({ ...f, fields: f.fields.map((fld, j) => j === i ? { ...fld, [key]: val } : fld) }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-10 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">{initial ? 'Edit Lead Form' : 'Create Lead Form'}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Form Title *</label>
            <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. General Enquiry Form" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea rows={2} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none resize-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Form Fields</label>
              <Button variant="outline" size="sm" onClick={addField}><Plus className="w-3.5 h-3.5 mr-1" />Add Field</Button>
            </div>
            <div className="space-y-2">
              {form.fields.map((field, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border border-border/50">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-2.5" />
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <input className="w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none"
                        value={field.label} onChange={e => updateField(i, 'label', e.target.value)} placeholder="Field label" />
                    </div>
                    <select className="px-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
                      value={field.type} onChange={e => updateField(i, 'type', e.target.value)}>
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input className="px-2.5 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
                      value={field.placeholder} onChange={e => updateField(i, 'placeholder', e.target.value)} placeholder="Placeholder text" />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground col-span-2">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(i, 'required', e.target.checked)} className="rounded" />
                      Required field
                    </label>
                  </div>
                  <button type="button" onClick={() => removeField(i)} className="text-destructive mt-2 hover:text-red-600 transition-colors">
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
            {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Create Form')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PreviewModal({ form, onClose }) {
  if (!form) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md z-10 p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <p className="font-semibold text-sm">{form.title} — Preview</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {form.description && <p className="text-xs text-muted-foreground mb-4">{form.description}</p>}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {(form.fields || []).map((field, i) => (
            <div key={i}>
              <label className="text-xs font-medium text-foreground">
                {field.label || `Field ${i + 1}`}{field.required && <span className="text-destructive ml-0.5">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea rows={3} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-muted/50 resize-none" placeholder={field.placeholder || ''} disabled />
              ) : field.type === 'select' ? (
                <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-muted/50" disabled>
                  <option>{field.placeholder || 'Select option…'}</option>
                </select>
              ) : field.type === 'checkbox' ? (
                <label className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" disabled /> {field.placeholder || field.label}
                </label>
              ) : (
                <input type={field.type} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-muted/50"
                  placeholder={field.placeholder || ''} disabled />
              )}
            </div>
          ))}
          <Button size="sm" className="w-full mt-2" disabled>Submit</Button>
        </div>
      </div>
    </div>
  )
}

function PushModal({ form, workspaces, onClose, onPush, loading }) {
  const [target, setTarget] = useState('all')
  if (!form) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm z-10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Push "{form.title}"</p>
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
          <Button size="sm" disabled={loading} onClick={() => onPush(form._id, target === 'all' ? null : [target])}>
            <Send className="w-3.5 h-3.5 mr-1.5" />{loading ? 'Pushing…' : 'Push Form'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformLeadForms() {
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
    queryKey: ['platform-lead-forms', page, pageSize, search],
    queryFn: () => {
      const p = new URLSearchParams({ page, limit: pageSize, ...(search && { search }) })
      return api.get(`/platform/lead-form-templates?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    staleTime: 15000,
  })

  const { data: wsData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100').then(r => r.data),
  })

  const forms      = data?.forms || data?.templates || []
  const total      = data?.total || 0
  const workspaces = wsData?.tenants || []

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/platform/lead-form-templates', body).then(r => r.data),
    onSuccess: () => { toast.success('Lead form created'); qc.invalidateQueries({ queryKey: ['platform-lead-forms'] }); setShowCreate(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/platform/lead-form-templates/${id}`, body).then(r => r.data),
    onSuccess: () => { toast.success('Form updated'); qc.invalidateQueries({ queryKey: ['platform-lead-forms'] }); setEditTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/platform/lead-form-templates/${id}`),
    onSuccess: () => { toast.success('Form deleted'); qc.invalidateQueries({ queryKey: ['platform-lead-forms'] }); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const duplicateMutation = useMutation({
    mutationFn: async (form) => {
      const { _id, createdAt, updatedAt, ...rest } = form
      return api.post('/platform/lead-form-templates', { ...rest, title: `${rest.title} (Copy)` }).then(r => r.data)
    },
    onSuccess: () => { toast.success('Form duplicated'); qc.invalidateQueries({ queryKey: ['platform-lead-forms'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const pushMutation = useMutation({
    mutationFn: ({ id, workspaceIds }) => api.post(`/platform/lead-form-templates/${id}/push`, { workspaceIds }).then(r => r.data),
    onSuccess: (d) => { toast.success(`Pushed to ${d.pushedTo || 'all workspaces'}`); setPushTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const columns = [
    {
      key: 'title', header: 'Form Name', sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-sm">{row.title}</p>
          {row.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{row.description}</p>}
        </div>
      ),
      exportValue: (row) => row.title,
    },
    {
      key: 'fields', header: 'Fields',
      render: (row) => <span className="text-sm text-muted-foreground">{row.fieldsCount ?? row.fields?.length ?? 0} fields</span>,
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
        title="Lead Form Templates"
        subtitle={`${total} forms — build once, push to any workspace`}
        icon={ClipboardList}
        breadcrumbs={[{ label: 'Lead Forms' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />New Form
            </Button>
          </>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={forms}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search lead forms…"
        emptyMessage="No lead form templates yet."
        filename="lead-form-templates"
        search={search}
        onSearchChange={setSearch}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <LeadFormModal open={showCreate} onClose={() => setShowCreate(false)} onSave={createMutation.mutate} loading={createMutation.isPending} />
      <LeadFormModal open={!!editTarget} initial={editTarget} onClose={() => setEditTarget(null)}
        onSave={(form) => updateMutation.mutate({ id: editTarget._id, ...form })} loading={updateMutation.isPending} />
      <PreviewModal form={previewTarget} onClose={() => setPreviewTarget(null)} />
      <PushModal form={pushTarget} workspaces={workspaces} onClose={() => setPushTarget(null)}
        loading={pushMutation.isPending} onPush={(id, ids) => pushMutation.mutate({ id, workspaceIds: ids })} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This form template will be permanently removed."
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
