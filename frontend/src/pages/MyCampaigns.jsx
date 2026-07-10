import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  Briefcase, Users, ListChecks, FileCheck2, UploadCloud, MessageSquarePlus,
  Megaphone, ClipboardList, StickyNote, Paperclip, Plus,
} from 'lucide-react'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const ADMIN_ROLES = ['super_admin', 'admin', 'manager']
const STATUS_VARIANTS = { draft: 'secondary', active: 'success', paused: 'warning', completed: 'info', cancelled: 'destructive' }
const TASK_STATUS_VARIANTS = { pending: 'secondary', in_progress: 'info', review: 'warning', completed: 'success' }
const LEAD_STATUS_VARIANTS = { won: 'success', lost: 'destructive', new_lead: 'secondary' }
const SOP_STATUS_VARIANTS = { not_started: 'secondary', in_progress: 'info', awaiting_review: 'warning', completed: 'success', overdue: 'destructive', archived: 'secondary' }

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'
}

export default function MyCampaigns() {
  const { user } = useAuth()
  const isAdmin = ADMIN_ROLES.includes(user?.role)
  const queryClient = useQueryClient()
  const [panel, setPanel] = useState(null) // { campaign, mode }
  const [noteText, setNoteText] = useState('')
  const [assetForm, setAssetForm] = useState({ name: '', fileUrl: '', fileType: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['my-campaigns'],
    queryFn: () => api.get('/campaigns/my').then(r => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const campaigns = data?.data || []
  // Keep the panel's campaign reference live so newly-added notes/assets
  // show up immediately after a refetch.
  const liveCampaign = panel ? (campaigns.find(c => c._id === panel.campaign._id) || panel.campaign) : null

  const subQuery = useQuery({
    queryKey: ['campaign-workspace', panel?.mode, panel?.campaign?._id],
    queryFn: () => api.get(`/campaigns/${panel.campaign._id}/${panel.mode}`).then(r => r.data),
    enabled: !!panel && ['leads', 'tasks', 'sop-assignments'].includes(panel.mode),
  })

  const addNoteMutation = useMutation({
    mutationFn: ({ id, text }) => api.post(`/campaigns/${id}/notes`, { text }),
    onSuccess: () => { queryClient.invalidateQueries(['my-campaigns']); setNoteText(''); toast.success('Note added') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Could not add note'),
  })

  const addAssetMutation = useMutation({
    mutationFn: ({ id, asset }) => api.post(`/campaigns/${id}/assets`, asset),
    onSuccess: () => { queryClient.invalidateQueries(['my-campaigns']); setAssetForm({ name: '', fileUrl: '', fileType: '' }); toast.success('Creative uploaded') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Could not upload creative'),
  })

  const openPanel = (campaign, mode) => setPanel({ campaign, mode })
  const closePanel = () => { setPanel(null); setNoteText(''); setAssetForm({ name: '', fileUrl: '', fileType: '' }) }

  const headerDescription = isAdmin
    ? 'Every active campaign — as Admin/Super Admin/Manager you have full visibility and access here'
    : 'Your assigned workspace — campaigns an Admin or Super Admin added you to'

  if (isLoading) {
    return (
      <div>
        <PageHeader title="My Campaigns" description={headerDescription} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="My Campaigns" description={headerDescription} />

      {campaigns.length === 0 ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <Briefcase className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">{isAdmin ? 'No active campaigns yet' : 'No campaigns assigned yet'}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isAdmin
                  ? 'Create a campaign to get started.'
                  : 'Visit the Campaigns page to see all agency campaigns, or contact your Admin to get assigned.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Card key={c._id} className="flex flex-col">
              <CardContent className="p-5 flex flex-col gap-4 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.type?.replace(/_/g, ' ')}</p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[c.status] || 'secondary'} className="capitalize shrink-0">{c.status}</Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.client?.companyName || '—'}</span>
                  {c.myRole && <Badge variant="purple">{c.myRole}</Badge>}
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold">{c.dueTasksCount ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground">Due Tasks</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{c.assignedLeadsCount ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground">My Leads</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{c.sopProgress ?? '—'}{c.sopProgress != null ? '%' : ''}</p>
                    <p className="text-[11px] text-muted-foreground">SOP Progress</p>
                  </div>
                </div>
                {c.sopProgress != null && <Progress value={c.sopProgress} className="h-1.5" />}

                <div className="mt-auto pt-2 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => openPanel(c, 'leads')}>
                    <Users className="w-3.5 h-3.5" /> Leads
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => openPanel(c, 'tasks')}>
                    <ListChecks className="w-3.5 h-3.5" /> Tasks
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => openPanel(c, 'sop-assignments')}>
                    <FileCheck2 className="w-3.5 h-3.5" /> SOPs
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start" onClick={() => openPanel(c, 'assets')}>
                    <UploadCloud className="w-3.5 h-3.5" /> Creatives
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 justify-start col-span-2" onClick={() => openPanel(c, 'notes')}>
                    <MessageSquarePlus className="w-3.5 h-3.5" /> Notes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Workspace panel — Leads / Tasks / SOPs / Creatives / Notes */}
      <Dialog open={!!panel} onOpenChange={(o) => !o && closePanel()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" /> {liveCampaign?.name}
            </DialogTitle>
          </DialogHeader>

          {panel?.mode === 'leads' && (
            <div className="space-y-2">
              {subQuery.isLoading ? <Skeleton className="h-20 w-full" /> : subQuery.data?.data?.length ? subQuery.data.data.map(l => (
                <div key={l._id} className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.company || l.email || '—'}</p>
                  </div>
                  <Badge variant={LEAD_STATUS_VARIANTS[l.status] || 'info'} className="capitalize">{l.status?.replace(/_/g, ' ')}</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground text-center py-8">No leads assigned to you on this campaign.</p>}
            </div>
          )}

          {panel?.mode === 'tasks' && (
            <div className="space-y-2">
              {subQuery.isLoading ? <Skeleton className="h-20 w-full" /> : subQuery.data?.data?.length ? subQuery.data.data.map(t => (
                <div key={t._id} className="flex items-center justify-between p-2.5 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.dueDate ? format(new Date(t.dueDate), 'MMM d, yyyy') : 'No due date'}</p>
                  </div>
                  <Badge variant={TASK_STATUS_VARIANTS[t.status] || 'secondary'} className="capitalize">{t.status?.replace(/_/g, ' ')}</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground text-center py-8">No tasks assigned to you on this campaign.</p>}
            </div>
          )}

          {panel?.mode === 'sop-assignments' && (
            <div className="space-y-2">
              {subQuery.isLoading ? <Skeleton className="h-20 w-full" /> : subQuery.data?.data?.length ? subQuery.data.data.map(s => (
                <div key={s._id} className="p-2.5 rounded-lg border border-border space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> {s.sopTitle}</p>
                    <Badge variant={SOP_STATUS_VARIANTS[s.status] || 'secondary'} className="capitalize">{s.status?.replace(/_/g, ' ')}</Badge>
                  </div>
                  <Progress value={s.progress || 0} className="h-1.5" />
                </div>
              )) : <p className="text-sm text-muted-foreground text-center py-8">No SOPs assigned to you on this campaign.</p>}
            </div>
          )}

          {panel?.mode === 'assets' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {liveCampaign?.assets?.length ? liveCampaign.assets.map((a, i) => (
                  <a key={a._id || i} href={a.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/40">
                    <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.name || a.fileUrl}</p>
                      <p className="text-xs text-muted-foreground">{a.fileType || 'file'} · {a.uploadedAt ? format(new Date(a.uploadedAt), 'MMM d, yyyy') : ''}</p>
                    </div>
                  </a>
                )) : <p className="text-sm text-muted-foreground text-center py-4">No creative assets uploaded yet.</p>}
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Upload a creative (name + link)</Label>
                <Input placeholder="Asset name" value={assetForm.name} onChange={(e) => setAssetForm(f => ({ ...f, name: e.target.value }))} />
                <Input placeholder="File URL" value={assetForm.fileUrl} onChange={(e) => setAssetForm(f => ({ ...f, fileUrl: e.target.value }))} />
                <Input placeholder="File type (e.g. image, video, pdf)" value={assetForm.fileType} onChange={(e) => setAssetForm(f => ({ ...f, fileType: e.target.value }))} />
                <Button
                  size="sm" className="gap-1.5"
                  disabled={!assetForm.name || !assetForm.fileUrl || addAssetMutation.isPending}
                  onClick={() => addAssetMutation.mutate({ id: liveCampaign._id, asset: assetForm })}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Creative
                </Button>
              </div>
            </div>
          )}

          {panel?.mode === 'notes' && (
            <div className="space-y-4">
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {liveCampaign?.notes?.length ? liveCampaign.notes.map((n, i) => (
                  <div key={n._id || i} className="flex gap-2.5 p-2.5 rounded-lg border border-border">
                    <Avatar className="h-7 w-7 shrink-0"><AvatarFallback className="text-[10px]">{initials(n.author?.name)}</AvatarFallback></Avatar>
                    <div className="min-w-0">
                      <p className="text-sm">{n.text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.createdAt ? format(new Date(n.createdAt), 'MMM d, yyyy · h:mm a') : ''}</p>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center py-4 flex items-center justify-center gap-1.5"><StickyNote className="w-4 h-4" /> No notes yet.</p>}
              </div>
              <Separator />
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Add a note for the team..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!noteText.trim() || addNoteMutation.isPending}
                  onClick={() => addNoteMutation.mutate({ id: liveCampaign._id, text: noteText.trim() })}
                >
                  Post
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePanel}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
