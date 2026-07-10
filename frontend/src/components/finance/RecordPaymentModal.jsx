import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/services/api'
import toast from 'react-hot-toast'

const METHODS = ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'razorpay', 'stripe', 'paypal', 'other']

function fmt(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

export default function RecordPaymentModal({ open, onClose, invoice, onSaved }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      amount: invoice?.outstanding || 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'upi',
      referenceNumber: '',
      transactionId: '',
      remarks: '',
    },
  })

  const onSubmit = async (data) => {
    try {
      await api.post(`/finance/invoices/${invoice._id}/payments`, data)
      toast.success('Payment recorded')
      onSaved?.()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to record payment')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Record Payment — {invoice?.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {invoice && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Invoice Total</span><span className="font-medium">{fmt(invoice.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-green-400">{fmt(invoice.paidAmount)}</span></div>
              <div className="flex justify-between font-semibold"><span>Outstanding</span><span className="text-amber-400">{fmt(invoice.outstanding)}</span></div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Amount (₹) *</Label>
            <Input type="number" step="0.01" min="0.01" max={invoice?.outstanding}
              {...register('amount', { required: true, min: 0.01 })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Date</Label>
              <Input type="date" {...register('paymentDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <select {...register('paymentMethod')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Reference #</Label>
              <Input {...register('referenceNumber')} placeholder="Cheque no / UTR" />
            </div>
            <div className="space-y-1.5">
              <Label>Transaction ID</Label>
              <Input {...register('transactionId')} placeholder="TXN12345" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Input {...register('remarks')} placeholder="Optional note" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Record Payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
