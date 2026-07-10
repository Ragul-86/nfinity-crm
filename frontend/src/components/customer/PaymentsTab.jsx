import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CreditCard, CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react'
import api from '@/services/api'

const STATUS_CONFIG = {
  paid:      { label: 'Paid',     icon: CheckCircle,  color: 'text-green-400',  bg: 'bg-green-500/10' },
  partial:   { label: 'Partial',  icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  pending:   { label: 'Pending',  icon: Clock,        color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  overdue:   { label: 'Overdue',  icon: AlertCircle,  color: 'text-red-400',    bg: 'bg-red-500/10' },
  cancelled: { label: 'Cancelled',icon: XCircle,      color: 'text-muted-foreground', bg: 'bg-muted/20' },
}

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString()}`
}

export default function PaymentsTab({ clientId }) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['customer-invoices', clientId],
    queryFn: () => api.get(`/customers/${clientId}/invoices`).then(r => r.data.data),
  })

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  // Derive payment summary from invoices
  const summary = invoices.reduce((acc, inv) => {
    acc.total += inv.total || 0
    acc.paid += inv.paidAmount || 0
    acc.outstanding += inv.outstanding || 0
    if (inv.status === 'overdue') acc.overdue++
    return acc
  }, { total: 0, paid: 0, outstanding: 0, overdue: 0 })

  // Sort invoices by date desc
  const sorted = [...invoices].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  if (!sorted.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No payment history yet</p>
        <p className="text-xs mt-1">Payment records will appear here once invoices are created</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Billed',   value: fmt(summary.total), color: '' },
          { label: 'Total Paid',     value: fmt(summary.paid),  color: 'text-green-400' },
          { label: 'Outstanding',    value: fmt(summary.outstanding), color: summary.outstanding > 0 ? 'text-amber-400' : '' },
          { label: 'Overdue',        value: summary.overdue,    color: summary.overdue > 0 ? 'text-red-400' : '' },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Invoice payment rows */}
      <div className="space-y-2">
        {sorted.map(inv => {
          const s = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending
          const StatusIcon = s.icon
          return (
            <div key={inv._id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${s.bg}`}>
                <StatusIcon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{inv.invoiceNumber}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${s.bg} ${s.color}`}>{s.label}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span>Total: <strong className="text-foreground">{fmt(inv.total)}</strong></span>
                  {inv.paidAmount > 0 && <span className="text-green-400">Paid: {fmt(inv.paidAmount)}</span>}
                  {inv.outstanding > 0 && <span className="text-amber-400">Due: {fmt(inv.outstanding)}</span>}
                  {inv.dueDate && <span>Due: {format(new Date(inv.dueDate), 'MMM d, yyyy')}</span>}
                  {inv.paidDate && <span>Paid: {format(new Date(inv.paidDate), 'MMM d, yyyy')}</span>}
                  {inv.paymentMethod && <span className="capitalize">{inv.paymentMethod.replace('_', ' ')}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{format(new Date(inv.createdAt), 'MMM d, yyyy')}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
