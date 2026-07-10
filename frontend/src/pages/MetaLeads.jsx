import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Download, Facebook, Instagram, Search, Filter, X, MessageSquare, Calendar, User as UserIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'

const STATUS_VARIANTS = {
  new: 'info', contacted: 'secondary', follow_up: 'warning',
  qualified: 'purple', converted: 'success', lost: 'destructive',
}
const STATUS_LABELS = {
  new: 'New', contacted: 'Contacted', follow_up: 'Follow-Up',
  qualified: 'Qualified', converted: 'Converted', lost: 'Lost',
}
const PLATFORM_COLORS = {
  facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-400',
  unknown: 'bg-muted text-muted-foreground',
}
const STATUSES = ['new', 'contacted', 'follow_up', 'qualified', 'converted', 'lost']

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, loading }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        {loading ? <Skeleton className="h-8 w-16 mb-1" /> : (
          <p className={cn('text-2xl font-bold', color)}>{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Platform Badge ────────────────────────────────────────────────────────────
function PlatformBadge({ platform }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize', PLATFORM_COLORS[platform] || PLATFORM_COLORS.unknown)}>
      {platform === 'facebook' && <span className="font-bold">f</span>}
      {platform === 'instagram' && <span className="font-bold">ig</span>}
      {platform || 'Unknown'}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MetaLeads() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ platform: 'all', status: 'all', dateFrom: '', dateTo: '' })
  const [selectedLead, setSelectedLead] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showCampaignEdit, setShowCampaignEdit] = useState(null)

  // Queries
  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['meta-kpis'],
    queryFn: () => api.get('/meta/kpis').then(r => r.data.data),
    refetchInterval: 60000,
  })

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['meta-leads', page, search, filters],
    queryFn: () => api.get('/meta', {
      params: { page, limit: 15, search, ...filters },
    }).then(r => r.data),
    keepPreviousData: true,
  })

  const { data: campaignsData, isLoading: campaignLoading } = useQuery({
    queryKey: ['meta-campaigns'],
    queryFn: () => api.get('/meta/campaigns').then(r => r.data.data),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/meta/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['meta-leads'])
      queryClient.invalidateQueries(['meta-kpis'])
      toast.success('Lead updated')
      setEditMode(false)
      if (selectedLead) {
        api.get(`/meta/${selectedLead._id}`).then(r => setSelectedLead(r.data.data))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/meta/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['meta-leads'])
      queryClient.invalidateQueries(['meta-kpis'])
      toast.success('Lead deleted')
      setShowModal(false)
    },
  })

  const noteMutation = useMutation({
    mutationFn: ({ id, text }) => api.post(`/meta/${id}/notes`, { text }),
    onSuccess: (res) => {
      setNoteText('')
      const notes = res.data.data
      setSelectedLead(prev => ({ ...prev, notes }))
      queryClient.invalidateQueries(['meta-leads'])
      toast.success('Note added')
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post('/meta/sync'),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['meta-leads'])
      queryClient.invalidateQueries(['meta-kpis'])
      toast.success(res.data.message)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Sync failed'),
  })

  const addMutation = useMutation({
    mutationFn: (d) => api.post('/meta', d),
    onSuccess: () => {
      queryClient.invalidateQueries(['meta-leads'])
      queryClient.invalidateQueries(['meta-kpis'])
      toast.success('Lead added')
      setShowAddModal(false)
      addForm.reset()
    },
  })

  const campaignFinMutation = useMutation({
    mutationFn: (d) => api.post('/meta/campaigns/financials', d),
    onSuccess: () => {
      queryClient.invalidateQueries(['meta-campaigns'])
      toast.success('Campaign data updated')
      setShowCampaignEdit(null)
    },
  })

  const addForm = useForm()
  const editForm = useForm()

  const handleExport = () => {
    const params = new URLSearchParams({ ...filters }).toString()
    window.open(`/api/meta/export?${params}`, '_blank')
  }

  const openLead = async (lead) => {
    const res = await api.get(`/meta/${lead._id}`)
    setSelectedLead(res.data.data)
    editForm.reset({
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      assignedTo: lead.assignedTo?._id,
      followUpDate: lead.followUpDate ? format(new Date(lead.followUpDate), 'yyyy-MM-dd') : '',
    })
    setEditMode(false)
    setShowModal(true)
  }

  const handleFilterChange = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }))
    setPage(1)
  }

  const handleSearch = useCallback((v) => { setSearch(v); setPage(1) }, [])

  const leads = leadsData?.data || []
  const total = leadsData?.total || 0
  const pages = leadsData?.pages || 1
  const kpis = kpiData || {}

  return (
    <div>
      <PageHeader
        title="Meta Leads"
        description="Facebook & Instagram lead management"
        action={{ label: 'Add Lead', icon: Plus, onClick: () => { addForm.reset({ platform: 'facebook', status: 'new' }); setShowAddModal(true) } }}
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <KpiCard label="Total Leads" value={kpis.total ?? '—'} loading={kpiLoading} color="text-foreground" />
        <KpiCard label="Facebook" value={kpis.facebook ?? '—'} loading={kpiLoading} color="text-blue-600" />
        <KpiCard label="Instagram" value={kpis.instagram ?? '—'} loading={kpiLoading} color="text-pink-500" />
        <KpiCard label="New Today" value={kpis.today ?? '—'} loading={kpiLoading} color="text-indigo-500" />
        <KpiCard label="Qualified" value={kpis.qualified ?? '—'} loading={kpiLoading} color="text-purple-500" />
        <KpiCard label="Converted" value={kpis.converted ?? '—'} loading={kpiLoading} color="text-green-600" />
        <KpiCard label="Lost" value={kpis.lost ?? '—'} loading={kpiLoading} color="text-destructive" />
        <KpiCard label="Conv. Rate" value={kpis.conversionRate ? `${kpis.conversionRate}%` : '0%'} loading={kpiLoading} color="text-amber-500" />
      </div>

      <Tabs defaultValue="leads">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="leads">All Leads</TabsTrigger>
            <TabsTrigger value="analytics">Campaign Analytics</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={cn('w-4 h-4 mr-2', syncMutation.isPending && 'animate-spin')} />
              Sync from Meta
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />Export CSV
            </Button>
          </div>
        </div>

        {/* ── Leads Tab ── */}
        <TabsContent value="leads">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, phone, campaign..."
                className="pl-9"
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>
            <Select value={filters.platform} onValueChange={v => handleFilterChange('platform', v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={v => handleFilterChange('status', v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" className="w-36" value={filters.dateFrom} onChange={e => handleFilterChange('dateFrom', e.target.value)} placeholder="From" />
            <Input type="date" className="w-36" value={filters.dateTo} onChange={e => handleFilterChange('dateTo', e.target.value)} placeholder="To" />
            {(filters.platform !== 'all' || filters.status !== 'all' || filters.dateFrom || filters.dateTo || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilters({ platform: 'all', status: 'all', dateFrom: '', dateTo: '' }); setSearch(''); setPage(1) }}>
                <X className="w-4 h-4 mr-1" />Clear
              </Button>
            )}
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Lead', 'Platform', 'Campaign', 'Status', 'Assigned', 'Follow-Up', 'Received', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leadsLoading && [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))}
                  {!leadsLoading && leads.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-16 text-muted-foreground">No leads found</td></tr>
                  )}
                  {leads.map((lead) => (
                    <motion.tr
                      key={lead._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => openLead(lead)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{lead.fullName}</p>
                        <p className="text-xs text-muted-foreground">{lead.phone || lead.email || '—'}</p>
                      </td>
                      <td className="px-4 py-3"><PlatformBadge platform={lead.platform} /></td>
                      <td className="px-4 py-3">
                        <p className="text-sm max-w-[140px] truncate">{lead.campaignName || '—'}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{lead.adSetName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[lead.status]} className="capitalize">{STATUS_LABELS[lead.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={lead.assignedTo.avatar} />
                              <AvatarFallback className="text-[10px] bg-primary/10">{lead.assignedTo.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs">{lead.assignedTo.name}</span>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        {lead.followUpDate ? (
                          <span className={cn('text-xs', new Date(lead.followUpDate) < new Date() ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                            {format(new Date(lead.followUpDate), 'MMM d, yyyy')}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(lead.receivedAt), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(lead._id)}>✕</Button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">{total} leads</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <span className="text-sm">{page} / {pages}</span>
                  <Button variant="outline" size="sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Campaign Analytics Tab ── */}
        <TabsContent value="analytics">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Campaign Performance</CardTitle>
              <p className="text-xs text-muted-foreground">Click a row to update ad spend / revenue for ROI calculation</p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Campaign', 'Platform', 'Leads', 'Qualified', 'Converted', 'Conv. %', 'Ad Spend', 'CPL', 'Revenue', 'ROI'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaignLoading && [...Array(4)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[...Array(10)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))}
                  {!campaignLoading && (!campaignsData || campaignsData.length === 0) && (
                    <tr><td colSpan={10} className="text-center py-16 text-muted-foreground">No campaign data yet. Sync leads from Meta to populate.</td></tr>
                  )}
                  {(campaignsData || []).map(row => (
                    <tr
                      key={row._id || row.campaignName}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setShowCampaignEdit(row)}
                    >
                      <td className="px-4 py-3 font-medium max-w-[160px] truncate">{row.campaignName || '—'}</td>
                      <td className="px-4 py-3"><PlatformBadge platform={row.platform} /></td>
                      <td className="px-4 py-3 font-semibold">{row.totalLeads}</td>
                      <td className="px-4 py-3">{row.qualifiedLeads}</td>
                      <td className="px-4 py-3">{row.convertedLeads}</td>
                      <td className="px-4 py-3">{row.conversionRate}%</td>
                      <td className="px-4 py-3">₹{(row.adSpend || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">₹{row.costPerLead || 0}</td>
                      <td className="px-4 py-3">₹{(row.revenueGenerated || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={row.roi >= 0 ? 'text-green-600 font-medium' : 'text-destructive font-medium'}>{row.roi}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Lead Detail Modal ── */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) { setEditMode(false); setNoteText('') } }} >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          {selectedLead && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{selectedLead.fullName}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <PlatformBadge platform={selectedLead.platform} />
                      <Badge variant={STATUS_VARIANTS[selectedLead.status]}>{STATUS_LABELS[selectedLead.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(selectedLead.receivedAt), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  </div>
                  <Button variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode(e => !e)}>
                    {editMode ? 'Cancel' : 'Edit'}
                  </Button>
                </div>
              </DialogHeader>

              {editMode ? (
                <form onSubmit={editForm.handleSubmit((d) => updateMutation.mutate({ id: selectedLead._id, data: d }))} className="space-y-4 mt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Full Name</Label>
                      <Input {...editForm.register('fullName')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input {...editForm.register('phone')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input {...editForm.register('email')} type="email" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select onValueChange={v => editForm.setValue('status', v)} defaultValue={selectedLead.status}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Assign To</Label>
                      <Select onValueChange={v => editForm.setValue('assignedTo', v)} defaultValue={selectedLead.assignedTo?._id}>
                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                        <SelectContent>
                          {(usersData?.data || []).map(u => <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Follow-Up Date</Label>
                      <Input {...editForm.register('followUpDate')} type="date" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                    <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
                  </DialogFooter>
                </form>
              ) : (
                <div className="mt-2 space-y-4">
                  {/* Lead Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ['Phone', selectedLead.phone || '—'],
                      ['Email', selectedLead.email || '—'],
                      ['Campaign', selectedLead.campaignName || '—'],
                      ['Ad Set', selectedLead.adSetName || '—'],
                      ['Assigned To', selectedLead.assignedTo?.name || 'Unassigned'],
                      ['Follow-Up', selectedLead.followUpDate ? format(new Date(selectedLead.followUpDate), 'MMM d, yyyy') : '—'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Quick Status Update */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Update Status</p>
                    <div className="flex flex-wrap gap-2">
                      {STATUSES.map(s => (
                        <button
                          key={s}
                          onClick={() => updateMutation.mutate({ id: selectedLead._id, data: { status: s } })}
                          className={cn(
                            'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                            selectedLead.status === s
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                          )}
                        >{STATUS_LABELS[s]}</button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes ({selectedLead.notes?.length || 0})</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                      {(selectedLead.notes || []).length === 0 && (
                        <p className="text-sm text-muted-foreground">No notes yet.</p>
                      )}
                      {(selectedLead.notes || []).map((note, i) => (
                        <div key={i} className="bg-muted/40 rounded-lg p-3">
                          <p className="text-sm">{note.text}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {note.createdBy?.name || 'Unknown'} · {format(new Date(note.createdAt), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a note..."
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && noteText.trim()) noteMutation.mutate({ id: selectedLead._id, text: noteText }) }}
                      />
                      <Button size="sm" disabled={!noteText.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate({ id: selectedLead._id, text: noteText })}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Lead Modal ── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Add Lead Manually</DialogTitle></DialogHeader>
          <form onSubmit={addForm.handleSubmit(d => addMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Full Name *</Label>
                <Input {...addForm.register('fullName', { required: true })} placeholder="John Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...addForm.register('phone')} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...addForm.register('email')} type="email" placeholder="john@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select onValueChange={v => addForm.setValue('platform', v)} defaultValue="facebook">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select onValueChange={v => addForm.setValue('status', v)} defaultValue="new">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Campaign Name</Label>
                <Input {...addForm.register('campaignName')} placeholder="Campaign name" />
              </div>
              <div className="space-y-1.5">
                <Label>Ad Set Name</Label>
                <Input {...addForm.register('adSetName')} placeholder="Ad set name" />
              </div>
              <div className="space-y-1.5">
                <Label>Follow-Up Date</Label>
                <Input {...addForm.register('followUpDate')} type="date" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending}>Add Lead</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Campaign Financial Edit Modal ── */}
      <Dialog open={!!showCampaignEdit} onOpenChange={() => setShowCampaignEdit(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Update Campaign Financials</DialogTitle></DialogHeader>
          {showCampaignEdit && (
            <CampaignEditForm campaign={showCampaignEdit} onSave={d => campaignFinMutation.mutate(d)} loading={campaignFinMutation.isPending} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CampaignEditForm({ campaign, onSave, loading }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      campaignId: campaign._id || campaign.campaignName,
      campaignName: campaign.campaignName,
      platform: campaign.platform,
      adSpend: campaign.adSpend || 0,
      revenueGenerated: campaign.revenueGenerated || 0,
    }
  })
  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      <p className="text-sm font-medium">{campaign.campaignName}</p>
      <div className="space-y-1.5">
        <Label>Ad Spend (₹)</Label>
        <Input {...register('adSpend', { valueAsNumber: true })} type="number" />
      </div>
      <div className="space-y-1.5">
        <Label>Revenue Generated (₹)</Label>
        <Input {...register('revenueGenerated', { valueAsNumber: true })} type="number" />
      </div>
      <input type="hidden" {...register('campaignId')} />
      <input type="hidden" {...register('campaignName')} />
      <input type="hidden" {...register('platform')} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>Save</Button>
      </DialogFooter>
    </form>
  )
}
