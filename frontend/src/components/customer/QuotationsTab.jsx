import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, MoreVertical, Edit2, Trash2, FileText, ArrowRight } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-muted text-muted-foreground' },
  sent:      { label: 'Sent',      color: 'bg-blue-500/10 text-blue-400' },
  approved:  { label: 'Approved',  color: 'bg-green-500/10 text-green-400' },
  rejected:  { label: 'Rejected',  color: 'bg-red-500/10 text-red-400' },
  converted: { label: 'Converted', color: 'bg-purple-500/10 text-purple-400' },
}

function fmt(n) {
  if (!n) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString()}`
}

const EMPTY_ITEM = { description: '', quantity: 1, unitPrice: 0, taxPercent: 0 }

function QuoteFormDialog({ open, onClose, clientId, quote, onSaved }) {
  const { register, handleSubmit, control, watch, reset, formState: { isSubmitting } } = useForm({
    defaultValues: quote ? {
      items: quote.items || [EMPTY_ITEM],
      validUntil: quote.validUntil ? quote.validUntil.split('T')[0] : '',
      notes: quote.notes || '',
    } : { items: [EMPTY_ITEM], validUntil: '', notes: '' },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items') || []

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
  const taxAmount = items.reduce((s, it) => {
    const base = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
    return s + base * ((Number(it.taxPercent) || 0) / 100)
  }, 0)

  const onSubmit = async (data) => {
    try {
      if (quote) {
        await api.put(`/customers/quotations/${quote._id}`, data)
        toast.success('Quotation updated')
      } else {
        await api.post(`/customers/${clientId}/quotations`, data)
        toast.success('Quotation created')
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
          <DialogTitle>{quote ? 'Edit Quotation' : 'Create Quotation'}</DialogTitle>
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
                <Input className="col-span-2" type="number" min="0" max="100" {...register(`items.${i}.taxPercent`)} />
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
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmt(subtotal + taxAmount)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valid Until</Label>
              <Input type="date" {...register('validUntil')} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Notes…" {...register('notes')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{quote ? 'Update' : 'Create Quotation'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function QuotationsTab({ clientId }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editQ, setEditQ] = useState(null)

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['customer-quotations', clientId],
    queryFn: () => api.get(`/customers/${clientId}/quotations`).then(r => r.data.data),
  })

  const convertMut = useMutation({
    mutationFn: id => api.post(`/customers/quotations/${id}/convert`),
    onSuccess: () => {
      qc.invalidateQueries(['customer-quotations', clientId])
      qc.invalidateQueries(['customer-invoices', clientId])
      toast.success('Converted to invoice')
    },
    onError: () => toast.error('Conversion failed'),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/quotations/${id}`),
    onSuccess: () => { qc.invalidateQueries(['customer-quotations', clientId]); toast.success('Deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const invalidate = () => qc.invalidateQueries(['customer-quotations', clientId])

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{quotes.length} quotation{quotes.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />New Quotation
        </Button>
      </div>

      {quotes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No quotations yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>Create First Quote</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map(q => {
            const s = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft
            return (
              <div key={q._id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{q.quoteNumber}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                    {q.validUntil && (
                      <span className="text-xs text-muted-foreground">
                        Valid till: {format(new Date(q.validUntil), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Total: <strong className="text-foreground">{fmt(q.total)}</strong></span>
                    <span>{q.items?.length || 0} items</span>
                    <span>{format(new Date(q.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                  {q.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{q.notes}</p>}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditQ(q)}>
                      <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                    </DropdownMenuItem>
                    {q.status !== 'converted' && (
                      <DropdownMenuItem onClick={() => { if (confirm('Convert to invoice?')) convertMut.mutate(q._id) }}>
                        <ArrowRight className="w-3.5 h-3.5 mr-2" />Convert to Invoice
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-400 focus:text-red-400"
                      onClick={() => { if (confirm('Delete quotation?')) deleteMut.mutate(q._id) }}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}

      <QuoteFormDialog open={showCreate} onClose={() => setShowCreate(false)} clientId={clientId} onSaved={invalidate} />
      {editQ && (
        <QuoteFormDialog open={!!editQ} onClose={() => setEditQ(null)} clientId={clientId} quote={editQ} onSaved={() => { invalidate(); setEditQ(null) }} />
      )}
    </div>
  )
}
