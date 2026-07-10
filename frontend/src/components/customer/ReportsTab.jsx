import { useQuery } from '@tanstack/react-query'
import { BarChart2, TrendingUp, CheckSquare2, BookOpen, CreditCard } from 'lucide-react'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString()}`
}

function StatBlock({ label, value, sub, color = '' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function MiniBar({ label, value, max, color = 'bg-primary' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className="font-medium ml-2 shrink-0">{value}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function ReportsTab({ clientId, stats }) {
  const { data: reports, isLoading } = useQuery({
    queryKey: ['customer-reports', clientId],
    queryFn: () => api.get(`/customers/${clientId}/reports`).then(r => r.data.data),
    refetchInterval: 60_000,
  })

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading reports…</div>

  const inv = reports?.invoices || {}
  const tasks = reports?.tasks || {}
  const sop = reports?.sop || {}
  const revenue = reports?.revenue || {}
  const monthly = reports?.monthlyRevenue || []

  const maxMonthly = monthly.length > 0 ? Math.max(...monthly.map(m => m.amount)) : 1

  return (
    <div className="space-y-4">
      {/* Revenue summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatBlock label="Total Revenue"     value={fmt(inv.totalRevenue)}     color="text-green-400" />
        <StatBlock label="Total Paid"        value={fmt(inv.totalPaid)}         color="text-green-400" />
        <StatBlock label="Outstanding"       value={fmt(inv.totalOutstanding)}  color={inv.totalOutstanding > 0 ? 'text-amber-400' : ''} />
        <StatBlock label="Overdue Invoices"  value={inv.overdue || 0}           color={inv.overdue > 0 ? 'text-red-400' : ''} sub={`${inv.total || 0} total`} />
      </div>

      {/* Invoice status breakdown */}
      <Section title="Invoice Status" icon={CreditCard}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ['Draft',     inv.byStatus?.draft || 0,     'bg-muted' ],
            ['Sent',      inv.byStatus?.sent || 0,      'bg-blue-400' ],
            ['Paid',      inv.byStatus?.paid || 0,      'bg-green-400' ],
            ['Partial',   inv.byStatus?.partial || 0,   'bg-amber-400' ],
            ['Overdue',   inv.byStatus?.overdue || 0,   'bg-red-400' ],
            ['Cancelled', inv.byStatus?.cancelled || 0, 'bg-slate-400' ],
          ].map(([label, count, color]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
              <span className="text-muted-foreground">{label}</span>
              <span className="ml-auto font-medium">{count}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Monthly revenue trend */}
      {monthly.length > 0 && (
        <Section title="Monthly Revenue" icon={TrendingUp}>
          <div className="space-y-2">
            {monthly.map((m, i) => (
              <MiniBar key={i} label={`${m.month}/${m.year}`} value={m.amount} max={maxMonthly}
                color="bg-green-400" />
            ))}
          </div>
        </Section>
      )}

      {/* Tasks report */}
      <Section title="Tasks Summary" icon={CheckSquare2}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Total',       tasks.total || 0,       '' ],
            ['Pending',     tasks.pending || 0,     'text-blue-400' ],
            ['Completed',   tasks.completed || 0,   'text-green-400' ],
            ['Overdue',     tasks.overdue || 0,     'text-red-400' ],
          ].map(([label, val, color]) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {(tasks.total || 0) > 0 && (
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden flex">
            <div className="bg-green-400 h-full" style={{ width: `${((tasks.completed || 0) / tasks.total) * 100}%` }} />
            <div className="bg-blue-400 h-full" style={{ width: `${((tasks.pending || 0) / tasks.total) * 100}%` }} />
            <div className="bg-red-400 h-full" style={{ width: `${((tasks.overdue || 0) / tasks.total) * 100}%` }} />
          </div>
        )}
      </Section>

      {/* SOP report */}
      <Section title="SOP Progress" icon={BookOpen}>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            ['Total',     sop.total || 0,       ''],
            ['Completed', sop.completed || 0,   'text-green-400'],
            ['Avg',       `${Math.round(sop.avgProgress || 0)}%`, 'text-blue-400'],
          ].map(([label, val, color]) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {sop.byStatus && (
          <div className="space-y-2">
            {Object.entries(sop.byStatus).map(([status, count]) => (
              <MiniBar key={status} label={status.replace('_', ' ')} value={count} max={sop.total || 1} />
            ))}
          </div>
        )}
      </Section>

      {/* Payment method breakdown */}
      {inv.byPaymentMethod && Object.keys(inv.byPaymentMethod).length > 0 && (
        <Section title="Payment Methods" icon={BarChart2}>
          <div className="space-y-2">
            {Object.entries(inv.byPaymentMethod).map(([method, count]) => (
              <MiniBar key={method} label={method.replace('_', ' ').toUpperCase()} value={count}
                max={Math.max(...Object.values(inv.byPaymentMethod))} color="bg-purple-400" />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
