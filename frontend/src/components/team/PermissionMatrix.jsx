import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, RotateCcw, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'

const MODULES = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'leads',      label: 'Leads' },
  { key: 'pipeline',   label: 'Pipeline' },
  { key: 'customers',  label: 'Customers' },
  { key: 'campaigns',  label: 'Campaigns' },
  { key: 'sop',        label: 'SOP' },
  { key: 'tasks',      label: 'Tasks' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'reports',    label: 'Reports' },
  { key: 'analytics',  label: 'Analytics' },
  { key: 'settings',   label: 'Settings' },
  { key: 'team',       label: 'Team Mgmt' },
]

const ACTIONS = [
  { key: 'view',    label: 'View' },
  { key: 'create',  label: 'Create' },
  { key: 'edit',    label: 'Edit' },
  { key: 'delete',  label: 'Delete' },
  { key: 'export',  label: 'Export' },
  { key: 'assign',  label: 'Assign' },
  { key: 'approve', label: 'Approve' },
]

const EDITABLE_ROLES = [
  { value: 'admin',    label: 'Admin' },
  { value: 'manager',  label: 'Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'viewer',   label: 'Viewer' },
]

function PermCell({ checked, onChange, disabled }) {
  return (
    <td className="px-2 py-2 text-center">
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'w-5 h-5 rounded border transition-colors mx-auto block',
          checked
            ? 'bg-primary border-primary'
            : 'bg-background border-border hover:border-primary/50',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
      >
        {checked && (
          <svg viewBox="0 0 10 10" className="w-full h-full p-0.5 text-primary-foreground" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </td>
  )
}

export default function PermissionMatrix() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const isSuperAdmin = ['super_admin', 'client_super_admin'].includes(me?.role)
  const [activeRole, setActiveRole] = useState('admin')
  const [localPerms, setLocalPerms] = useState(null)
  const [isDirty, setIsDirty] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['permissions-all'],
    queryFn: () => api.get('/permissions').then(r => r.data),
  })

  // Sync local state when data loads or role switches
  useEffect(() => {
    if (data?.data?.[activeRole]) {
      setLocalPerms(JSON.parse(JSON.stringify(data.data[activeRole])))
      setIsDirty(false)
    }
  }, [data, activeRole])

  const saveMutation = useMutation({
    mutationFn: ({ role, modules }) => api.put(`/permissions/${role}`, { modules }).then(r => r.data),
    onSuccess: () => {
      toast.success('Permissions saved')
      qc.invalidateQueries(['permissions-all'])
      setIsDirty(false)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const resetMutation = useMutation({
    mutationFn: (role) => api.post(`/permissions/reset/${role}`).then(r => r.data),
    onSuccess: () => {
      toast.success('Permissions reset to defaults')
      qc.invalidateQueries(['permissions-all'])
      setIsDirty(false)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Reset failed'),
  })

  const toggle = (mod, action) => {
    if (!isSuperAdmin) return
    setLocalPerms(prev => ({
      ...prev,
      [mod]: { ...prev[mod], [action]: !prev[mod]?.[action] },
    }))
    setIsDirty(true)
  }

  const save = () => saveMutation.mutate({ role: activeRole, modules: localPerms })
  const reset = () => resetMutation.mutate(activeRole)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Permission Matrix</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isSuperAdmin ? 'Customize module access per role.' : 'View your team\'s access permissions.'}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={reset}
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset Defaults
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!isDirty || saveMutation.isPending}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit flex-wrap">
        {EDITABLE_ROLES.map(r => (
          <button
            key={r.value}
            type="button"
            onClick={() => { setActiveRole(r.value); setIsDirty(false) }}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
              activeRole === r.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          You have unsaved changes. Click "Save Changes" to apply.
        </div>
      )}

      {/* Matrix table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading || !localPerms ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Module</th>
                  {ACTIONS.map(a => (
                    <th key={a.key} className="px-2 py-2.5 font-medium text-muted-foreground text-center whitespace-nowrap">
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MODULES.map(mod => (
                  <tr key={mod.key} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{mod.label}</td>
                    {ACTIONS.map(action => (
                      <PermCell
                        key={action.key}
                        checked={!!localPerms?.[mod.key]?.[action.key]}
                        onChange={() => toggle(mod.key, action.key)}
                        disabled={!isSuperAdmin}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        * Platform Super Admin always has full access and cannot be modified here.
        Changes apply to all users of this role in your workspace.
      </p>
    </div>
  )
}
