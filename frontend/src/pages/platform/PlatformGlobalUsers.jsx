import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Users, RefreshCcw, ShieldOff, ShieldCheck, Key } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, StatusBadge, ConfirmDialog } from '@/components/platform/PlatformPageHeader'

export default function PlatformGlobalUsers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ role: 'all', status: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })
  const [confirm, setConfirm] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['platform-users', page, pageSize, search, filters, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        page, limit: pageSize,
        sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search && { search }),
        ...(filters.role !== 'all' && { role: filters.role }),
        ...(filters.status !== 'all' && { status: filters.status }),
      })
      return api.get(`/platform/users?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })

  const users = data?.users || []
  const total = data?.total || 0

  const suspendMutation = useMutation({
    mutationFn: (id) => api.patch(`/platform/users/${id}/suspend`),
    onSuccess: () => { toast.success('User suspended'); qc.invalidateQueries({ queryKey: ['platform-users'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const activateMutation = useMutation({
    mutationFn: (id) => api.patch(`/platform/users/${id}/activate`),
    onSuccess: () => { toast.success('User activated'); qc.invalidateQueries({ queryKey: ['platform-users'] }) },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const resetMutation = useMutation({
    mutationFn: (id) => api.patch(`/platform/users/${id}/reset-password`).then(r => r.data),
    onSuccess: (d) => {
      toast.success(`Temp password: ${d.tempPassword || 'sent via email'}`)
      setResetTarget(null)
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  const columns = [
    {
      key: 'name', header: 'User', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {row.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
      exportValue: (row) => row.name,
    },
    {
      key: 'workspace', header: 'Workspace',
      render: (row) => <span className="text-xs text-muted-foreground">{row.tenant?.name || 'Platform Admin'}</span>,
      exportValue: (row) => row.tenant?.name || '',
    },
    {
      key: 'role', header: 'Role',
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted border border-border capitalize">
          {row.role?.replace(/_/g, ' ')}
        </span>
      ),
      exportValue: (row) => row.role,
    },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <StatusBadge status={row.isActive === false ? 'inactive' : 'active'} />, exportValue: (row) => row.isActive ? 'active' : 'inactive' },
    {
      key: 'createdAt', header: 'Joined', sortable: true,
      render: (row) => <span className="text-xs text-muted-foreground">{row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}</span>,
      exportValue: (row) => row.createdAt ? format(new Date(row.createdAt), 'yyyy-MM-dd') : '',
    },
    {
      key: 'actions', header: '', exportable: false,
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.isActive !== false ? (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-yellow-600" title="Suspend" onClick={() => setConfirm({ type: 'suspend', user: row })}>
              <ShieldOff className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-emerald-600" title="Activate" onClick={() => activateMutation.mutate(row._id)}>
              <ShieldCheck className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="w-7 h-7" title="Reset Password" onClick={() => setResetTarget(row)}>
            <Key className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const tableFilters = [
    { key: 'role', label: 'Role', options: [{ value: 'client_super_admin', label: 'Client Admin' }, { value: 'manager', label: 'Manager' }, { value: 'employee', label: 'Employee' }, { value: 'platform_super_admin', label: 'Platform Admin' }] },
    { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Global Users"
        subtitle={`${total.toLocaleString()} users across all workspaces`}
        icon={Users}
        breadcrumbs={[{ label: 'Global Users' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['platform-users'] })} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={users}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search users…"
        emptyMessage="No users found."
        filename="global-users"
        filters={tableFilters}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
        search={search}
        onSearchChange={setSearch}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onSort={(k, d) => setSort({ key: k, dir: d })}
        sortKey={sort.key}
        sortDir={sort.dir}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Suspend ${confirm?.user?.name}?`}
        description="This user will lose access to their workspace."
        confirmLabel="Suspend"
        confirmVariant="default"
        onConfirm={() => { suspendMutation.mutate(confirm.user._id); setConfirm(null) }}
        loading={suspendMutation.isPending}
      />
      <ConfirmDialog
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Reset password for ${resetTarget?.name}?`}
        description="A temporary password will be generated and shown once."
        confirmLabel="Reset Password"
        confirmVariant="default"
        onConfirm={() => resetMutation.mutate(resetTarget._id)}
        loading={resetMutation.isPending}
      />
    </div>
  )
}
