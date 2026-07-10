import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Lock, Save, RefreshCcw, Check, X, ChevronDown } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

const MODULES = [
  'Dashboard','Workspaces','Users','CRM','Leads','Customers',
  'Pipeline','Quotations','Invoices','Payments','SOP','Tasks',
  'Reports','Analytics','Templates','Integrations','Infrastructure','Settings','Activity Logs',
]

const ACTIONS = ['view','create','edit','delete','export','import','assign','approve','archive']

const ROLES = [
  { key: 'platform_super_admin', label: 'Platform Admin', color: 'text-red-600' },
  { key: 'client_super_admin',   label: 'Client Admin',   color: 'text-primary' },
  { key: 'manager',              label: 'Manager',        color: 'text-violet-600' },
  { key: 'employee',             label: 'Employee',       color: 'text-blue-600' },
]

function ActionCheckbox({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
        checked
          ? 'bg-primary border-primary text-primary-foreground'
          : 'border-border bg-background hover:bg-muted'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {checked && <Check className="w-3 h-3" />}
    </button>
  )
}

export default function PlatformPermissions() {
  const [selectedRole, setSelectedRole] = useState('client_super_admin')
  const [matrix, setMatrix] = useState({})  // { Module: Set(['view','edit',...]) }
  const [isDirty, setIsDirty] = useState(false)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-permissions', selectedRole],
    queryFn: () => api.get(`/platform/permissions?roleKey=${selectedRole}`).then(r => r.data),
  })

  useEffect(() => {
    if (data?.matrix) {
      const parsed = {}
      MODULES.forEach(mod => {
        parsed[mod] = new Set(data.matrix[mod] || [])
      })
      setMatrix(parsed)
      setIsDirty(false)
    }
  }, [data])

  useEffect(() => { setIsDirty(false) }, [selectedRole])

  const toggle = (module, action) => {
    setMatrix(prev => {
      const copy = { ...prev }
      const s = new Set(copy[module] || [])
      if (s.has(action)) s.delete(action)
      else s.add(action)
      copy[module] = s
      return copy
    })
    setIsDirty(true)
  }

  const toggleAllActions = (module) => {
    const current = matrix[module] || new Set()
    const allSelected = ACTIONS.every(a => current.has(a))
    setMatrix(prev => {
      const copy = { ...prev }
      copy[module] = allSelected ? new Set() : new Set(ACTIONS)
      return copy
    })
    setIsDirty(true)
  }

  const toggleAllModules = (action) => {
    const allSelected = MODULES.every(m => (matrix[m] || new Set()).has(action))
    setMatrix(prev => {
      const copy = { ...prev }
      MODULES.forEach(m => {
        const s = new Set(copy[m] || [])
        if (allSelected) s.delete(action)
        else s.add(action)
        copy[m] = s
      })
      return copy
    })
    setIsDirty(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const matrixObj = {}
      MODULES.forEach(m => { matrixObj[m] = [...(matrix[m] || [])] })
      return api.put('/platform/permissions', { roleKey: selectedRole, matrix: matrixObj })
    },
    onSuccess: () => { toast.success('Permissions saved'); setIsDirty(false); refetch() },
    onError: err => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const checkedCount = MODULES.reduce((sum, m) => sum + (matrix[m]?.size || 0), 0)
  const isPlatformAdmin = selectedRole === 'platform_super_admin'

  return (
    <div>
      <PlatformPageHeader
        title="Permission Matrix"
        subtitle={`${checkedCount} permissions enabled${isDirty ? ' · Unsaved changes' : ''}`}
        icon={Lock}
        breadcrumbs={[{ label: 'Permissions' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending || isPlatformAdmin}>
              <Save className={`w-3.5 h-3.5 mr-1.5 ${saveMutation.isPending ? 'animate-pulse' : ''}`} />
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      {/* Role selector */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setSelectedRole(r.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              selectedRole === r.key
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isPlatformAdmin && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-700 text-xs">
          Platform Super Admin has all permissions by default. This matrix cannot be edited.
        </div>
      )}

      {isDirty && !isPlatformAdmin && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-700 text-xs flex items-center gap-2">
          <Save className="w-3.5 h-3.5 shrink-0" />
          Unsaved changes — click <strong className="mx-1">Save Changes</strong> to persist.
        </div>
      )}

      {isLoading ? (
        <div className="h-96 bg-muted rounded-xl animate-pulse" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground w-36 sticky left-0 bg-muted/30 z-10">Module</th>
                <th className="px-2 py-3 text-center text-xs font-semibold text-muted-foreground w-10">All</th>
                {ACTIONS.map(a => (
                  <th key={a} className="px-2 py-3 text-center w-14">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-muted-foreground capitalize">{a}</span>
                      {!isPlatformAdmin && (
                        <ActionCheckbox
                          checked={MODULES.every(m => (matrix[m] || new Set()).has(a))}
                          onChange={() => toggleAllModules(a)}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, i) => {
                const modPerms = matrix[mod] || new Set()
                const allChecked = ACTIONS.every(a => modPerms.has(a))
                const someChecked = ACTIONS.some(a => modPerms.has(a))
                return (
                  <tr key={mod} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'} hover:bg-accent/30 transition-colors`}>
                    <td className="px-4 py-2.5 text-sm font-medium sticky left-0 bg-inherit z-10">{mod}</td>
                    <td className="px-2 py-2.5 text-center">
                      {isPlatformAdmin ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10">
                          <Check className="w-3 h-3 text-primary" />
                        </span>
                      ) : (
                        <ActionCheckbox
                          checked={allChecked}
                          onChange={() => toggleAllActions(mod)}
                        />
                      )}
                    </td>
                    {ACTIONS.map(action => (
                      <td key={action} className="px-2 py-2.5 text-center">
                        {isPlatformAdmin ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10">
                            <Check className="w-3 h-3 text-primary" />
                          </span>
                        ) : (
                          <ActionCheckbox
                            checked={modPerms.has(action)}
                            onChange={() => toggle(mod, action)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-primary border border-primary inline-flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </span>
          Allowed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded bg-background border border-border inline-flex items-center justify-center" />
          Denied
        </span>
        <span className="ml-4 text-muted-foreground/70">Row "All" toggles all actions for that module. Column header toggles that action for all modules.</span>
      </div>
    </div>
  )
}
