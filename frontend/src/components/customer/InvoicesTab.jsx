import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, MoreVertical, Download, CheckCircle, Copy, Trash2, Edit2, Receipt } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-muted text-muted-foreground' },
  sent:      { label: 'Sent',      color: 'bg-blue-500/10 text-blue-400' },
  paid:      { label: 'Paid',      color: 'bg-green-500/10 text-green-400' },
  partial:   { label: 'Partial',   color: 'bg-amber-500/10 text-amber-400' },
  overdue:   { label: 'Overdue',   color: 'bg-red-500/10 text-red-400' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
}

function fmt(n) {
  if (!n) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString()}`
}

const EMPTY_ITEM = { description: '', quantity: 1, unitPrice: 0, taxPercent: 0 }

function InvoiceFormDialog({ open, onClose, clientId, invoice, onSaved }) {
  const { register, handleSubmit, control, watch, reset, formState: { isSubmitting } } = useForm({
    defaultValues: invoice ? {
      items: invoice.items || [EMPTY_ITEM],
      dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
      notes: invoice.notes || '',
      status: invoice.status || 'draft',
    } : { items: [EMPTY_ITEM], dueDate: '', notes: '', status: 'draft' },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items') || []

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
  const taxAmount = items.reduce((s, it) => {
    const base = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
    return s + base * ((Number(it.taxPercent) || 0) / 100)
  }, 0)
  const total = subtotal + taxAmount

  const onSubmit = async (data) => {
    try {
      if (invoice) {
        await api.put(`/customers/invoices/${invoice._id}`, data)
        toast.success('Invoice updated')
      } else {
        await api.post(`/customers/${clientId}/invoices`, data)
        toast.success('Invoice created')
      }
      onSaved()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{invoice ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
              <span className="col-span-5">Description</span>
              <span className="col-span-2">Qty</span>
              <span className="col-span-2">Unit Price</span>
              <span className="col-span-2">Tax %</span>
              <span className="col-span-1"></span>
            </div>
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-5" placeholder="Description" {...register(`items.${i}.description`)} />
                <Input className="col-span-2" type="number" min="1" {...register(`items.${i}.quantity`)} />
                <Input className="col-span-2" type="number" min="0" step="0.01" {...register(`items.${i}.unitPrice`)} />
                <Input className="col-span-2" type="number" min="0" max="100" step="0.1" {...register(`items.${i}.taxPercent`)} />
                <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8"
                  onClick={() => remove(i)} disabled={fields.length === 1}>
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append(EMPTY_ITEM)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add Item
            </Button>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1 text-right">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(taxAmount)}</span></div>
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmt(total)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" {...register('dueDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Payment notes…" {...register('notes')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {invoice ? 'Update Invoice' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MarkPaidDialog({ open, invoice, onClose, onPaid }) {
  const [amount, setAmount] = useState(invoice?.outstanding || 0)
  const [method, setMethod] = useState('bank_transfer')
  const [loading, setLoading] = useState(false)

  const methods = ['bank_transfer', 'upi', 'cash', 'cheque', 'card', 'other']

  const handlePay = async () => {
    setLoading(true)
    try {
      await api.post(`/customers/invoices/${invoice._id}/mark-paid`, { amount: Number(amount), paymentMethod: method })
      toast.success('Payment recorded')
      onPaid()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Outstanding: <span className="font-semibold text-foreground">{fmt(invoice?.outstanding)}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Amount Paid</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" max={invoice?.outstanding} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {methods.map(m => <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePay} disabled={loading}>Mark Paid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function InvoicesTab({ clientId }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editInv, setEditInv] = useState(null)
  const [payInv, setPayInv] = useState(null)

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['customer-invoices', clientId],
    queryFn: () => api.get(`/customers/${clientId}/invoices`).then(r => r.data.data),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries(['customer-invoices', clientId]); toast.success('Invoice deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const invalidate = () => {
    qc.invalidateQueries(['customer-invoices', clientId])
    qc.invalidateQueries(['customer-workspace', clientId])
  }

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  const totals = invoices.reduce((acc, inv) => {
    acc.total += inv.total || 0
    acc.paid += inv.paidAmount || 0
    acc.outstanding += inv.outstanding || 0
    return acc
  }, { total: 0, paid: 0, outstanding: 0 })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">Total: <strong>{fmt(totals.total)}</strong></span>
          <span className="text-green-400">Paid: <strong>{fmt(totals.paid)}</strong></span>
          {totals.outstanding > 0 && <span className="text-amber-400">Outstanding: <strong>{fmt(totals.outstanding)}</strong></span>}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />New Invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No invoices yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>Create First Invoice</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const s = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft
            return (
              <div key={inv._id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{inv.invoiceNumber}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                    {inv.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        Due: {format(new Date(inv.dueDate), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Items: {inv.items?.length || 0}</span>
                    <span>Total: <strong className="text-foreground">{fmt(inv.total)}</strong></span>
                    {inv.outstanding > 0 && <span className="text-amber-400">Owed: {fmt(inv.outstanding)}</span>}
                    <span>{format(new Date(inv.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                  {inv.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{inv.notes}</p>}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditInv(inv)}>
                      <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                    </DropdownMenuItem>
                    {inv.outstanding > 0 && (
                      <DropdownMenuItem onClick={() => setPayInv(inv)}>
                        <CheckCircle className="w-3.5 h-3.5 mr-2" />Mark Paid
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-400 focus:text-red-400"
                      onClick={() => { if (confirm('Delete invoice?')) deleteMut.mutate(inv._id) }}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}

      <InvoiceFormDialog open={showCreate} onClose={() => setShowCreate(false)} clientId={clientId} onSaved={invalidate} />
      {editInv && (
        <InvoiceFormDialog open={!!editInv} onClose={() => setEditInv(null)} clientId={clientId} invoice={editInv} onSaved={() => { invalidate(); setEditInv(null) }} />
      )}
      {payInv && (
        <MarkPaidDialog open={!!payInv} invoice={payInv} onClose={() => setPayInv(null)} onPaid={() => { invalidate(); setPayInv(null) }} />
      )}
    </div>
  )
}
