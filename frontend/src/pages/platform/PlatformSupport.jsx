import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { HelpCircle, RefreshCcw, MessageSquare, Plus, X } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, StatusBadge, PlatformStatCard } from '@/components/platform/PlatformPageHeader'

const PRIORITY_COLORS = {
  low: 'bg-gray-500/10 text-gray-600',
  medium: 'bg-blue-500/10 text-blue-600',
  high: 'bg-yellow-500/10 text-yellow-700',
  critical: 'bg-red-500/10 text-red-600',
}

function TicketModal({ open, onClose, ticket }) {
  const qc = useQueryClient()
  const [reply, setReply] = useState('')

  const updateMutation = useMutation({
    mutationFn: ({ id, status, reply: r }) => api.patch(`/platform/support/${id}`, { status, reply: r }).then(d => d.data),
    onSuccess: () => {
      toast.success('Ticket updated')
      qc.invalidateQueries({ queryKey: ['platform-support'] })
      setReply('')
      onClose()
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed'),
  })

  if (!open || !ticket) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg z-10 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="font-semibold text-sm">{ticket.subject || 'Support Ticket'}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">From:</span> <span className="font-medium">{ticket.createdBy?.name || '—'}</span></div>
            <div><span className="text-muted-foreground">Workspace:</span> <span className="font-medium">{ticket.tenantName || '—'}</span></div>
            <div><span className="text-muted-foreground">Priority:</span> <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${PRIORITY_COLORS[ticket.priority] || 'bg-muted'}`}>{ticket.priority}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={ticket.status} /></div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-sm">{ticket.description || ticket.message || 'No description provided.'}</div>
          {ticket.replies?.map((r, i) => (
            <div key={i} className={`p-3 rounded-lg text-xs ${r.isAdmin ? 'bg-primary/5 border border-primary/10 ml-6' : 'bg-muted/50 mr-6'}`}>
              <p className="font-medium mb-1 text-muted-foreground">{r.isAdmin ? 'Platform Admin' : r.name}</p>
              <p>{r.message}</p>
            </div>
          ))}
          <div className="pt-2">
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Type a reply…"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => updateMutation.mutate({ id: ticket._id, status: 'resolved' })}>Resolve</Button>
            <Button variant="outline" size="sm" onClick={() => updateMutation.mutate({ id: ticket._id, status: 'closed' })}>Close</Button>
          </div>
          <Button size="sm" disabled={!reply.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate({ id: ticket._id, reply })}>
            {updateMutation.isPending ? 'Sending…' : 'Send Reply'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PlatformSupport() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: 'all', priority: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })
  const [viewTicket, setViewTicket] = useState(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-support', page, pageSize, search, filters, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        page, limit: pageSize,
        sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`,
        ...(search && { search }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.priority !== 'all' && { priority: filters.priority }),
      })
      return api.get(`/platform/support?${p}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  })

  const tickets = data?.tickets || []
  const total = data?.total || 0
  const stats = data?.stats || {}

  const columns = [
    {
      key: 'subject', header: 'Subject', sortable: true,
      render: (row) => (
        <button className="text-sm font-medium text-left hover:text-primary transition-colors" onClick={() => setViewTicket(row)}>
          {row.subject || 'Untitled'}
        </button>
      ),
      exportValue: (row) => row.subject || '',
    },
    { key: 'tenantName', header: 'Workspace', render: (row) => <span className="text-xs text-muted-foreground">{row.tenantName || '—'}</span> },
    {
      key: 'priority', header: 'Priority',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${PRIORITY_COLORS[row.priority] || 'bg-muted text-muted-foreground'}`}>
          {row.priority || '—'}
        </span>
      ),
    },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <StatusBadge status={row.status} />, exportValue: (row) => row.status },
    {
      key: 'createdAt', header: 'Created', sortable: true,
      render: (row) => <span className="text-xs text-muted-foreground">{row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}</span>,
    },
    {
      key: 'actions', header: '', exportable: false,
      render: (row) => (
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setViewTicket(row)}>
          <MessageSquare className="w-3.5 h-3.5 mr-1" />View
        </Button>
      ),
    },
  ]

  const tableFilters = [
    { key: 'status', label: 'Status', options: [{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }] },
    { key: 'priority', label: 'Priority', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }] },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Support Center"
        subtitle={`${total} support tickets`}
        icon={HelpCircle}
        breadcrumbs={[{ label: 'Support Center' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <PlatformStatCard title="Open" value={stats.open || 0} icon={HelpCircle} color="bg-blue-500" />
        <PlatformStatCard title="In Progress" value={stats.in_progress || 0} icon={MessageSquare} color="bg-yellow-500" />
        <PlatformStatCard title="Resolved" value={stats.resolved || 0} icon={HelpCircle} color="bg-emerald-500" />
        <PlatformStatCard title="Closed" value={stats.closed || 0} icon={HelpCircle} color="bg-gray-500" />
      </div>

      <PlatformDataTable
        columns={columns}
        data={tickets}
        total={total}
        loading={isLoading}
        searchPlaceholder="Search tickets…"
        emptyMessage="No support tickets found."
        filename="support-tickets"
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

      <TicketModal open={!!viewTicket} ticket={viewTicket} onClose={() => setViewTicket(null)} />
    </div>
  )
}
