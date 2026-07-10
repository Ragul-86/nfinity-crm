import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ScrollText, RefreshCcw } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'

const ACTION_COLORS = {
  create: 'bg-emerald-500/10 text-emerald-700',
  update: 'bg-blue-500/10 text-blue-700',
  delete: 'bg-red-500/10 text-red-700',
  login: 'bg-violet-500/10 text-violet-700',
  logout: 'bg-gray-500/10 text-gray-600',
  suspend: 'bg-yellow-500/10 text-yellow-700',
  activate: 'bg-emerald-500/10 text-emerald-700',
  impersonate: 'bg-orange-500/10 text-orange-700',
}

export default function PlatformAuditLogs() {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ action: 'all', resource: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sort, setSort] = useState({ key: 'timestamp', dir: 'desc' })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-audit-logs', page, pageSize, search, filters, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        page, limit: pageSize,
        sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search && { search }),
        ...(filters.action !== 'all' && { action: filters.action }),
        ...(filters.resource !== 'all' && { resource: filters.resource }),
      })
      return api.get(`/platform/audit-logs?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60000,
  })

  const logs = data?.logs || []
  const total = data?.total || 0

  const columns = [
    {
      key: 'timestamp', header: 'Time', sortable: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.timestamp ? format(new Date(row.timestamp), 'MMM d, HH:mm:ss') : '—'}
        </span>
      ),
      exportValue: (row) => row.timestamp ? format(new Date(row.timestamp), 'yyyy-MM-dd HH:mm:ss') : '',
    },
    {
      key: 'action', header: 'Action',
      render: (row) => {
        const color = ACTION_COLORS[row.action?.toLowerCase()] || 'bg-muted text-muted-foreground'
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${color}`}>
            {row.action}
          </span>
        )
      },
    },
    { key: 'resource', header: 'Resource', render: (row) => <span className="text-xs font-medium capitalize">{row.resource || '—'}</span> },
    { key: 'actor', header: 'Actor', render: (row) => <span className="text-xs text-muted-foreground">{row.actor?.email || row.actorEmail || '—'}</span> },
    { key: 'target', header: 'Target', render: (row) => <span className="text-xs text-muted-foreground truncate max-w-32 block">{row.target || '—'}</span> },
    { key: 'ip', header: 'IP', render: (row) => <span className="text-xs font-mono text-muted-foreground">{row.ip || '—'}</span> },
    { key: 'details', header: 'Details', render: (row) => <span className="text-xs text-muted-foreground truncate max-w-40 block">{row.details || ''}</span>, hidden: true },
  ]

  const tableFilters = [
    { key: 'action', label: 'Action', options: ['create','update','delete','login','logout','suspend','activate','impersonate'].map(a => ({ value: a, label: a.charAt(0).toUpperCase() + a.slice(1) })) },
    { key: 'resource', label: 'Resource', options: ['workspace','user','invoice','subscription','feature','plan'].map(r => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) })) },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Audit Logs"
        subtitle="Platform-level action history"
        icon={ScrollText}
        breadcrumbs={[{ label: 'Audit Logs' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <PlatformDataTable
        columns={columns}
        data={logs}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search logs…"
        emptyMessage="No audit logs found."
        filename="audit-logs"
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
