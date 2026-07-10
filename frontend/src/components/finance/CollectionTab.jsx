import { useQuery } from '@tanstack/react-query'
import { TrendingUp, IndianRupee, Users } from 'lucide-react'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

const METHOD_LABELS = {
  cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer',
  cheque: 'Cheque', card: 'Card', razorpay: 'Razorpay',
  stripe: 'Stripe', paypal: 'PayPal', other: 'Other',
}

const METHOD_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-rose-500', 'bg-teal-500',
]

export default function CollectionTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['finance-collections'],
    queryFn: () => api.get('/finance/collections').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  const monthly    = data?.monthlyData  || []
  const byMethod   = data?.byMethod     || []
  const topClients = data?.topClients   || []
  const overall    = {
    totalCollected:  data?.totalCollected  || 0,
    thisMonth:       data?.thisMonth       || 0,
    avgPerMonth:     data?.avgPerMonth     || 0,
    collectionPct:   data?.collectionPct   || 0,
  }

  const maxMonthly  = Math.max(...monthly.map(m => m.collected || 0), 1)
  const totalMethod = byMethod.reduce((s, m) => s + (m.total || 0), 0)

  return (
    <div className="space-y-6">
      {/* Overall stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Collected', value: fmt(overall.totalCollected), icon: IndianRupee },
          { label: 'This Month', value: fmt(overall.thisMonth), icon: TrendingUp },
          { label: 'Avg Per Month', value: fmt(overall.avgPerMonth), icon: IndianRupee },
          { label: 'Top Method', value: byMethod[0]?._id ? METHOD_LABELS[byMethod[0]._id] || byMethod[0]._id : '—', icon: IndianRupee },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly bar chart */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">Monthly Collections</h3>
          {monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <div className="space-y-2">
              {monthly.slice(-12).map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">
                    {['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m._id?.month || m.month] || m._id?.month || m.month}
                  </span>
                  <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded transition-all"
                      style={{ width: `${((m.collected || 0) / maxMonthly) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-16 text-right">{fmt(m.collected)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By method */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">Collections by Method</h3>
          {byMethod.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <div className="space-y-3">
              {byMethod.map((m, i) => {
                const pct = totalMethod > 0 ? ((m.total / totalMethod) * 100).toFixed(1) : 0
                return (
                  <div key={m._id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{METHOD_LABELS[m._id] || m._id}</span>
                      <span className="font-medium">{fmt(m.total)} <span className="text-muted-foreground">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-muted/30 rounded overflow-hidden">
                      <div className={`h-full rounded ${METHOD_COLORS[i % METHOD_COLORS.length]}`}
                        style={{ width: `${pct}%`, opacity: 0.7 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top clients */}
      {topClients.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" />Top Clients by Collection
          </h3>
          <div className="space-y-2">
            {topClients.map((c, i) => (
              <div key={c._id} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <span className="flex-1 font-medium truncate">{c.client?.companyName || '—'}</span>
                <span className="text-muted-foreground text-xs">{c.paymentCount} payments</span>
                <span className="font-semibold text-green-400">{fmt(c.totalCollected)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
