import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, MoreVertical, Download, Copy, Trash2, Edit2, ArrowRight, FileText, Search } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import FinanceFormModal from './FinanceFormModal'
import { usePDFDownload } from '@/hooks/usePDFDownload'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-muted text-muted-foreground' },
  sent:      { label: 'Sent',      color: 'bg-blue-500/10 text-blue-400' },
  viewed:    { label: 'Viewed',    color: 'bg-cyan-500/10 text-cyan-400' },
  approved:  { label: 'Approved',  color: 'bg-green-500/10 text-green-400' },
  rejected:  { label: 'Rejected',  color: 'bg-red-500/10 text-red-400' },
  expired:   { label: 'Expired',   color: 'bg-orange-500/10 text-orange-400' },
  converted: { label: 'Converted', color: 'bg-purple-500/10 text-purple-400' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
}

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function GlobalQuotationsTab() {
  const qc = useQueryClient()
  const { downloadPDF, generating } = usePDFDownload()

  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editDoc, setEditDoc]   = useState(null)
  const [selected, setSelected] = useState([])

  const { data, isLoading } = useQuery({
    queryKey: ['finance-quotations', page, search, status],
    queryFn: () => api.get('/finance/quotations', { params: { page, limit: 20, search, status } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries(['finance-quotations'])
    qc.invalidateQueries(['finance-dashboard'])
    qc.invalidateQueries(['finance-invoices'])
  }

  const dupMut = useMutation({
    mutationFn: id => api.post(`/finance/quotations/${id}/duplicate`),
    onSuccess: () => { invalidate(); toast.success('Quotation duplicated') },
    onError: () => toast.error('Failed'),
  })

  const convertMut = useMutation({
    mutationFn: id => api.post(`/finance/quotations/${id}/convert`),
    onSuccess: () => { invalidate(); toast.success('Converted to invoice') },
    onError: e => toast.error(e?.response?.data?.message || 'Conversion failed'),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/finance/quotations/${id}`),
    onSuccess: () => { invalidate(); toast.success('Deleted') },
    onError: () => toast.error('Delete failed'),
  })

  const bulkMut = useMutation({
    mutationFn: data => api.post('/finance/bulk', data),
    onSuccess: () => { invalidate(); setSelected([]); toast.success('Done') },
  })

  const quotations = data?.data || []
  const total = data?.total || 0
  const pages = data?.pages || 1

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll    = () => setSelected(quotations.length === selected.length ? [] : quotations.map(q => q._id))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search quotations…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All Status</option>
          {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => window.open(`/api/finance/export?type=quotation`, '_blank')}>
          Export CSV
        </Button>
        <Button size="sm" onClick={() => { setEditDoc(null); setShowForm(true) }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />New Quotation
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2">
          <span className="text-sm font-medium text-primary">{selected.length} selected</span>
          <div className="flex gap-1.5 ml-auto">
            <Button size="sm" variant="outline" className="text-red-400" onClick={() => { if (confirm('Delete?')) bulkMut.mutate({ action: 'delete', ids: selected, type: 'quotation' }) }}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : quotations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No quotations found</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Create First Quotation</Button>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-8 px-3 py-3">
                    <input type="checkbox" checked={selected.length === quotations.length && quotations.length > 0} onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Quote #</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Created</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Expiry</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quotations.map(q => {
                  const s = STATUS_CONFIG[q.status] || STATUS_CONFIG.draft
                  const isExpired = q.validUntil && new Date(q.validUntil) < new Date() && !['converted', 'cancelled', 'rejected'].includes(q.status)
                  return (
                    <tr key={q._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.includes(q._id)} onChange={() => toggleSelect(q._id)} className="rounded" />
                      </td>
                      <td className="px-3 py-3 font-medium">{q.quoteNumber}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium truncate max-w-[150px]">{q.client?.companyName || '—'}</p>
                        {q.createdBy?.name && <p className="text-xs text-muted-foreground">{q.createdBy.name}</p>}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">
                        {q.createdAt ? format(new Date(q.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {q.validUntil
                          ? <span className={`text-sm ${isExpired ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                              {format(new Date(q.validUntil), 'MMM d, yyyy')}
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{fmt(q.total)}</td>
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
                            <DropdownMenuItem onClick={() => { setEditDoc(q); setShowForm(true) }}>
                              <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => dupMut.mutate(q._id)}>
                              <Copy className="w-3.5 h-3.5 mr-2" />Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadPDF(q, 'quotation')} disabled={generating}>
                              <Download className="w-3.5 h-3.5 mr-2" />Download PDF
                            </DropdownMenuItem>
                            {!['converted', 'cancelled', 'rejected'].includes(q.status) && (
                              <DropdownMenuItem onClick={() => { if (confirm('Convert to invoice?')) convertMut.mutate(q._id) }}>
                                <ArrowRight className="w-3.5 h-3.5 mr-2" />Convert to Invoice
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-400 focus:text-red-400"
                              onClick={() => { if (confirm('Delete this quotation?')) deleteMut.mutate(q._id) }}>
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

      <FinanceFormModal open={showForm} onClose={() => { setShowForm(false); setEditDoc(null) }}
        type="quotation" doc={editDoc} onSaved={invalidate} />
    </div>
  )
}
