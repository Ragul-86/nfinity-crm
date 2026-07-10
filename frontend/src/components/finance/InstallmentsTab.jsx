import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isPast } from 'date-fns'
import { CreditCard, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: 'bg-muted text-muted-foreground',        icon: Clock },
  paid:     { label: 'Paid',     color: 'bg-green-500/10 text-green-400',        icon: CheckCircle },
  overdue:  { label: 'Overdue',  color: 'bg-red-500/10 text-red-400',            icon: AlertCircle },
  partial:  { label: 'Partial',  color: 'bg-amber-500/10 text-amber-400',        icon: Clock },
}

function PayInstallmentModal({ open, onClose, invoiceId, installment, onSaved }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      amount: installment?.amount - (installment?.paidAmount || 0),
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'upi',
      reference: '',
    },
  })

  const onSubmit = async (data) => {
    try {
      await api.post(`/finance/invoices/${invoiceId}/payments`, {
        ...data,
        installmentNumber: installment.installmentNumber,
      })
      toast.success('Installment payment recorded')
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Pay Installment #{installment?.installmentNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (₹) *</Label>
            <Input type="number" step="0.01" {...register('amount', { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" {...register('paymentDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <select {...register('paymentMethod')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {['cash','upi','bank_transfer','cheque','card','razorpay','stripe','paypal','other'].map(m =>
                  <option key={m} value={m}>{m.replace('_',' ').toUpperCase()}</option>
                )}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reference #</Label>
            <Input {...register('reference')} placeholder="UTR / Cheque no." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Record Payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function InstallmentsTab() {
  const qc = useQueryClient()
  const [page, setPage]   = useState(1)
  const [status, setStatus] = useState('')
  const [payTarget, setPayTarget] = useState(null) // { invoiceId, installment }

  // We query invoices that have installments enabled
  const { data, isLoading } = useQuery({
    queryKey: ['finance-invoices-installments', page, status],
    queryFn: () => api.get('/finance/invoices', {
      params: { page, limit: 20, installmentsEnabled: true, status: status || undefined }
    }).then(r => r.data),
    refetchInterval: 30_000,
  })

  const invoices = data?.data || []
  const total    = data?.total || 0
  const pages    = Math.ceil(total / 20)

  // Flatten installments for display
  const rows = invoices.flatMap(inv =>
    (inv.installments || []).map(inst => ({
      ...inst,
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client?.companyName || '—',
    }))
  )

  const overdue  = rows.filter(r => r.status === 'overdue' || (r.status === 'pending' && r.dueDate && isPast(new Date(r.dueDate)))).length
  const pending  = rows.filter(r => r.status === 'pending').length
  const paid     = rows.filter(r => r.status === 'paid').length

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-amber-400">{pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-red-400">{overdue}</p>
          <p className="text-xs text-muted-foreground">Overdue</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-green-400">{paid}</p>
          <p className="text-xs text-muted-foreground">Paid</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All Invoices</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No installment plans found</p>
          <p className="text-xs mt-1">Enable installments when creating an invoice to manage payment schedules</p>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Due Date</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">Paid</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, idx) => {
                  const isOverdue = r.status !== 'paid' && r.dueDate && isPast(new Date(r.dueDate))
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
                  return (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3 font-medium text-primary">{r.invoiceNumber}</td>
                      <td className="px-3 py-3 text-muted-foreground truncate max-w-[120px]">{r.clientName}</td>
                      <td className="px-3 py-3 text-center text-muted-foreground">{r.installmentNumber}</td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {r.dueDate
                          ? <span className={`text-sm ${isOverdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                              {format(new Date(r.dueDate), 'MMM d, yyyy')}
                            </span>
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-medium">{fmt(r.amount)}</td>
                      <td className="px-3 py-3 text-right text-green-400 hidden sm:table-cell">{fmt(r.paidAmount || 0)}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${isOverdue && r.status !== 'paid' ? 'bg-red-500/10 text-red-400' : cfg.color}`}>
                          {isOverdue && r.status !== 'paid' ? 'Overdue' : cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {r.status !== 'paid' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => setPayTarget({ invoiceId: r.invoiceId, installment: r })}>
                            Pay
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} invoices with installments</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      {payTarget && (
        <PayInstallmentModal
          open={!!payTarget}
          onClose={() => setPayTarget(null)}
          invoiceId={payTarget.invoiceId}
          installment={payTarget.installment}
          onSaved={() => { qc.invalidateQueries(['finance-invoices-installments']); qc.invalidateQueries(['finance-payments']); setPayTarget(null) }}
        />
      )}
    </div>
  )
}
