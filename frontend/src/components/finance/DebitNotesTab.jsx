import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, MoreVertical, Trash2, Edit2, FileText } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-muted text-muted-foreground' },
  issued:    { label: 'Issued',    color: 'bg-amber-500/10 text-amber-400' },
  applied:   { label: 'Applied',   color: 'bg-green-500/10 text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
}

function DebitNoteModal({ open, onClose, doc, onSaved }) {
  const isEdit = !!doc?._id
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      clientName:    doc?.clientName    || '',
      invoiceNumber: doc?.invoice?.invoiceNumber || '',
      amount:        doc?.amount        || '',
      reason:        doc?.reason        || '',
      notes:         doc?.notes         || '',
      status:        doc?.status        || 'draft',
    },
  })

  const onSubmit = async (data) => {
    try {
      if (isEdit) await api.put(`/finance/debit-notes/${doc._id}`, data)
      else        await api.post('/finance/debit-notes', data)
      toast.success(isEdit ? 'Debit note updated' : 'Debit note created')
      onSaved?.()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Debit Note' : 'New Debit Note'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Client Name *</Label>
            <Input {...register('clientName', { required: true })} placeholder="Client company name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice # (optional)</Label>
              <Input {...register('invoiceNumber')} placeholder="INV-00001" />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input type="number" step="0.01" {...register('amount', { required: true, min: 0.01 })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Input {...register('reason', { required: true })} placeholder="Reason for debit note" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input {...register('notes')} placeholder="Additional notes" />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select {...register('status')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isEdit ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function DebitNotesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editDoc, setEditDoc]   = useState(null)
  const [page, setPage]         = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['finance-debit-notes', page],
    queryFn: () => api.get('/finance/debit-notes', { params: { page, limit: 20 } }).then(r => r.data),
    refetchInterval: 30_000,
  })

  const invalidate = () => qc.invalidateQueries(['finance-debit-notes'])

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/finance/debit-notes/${id}`),
    onSuccess: () => { invalidate(); toast.success('Deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const notes = data?.data || []
  const total = data?.total || 0
  const pages = Math.ceil(total / 20)

  const totalIssued = notes.filter(n => ['issued','applied'].includes(n.status)).reduce((s, n) => s + (n.amount || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {totalIssued > 0 && (
          <div className="bg-card border border-border rounded-xl px-4 py-2 text-sm">
            Total issued: <strong className="text-amber-400">{fmt(totalIssued)}</strong>
          </div>
        )}
        <Button size="sm" className="ml-auto" onClick={() => { setEditDoc(null); setShowForm(true) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />New Debit Note
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No debit notes yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Create First</Button>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Debit Note #</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Invoice</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Reason</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {notes.map(n => {
                  const s = STATUS_CONFIG[n.status] || STATUS_CONFIG.draft
                  return (
                    <tr key={n._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3 font-medium text-primary">{n.debitNoteNumber}</td>
                      <td className="px-3 py-3 truncate max-w-[120px]">{n.clientName || n.client?.companyName || '—'}</td>
                      <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{n.invoice?.invoiceNumber || '—'}</td>
                      <td className="px-3 py-3 text-right font-semibold text-amber-400">{fmt(n.amount)}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs truncate max-w-[150px] hidden sm:table-cell">{n.reason}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {n.issuedAt ? format(new Date(n.issuedAt), 'MMM d, yyyy') : n.createdAt ? format(new Date(n.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => { setEditDoc(n); setShowForm(true) }}>
                              <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-400 focus:text-red-400"
                              onClick={() => { if (confirm('Delete?')) deleteMut.mutate(n._id) }}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} total</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <DebitNoteModal open={showForm} onClose={() => { setShowForm(false); setEditDoc(null) }}
        doc={editDoc} onSaved={invalidate} />
    </div>
  )
}
