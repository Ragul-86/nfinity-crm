import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'react-hot-toast'
import {
  Plus, Search, Download, Upload, MoreVertical, Trash2,
  Archive, X, ChevronLeft, ChevronRight, Eye, AlertCircle,
  Calendar,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import LeadDetailModal from '@/components/leads/LeadDetailModal'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

async function apiFetch(url, opts = {}) {
  const r = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.message || 'Request failed')
  return d
}

const STATUSES = [
  { value: 'new_lead',       label: 'New Lead',       color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  { value: 'contacted',      label: 'Contacted',      color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
  { value: 'discovery_call', label: 'Discovery Call', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' },
  { value: 'proposal_sent',  label: 'Proposal Sent',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400' },
  { value: 'negotiation',    label: 'Negotiation',    color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
  { value: 'won',            label: 'Won',            color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  { value: 'lost',           label: 'Lost',           color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  { value: 'archived',       label: 'Archived',       color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
]
const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'text-red-600' },
  { value: 'high',   label: 'High',   color: 'text-orange-600' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600' },
  { value: 'low',    label: 'Low',    color: 'text-gray-500' },
]
const SOURCES = [
  'manual','website','referral','social_media','cold_call','email','event','meta_ads',
  'lead_form','facebook_ads','instagram_ads','whatsapp','google_ads','landing_page',
  'import','api','webhook','other',
]

function statusInfo(val) { return STATUSES.find(s => s.value === val) || { label: val || '—', color: '' } }
function priorityInfo(val) { return PRIORITIES.find(p => p.value === val) || { label: val || '—', color: '' } }
function fmtLabel(s) { return s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '' }

// ── KPI bar ────────────────────────────────────────────────────────────────────
function KpiBar({ stats }) {
  if (!stats) return null
  const totals = stats.totals || {}
  const byStatus = stats.byStatus || []
  const kpis = [
    { label: 'Total',    value: totals.count || 0,                                  color: 'text-foreground' },
    { label: 'Won',      value: byStatus.find(s => s._id === 'won')?.count  || 0,   color: 'text-emerald-600' },
    { label: 'Lost',     value: byStatus.find(s => s._id === 'lost')?.count || 0,   color: 'text-red-600' },
    { label: 'Pipeline', value: `₹${((totals.total || 0) / 100000).toFixed(1)}L`,   color: 'text-blue-600' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map(k => (
        <Card key={k.label}>
          <CardContent className="p-3">
            <p className={cn('text-xl font-bold', k.color)}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Create Lead Dialog ─────────────────────────────────────────────────────────
function CreateLeadDialog({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', company: '', phone: '', email: '', website: '',
    source: 'manual', status: 'new_lead', priority: 'medium',
    value: '', city: '', state: '', serviceRequired: '', tags: '',
    expectedCloseDate: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-stats'] })
      toast.success('Lead created')
      onClose()
    },
    onError: e => toast.error(e.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name is required')
    mutation.mutate({
      ...form,
      value: form.value ? Number(form.value) : 0,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full Name *</Label>
              <Input placeholder="Contact person" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input placeholder="Company name" value={form.company} onChange={e => set('company', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+91 98765 43210" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="name@company.com" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input placeholder="https://..." value={form.website} onChange={e => set('website', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={v => set('source', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deal Value (₹)</Label>
              <Input type="number" placeholder="0" value={form.value} onChange={e => set('value', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Service Required</Label>
              <Input placeholder="e.g. Digital Marketing" value={form.serviceRequired} onChange={e => set('serviceRequired', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Close Date</Label>
              <Input type="date" value={form.expectedCloseDate} onChange={e => set('expectedCloseDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input placeholder="Mumbai" value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tags (comma-separated)</Label>
              <Input placeholder="Hot, VIP, Referral" value={form.tags} onChange={e => set('tags', e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 pt-3 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? 'Creating…' : 'Create Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Import Dialog ──────────────────────────────────────────────────────────────
function ImportDialog({ open, onClose }) {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [rows, setRows] = useState([])
  const [preview, setPreview] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.replace(/['"]/g, '').trim())
    const data = lines.slice(1)
      .map(line => {
        const vals = line.split(',').map(v => v.replace(/['"]/g, '').trim())
        return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] || '' }), {})
      })
      .filter(r => r.name || r.Name || r.fullName)
      .map(r => ({
        name:     r.name    || r.Name    || r.fullName || r['Full Name'] || '',
        phone:    r.phone   || r.Phone   || r.mobile   || '',
        email:    r.email   || r.Email   || '',
        company:  r.company || r.Company || '',
        source:   'import', status: 'new_lead', priority: 'medium',
        value:    Number(r.value || r.Value || 0),
        city:     r.city    || r.City    || '',
      }))
    setRows(data); setPreview(true)
  }

  const importMut = useMutation({
    mutationFn: (leads) => apiFetch('/api/leads/import', { method: 'POST', body: JSON.stringify({ leads }) }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      toast.success(`Imported ${d.imported} leads${d.skipped ? `, skipped ${d.skipped}` : ''}`)
      onClose()
    },
    onError: e => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import Leads from CSV</DialogTitle></DialogHeader>
        {!preview ? (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">Choose a CSV file</p>
            <p className="text-xs text-muted-foreground">Columns: name, phone, email, company, value, city</p>
            <Button className="mt-4" onClick={() => fileRef.current?.click()}>Browse File</Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <p className="text-sm">{rows.length} leads ready to import</p>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>{['Name','Phone','Email','Company'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">{r.phone}</td>
                      <td className="px-3 py-1.5">{r.email}</td>
                      <td className="px-3 py-1.5">{r.company}</td>
                    </tr>
                  ))}
                  {rows.length > 10 && (
                    <tr className="border-t border-border/50">
                      <td colSpan={4} className="px-3 py-1.5 text-muted-foreground">…and {rows.length - 10} more</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPreview(false); setRows([]) }}>Back</Button>
              <Button onClick={() => importMut.mutate(rows)} disabled={importMut.isPending}>
                {importMut.isPending ? 'Importing…' : `Import ${rows.length} Leads`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Leads() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', priority: '', source: '' })
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [selected, setSelected] = useState([])

  const isManager = ['super_admin', 'admin', 'manager'].includes(user?.role)
  const LIMIT = 20

  const qp = new URLSearchParams({
    page, limit: LIMIT,
    ...(search           && { search }),
    ...(filters.status   && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.source   && { source: filters.source }),
  }).toString()

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', page, search, filters],
    queryFn: () => apiFetch(`/api/leads?${qp}`),
    keepPreviousData: true,
    refetchInterval: 30000,
  })

  const { data: statsData } = useQuery({
    queryKey: ['lead-stats'],
    queryFn: () => apiFetch('/api/leads/stats').then(d => d.data),
    refetchInterval: 60000,
  })

  const deleteMut = useMutation({
    mutationFn: (id) => apiFetch(`/api/leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Lead deleted') },
    onError: e => toast.error(e.message),
  })

  const bulkMut = useMutation({
    mutationFn: (payload) => apiFetch('/api/leads/bulk', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      setSelected([])
      toast.success(`${d.affected} leads updated`)
    },
    onError: e => toast.error(e.message),
  })

  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const leads = leadsData?.data || []
  const total = leadsData?.total || 0
  const pages = Math.ceil(total / LIMIT)
  const hasFilters = search || filters.status || filters.priority || filters.source
  const filterChange = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }
  const clearFilters = () => { setFilters({ status: '', priority: '', source: '' }); setSearch(''); setPage(1) }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{total} total lead{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.open(`${API}/api/leads/export`, '_blank')}>
                <Download className="w-4 h-4 mr-1.5" /> Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                <Upload className="w-4 h-4 mr-1.5" /> Import
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Lead
          </Button>
        </div>
      </div>

      <KpiBar stats={statsData} />

      {/* Bulk bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate({ action: 'archive', ids: selected })} disabled={bulkMut.isPending}>
              <Archive className="w-3.5 h-3.5 mr-1" /> Archive
            </Button>
            <Button size="sm" variant="destructive"
              onClick={() => { if (window.confirm(`Delete ${selected.length} lead(s)?`)) bulkMut.mutate({ action: 'delete', ids: selected }) }}
              disabled={bulkMut.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelected([])}><X className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, email, lead ID…" className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select value={filters.status || 'all'} onValueChange={v => filterChange('status', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.priority || 'all'} onValueChange={v => filterChange('priority', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.source || 'all'} onValueChange={v => filterChange('source', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {SOURCES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="w-4 h-4 mr-1" /> Clear</Button>}
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" className="rounded"
                    checked={leads.length > 0 && selected.length === leads.length}
                    onChange={() => setSelected(p => p.length === leads.length ? [] : leads.map(l => l._id))} />
                </th>
                {['Lead','Contact','Status','Priority','Source','Value','Assigned','Follow-up','Created',''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {[...Array(10)].map((_, j) => <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))}
              {!isLoading && !leads.length && (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{hasFilters ? 'No leads match your filters' : 'No leads yet'}</p>
                    {!hasFilters && <Button className="mt-3" size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" /> Add your first lead</Button>}
                  </td>
                </tr>
              )}
              {leads.map(lead => {
                const si = statusInfo(lead.status)
                const pi = priorityInfo(lead.priority)
                return (
                  <tr key={lead._id} className={cn('border-b border-border/50 hover:bg-muted/30 transition-colors', selected.includes(lead._id) && 'bg-primary/5')}>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="rounded" checked={selected.includes(lead._id)} onChange={() => toggleSelect(lead._id)} />
                    </td>
                    <td className="px-3 py-3 cursor-pointer" onClick={() => setDetailId(lead._id)}>
                      <p className="font-medium hover:text-primary transition-colors">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.company || lead.leadId || ''}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs">{lead.phone || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{lead.email || ''}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', si.color)}>{si.label}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('text-xs font-semibold', pi.color)}>{pi.label}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground capitalize">{lead.source?.replace(/_/g, ' ') || '—'}</td>
                    <td className="px-3 py-3 text-xs font-medium">{lead.value > 0 ? `₹${lead.value.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-3">
                      {lead.assignedTo?.length > 0 ? (
                        <div className="flex -space-x-1">
                          {lead.assignedTo.slice(0, 3).map(u => (
                            <Avatar key={u._id} className="w-5 h-5 border border-background" title={u.name}>
                              <AvatarFallback className="text-[8px] bg-primary/20 text-primary">{u.name?.[0]}</AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                    </td>
                    <td className="px-3 py-3">
                      {lead.followUpDate ? (
                        <span className={cn('text-xs flex items-center gap-1', new Date(lead.followUpDate) < new Date() ? 'text-destructive' : 'text-muted-foreground')}>
                          <Calendar className="w-3 h-3" />{format(new Date(lead.followUpDate), 'MMM d')}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(lead.createdAt), 'MMM d, yyyy')}</td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => setDetailId(lead._id)}><Eye className="w-4 h-4 mr-2" /> View Details</DropdownMenuItem>
                          {isManager && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive"
                                onClick={() => { if (window.confirm(`Delete "${lead.name}"?`)) deleteMut.mutate(lead._id) }}
                                disabled={deleteMut.isPending}
                              ><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                            </>
                          )}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">{total} leads</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm px-2">{page} / {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {showCreate && <CreateLeadDialog open onClose={() => setShowCreate(false)} />}
      {showImport && <ImportDialog open onClose={() => setShowImport(false)} />}
      {detailId && (
        <LeadDetailModal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          leadId={detailId}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['leads'] })}
        />
      )}
    </div>
  )
}
