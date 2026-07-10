import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Megaphone, Copy, Archive, Lock, ShieldAlert, ArrowUpRight } from 'lucide-react'
import api from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import PageHeader from '@/components/common/PageHeader'
import DataTable from '@/components/common/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const STATUS_VARIANTS = { draft: 'secondary', active: 'success', paused: 'warning', completed: 'info', cancelled: 'destructive' }
const CAMPAIGN_TYPES = ['google_ads', 'facebook_ads', 'instagram_ads', 'seo', 'email_marketing', 'whatsapp_marketing', 'sms_marketing', 'linkedin', 'youtube_ads', 'social_media']
const ADMIN_ROLES = ['super_admin', 'admin', 'manager']

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'
}

function TeamAvatars({ team }) {
  if (!team?.length) return <span className="text-muted-foreground text-xs">Unassigned</span>
  const shown = team.slice(0, 3)
  const extra = team.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((t, i) => (
        <Avatar key={t.user?._id || i} className="h-7 w-7 border-2 border-background" title={`${t.user?.name || 'Unknown'}${t.role ? ' — ' + t.role : ''}`}>
          <AvatarFallback className="text-[10px]">{initials(t.user?.name)}</AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  )
}

export default function Campaigns() {
  const navigate = useNavigate()
  const { isRole } = useAuth()
  const isAdmin = isRole(...ADMIN_ROLES)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editCampaign, setEditCampaign] = useState(null)
  const [team, setTeam] = useState([]) // [{ user, name, role }]
  const [viewCampaign, setViewCampaign] = useState(null)
  const [blockedCampaign, setBlockedCampaign] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', page, search],
    queryFn: () => api.get('/campaigns', { params: { page, limit: 10, search } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { limit: 100 } }).then(r => r.data),
    enabled: isAdmin,
  })

  const { data: usersData } = useQuery({
    queryKey: ['users-list-assignable'],
    queryFn: () => api.get('/users', { params: { limit: 200 } }).then(r => r.data),
    enabled: isAdmin,
  })
  const assignableUsers = (usersData?.data || []).filter(u => !['super_admin', 'admin'].includes(u.role) && u.isActive !== false)

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm()

  const mutation = useMutation({
    mutationFn: (d) => {
      const payload = { ...d, assignedTeam: team.map(({ user, role }) => ({ user, role })) }
      return editCampaign ? api.put(`/campaigns/${editCampaign._id}`, payload) : api.post('/campaigns', payload)
    },
    onSuccess: () => { queryClient.invalidateQueries(['campaigns']); toast.success(editCampaign ? 'Campaign updated' : 'Campaign created'); setShowModal(false); reset(); setTeam([]) },
    onError: (err) => toast.error(err?.response?.data?.message || 'Something went wrong'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id) => api.post(`/campaigns/${id}/duplicate`),
    onSuccess: () => { queryClient.invalidateQueries(['campaigns']); toast.success('Campaign duplicated') },
  })

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/campaigns/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries(['campaigns']); toast.success('Campaign archived') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/campaigns/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['campaigns']); toast.success('Campaign deleted') },
  })

  const toDateInput = (v) => v ? format(new Date(v), 'yyyy-MM-dd') : ''

  const openEdit = (c) => {
    setEditCampaign(c)
    reset({ ...c, client: c.client?._id, startDate: toDateInput(c.startDate), endDate: toDateInput(c.endDate) })
    setTeam((c.assignedTeam || []).map(t => ({ user: t.user?._id, name: t.user?.name, role: t.role || '' })))
    setShowModal(true)
  }

  const openCreate = () => {
    setEditCampaign(null)
    reset({})
    setTeam([])
    setShowModal(true)
  }

  // Employees/viewers: "opening" a campaign either shows the read-only
  // overview (if Admin/Super Admin assigned them) or a blocked message
  // (if it's view-only visibility for them).
  const openRow = (row) => {
    if (isAdmin) return openEdit(row)
    if (row.accessType === 'ASSIGNED') setViewCampaign(row)
    else setBlockedCampaign(row)
  }

  const toggleTeamMember = (u, checked) => {
    setTeam(prev => checked ? [...prev, { user: u._id, name: u.name, role: '' }] : prev.filter(t => t.user !== u._id))
  }
  const setTeamRole = (userId, role) => setTeam(prev => prev.map(t => t.user === userId ? { ...t, role } : t))

  const columns = [
    { key: 'name', label: 'Campaign', sortable: true, render: (v, row) => (
      <button type="button" onClick={() => openRow(row)} className="text-left hover:underline">
        <p className="font-medium">{v}</p>
        <p className="text-xs text-muted-foreground capitalize">{row.type?.replace(/_/g, ' ')}</p>
      </button>
    )},
    { key: 'client', label: 'Client', render: (v) => v?.companyName || '—' },
    { key: 'status', label: 'Status', render: (v) => <Badge variant={STATUS_VARIANTS[v] || 'secondary'} className="capitalize">{v}</Badge> },
    { key: 'startDate', label: 'Dates', render: (v, row) => (
      <div className="text-xs">
        <div>{v ? format(new Date(v), 'MMM d') : '—'}</div>
        <div className="text-muted-foreground">{row.endDate ? format(new Date(row.endDate), 'MMM d, yyyy') : '—'}</div>
      </div>
    )},
    { key: 'assignedTeam', label: 'Assigned Team', render: (v) => <TeamAvatars team={v} /> },
    { key: 'analytics', label: 'Performance', render: (v) => v && (v.leadsGenerated || v.conversions) ? (
      <div className="text-xs">
        <div>{v.leadsGenerated || 0} leads</div>
        <div className="text-muted-foreground">{v.conversionRate || 0}% CVR</div>
      </div>
    ) : <span className="text-muted-foreground text-xs">—</span> },
  ]

  if (isAdmin) {
    columns.push(
      { key: 'budget', label: 'Budget', render: (v, row) => (
        <div className="min-w-[120px]">
          <div className="flex justify-between text-xs mb-1">
            <span>₹{(row.spend || 0).toLocaleString()}</span>
            <span className="text-muted-foreground">₹{(v || 0).toLocaleString()}</span>
          </div>
          <Progress value={v > 0 ? (row.spend / v) * 100 : 0} className="h-1.5" />
        </div>
      )},
      { key: 'roi', label: 'ROI', render: (v) => v ? <span className={v >= 0 ? 'text-green-600' : 'text-red-500'}>{v}%</span> : '—' },
    )
  } else {
    columns.push({ key: 'accessType', label: 'Access', render: (v) => v === 'ASSIGNED'
      ? <Badge variant="success">🟢 Assigned</Badge>
      : <Badge variant="secondary">🔒 View Only</Badge>
    })
  }

  if (isAdmin) {
    columns.push({ key: '_id', label: '', render: (_, row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">•••</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => duplicateMutation.mutate(row._id)}><Copy className="w-4 h-4 mr-2" />Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => archiveMutation.mutate(row._id)}><Archive className="w-4 h-4 mr-2" />Archive</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(row._id)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )})
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description={isAdmin ? 'Manage your marketing campaigns' : 'View all agency campaigns — work happens in My Campaigns'}
        action={isAdmin ? { label: 'New Campaign', icon: Plus, onClick: openCreate } : undefined}
      />

      <DataTable
        columns={columns} data={data?.data} loading={isLoading}
        searchable searchPlaceholder="Search campaigns..."
        onSearch={useCallback((v) => { setSearch(v); setPage(1) }, [])}
        pagination={data ? { page, limit: 10, total: data.total, onChange: setPage } : undefined}
      />

      {/* Create / Edit — Admin, Super Admin, Manager only */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editCampaign ? 'Edit Campaign' : 'New Campaign'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Campaign Name *</Label>
                <Input {...register('name', { required: true })} placeholder="Q1 Brand Awareness" />
              </div>
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select onValueChange={(v) => setValue('client', v)} defaultValue={editCampaign?.client?._id}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clientsData?.data?.map(c => <SelectItem key={c._id} value={c._id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Platform *</Label>
                <Select onValueChange={(v) => setValue('type', v)} defaultValue={editCampaign?.type}>
                  <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Objective</Label>
                <Input {...register('objectives')} placeholder="Increase brand awareness, generate 100 leads..." />
              </div>
              <div className="space-y-1.5">
                <Label>Budget (₹)</Label>
                <Input {...register('budget', { valueAsNumber: true })} type="number" placeholder="10000" />
              </div>
              <div className="space-y-1.5">
                <Label>Spend (₹)</Label>
                <Input {...register('spend', { valueAsNumber: true })} type="number" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input {...register('startDate')} type="date" />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input {...register('endDate')} type="date" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select onValueChange={(v) => setValue('status', v)} defaultValue={editCampaign?.status || 'draft'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['draft', 'active', 'paused', 'completed', 'cancelled'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ROI (%)</Label>
                <Input {...register('roi', { valueAsNumber: true })} type="number" placeholder="0" />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Assign Team</Label>
              <p className="text-xs text-muted-foreground">
                Only checked employees get work access (My Campaigns). Everyone else still sees this campaign read-only.
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {assignableUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">No employees found.</p>
                )}
                {assignableUsers.map(u => {
                  const entry = team.find(t => t.user === u._id)
                  return (
                    <div key={u._id} className="flex items-center gap-3 p-2.5">
                      <input
                        type="checkbox"
                        checked={!!entry}
                        onChange={(e) => toggleTeamMember(u, e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary shrink-0"
                      />
                      <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{initials(u.name)}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground capitalize truncate">{u.role?.replace(/_/g, ' ')}</p>
                      </div>
                      {entry && (
                        <Input
                          value={entry.role}
                          onChange={(e) => setTeamRole(u._id, e.target.value)}
                          placeholder="Role e.g. Media Buyer"
                          className="h-8 w-44 text-xs shrink-0"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{editCampaign ? 'Update' : 'Create'} Campaign</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Read-only campaign overview — Employees/Viewers with work access */}
      <Dialog open={!!viewCampaign} onOpenChange={(o) => !o && setViewCampaign(null)}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" /> {viewCampaign?.name}
            </DialogTitle>
          </DialogHeader>
          {viewCampaign && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Client</p><p className="font-medium">{viewCampaign.client?.companyName || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Platform</p><p className="font-medium capitalize">{viewCampaign.type?.replace(/_/g, ' ')}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={STATUS_VARIANTS[viewCampaign.status] || 'secondary'} className="capitalize">{viewCampaign.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Dates</p><p className="font-medium">{viewCampaign.startDate ? format(new Date(viewCampaign.startDate), 'MMM d, yyyy') : '—'} – {viewCampaign.endDate ? format(new Date(viewCampaign.endDate), 'MMM d, yyyy') : '—'}</p></div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Overview</p>
                <p>{viewCampaign.objectives || viewCampaign.description || 'No overview provided.'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Assigned Team</p>
                <TeamAvatars team={viewCampaign.assignedTeam} />
              </div>
              {viewCampaign.analytics && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">High-Level Performance Summary</p>
                  <div className="flex gap-4 text-xs">
                    <span>{viewCampaign.analytics.leadsGenerated || 0} leads</span>
                    <span>{viewCampaign.analytics.conversions || 0} conversions</span>
                    <span>{viewCampaign.analytics.conversionRate || 0}% CVR</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewCampaign(null)}>Close</Button>
                <Button onClick={() => navigate('/my-campaigns')} className="gap-1.5">
                  Open in My Campaigns <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Blocked message — Employees/Viewers without work access */}
      <Dialog open={!!blockedCampaign} onOpenChange={(o) => !o && setBlockedCampaign(null)}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> {blockedCampaign?.name}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              You don't have access to work on this campaign. Please contact your Admin if access is required.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockedCampaign(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
