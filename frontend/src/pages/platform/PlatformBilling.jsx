import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format } from 'date-fns'
import { TrendingUp, RefreshCcw, DollarSign, Receipt, CreditCard } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import PlatformDataTable from '@/components/platform/PlatformDataTable'
import { PlatformPageHeader, PlatformStatCard, StatusBadge } from '@/components/platform/PlatformPageHeader'

export default function PlatformBilling() {
  const [tab, setTab] = useState('invoices')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })

  const { data: overview, isLoading: overviewLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-billing-overview'],
    queryFn: () => api.get('/platform/billing/overview').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['platform-invoices', page, pageSize, search, sort],
    queryFn: () => {
      const p = new URLSearchParams({ page, limit: pageSize, sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`, ...(search && { search }) })
      return api.get(`/platform/billing/invoices?${p}`).then(r => r.data)
    },
    enabled: tab === 'invoices',
    placeholderData: keepPreviousData,
  })

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['platform-payments', page, pageSize, search, sort],
    queryFn: () => {
      const p = new URLSearchParams({ page, limit: pageSize, sort: `${sort.dir === 'desc' ? '-' : ''}${sort.key}`, ...(search && { search }) })
      return api.get(`/platform/billing/payments?${p}`).then(r => r.data)
    },
    enabled: tab === 'payments',
    placeholderData: keepPreviousData,
  })

  const ov = overview || {}
  const invoices = invoicesData?.invoices || []
  const payments = paymentsData?.payments || []
  const totalInvoices = invoicesData?.total || 0
  const totalPayments = paymentsData?.total || 0

  const invoiceColumns = [
    { key: 'invoiceNumber', header: 'Invoice #', render: (row) => <span className="text-xs font-mono">{row.invoiceNumber || row._id?.slice(-6).toUpperCase()}</span> },
    { key: 'workspace', header: 'Workspace', render: (row) => <span className="text-sm">{row.tenantName || row.client?.name || '—'}</span>, exportValue: (row) => row.tenantName || '' },
    { key: 'amount', header: 'Amount', sortable: true, render: (row) => <span className="font-medium text-sm">₹{(row.amount || 0).toLocaleString('en-IN')}</span>, exportValue: (row) => row.amount || 0 },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} />, exportValue: (row) => row.status },
    { key: 'dueDate', header: 'Due Date', sortable: true, render: (row) => <span className="text-xs text-muted-foreground">{row.dueDate ? format(new Date(row.dueDate), 'MMM d, yyyy') : '—'}</span> },
    { key: 'createdAt', header: 'Created', sortable: true, render: (row) => <span className="text-xs text-muted-foreground">{row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}</span>, exportValue: (row) => row.createdAt ? format(new Date(row.createdAt), 'yyyy-MM-dd') : '' },
  ]

  const paymentColumns = [
    { key: 'reference', header: 'Reference', render: (row) => <span className="text-xs font-mono">{row.transactionId || row._id?.slice(-8).toUpperCase()}</span> },
    { key: 'workspace', header: 'Workspace', render: (row) => <span className="text-sm">{row.tenantName || row.client?.name || '—'}</span> },
    { key: 'amount', header: 'Amount', sortable: true, render: (row) => <span className="font-medium text-sm text-emerald-600">₹{(row.amount || 0).toLocaleString('en-IN')}</span>, exportValue: (row) => row.amount || 0 },
    { key: 'method', header: 'Method', render: (row) => <span className="text-xs text-muted-foreground capitalize">{row.method || row.paymentMethod || '—'}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} />, exportValue: (row) => row.status },
    { key: 'createdAt', header: 'Date', sortable: true, render: (row) => <span className="text-xs text-muted-foreground">{row.createdAt ? format(new Date(row.createdAt), 'MMM d, yyyy') : '—'}</span> },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Billing & Payments"
        subtitle="Revenue overview across all workspaces"
        icon={TrendingUp}
        breadcrumbs={[{ label: 'Billing & Payments' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <PlatformStatCard title="Total Revenue" value={`₹${((ov.totalRevenue || 0) / 100000).toFixed(1)}L`} icon={DollarSign} color="bg-emerald-500" loading={overviewLoading} />
        <PlatformStatCard title="This Month" value={`₹${((ov.monthRevenue || 0) / 1000).toFixed(0)}K`} icon={TrendingUp} color="bg-primary" loading={overviewLoading} />
        <PlatformStatCard title="Pending Invoices" value={ov.pendingInvoices || 0} icon={Receipt} color="bg-yellow-500" loading={overviewLoading} />
        <PlatformStatCard title="Paid Invoices" value={ov.paidInvoices || 0} icon={CreditCard} color="bg-blue-500" loading={overviewLoading} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/50 p-1 rounded-lg w-fit">
        {['invoices','payments'].map(t => (
          <button key={t} onClick={() => { setTab(t); setPage(1) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <PlatformDataTable
          columns={invoiceColumns}
          data={invoices}
          total={totalInvoices}
          loading={invoicesLoading}
          searchPlaceholder="Search invoices…"
          emptyMessage="No invoices found."
          filename="invoices"
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
      )}
      {tab === 'payments' && (
        <PlatformDataTable
          columns={paymentColumns}
          data={payments}
          total={totalPayments}
          loading={paymentsLoading}
          searchPlaceholder="Search payments…"
          emptyMessage="No payments found."
          filename="payments"
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
      )}
    </div>
  )
}
