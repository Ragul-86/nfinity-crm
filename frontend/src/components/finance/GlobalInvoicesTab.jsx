import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, MoreVertical, Download, CheckCircle, Copy, Trash2, Edit2, XCircle, CreditCard, Receipt, Search, Filter } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import FinanceFormModal from './FinanceFormModal'
import RecordPaymentModal from './RecordPaymentModal'
import { usePDFDownload } from '@/hooks/usePDFDownload'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',       color: 'bg-muted text-muted-foreground' },
  sent:      { label: 'Sent',        color: 'bg-blue-500/10 text-blue-400' },
  viewed:    { label: 'Viewed',      color: 'bg-cyan-500/10 text-cyan-400' },
  partial:   { label: 'Partial',     color: 'bg-amber-500/10 text-amber-400' },
  paid:      { label: 'Paid',        color: 'bg-green-500/10 text-green-400' },
  overdue:   { label: 'Overdue',     color: 'bg-red-500/10 text-red-400' },
  cancelled: { label: 'Cancelled',   color: 'bg-muted text-muted-foreground' },
}

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function GlobalInvoicesTab() {
  const qc = useQueryClient()
  const { downloadPDF, generating } = usePDFDownload()

  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editDoc, setEditDoc]     = useState(null)
  const [payInvoice, setPayInvoice] = useState(null)
  const [selected, setSelected]   = useState([])

  const { data, isLoading } = useQuery({
    queryKey: ['finance-invoices', page, search, status],
    queryFn: () => api.get('/finance/invoices', { params: { page, limit: 20, search, status } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries(['finance-invoices'])
    qc.invalidateQueries(['finance-dashboard'])
  }

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/finance/invoices/${id}/cancel`, { reason }),
    onSuccess: () => { invalidate(); toast.success('Invoice cancelled') },
    onError: () => toast.error('Cancel failed'),
  })

  const dupMut = useMutation({
    mutationFn: id => api.post(`/finance/invoices/${id}/duplicate`),
    onSuccess: () => { invalidate(); toast.success('Invoice duplicated') },
    onError: () => toast.error('Duplicate failed'),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/finance/invoices/${id}`),
    onSuccess: () => { invalidate(); toast.success('Invoice deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const bulkMut = useMutation({
    mutationFn: data => api.post('/finance/bulk', data),
    onSuccess: () => { invalidate(); setSelected([]); toast.success('Bulk action done') },
    onError: () => toast.error('Bulk action failed'),
  })

  const invoices = data?.data || []
  const total    = data?.total || 0
  const pages    = data?.pages || 1

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll    = () => setSelected(invoices.length === selected.length ? [] : invoices.map(i => i._id))

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search invoices, clients…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All Status</option>
          {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => window.open(`/api/finance/export?type=invoice`, '_blank')}>
          Export CSV
        </Button>
        <Button size="sm" onClick={() => { setEditDoc(null); setShowForm(true) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />New Invoice
        </Button>
      </div>

      {/* Bulk bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2">
          <span className="text-sm font-medium text-primary">{selected.length} selected</span>
          <div className="flex gap-1.5 ml-auto">
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ action: 'mark_sent', ids: selected, type: 'invoice' })}>Mark Sent</Button>
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ action: 'mark_paid', ids: selected, type: 'invoice' })}>Mark Paid</Button>
            <Button size="sm" variant="outline" className="text-red-400" onClick={() => { if (confirm(`Delete ${selected.length} invoices?`)) bulkMut.mutate({ action: 'delete', ids: selected, type: 'invoice' }) }}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No invoices found</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Create First Invoice</Button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-8 px-3 py-3">
                    <input type="checkbox" checked={selected.length === invoices.length && invoices.length > 0}
                      onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Invoice #</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Date</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Due</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">Outstanding</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map(inv => {
                  const s = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft
                  return (
                    <tr key={inv._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.includes(inv._id)} onChange={() => toggleSelect(inv._id)} className="rounded" />
                      </td>
                      <td className="px-3 py-3 font-medium">{inv.invoiceNumber}</td>
                      <td className="px-3 py-3">
                        <div>
                          <p className="font-medium truncate max-w-[150px]">{inv.client?.companyName || '—'}</p>
                          {inv.gstType !== 'non_gst' && inv.client?.gstNumber && (
                            <p className="text-xs text-muted-foreground">{inv.client.gstNumber}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">
                        {inv.createdAt ? format(new Date(inv.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {inv.dueDate
                          ? <span className={`text-sm ${new Date(inv.dueDate) < new Date() && inv.status !== 'paid' ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                              {format(new Date(inv.dueDate), 'MMM d, yyyy')}
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{fmt(inv.total)}</td>
                      <td className="px-3 py-3 text-right hidden sm:table-cell">
                        {inv.outstanding > 0
                          ? <span className="text-amber-400 font-medium">{fmt(inv.outstanding)}</span>
                          : <span className="text-green-400">Cleared</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => { setEditDoc(inv); setShowForm(true) }}>
                              <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => dupMut.mutate(inv._id)}>
                              <Copy className="w-3.5 h-3.5 mr-2" />Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadPDF(inv, 'invoice')} disabled={generating}>
                              <Download className="w-3.5 h-3.5 mr-2" />Download PDF
                            </DropdownMenuItem>
                            {inv.outstanding > 0 && (
                              <DropdownMenuItem onClick={() => setPayInvoice(inv)}>
                                <CreditCard className="w-3.5 h-3.5 mr-2" />Record Payment
                              </DropdownMenuItem>
                            )}
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <DropdownMenuItem onClick={() => cancelMut.mutate({ id: inv._id, reason: 'Cancelled by user' })}>
                                <XCircle className="w-3.5 h-3.5 mr-2" />Cancel Invoice
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-400 focus:text-red-400"
                              onClick={() => { if (confirm('Delete this invoice?')) deleteMut.mutate(inv._id) }}>
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

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <FinanceFormModal open={showForm} onClose={() => { setShowForm(false); setEditDoc(null) }}
        type="invoice" doc={editDoc} onSaved={invalidate} />
      {payInvoice && (
        <RecordPaymentModal open={!!payInvoice} onClose={() => setPayInvoice(null)}
          invoice={payInvoice} onSaved={() => { invalidate(); setPayInvoice(null) }} />
      )}
    </div>
  )
}
