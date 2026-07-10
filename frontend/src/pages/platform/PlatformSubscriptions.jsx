import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CreditCard, RefreshCcw } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, StatusBadge, PlanBadge } from '@/components/platform/PlatformPageHeader'

export default function PlatformSubscriptions() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ plan: 'all', status: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-subscriptions', page, pageSize, search, filters, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        page, limit: pageSize,
        sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search && { search }),
        ...(filters.plan !== 'all' && { plan: filters.plan }),
        ...(filters.status !== 'all' && { status: filters.status }),
      })
      return api.get(`/platform/subscriptions?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })

  const subscriptions = data?.subscriptions || []
  const total = data?.total || 0

  const columns = [
    {
      key: 'workspace', header: 'Workspace', sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-sm">{row.tenantName || row.workspace?.name || '—'}</p>
          <p className="text-xs text-muted-foreground">{row.ownerEmail || ''}</p>
        </div>
      ),
      exportValue: (row) => row.tenantName || '',
    },
    { key: 'plan', header: 'Plan', sortable: true, render: (row) => <PlanBadge plan={row.plan} />, exportValue: (row) => row.plan },
    {
      key: 'amount', header: 'Amount',
      render: (row) => (
        <span className="font-medium text-sm">
          {row.currency || 'INR'} {row.amount?.toLocaleString('en-IN') || '0'}
        </span>
      ),
      exportValue: (row) => row.amount || 0,
    },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status || 'active'} />, exportValue: (row) => row.status },
    {
      key: 'startDate', header: 'Start Date', sortable: true,
      render: (row) => <span className="text-xs text-muted-foreground">{row.startDate ? format(new Date(row.startDate), 'MMM d, yyyy') : '—'}</span>,
      exportValue: (row) => row.startDate ? format(new Date(row.startDate), 'yyyy-MM-dd') : '',
    },
    {
      key: 'expiryDate', header: 'Expiry', sortable: true,
      render: (row) => {
        if (!row.expiryDate) return <span className="text-xs text-muted-foreground">—</span>
        const expired = new Date(row.expiryDate) < new Date()
        return (
          <span className={`text-xs ${expired ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {format(new Date(row.expiryDate), 'MMM d, yyyy')}
          </span>
        )
      },
      exportValue: (row) => row.expiryDate ? format(new Date(row.expiryDate), 'yyyy-MM-dd') : '',
    },
    {
      key: 'renewal', header: 'Renewal',
      render: (row) => (
        <span className="text-xs text-muted-foreground capitalize">{row.billingCycle || row.renewal || '—'}</span>
      ),
    },
  ]

  const tableFilters = [
    { key: 'plan', label: 'Plan', options: [{ value: 'trial', label: 'Trial' }, { value: 'starter', label: 'Starter' }, { value: 'professional', label: 'Professional' }, { value: 'enterprise', label: 'Enterprise' }] },
    { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'expired', label: 'Expired' }] },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Subscriptions"
        subtitle={`${total.toLocaleString()} subscriptions`}
        icon={CreditCard}
        breadcrumbs={[{ label: 'Subscriptions' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={subscriptions}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search subscriptions…"
        emptyMessage="No subscriptions found."
        filename="subscriptions"
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
    </div>
  )
}
