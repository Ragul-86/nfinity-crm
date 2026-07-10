/**
 * FinanceFormModal
 * Shared create/edit form for Invoice and Quotation.
 * Handles line items, GST type (India), discount, installments.
 */
import { useEffect } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import toast from 'react-hot-toast'

const PAYMENT_TERMS = ['immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', 'custom']
const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'razorpay', 'stripe', 'paypal', 'other']
const GST_TYPES = [
  { value: 'non_gst',    label: 'Non-GST' },
  { value: 'intra_state', label: 'Intra-State GST (CGST + SGST)' },
  { value: 'inter_state', label: 'Inter-State GST (IGST)' },
]
const EMPTY_ITEM = { description: '', hsnCode: '', quantity: 1, unitPrice: 0, discount: 0, taxPercent: 18, amount: 0 }

function fmt(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function calcTotals(items = [], discountPercent = 0, gstType = 'non_gst') {
  let subtotal = 0
  items.forEach(it => {
    const base = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
    const disc = base * ((Number(it.discount) || 0) / 100)
    subtotal += base - disc
  })
  const discountAmount = subtotal * (Number(discountPercent) / 100)
  const afterDiscount = subtotal - discountAmount
  const avgTax = items.length > 0 ? items.reduce((s, i) => s + (Number(i.taxPercent) || 0), 0) / items.length : 0
  const taxAmount = afterDiscount * (avgTax / 100)
  let cgst = 0, sgst = 0, igst = 0
  if (gstType === 'intra_state') { cgst = taxAmount / 2; sgst = taxAmount / 2 }
  else if (gstType === 'inter_state') { igst = taxAmount }
  return { subtotal, discountAmount, afterDiscount, taxAmount, cgst, sgst, igst, total: afterDiscount + taxAmount }
}

export default function FinanceFormModal({ open, onClose, type = 'invoice', doc, onSaved }) {
  const isInvoice = type === 'invoice'
  const title = doc ? `Edit ${isInvoice ? 'Invoice' : 'Quotation'}` : `New ${isInvoice ? 'Invoice' : 'Quotation'}`

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { limit: 200 } }).then(r => r.data.data || []),
    staleTime: 60_000,
  })

  const defaults = doc ? {
    client:            doc.client?._id || doc.client || '',
    items:             doc.items?.length ? doc.items : [EMPTY_ITEM],
    discountPercent:   doc.discountPercent || 0,
    gstType:           doc.gstType || 'non_gst',
    gstNumber:         doc.gstNumber || '',
    clientGstNumber:   doc.clientGstNumber || '',
    notes:             doc.notes || '',
    termsAndConditions:doc.termsAndConditions || '',
    ...(isInvoice ? {
      dueDate:        doc.dueDate ? new Date(doc.dueDate).toISOString().split('T')[0] : '',
      paymentTerms:   doc.paymentTerms || 'net_30',
      status:         doc.status || 'draft',
    } : {
      validUntil:     doc.validUntil ? new Date(doc.validUntil).toISOString().split('T')[0] : '',
      expectedRevenue:doc.expectedRevenue || 0,
      remarks:        doc.remarks || '',
    }),
  } : {
    client: '', items: [EMPTY_ITEM], discountPercent: 0, gstType: 'non_gst',
    gstNumber: '', clientGstNumber: '', notes: '', termsAndConditions: '',
    ...(isInvoice ? { dueDate: '', paymentTerms: 'net_30', status: 'draft' } : { validUntil: '', expectedRevenue: 0, remarks: '' }),
  }

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm({ defaultValues: defaults })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' }) || []
  const watchedDiscount = useWatch({ control, name: 'discountPercent' }) || 0
  const watchedGSTType  = useWatch({ control, name: 'gstType' }) || 'non_gst'

  const totals = calcTotals(watchedItems, watchedDiscount, watchedGSTType)

  useEffect(() => { if (open) reset(defaults) }, [open, doc])

  const onSubmit = async (data) => {
    try {
      const endpoint = doc
        ? isInvoice ? `/finance/invoices/${doc._id}` : `/finance/quotations/${doc._id}`
        : isInvoice ? '/finance/invoices' : '/finance/quotations'
      const method = doc ? 'put' : 'post'
      await api[method](endpoint, data)
      toast.success(doc ? `${isInvoice ? 'Invoice' : 'Quotation'} updated` : `${isInvoice ? 'Invoice' : 'Quotation'} created`)
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Client + basic fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Client *</Label>
              <select {...register('client', { required: true })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select client…</option>
                {clients.map(c => <option key={c._id} value={c._id}>{c.companyName}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>GST Type</Label>
              <select {...register('gstType')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {GST_TYPES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            {watchedGSTType !== 'non_gst' && (
              <div className="space-y-1.5">
                <Label>Your GSTIN</Label>
                <Input {...register('gstNumber')} placeholder="27AAABB1234C1Z5" />
              </div>
            )}
            {watchedGSTType !== 'non_gst' && (
              <div className="space-y-1.5">
                <Label>Client GSTIN</Label>
                <Input {...register('clientGstNumber')} placeholder="Client GST number" />
              </div>
            )}
            {isInvoice ? (
              <>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" {...register('dueDate')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Terms</Label>
                  <select {...register('paymentTerms')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
                  </select>
                </div>
                {doc && (
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <select {...register('status')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {['draft','sent','viewed','partial','paid','overdue','cancelled'].map(s =>
                        <option key={s} value={s} className="capitalize">{s}</option>
                      )}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Valid Until</Label>
                  <Input type="date" {...register('validUntil')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Expected Revenue (₹)</Label>
                  <Input type="number" min="0" {...register('expectedRevenue')} />
                </div>
                {doc && (
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <select {...register('status')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {['draft','sent','viewed','approved','rejected','expired','converted','cancelled'].map(s =>
                        <option key={s} value={s} className="capitalize">{s}</option>
                      )}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ ...EMPTY_ITEM })}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add Item
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className={`grid text-xs font-medium text-muted-foreground bg-muted/30 px-3 py-2 ${watchedGSTType !== 'non_gst' ? 'grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_0.5fr]' : 'grid-cols-[3fr_1fr_1fr_1fr_1fr_0.5fr]'}`}>
                <span>Description</span>
                {watchedGSTType !== 'non_gst' && <span>HSN/SAC</span>}
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Disc%</span>
                <span className="text-right">Tax%</span>
                <span></span>
              </div>
              {fields.map((f, i) => (
                <div key={f.id} className={`grid items-center gap-1.5 px-3 py-2 border-t border-border ${watchedGSTType !== 'non_gst' ? 'grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_0.5fr]' : 'grid-cols-[3fr_1fr_1fr_1fr_1fr_0.5fr]'}`}>
                  <Input className="h-8 text-sm" {...register(`items.${i}.description`)} placeholder="Description" />
                  {watchedGSTType !== 'non_gst' && <Input className="h-8 text-sm" {...register(`items.${i}.hsnCode`)} placeholder="HSN" />}
                  <Input className="h-8 text-sm text-right" type="number" min="0" step="0.01" {...register(`items.${i}.quantity`)} />
                  <Input className="h-8 text-sm text-right" type="number" min="0" step="0.01" {...register(`items.${i}.unitPrice`)} />
                  <Input className="h-8 text-sm text-right" type="number" min="0" max="100" step="0.1" {...register(`items.${i}.discount`)} />
                  <Input className="h-8 text-sm text-right" type="number" min="0" max="100" step="0.1" {...register(`items.${i}.taxPercent`)} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i)} disabled={fields.length === 1}>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Discount + Totals */}
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="space-y-1.5 w-40">
              <Label>Invoice Discount %</Label>
              <Input type="number" min="0" max="100" step="0.1" {...register('discountPercent')} />
            </div>
            <div className="bg-muted/20 border border-border rounded-xl p-4 min-w-[260px] space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
              {totals.discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-green-400">−{fmt(totals.discountAmount)}</span></div>}
              {watchedGSTType === 'intra_state' && <>
                <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{fmt(totals.cgst)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{fmt(totals.sgst)}</span></div>
              </>}
              {watchedGSTType === 'inter_state' && <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{fmt(totals.igst)}</span></div>}
              {watchedGSTType === 'non_gst' && totals.taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(totals.taxAmount)}</span></div>}
              <div className="flex justify-between text-base font-bold border-t border-border pt-1.5 mt-1"><span>Total</span><span className="text-primary">{fmt(totals.total)}</span></div>
            </div>
          </div>

          {/* Notes + Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...register('notes')} className="text-sm min-h-[72px]" placeholder="Payment notes, remarks…" />
            </div>
            <div className="space-y-1.5">
              <Label>Terms & Conditions</Label>
              <Textarea {...register('termsAndConditions')} className="text-sm min-h-[72px]" placeholder="Terms and conditions…" />
            </div>
            {!isInvoice && (
              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Textarea {...register('remarks')} className="text-sm min-h-[72px]" placeholder="Internal remarks…" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {doc ? 'Update' : 'Create'} {isInvoice ? 'Invoice' : 'Quotation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
