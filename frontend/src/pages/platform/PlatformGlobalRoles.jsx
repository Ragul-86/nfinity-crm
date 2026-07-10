import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { UserCog, Shield, Plus, Search, Pencil, Trash2, Copy, RefreshCcw, X, ChevronDown } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

const ROLE_TYPES  = ['system','custom','workspace']
const ROLE_COLORS = ['bg-primary','bg-red-500','bg-violet-500','bg-blue-500','bg-amber-500','bg-emerald-500','bg-pink-500','bg-indigo-500']
const COMMON_PERMISSIONS = ['leads.*','tasks.*','clients.*','campaigns.*','finance.*','reports.view','reports.export','settings.view','settings.edit','users.view','users.create','users.edit','users.delete']

function RoleModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState({ name: '', description: '', roleType: 'custom', status: 'active', color: 'bg-primary', permissions: [] })
  const [permInput, setPermInput] = useState('')

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ name: initial.name || '', description: initial.description || '', roleType: initial.roleType || 'custom', status: initial.status || 'active', color: initial.color || 'bg-primary', permissions: initial.permissions || [] })
      } else {
        setForm({ name: '', description: '', roleType: 'custom', status: 'active', color: 'bg-primary', permissions: [] })
      }
      setPermInput('')
    }
  }, [open, initial?._id])

  if (!open) return null

  const addPerm = (p) => {
    const val = p || permInput.trim()
    if (!val || form.permissions.includes(val)) return
    setForm(f => ({ ...f, permissions: [...f.permissions, val] }))
    setPermInput('')
  }

  const removePerm = (p) => setForm(f => ({ ...f, permissions: f.permissions.filter(x => x !== p) }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md z-10 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">{initial ? 'Edit Role' : 'Create Custom Role'}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Role Name *</label>
            <input className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sales Manager" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea rows={2} className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none resize-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Role Type</label>
              <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none capitalize"
                value={form.roleType} onChange={e => setForm(f => ({ ...f, roleType: e.target.value }))}>
                {ROLE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none"
                value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Color</label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {ROLE_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-6 h-6 rounded-full ${c} ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground' : ''}`} />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Permissions</label>
            <div className="flex gap-2 mt-1.5">
              <input className="flex-1 px-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none"
                value={permInput} onChange={e => setPermInput(e.target.value)} placeholder="e.g. leads.create"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPerm())} />
              <Button variant="outline" size="sm" onClick={() => addPerm()}>Add</Button>
            </div>
            {/* Quick-add chips */}
            <div className="flex flex-wrap gap-1 mt-2">
              {COMMON_PERMISSIONS.filter(p => !form.permissions.includes(p)).slice(0, 8).map(p => (
                <button key={p} type="button" onClick={() => addPerm(p)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground hover:bg-accent transition-colors">
                  +{p}
                </button>
              ))}
            </div>
            {form.permissions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.permissions.map(p => (
                  <span key={p} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
                    {p}
                    <button type="button" onClick={() => removePerm(p)}><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.name.trim() || loading} onClick={() => onSave(form)}>
            {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Create Role')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformGlobalRoles() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-roles', search, statusFilter],
    queryFn: () => {
      const p = new URLSearchParams({ ...(search && { search }), ...(statusFilter !== 'all' && { status: statusFilter }) })
      return api.get(`/platform/roles?${p}`).then(r => r.data)
    },
  })

  const roles = data?.roles || []
  const customCount = roles.filter(r => !r.isSystem).length

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/platform/roles', body).then(r => r.data),
    onSuccess: () => { toast.success('Role created'); qc.invalidateQueries({ queryKey: ['platform-roles'] }); setShowCreate(false) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/platform/roles/${id}`, body).then(r => r.data),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['platform-roles'] }); setEditTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/platform/roles/${id}`),
    onSuccess: () => { toast.success('Role deleted'); qc.invalidateQueries({ queryKey: ['platform-roles'] }); setDeleteTarget(null) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id) => api.post(`/platform/roles/${id}/duplicate`).then(r => r.data),
    onSuccess: () => { toast.success('Role duplicated'); qc.invalidateQueries({ queryKey: ['platform-roles'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  return (
    <div>
      <PlatformPageHeader
        title="Global Roles"
        subtitle={`${roles.length} roles (${customCount} custom)`}
        icon={UserCog}
        breadcrumbs={[{ label: 'Global Roles' }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add Custom Role
            </Button>
          </>
        }
      />

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search roles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <UserCog className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No roles found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map(role => (
            <div key={role._id || role.key} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${role.color || 'bg-primary'}`}>
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{role.name}</p>
                      {role.isSystem && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground font-medium">System</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${role.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                        {role.status || 'active'}
                      </span>
                      {role.roleType && role.roleType !== 'system' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 capitalize">{role.roleType}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">{role.description}</p>
                  </div>
                </div>
                {/* Actions — only for custom roles */}
                {!role.isSystem && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="w-7 h-7" title="Edit" onClick={() => setEditTarget(role)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" title="Duplicate" onClick={() => duplicateMutation.mutate(role._id)} disabled={duplicateMutation.isPending}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" title="Delete" onClick={() => setDeleteTarget(role)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {(role.permissions || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {role.permissions.slice(0, 6).map(p => (
                    <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/5 border border-primary/10 text-primary font-mono">{p}</span>
                  ))}
                  {role.permissions.length > 6 && (
                    <span className="text-[10px] text-muted-foreground">+{role.permissions.length - 6} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <RoleModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={(form) => createMutation.mutate(form)}
        loading={createMutation.isPending}
      />
      <RoleModal
        open={!!editTarget}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={(form) => updateMutation.mutate({ id: editTarget._id, ...form })}
        loading={updateMutation.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This role will be permanently removed and cannot be assigned to new users."
        confirmLabel="Delete Role"
        confirmVariant="destructive"
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
