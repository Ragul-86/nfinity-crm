import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CreditCard, Search } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const METHOD_LABELS = {
  cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer',
  cheque: 'Cheque', card: 'Card', razorpay: 'Razorpay',
  stripe: 'Stripe', paypal: 'PayPal', other: 'Other',
}

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function GlobalPaymentsTab() {
  const [page, setPage]         = useState(1)
  const [method, setMethod]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['finance-payments', page, method, dateFrom, dateTo],
    queryFn: () => api.get('/finance/payments', { params: { page, limit: 20, paymentMethod: method, dateFrom, dateTo } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30_000,
  })

  const payments = data?.data || []
  const total    = data?.total || 0
  const pages    = Math.ceil(total / 20)

  const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={method} onChange={e => { setMethod(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All Methods</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" placeholder="From" />
        <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="w-40" placeholder="To" />
        <Button size="sm" variant="outline" onClick={() => window.open(`/api/finance/export?type=payment`, '_blank')}>
          Export CSV
        </Button>
      </div>

      {/* Summary pill */}
      {payments.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="bg-card border border-border rounded-xl px-4 py-2 text-sm">
            Showing: <strong>{fmt(totalAmount)}</strong> across {payments.length} payments
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No payments recorded yet</p>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Payment #</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Invoice</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Date</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Method</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Reference</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Collected By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map(pay => (
                  <tr key={pay._id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-3 font-medium text-primary">{pay.paymentNumber}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium truncate max-w-[140px]">{pay.client?.companyName || '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{pay.invoice?.invoiceNumber || '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">
                      {pay.paymentDate ? format(new Date(pay.paymentDate), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-green-400">{fmt(pay.amount)}</td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                        {METHOD_LABELS[pay.paymentMethod] || pay.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs hidden lg:table-cell">{pay.referenceNumber || '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground text-xs hidden lg:table-cell">{pay.collectedBy?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} total payments</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
