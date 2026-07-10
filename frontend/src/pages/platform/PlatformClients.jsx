import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Globe, RefreshCcw } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, StatusBadge } from '@/components/platform/PlatformPageHeader'

export default function PlatformClients() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-clients', page, pageSize, search, filters, sort],
    queryFn: () => {
      // Fetch clients across all workspaces via platform admin API
      const p = new URLSearchParams({
        page, limit: pageSize,
        sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search && { search }),
        ...(filters.status !== 'all' && { status: filters.status }),
        scope: 'global', // platform-wide
      })
      return api.get(`/platform/clients?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })

  const clients = data?.clients || []
  const total = data?.total || 0

  const columns = [
    {
      key: 'name', header: 'Client', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {(row.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.email || ''}</p>
          </div>
        </div>
      ),
      exportValue: (row) => row.name,
    },
    { key: 'phone', header: 'Phone', render: (row) => <span className="text-xs text-muted-foreground">{row.phone || '—'}</span> },
    { key: 'company', header: 'Company', render: (row) => <span className="text-sm">{row.company || '—'}</span>, exportValue: (row) => row.company || '' },
    { key: 'workspace', header: 'Workspace', render: (row) => <span className="text-xs text-muted-foreground">{row.tenantName || '—'}</span> },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status || 'active'} />, exportValue: (row) => row.status },
    {
      key: 'totalBilled', header: 'Total Billed',
      render: (row) => (
        <span className="text-sm font-medium">
          {row.totalBilled ? `₹${row.totalBilled.toLocaleString('en-IN')}` : '—'}
        </span>
      ),
      exportValue: (row) => row.totalBilled || 0,
    },
    {
      key: 'createdAt', header: 'Added', sortable: true,
      render: (row) => <span className="text-xs text-muted-foreground">{row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}</span>,
      exportValue: (row) => row.createdAt ? format(new Date(row.createdAt), 'yyyy-MM-dd') : '',
    },
  ]

  const tableFilters = [
    { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Client Management"
        subtitle={`${total.toLocaleString()} clients across all workspaces`}
        icon={Globe}
        breadcrumbs={[{ label: 'Client Management' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={clients}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search clients…"
        emptyMessage="No clients found."
        filename="platform-clients"
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
