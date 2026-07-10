import { useQuery } from '@tanstack/react-query'
import { TrendingUp, CreditCard, AlertCircle, CheckCircle, Clock, IndianRupee, Calendar, Timer } from 'lucide-react'
import { format } from 'date-fns'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function KPI({ label, value, sub, icon: Icon, color = '', bg = 'bg-card' }) {
  return (
    <div className={`${bg} border border-border rounded-xl p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
    </div>
  )
}

const STATUS_COLOR = {
  paid:     'bg-green-500/10 text-green-400',
  partial:  'bg-amber-500/10 text-amber-400',
  overdue:  'bg-red-500/10 text-red-400',
  sent:     'bg-blue-500/10 text-blue-400',
  viewed:   'bg-cyan-500/10 text-cyan-400',
  draft:    'bg-muted text-muted-foreground',
  cancelled:'bg-muted text-muted-foreground',
}

export default function FinanceDashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['finance-dashboard'],
    queryFn: () => api.get('/finance/dashboard').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading dashboard…</div>

  const k = data?.kpis || {}

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KPI label="Total Revenue"       value={fmt(k.totalRevenue)}      icon={TrendingUp}  color="text-green-400" />
        <KPI label="Total Collected"     value={fmt(k.totalPaid)}         icon={CheckCircle} color="text-green-400" />
        <KPI label="Outstanding"         value={fmt(k.totalOutstanding)}  icon={Clock}       color={k.totalOutstanding > 0 ? 'text-amber-400' : ''} />
        <KPI label="Overdue Amount"      value={k.overdueCount}           icon={AlertCircle} color={k.overdueCount > 0 ? 'text-red-400' : ''} sub="overdue invoices" />
        <KPI label="Today's Collection"  value={fmt(k.todayCollection)}   icon={Calendar}    />
        <KPI label="Monthly Collection"  value={fmt(k.monthlyCollection)} icon={IndianRupee} />
        <KPI label="Collection %"        value={`${k.collectionPct || 0}%`} icon={CreditCard} color={k.collectionPct >= 80 ? 'text-green-400' : 'text-amber-400'} />
        <KPI label="Avg Collection Time" value={`${k.avgCollectionDays || 0}d`} icon={Timer} sub="days to get paid" />
      </div>

      {/* Invoice status summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{k.paidCount || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Paid Invoices</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{k.pendingCount || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending Invoices</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{k.overdueCount || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Overdue Invoices</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Invoices */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Invoices</h3>
          {data?.recentInvoices?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No invoices yet</p>}
          <div className="space-y-2">
            {(data?.recentInvoices || []).map(inv => (
              <div key={inv._id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{inv.client?.companyName || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{fmt(inv.total)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[inv.status] || 'bg-muted text-muted-foreground'}`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recent Payments</h3>
          {data?.recentPayments?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No payments yet</p>}
          <div className="space-y-2">
            {(data?.recentPayments || []).map(pay => (
              <div key={pay._id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{fmt(pay.amount)}</p>
                  <p className="text-xs text-muted-foreground">{pay.client?.companyName || '—'} · {pay.invoice?.invoiceNumber || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground capitalize">{pay.paymentMethod?.replace('_', ' ')}</p>
                  {pay.paymentDate && <p className="text-xs text-muted-foreground">{format(new Date(pay.paymentDate), 'MMM d')}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quotation stats */}
      {data?.quotationStats && Object.keys(data.quotationStats).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Quotation Pipeline</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(data.quotationStats).map(([status, s]) => (
              <div key={status} className="flex-1 min-w-[100px] text-center bg-muted/20 rounded-lg p-3">
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-xs text-muted-foreground capitalize">{status}</p>
                <p className="text-xs text-primary">{fmt(s.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
