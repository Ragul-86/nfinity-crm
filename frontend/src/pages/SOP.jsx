import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, BookOpen, Bookmark, Eye, Copy, Archive, ArchiveRestore, UserPlus,
  Search, Download, ChevronDown, ChevronRight, CheckSquare,
  Square, Clock, Tag, X, MoreVertical, Layers, AlertCircle,
  Megaphone, Linkedin, Settings2, ArrowUp, ArrowDown, Trash2, MessageSquare,
  Reply, Pencil, CheckCircle2, Send, History, GitCompare, RotateCcw,
  UserCog, ClipboardCheck, ShieldCheck, XCircle, Activity as ActivityIcon, AtSign, RefreshCcw,
} from 'lucide-react'
import api from '@/services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'

const DEPARTMENTS = [
  { value: 'marketing',      label: 'Marketing',        color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { value: 'sales',          label: 'Sales',            color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'operations',     label: 'Operations',       color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { value: 'hr',             label: 'HR',               color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { value: 'technical',      label: 'Analytics',        color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { value: 'finance',        label: 'Finance',          color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  { value: 'client_success', label: 'Account Mgmt',     color: 'bg-green-500/10 text-green-400 border-green-500/30' },
]

const DEPT_MAP = Object.fromEntries(DEPARTMENTS.map(d => [d.value, d]))

export default function SOP() {
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sopTypeTab, setSopTypeTab] = useState('performance_marketing')
  const [activeTab, setActiveTab] = useState('library')
  const [viewSOP, setViewSOP] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createType, setCreateType] = useState('performance_marketing')
  const [editSOP, setEditSOP] = useState(null)
  const [assignSOP, setAssignSOP] = useState(null)
  const [manageAssignmentId, setManageAssignmentId] = useState(null)
  const [versionHistorySOP, setVersionHistorySOP] = useState(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // ── Queries ──────────────────────────────────────────────────────────────
  const SOP_REFRESH_MS = 30_000

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['sop', 'performance_marketing', search, deptFilter],
    queryFn: () => api.get('/sop', { params: { search, department: deptFilter || undefined, sopType: 'performance_marketing', limit: 100 } }).then(r => r.data),
    refetchInterval: SOP_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const { data: linkedinData, isLoading: linkedinLoading } = useQuery({
    queryKey: ['sop', 'linkedin'],
    queryFn: () => api.get('/sop', { params: { sopType: 'linkedin', limit: 100 } }).then(r => r.data),
    enabled: sopTypeTab === 'linkedin',
    refetchInterval: SOP_REFRESH_MS,
  })

  const { data: myAssignments } = useQuery({
    queryKey: ['sop-assignments'],
    queryFn: () => api.get('/sop/assignments').then(r => r.data),
    refetchInterval: SOP_REFRESH_MS,
  })

  const { data: statsData } = useQuery({
    queryKey: ['sop-stats'],
    queryFn: () => api.get('/sop/stats').then(r => r.data.data),
    refetchInterval: SOP_REFRESH_MS,
  })

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data.data),
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const seedMutation = useMutation({
    mutationFn: () => api.post('/sop/seed-templates'),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['sop'])
      toast.success(res.data.message || '10 templates loaded!')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Seed failed'),
  })

  const bookmarkMutation = useMutation({
    mutationFn: (id) => api.put(`/sop/${id}/bookmark`),
    onSuccess: () => queryClient.invalidateQueries(['sop']),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id) => api.post(`/sop/${id}/duplicate`),
    onSuccess: () => { queryClient.invalidateQueries(['sop']); toast.success('SOP duplicated') },
  })

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/sop/${id}/archive`),
    onSuccess: () => { queryClient.invalidateQueries(['sop']); toast.success('SOP archived') },
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => api.put(`/sop/${id}/restore`),
    onSuccess: () => { queryClient.invalidateQueries(['sop']); toast.success('SOP restored') },
    onError: (err) => toast.error(err.response?.data?.message || 'Restore failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/sop/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['sop']); toast.success('SOP deleted') },
  })

  const allSOPs = data?.data || []
  const linkedinSOPs = linkedinData?.data || []
  const filterArchived = (list) => list.filter(s => showArchived ? s.status === 'archived' : s.status !== 'archived')
  const visibleSOPs = filterArchived(allSOPs)
  const visibleLinkedinSOPs = filterArchived(linkedinSOPs)
  const currentSOPs = sopTypeTab === 'linkedin' ? visibleLinkedinSOPs : visibleSOPs
  const bookmarked = visibleSOPs.filter(s => s.bookmarkedBy?.includes(user?._id))
  const assignments = myAssignments?.data || []

  const totalItems = (sop) => sop.days?.reduce((a, d) => a + (d.items?.length || 0), 0) || 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">SOP Management</h1>
          <p className="text-sm text-muted-foreground">Standard Operating Procedures for your agency</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {sopTypeTab === 'performance_marketing' ? (
            <>
              {allSOPs.length === 0 && (
                <Button
                  variant="outline"
                  className="gap-2 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  <Download className="w-4 h-4" />
                  {seedMutation.isPending ? 'Loading...' : 'Load 10 Templates'}
                </Button>
              )}
              <Button className="gap-2" onClick={() => { setEditSOP(null); setCreateType('performance_marketing'); setShowCreate(true) }}>
                <Plus className="w-4 h-4" />Create SOP
              </Button>
            </>
          ) : (
            <Button
              className="gap-2 bg-[#0A66C2] hover:bg-[#004182] text-white"
              onClick={() => { setEditSOP(null); setCreateType('linkedin'); setShowCreate(true) }}
            >
              <Plus className="w-4 h-4" />Create LinkedIn SOP
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {statsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total SOPs', value: statsData.totalSOPs ?? currentSOPs.length, color: 'text-foreground' },
            { label: 'Active SOPs', value: statsData.active || 0, color: 'text-blue-400' },
            { label: 'Completed SOPs', value: statsData.completed || 0, color: 'text-green-400' },
            { label: 'Overdue SOPs', value: statsData.overdue || 0, color: 'text-red-400' },
            { label: 'Completion Rate', value: `${statsData.completionRate || 0}%`, color: 'text-purple-400' },
            { label: 'My Assigned SOPs', value: statsData.myAssignedSOPs || 0, color: 'text-cyan-400' },
            { label: 'Awaiting Review', value: statsData.awaitingReview || 0, color: 'text-amber-400' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recently Updated SOPs widget */}
      {statsData?.recentlyUpdated?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recently Updated SOPs</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/60">
              {statsData.recentlyUpdated.map(s => (
                <div key={s._id} className="flex items-center gap-3 py-2 text-sm">
                  {s.sopType === 'linkedin'
                    ? <Linkedin className="w-3.5 h-3.5 text-[#0A66C2] shrink-0" />
                    : <Megaphone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  }
                  <span className="flex-1 min-w-0 truncate">{s.title}</span>
                  <span className={cn(
                    'text-[10px] px-2 py-0.5 rounded font-medium capitalize shrink-0',
                    s.status === 'archived' ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-400'
                  )}>{s.status}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={sopTypeTab} onValueChange={setSopTypeTab}>
        <TabsList>
          <TabsTrigger value="performance_marketing" className="gap-1.5">
            <Megaphone className="w-3.5 h-3.5" />Performance Marketing SOPs
          </TabsTrigger>
          <TabsTrigger value="linkedin" className="gap-1.5">
            <Linkedin className="w-3.5 h-3.5" />LinkedIn SOPs
          </TabsTrigger>
        </TabsList>

        {/* ── PERFORMANCE MARKETING SOPS ── */}
        <TabsContent value="performance_marketing" className="mt-4">
          <motion.div
            key="performance_marketing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="library">Library ({visibleSOPs.length})</TabsTrigger>
          <TabsTrigger value="assignments">
            My Assignments
            {assignments.filter(a => a.status !== 'completed').length > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                {assignments.filter(a => a.status !== 'completed').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="bookmarks">Bookmarked ({bookmarked.length})</TabsTrigger>
        </TabsList>

        {/* ── LIBRARY ── */}
        <TabsContent value="library" className="mt-4">
          {/* Filters */}
          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search SOPs..."
                className="pl-8 h-8 w-52"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant={!deptFilter ? 'default' : 'outline'}
              size="sm" className="h-8"
              onClick={() => setDeptFilter('')}
            >All</Button>
            {DEPARTMENTS.map(d => (
              <Button
                key={d.value}
                variant={deptFilter === d.value ? 'default' : 'outline'}
                size="sm" className="h-8"
                onClick={() => setDeptFilter(deptFilter === d.value ? '' : d.value)}
              >{d.label}</Button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant={!showArchived ? 'default' : 'outline'}
                size="sm" className="h-8"
                onClick={() => setShowArchived(false)}
              >Active</Button>
              <Button
                variant={showArchived ? 'default' : 'outline'}
                size="sm" className="h-8 gap-1.5"
                onClick={() => setShowArchived(true)}
              ><Archive className="w-3.5 h-3.5" />Archived</Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
            </div>
          ) : visibleSOPs.length === 0 ? (
            showArchived ? (
              <div className="text-center py-20 text-muted-foreground">
                <Archive className="w-14 h-14 mx-auto mb-4 opacity-20" />
                <p className="font-semibold text-lg mb-1">No archived SOPs</p>
                <p className="text-sm">SOPs you archive will show up here.</p>
              </div>
            ) : (
              <div className="text-center py-20">
                <BookOpen className="w-14 h-14 mx-auto mb-4 opacity-20" />
                <p className="font-semibold text-lg mb-1">No SOPs yet</p>
                <p className="text-sm text-muted-foreground mb-5">Load the 10 prebuilt agency templates or create your own.</p>
                <Button
                  className="gap-2"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  <Download className="w-4 h-4" />
                  {seedMutation.isPending ? 'Loading templates...' : 'Load 10 Agency Templates'}
                </Button>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleSOPs.map((sop, i) => (
                <SOPCard
                  key={sop._id}
                  sop={sop}
                  userId={user?._id}
                  totalItems={totalItems(sop)}
                  onView={() => setViewSOP(sop)}
                  onEdit={() => { setEditSOP(sop); setShowCreate(true) }}
                  onBookmark={() => bookmarkMutation.mutate(sop._id)}
                  onDuplicate={() => duplicateMutation.mutate(sop._id)}
                  onArchive={() => archiveMutation.mutate(sop._id)}
                  onRestore={() => restoreMutation.mutate(sop._id)}
                  onAssign={() => setAssignSOP(sop)}
                  onDelete={() => { if (confirm('Delete this SOP?')) deleteMutation.mutate(sop._id) }}
                  onVersionHistory={() => setVersionHistorySOP(sop)}
                  index={i}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ASSIGNMENTS ── */}
        <TabsContent value="assignments" className="mt-4">
          {assignments.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No assignments yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map(a => (
                <AssignmentRow key={a._id} assignment={a} onManage={() => setManageAssignmentId(a._id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── BOOKMARKS ── */}
        <TabsContent value="bookmarks" className="mt-4">
          {bookmarked.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No bookmarks yet — click the bookmark icon on any SOP</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookmarked.map((sop, i) => (
                <SOPCard
                  key={sop._id} sop={sop} userId={user?._id}
                  totalItems={totalItems(sop)}
                  onView={() => setViewSOP(sop)}
                  onBookmark={() => bookmarkMutation.mutate(sop._id)}
                  onDuplicate={() => duplicateMutation.mutate(sop._id)}
                  onArchive={() => archiveMutation.mutate(sop._id)}
                  onRestore={() => restoreMutation.mutate(sop._id)}
                  onAssign={() => setAssignSOP(sop)}
                  onVersionHistory={() => setVersionHistorySOP(sop)}
                  index={i}
                />
              ))}
            </div>
          )}
        </TabsContent>
          </Tabs>
          </motion.div>
        </TabsContent>

        {/* ── LINKEDIN SOPS ── */}
        <TabsContent value="linkedin" className="mt-4">
          <motion.div
            key="linkedin"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {!linkedinLoading && linkedinSOPs.length > 0 && (
              <div className="flex items-center gap-1 mb-4 justify-end">
                <Button
                  variant={!showArchived ? 'default' : 'outline'}
                  size="sm" className="h-8"
                  onClick={() => setShowArchived(false)}
                >Active</Button>
                <Button
                  variant={showArchived ? 'default' : 'outline'}
                  size="sm" className="h-8 gap-1.5"
                  onClick={() => setShowArchived(true)}
                ><Archive className="w-3.5 h-3.5" />Archived</Button>
              </div>
            )}
            {linkedinLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
              </div>
            ) : linkedinSOPs.length === 0 ? (
              <LinkedInEmptyState onCreate={() => { setEditSOP(null); setCreateType('linkedin'); setShowCreate(true) }} />
            ) : visibleLinkedinSOPs.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Archive className="w-14 h-14 mx-auto mb-4 opacity-20" />
                <p className="font-semibold text-lg mb-1">No archived LinkedIn SOPs</p>
                <p className="text-sm">SOPs you archive will show up here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleLinkedinSOPs.map((sop, i) => (
                  <SOPCard
                    key={sop._id}
                    sop={sop}
                    userId={user?._id}
                    totalItems={totalItems(sop)}
                    onView={() => setViewSOP(sop)}
                    onEdit={() => { setEditSOP(sop); setShowCreate(true) }}
                    onBookmark={() => bookmarkMutation.mutate(sop._id)}
                    onDuplicate={() => duplicateMutation.mutate(sop._id)}
                    onArchive={() => archiveMutation.mutate(sop._id)}
                    onRestore={() => restoreMutation.mutate(sop._id)}
                    onAssign={() => setAssignSOP(sop)}
                    onDelete={() => { if (confirm('Delete this SOP?')) deleteMutation.mutate(sop._id) }}
                    onVersionHistory={() => setVersionHistorySOP(sop)}
                    index={i}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* ── SOP VIEW MODAL ── */}
      <AnimatePresence>
        {viewSOP && (
          <SOPViewModal
            sop={viewSOP}
            onClose={() => setViewSOP(null)}
            onAssign={() => { setAssignSOP(viewSOP); setViewSOP(null) }}
          />
        )}
      </AnimatePresence>

      {/* ── CREATE / EDIT MODAL ── */}
      {showCreate && (
        <SOPFormModal
          editSOP={editSOP}
          defaultSopType={createType}
          onClose={() => { setShowCreate(false); setEditSOP(null) }}
          onSuccess={() => {
            queryClient.invalidateQueries(['sop'])
            setShowCreate(false)
            setEditSOP(null)
          }}
        />
      )}

      {/* ── ASSIGN MODAL ── */}
      {assignSOP && (
        <AssignModal
          sop={assignSOP}
          employees={employees || []}
          onClose={() => setAssignSOP(null)}
          onSuccess={() => {
            queryClient.invalidateQueries(['sop-assignments'])
            setAssignSOP(null)
            toast.success('SOP assigned — tasks auto-created!')
          }}
        />
      )}

      {/* ── ASSIGNMENT DETAIL MODAL (checklist / comments / review / reassign) ── */}
      {manageAssignmentId && (
        <AssignmentDetailModal
          assignmentId={manageAssignmentId}
          employees={employees || []}
          onClose={() => setManageAssignmentId(null)}
        />
      )}

      {/* ── VERSION HISTORY MODAL (view / compare / restore) ── */}
      {versionHistorySOP && (
        <VersionHistoryModal
          sop={versionHistorySOP}
          onClose={() => setVersionHistorySOP(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SOP Card
// ─────────────────────────────────────────────────────────────────────────────
function SOPCard({ sop, userId, totalItems, onView, onEdit, onBookmark, onDuplicate, onArchive, onRestore, onAssign, onDelete, onVersionHistory, index }) {
  const isBookmarked = sop.bookmarkedBy?.some(id => id === userId || id?._id === userId)
  const dept = DEPT_MAP[sop.department]
  const isArchived = sop.status === 'archived'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn(
            'text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0',
            dept?.color || 'bg-muted text-muted-foreground border-border'
          )}>
            {dept?.label || sop.department}
          </span>
          {isArchived && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 bg-muted text-muted-foreground border-border flex items-center gap-1">
              <Archive className="w-2.5 h-2.5" />Archived
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onBookmark}
            className={cn('p-1 rounded hover:bg-accent transition-colors',
              isBookmarked ? 'text-amber-400' : 'text-muted-foreground')}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent text-muted-foreground">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}><Eye className="w-3.5 h-3.5 mr-2" />View Checklist</DropdownMenuItem>
              {onEdit && <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>}
              <DropdownMenuItem onClick={onDuplicate}><Copy className="w-3.5 h-3.5 mr-2" />Duplicate</DropdownMenuItem>
              {onVersionHistory && <DropdownMenuItem onClick={onVersionHistory}><History className="w-3.5 h-3.5 mr-2" />Version History</DropdownMenuItem>}
              {onAssign && !isArchived && <DropdownMenuItem onClick={onAssign}><UserPlus className="w-3.5 h-3.5 mr-2" />Assign</DropdownMenuItem>}
              <DropdownMenuSeparator />
              {isArchived
                ? (onRestore && <DropdownMenuItem onClick={onRestore}><ArchiveRestore className="w-3.5 h-3.5 mr-2" />Restore</DropdownMenuItem>)
                : (onArchive && <DropdownMenuItem onClick={onArchive}><Archive className="w-3.5 h-3.5 mr-2" />Archive</DropdownMenuItem>)
              }
              {onDelete && <DropdownMenuItem className="text-destructive" onClick={onDelete}>Delete</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h3 className="font-semibold text-sm mb-1 line-clamp-2 flex-1">{sop.title}</h3>
      {sop.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{sop.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-3 border-t border-border">
        <span className="flex items-center gap-1">
          <CheckSquare className="w-3.5 h-3.5" />{totalItems} steps
        </span>
        <span className="flex items-center gap-1">
          <Layers className="w-3.5 h-3.5" />{sop.days?.length || 0} day{(sop.days?.length || 0) !== 1 ? 's' : ''}
        </span>
        {sop.estimatedDuration && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />{sop.estimatedDuration}
          </span>
        )}
        <span className="ml-auto">v{sop.version || 1}</span>
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={onView}>
          <Eye className="w-3 h-3 mr-1" />View
        </Button>
        {isArchived ? (
          onRestore && (
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={onRestore}>
              <ArchiveRestore className="w-3 h-3 mr-1" />Restore
            </Button>
          )
        ) : (
          onAssign && (
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={onAssign}>
              <UserPlus className="w-3 h-3 mr-1" />Assign
            </Button>
          )
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SOP View Modal
// ─────────────────────────────────────────────────────────────────────────────
function SOPViewModal({ sop, onClose, onAssign }) {
  const [openDays, setOpenDays] = useState(() => sop.days?.map((_, i) => i) || [])
  const [showActivity, setShowActivity] = useState(false)
  const toggleDay = (i) => setOpenDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  const totalItems = sop.days?.reduce((a, d) => a + (d.items?.length || 0), 0) || 0
  const dept = DEPT_MAP[sop.department]

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['sop-activity', sop._id],
    queryFn: () => api.get(`/sop/${sop._id}/activity`).then(r => r.data.data),
    enabled: showActivity,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative bg-card border-l border-border h-full w-[480px] max-w-full flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <span className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded border',
                dept?.color || 'bg-muted text-muted-foreground border-border'
              )}>{dept?.label || sop.department}</span>
              <h2 className="text-base font-bold mt-2 leading-tight">{sop.title}</h2>
              {sop.description && <p className="text-xs text-muted-foreground mt-1">{sop.description}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-accent shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />{totalItems} steps</span>
            <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{sop.days?.length} day-groups</span>
            {sop.estimatedDuration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{sop.estimatedDuration}</span>}
            <span className="ml-auto">v{sop.version || 1} / {sop.viewCount || 0} views</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sop.days?.map((day, di) => (
            <div key={di} className="border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors text-left"
                onClick={() => toggleDay(di)}
              >
                <div className="flex items-center gap-2">
                  {openDays.includes(di)
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  }
                  <span className="text-xs font-semibold">{day.title || 'Day ' + day.dayNumber}</span>
                </div>
                <span className="text-xs text-muted-foreground">{day.items?.length || 0} steps</span>
              </button>
              <AnimatePresence>
                {openDays.includes(di) && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border divide-y divide-border/60">
                      {day.items?.map((item, ii) => (
                        <div key={ii} className="flex items-start gap-2.5 px-4 py-2.5">
                          <Square className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{item.title}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {(!sop.days || sop.days.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-8">No checklist items yet</p>
          )}

          <div className="border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors text-left"
              onClick={() => setShowActivity(v => !v)}
            >
              <div className="flex items-center gap-2">
                {showActivity
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                }
                <ActivityIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">Activity Log</span>
              </div>
            </button>
            <AnimatePresence>
              {showActivity && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border divide-y divide-border/60 max-h-64 overflow-y-auto">
                    {activityLoading ? (
                      <div className="p-3 space-y-2">
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ) : activityData?.length > 0 ? (
                      activityData.map(log => (
                        <div key={log._id} className="flex items-start gap-2.5 px-4 py-2.5 text-sm">
                          <ActivityIcon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p>{log.action}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {log.user?.name || 'System'} · {log.createdAt ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true }) : ''}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted-foreground text-sm py-6">No activity yet</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2 shrink-0">
          <Button className="flex-1 gap-2" onClick={onAssign}>
            <UserPlus className="w-4 h-4" />Assign to Team Member
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Assign Modal
// ─────────────────────────────────────────────────────────────────────────────
function AssignModal({ sop, employees, onClose, onSuccess }) {
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm()
  const totalItems = sop.days?.reduce((a, d) => a + (d.items?.length || 0), 0) || 0

  const mutation = useMutation({
    mutationFn: (d) => api.post('/sop/' + sop._id + '/assign', d),
    onSuccess,
    onError: (err) => toast.error(err.response?.data?.message || 'Assignment failed'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Assign SOP</DialogTitle></DialogHeader>
        <div className="bg-muted/50 rounded-lg p-3 mb-2">
          <p className="text-sm font-medium">{sop.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{totalItems} steps / {sop.days?.length} day-groups</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-2">
          <p className="text-xs text-blue-400 flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            {totalItems} tasks will be auto-created from checklist items on assign.
          </p>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Assign To *</Label>
            <Select onValueChange={v => setValue('assignedTo', v)}>
              <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e._id} value={e._id}>{e.name} ({e.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input {...register('dueDate')} type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select onValueChange={v => setValue('priority', v)} defaultValue="medium">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['high', 'medium', 'low'].map(p => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Assign &amp; Create Tasks</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Assignment Row
// ─────────────────────────────────────────────────────────────────────────────
function AssignmentRow({ assignment, onManage }) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const completeMutation = useMutation({
    mutationFn: ({ assignId, itemId }) =>
      api.put('/sop/assignments/' + assignId + '/complete-item', { checklistItemId: itemId }),
    onSuccess: () => queryClient.invalidateQueries(['sop-assignments']),
  })

  const STATUS_COLORS = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-blue-500/10 text-blue-400',
    awaiting_review: 'bg-amber-500/10 text-amber-400',
    completed: 'bg-green-500/10 text-green-400',
    overdue: 'bg-red-500/10 text-red-400',
    archived: 'bg-muted text-muted-foreground',
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-[10px] px-2 py-0.5 rounded font-medium capitalize', STATUS_COLORS[assignment.status] || 'bg-muted text-muted-foreground')}>
                {(assignment.status || '').replace('_', ' ')}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{assignment.priority} priority</span>
              {assignment.dueDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {format(new Date(assignment.dueDate), 'MMM d')}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold">{assignment.sopTitle || assignment.sop?.title}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={onManage}>
              <Settings2 className="w-3.5 h-3.5" />Manage
            </Button>
            <button onClick={() => setExpanded(v => !v)} className="p-1 rounded hover:bg-accent text-muted-foreground">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1 mb-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-medium text-foreground">{assignment.progress || 0}%</span>
          </div>
          <Progress value={assignment.progress || 0} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            {assignment.checklist?.filter(c => c.isCompleted).length || 0} / {assignment.checklist?.length || 0} steps
          </p>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                {assignment.checklist?.map((item) => (
                  <button
                    key={item._id || item.sopItemId}
                    onClick={() => !item.isCompleted && completeMutation.mutate({
                      assignId: assignment._id,
                      itemId: item._id || item.sopItemId,
                    })}
                    className={cn(
                      'w-full flex items-center gap-2.5 text-left px-2 py-2 rounded-lg transition-colors text-sm',
                      item.isCompleted ? 'text-muted-foreground' : 'hover:bg-accent cursor-pointer'
                    )}
                    disabled={item.isCompleted}
                  >
                    {item.isCompleted
                      ? <CheckSquare className="w-4 h-4 text-green-500 shrink-0" />
                      : <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                    }
                    <span className={item.isCompleted ? 'line-through opacity-60' : ''}>{item.title}</span>
                    {item.isCompleted && item.completedAt && (
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(item.completedAt), { addSuffix: true })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Assignment Detail Modal — checklist mgmt, comments/collaboration, review workflow
// ─────────────────────────────────────────────────────────────────────────────
const ASSIGNMENT_STATUS_COLORS = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/10 text-blue-400',
  awaiting_review: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-green-500/10 text-green-400',
  overdue: 'bg-red-500/10 text-red-400',
  archived: 'bg-muted text-muted-foreground',
}

function buildCommentTree(comments = []) {
  const byId = {}
  comments.forEach(c => { byId[c._id] = { ...c, replies: [] } })
  const roots = []
  comments.forEach(c => {
    const parentId = c.parentComment
    if (parentId && byId[parentId]) byId[parentId].replies.push(byId[c._id])
    else roots.push(byId[c._id])
  })
  return roots
}

function AssignmentDetailModal({ assignmentId, employees, onClose }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = ['super_admin', 'admin', 'manager'].includes(user?.role)

  const [tab, setTab] = useState('checklist')
  const [newItemTitle, setNewItemTitle] = useState('')
  const [expandedItems, setExpandedItems] = useState([])
  const [itemCommentDrafts, setItemCommentDrafts] = useState({})
  const [commentDraft, setCommentDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [mentionPicker, setMentionPicker] = useState(false)
  const [selectedMentions, setSelectedMentions] = useState([])
  const [editingComment, setEditingComment] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [showReassign, setShowReassign] = useState(false)
  const [reassignTo, setReassignTo] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  const { data: assignment, isLoading } = useQuery({
    queryKey: ['sop-assignment', assignmentId],
    queryFn: () => api.get(`/sop/assignments/${assignmentId}`).then(r => r.data.data),
    enabled: !!assignmentId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries(['sop-assignment', assignmentId])
    queryClient.invalidateQueries(['sop-assignments'])
    queryClient.invalidateQueries(['sop-stats'])
  }
  const onErr = (err) => toast.error(err.response?.data?.message || 'Action failed')

  const completeMutation = useMutation({
    mutationFn: (itemId) => api.put(`/sop/assignments/${assignmentId}/complete-item`, { checklistItemId: itemId }),
    onSuccess: invalidate,
    onError: onErr,
  })
  const addItemMutation = useMutation({
    mutationFn: (title) => api.post(`/sop/assignments/${assignmentId}/checklist`, { title, dayTitle: 'Custom' }),
    onSuccess: () => { invalidate(); setNewItemTitle('') },
    onError: onErr,
  })
  const deleteItemMutation = useMutation({
    mutationFn: (itemId) => api.delete(`/sop/assignments/${assignmentId}/checklist/${itemId}`),
    onSuccess: invalidate,
    onError: onErr,
  })
  const reorderMutation = useMutation({
    mutationFn: (order) => api.put(`/sop/assignments/${assignmentId}/checklist/reorder`, { order }),
    onSuccess: invalidate,
    onError: onErr,
  })
  const itemCommentMutation = useMutation({
    mutationFn: ({ itemId, text }) => api.post(`/sop/assignments/${assignmentId}/checklist/${itemId}/comments`, { text }),
    onSuccess: (_res, vars) => { invalidate(); setItemCommentDrafts(d => ({ ...d, [vars.itemId]: '' })) },
    onError: onErr,
  })
  const addCommentMutation = useMutation({
    mutationFn: ({ text, parentComment, mentions }) => api.post(`/sop/assignments/${assignmentId}/comments`, { text, parentComment, mentions }),
    onSuccess: () => { invalidate(); setCommentDraft(''); setReplyTo(null); setSelectedMentions([]); setMentionPicker(false) },
    onError: onErr,
  })
  const editCommentMutation = useMutation({
    mutationFn: ({ commentId, text }) => api.put(`/sop/assignments/${assignmentId}/comments/${commentId}`, { text }),
    onSuccess: () => { invalidate(); setEditingComment(null) },
    onError: onErr,
  })
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId) => api.delete(`/sop/assignments/${assignmentId}/comments/${commentId}`),
    onSuccess: invalidate,
    onError: onErr,
  })
  const resolveCommentMutation = useMutation({
    mutationFn: (commentId) => api.put(`/sop/assignments/${assignmentId}/comments/${commentId}/resolve`),
    onSuccess: invalidate,
    onError: onErr,
  })
  const submitReviewMutation = useMutation({
    mutationFn: () => api.put(`/sop/assignments/${assignmentId}/submit-review`),
    onSuccess: () => { invalidate(); toast.success('Submitted for review') },
    onError: onErr,
  })
  const approveMutation = useMutation({
    mutationFn: (notes) => api.put(`/sop/assignments/${assignmentId}/approve`, { notes }),
    onSuccess: () => { invalidate(); toast.success('Approved — SOP completed'); setReviewNotes('') },
    onError: onErr,
  })
  const requestChangesMutation = useMutation({
    mutationFn: (notes) => api.put(`/sop/assignments/${assignmentId}/request-changes`, { notes }),
    onSuccess: () => { invalidate(); toast.success('Changes requested'); setReviewNotes('') },
    onError: onErr,
  })
  const reassignMutation = useMutation({
    mutationFn: (assignedTo) => api.put(`/sop/assignments/${assignmentId}/reassign`, { assignedTo }),
    onSuccess: () => { invalidate(); toast.success('Reassigned'); setShowReassign(false); setReassignTo('') },
    onError: onErr,
  })

  if (!assignmentId) return null

  const toggleItemComments = (id) => setExpandedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const moveItem = (idx, dir) => {
    const list = [...assignment.checklist]
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= list.length) return
    ;[list[idx], list[swapIdx]] = [list[swapIdx], list[idx]]
    reorderMutation.mutate(list.map(i => i._id))
  }

  const assigneeId = assignment?.assignedTo?._id || assignment?.assignedTo
  const isAssignee = user?._id === assigneeId
  const canSubmitReview = isAssignee && ['not_started', 'in_progress', 'overdue'].includes(assignment?.status)
  const canReview = isManager && assignment?.status === 'awaiting_review'
  const canReassign = isManager && !['completed', 'archived'].includes(assignment?.status)
  const commentTree = assignment ? buildCommentTree(assignment.comments) : []

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <ClipboardCheck className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="line-clamp-1">{assignment?.sopTitle || 'Loading…'}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading || !assignment ? (
          <div className="space-y-2 py-6">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {/* ── Summary / status row ── */}
            <div className="flex items-center gap-2 flex-wrap text-xs mb-3">
              <span className={cn('px-2 py-0.5 rounded font-medium capitalize', ASSIGNMENT_STATUS_COLORS[assignment.status] || 'bg-muted text-muted-foreground')}>
                {(assignment.status || '').replace('_', ' ')}
              </span>
              <span className="text-muted-foreground capitalize">{assignment.priority} priority</span>
              {assignment.dueDate && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />Due {format(new Date(assignment.dueDate), 'MMM d, yyyy')}
                </span>
              )}
              <span className="text-muted-foreground flex items-center gap-1">
                <UserCog className="w-3 h-3" />{assignment.assignedTo?.name || 'Unassigned'}
              </span>
              {assignment.client?.companyName && (
                <span className="text-muted-foreground">· {assignment.client.companyName}</span>
              )}
              {canReassign && (
                <button
                  className="ml-auto text-primary hover:underline flex items-center gap-1"
                  onClick={() => setShowReassign(v => !v)}
                >
                  <UserCog className="w-3 h-3" />Reassign
                </button>
              )}
            </div>

            {showReassign && (
              <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-muted/50">
                <Select onValueChange={setReassignTo} value={reassignTo}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select new assignee" /></SelectTrigger>
                  <SelectContent>
                    {(employees || []).map(e => (
                      <SelectItem key={e._id} value={e._id}>{e.name} ({e.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" disabled={!reassignTo} onClick={() => reassignMutation.mutate(reassignTo)}>
                  Confirm
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowReassign(false)}>Cancel</Button>
              </div>
            )}

            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span className="font-medium text-foreground">{assignment.progress || 0}%</span>
              </div>
              <Progress value={assignment.progress || 0} className="h-1.5" />
            </div>

            {/* ── Review workflow actions ── */}
            {(canSubmitReview || canReview) && (
              <div className="rounded-lg border border-border p-3 mb-3 space-y-2">
                {canReview && (
                  <textarea
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Review notes (optional)"
                    rows={2}
                    className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}
                <div className="flex gap-2">
                  {canSubmitReview && (
                    <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => submitReviewMutation.mutate()}>
                      <Send className="w-3.5 h-3.5" />Submit for Review
                    </Button>
                  )}
                  {canReview && (
                    <>
                      <Button size="sm" className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => approveMutation.mutate(reviewNotes)}>
                        <ShieldCheck className="w-3.5 h-3.5" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => requestChangesMutation.mutate(reviewNotes)}>
                        <XCircle className="w-3.5 h-3.5" />Request Changes
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            {assignment.reviewNotes && (
              <div className="bg-muted/50 rounded-lg p-2.5 mb-3 text-xs">
                <span className="font-medium">Review notes: </span>{assignment.reviewNotes}
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="checklist" className="gap-1.5"><CheckSquare className="w-3.5 h-3.5" />Checklist</TabsTrigger>
                <TabsTrigger value="comments" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" />Comments{assignment.comments?.length > 0 && ` (${assignment.comments.filter(c => !c.isDeleted).length})`}</TabsTrigger>
                <TabsTrigger value="activity" className="gap-1.5"><ActivityIcon className="w-3.5 h-3.5" />Activity</TabsTrigger>
              </TabsList>

              {/* ── Checklist tab ── */}
              <TabsContent value="checklist" className="space-y-1.5 mt-3">
                {assignment.checklist?.map((item, idx) => (
                  <div key={item._id} className="rounded-lg border border-border/60">
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <button
                        onClick={() => !item.isCompleted && completeMutation.mutate(item._id)}
                        disabled={item.isCompleted}
                        className="shrink-0"
                      >
                        {item.isCompleted
                          ? <CheckSquare className="w-4 h-4 text-green-500" />
                          : <Square className="w-4 h-4 text-muted-foreground" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm', item.isCompleted && 'line-through opacity-60')}>{item.title}</p>
                        {item.dayTitle && <p className="text-[10px] text-muted-foreground">{item.dayTitle}</p>}
                      </div>
                      {item.isCompleted && item.completedAt && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {item.completedBy?.name ? `${item.completedBy.name} · ` : ''}{formatDistanceToNow(new Date(item.completedAt), { addSuffix: true })}
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30" disabled={idx === assignment.checklist.length - 1} onClick={() => moveItem(idx, 1)}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 rounded hover:bg-accent text-muted-foreground relative" onClick={() => toggleItemComments(item._id)}>
                          <MessageSquare className="w-3.5 h-3.5" />
                          {item.comments?.length > 0 && (
                            <span className="absolute -top-1 -right-1 text-[9px] bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">{item.comments.length}</span>
                          )}
                        </button>
                        {item.isCustom && (
                          <button className="p-1 rounded hover:bg-accent text-destructive" onClick={() => deleteItemMutation.mutate(item._id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedItems.includes(item._id) && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="border-t border-border/60 px-2.5 py-2 space-y-1.5 bg-muted/30">
                            {item.comments?.map(c => (
                              <div key={c._id} className="text-xs">
                                <span className="font-medium">{c.author?.name || 'Someone'}</span>{' '}
                                <span className="text-muted-foreground">{c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : ''}</span>
                                <p>{c.text}</p>
                              </div>
                            ))}
                            <div className="flex gap-1.5 pt-1">
                              <Input
                                value={itemCommentDrafts[item._id] || ''}
                                onChange={e => setItemCommentDrafts(d => ({ ...d, [item._id]: e.target.value }))}
                                placeholder="Add a comment…"
                                className="h-7 text-xs"
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && itemCommentDrafts[item._id]?.trim()) {
                                    itemCommentMutation.mutate({ itemId: item._id, text: itemCommentDrafts[item._id].trim() })
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                className="h-7 text-xs px-2"
                                disabled={!itemCommentDrafts[item._id]?.trim()}
                                onClick={() => itemCommentMutation.mutate({ itemId: item._id, text: itemCommentDrafts[item._id].trim() })}
                              >
                                <Send className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {(!assignment.checklist || assignment.checklist.length === 0) && (
                  <p className="text-center text-muted-foreground text-sm py-6">No checklist items</p>
                )}
                <div className="flex gap-1.5 pt-2">
                  <Input
                    value={newItemTitle}
                    onChange={e => setNewItemTitle(e.target.value)}
                    placeholder="Add a custom checklist item…"
                    className="h-8 text-xs"
                    onKeyDown={e => { if (e.key === 'Enter' && newItemTitle.trim()) addItemMutation.mutate(newItemTitle.trim()) }}
                  />
                  <Button size="sm" className="h-8 text-xs gap-1" disabled={!newItemTitle.trim()} onClick={() => addItemMutation.mutate(newItemTitle.trim())}>
                    <Plus className="w-3.5 h-3.5" />Add
                  </Button>
                </div>
              </TabsContent>

              {/* ── Comments tab ── */}
              <TabsContent value="comments" className="space-y-3 mt-3">
                {commentTree.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-6">No comments yet</p>
                )}
                {commentTree.map(c => (
                  <CommentNode
                    key={c._id}
                    comment={c}
                    depth={0}
                    currentUserId={user?._id}
                    isManager={isManager}
                    editingComment={editingComment}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    onReply={(id) => setReplyTo(id)}
                    onStartEdit={(c2) => { setEditingComment(c2._id); setEditDraft(c2.text) }}
                    onSaveEdit={(id) => editCommentMutation.mutate({ commentId: id, text: editDraft })}
                    onCancelEdit={() => setEditingComment(null)}
                    onDelete={(id) => { if (confirm('Delete this comment?')) deleteCommentMutation.mutate(id) }}
                    onResolve={(id) => resolveCommentMutation.mutate(id)}
                  />
                ))}

                <div className="pt-2 border-t border-border space-y-2">
                  {replyTo && (
                    <div className="flex items-center justify-between text-xs bg-muted/50 rounded-md px-2.5 py-1.5">
                      <span className="text-muted-foreground">Replying to comment</span>
                      <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  {mentionPicker && (
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-muted/50">
                      {(employees || []).filter(e => e._id !== user?._id).map(e => (
                        <button
                          key={e._id}
                          onClick={() => setSelectedMentions(prev => prev.includes(e._id) ? prev.filter(x => x !== e._id) : [...prev, e._id])}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded-full border flex items-center gap-1',
                            selectedMentions.includes(e._id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'
                          )}
                        >
                          <AtSign className="w-2.5 h-2.5" />{e.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedMentions.length > 0 && !mentionPicker && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMentions.map(id => {
                        const e = (employees || []).find(emp => emp._id === id)
                        return <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1"><AtSign className="w-2.5 h-2.5" />{e?.name || id}</span>
                      })}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <textarea
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      placeholder="Write a comment…"
                      rows={2}
                      className="flex-1 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <div className="flex flex-col gap-1.5">
                      <button
                        className={cn('p-1.5 rounded border', mentionPicker ? 'bg-accent border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent')}
                        onClick={() => setMentionPicker(v => !v)}
                        title="Mention teammates"
                      >
                        <AtSign className="w-3.5 h-3.5" />
                      </button>
                      <Button
                        size="sm"
                        className="h-8 text-xs px-2"
                        disabled={!commentDraft.trim()}
                        onClick={() => addCommentMutation.mutate({ text: commentDraft.trim(), parentComment: replyTo, mentions: selectedMentions })}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Activity tab ── */}
              <TabsContent value="activity" className="space-y-2 mt-3">
                {[...(assignment.activityLog || [])].reverse().map((log, i) => (
                  <div key={log._id || i} className="flex items-start gap-2.5 text-sm">
                    <ActivityIcon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p>{log.action}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {log.performedBy?.name || 'System'} · {log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {(!assignment.activityLog || assignment.activityLog.length === 0) && (
                  <p className="text-center text-muted-foreground text-sm py-6">No activity yet</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CommentNode({ comment, depth, currentUserId, isManager, editingComment, editDraft, setEditDraft, onReply, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onResolve }) {
  const isOwn = comment.author?._id === currentUserId
  const canDelete = isOwn || isManager
  const isEditing = editingComment === comment._id

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }} className={depth > 0 ? 'border-l border-border pl-3' : ''}>
      <div className={cn('rounded-lg p-2.5', comment.resolved ? 'bg-green-500/5 border border-green-500/20' : 'bg-muted/40')}>
        <div className="flex items-center gap-1.5 text-xs mb-1">
          <span className="font-semibold">{comment.author?.name || 'Someone'}</span>
          <span className="text-muted-foreground">{comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : ''}</span>
          {comment.isEdited && <span className="text-muted-foreground">(edited)</span>}
          {comment.resolved && <span className="text-green-500 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />Resolved</span>}
        </div>
        {isEditing ? (
          <div className="space-y-1.5">
            <textarea
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => onSaveEdit(comment._id)}>Save</Button>
              <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={onCancelEdit}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className={cn('text-sm', comment.isDeleted && 'italic text-muted-foreground')}>{comment.text}</p>
        )}
        {!isEditing && !comment.isDeleted && (
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            <button className="flex items-center gap-1 hover:text-foreground" onClick={() => onReply(comment._id)}><Reply className="w-3 h-3" />Reply</button>
            {isOwn && <button className="flex items-center gap-1 hover:text-foreground" onClick={() => onStartEdit(comment)}><Pencil className="w-3 h-3" />Edit</button>}
            {canDelete && <button className="flex items-center gap-1 hover:text-destructive" onClick={() => onDelete(comment._id)}><Trash2 className="w-3 h-3" />Delete</button>}
            <button className="flex items-center gap-1 hover:text-foreground" onClick={() => onResolve(comment._id)}>
              <CheckCircle2 className="w-3 h-3" />{comment.resolved ? 'Unresolve' : 'Resolve'}
            </button>
          </div>
        )}
      </div>
      {comment.replies?.map(r => (
        <div key={r._id} className="mt-2">
          <CommentNode
            comment={r}
            depth={depth + 1}
            currentUserId={currentUserId}
            isManager={isManager}
            editingComment={editingComment}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            onReply={onReply}
            onStartEdit={onStartEdit}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onDelete={onDelete}
            onResolve={onResolve}
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Version History Modal — view / compare / restore past SOP versions
// ─────────────────────────────────────────────────────────────────────────────
const COMPARE_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'department', label: 'Department' },
  { key: 'description', label: 'Description' },
  { key: 'estimatedDuration', label: 'Estimated Duration' },
  { key: 'templateCategory', label: 'Template Category' },
  { key: 'tags', label: 'Tags' },
  { key: 'days', label: 'Checklist (days/items)' },
]

function summarizeField(key, snapshot) {
  if (!snapshot) return '—'
  const val = snapshot[key]
  if (key === 'days') {
    const days = val || []
    const items = days.reduce((a, d) => a + (d.items?.length || 0), 0)
    return `${days.length} day-group${days.length !== 1 ? 's' : ''}, ${items} item${items !== 1 ? 's' : ''}`
  }
  if (key === 'tags') return (val && val.length) ? val.join(', ') : '—'
  return val || '—'
}

function VersionHistoryModal({ sop, onClose }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isManager = ['super_admin', 'admin', 'manager'].includes(user?.role)
  const [compareV1, setCompareV1] = useState('')
  const [compareV2, setCompareV2] = useState('')
  const [showCompare, setShowCompare] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sop-versions', sop._id],
    queryFn: () => api.get(`/sop/${sop._id}/versions`).then(r => r.data.data),
    enabled: !!sop._id,
  })

  const compareEnabled = showCompare && !!compareV1 && !!compareV2 && compareV1 !== compareV2
  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ['sop-version-compare', sop._id, compareV1, compareV2],
    queryFn: () => api.get(`/sop/${sop._id}/versions/compare`, { params: { v1: compareV1, v2: compareV2 } }).then(r => r.data.data),
    enabled: compareEnabled,
  })

  const restoreMutation = useMutation({
    mutationFn: (version) => api.post(`/sop/${sop._id}/versions/${version}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries(['sop'])
      queryClient.invalidateQueries(['sop-versions', sop._id])
      toast.success('SOP restored to selected version')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Restore failed'),
  })

  const history = data?.history || []
  const currentVersion = data?.currentVersion ?? sop.version
  const versionOptions = [
    { value: 'current', label: `v${currentVersion} (current)` },
    ...history.map(h => ({ value: String(h.version), label: `v${h.version}` })),
  ]

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <History className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="line-clamp-1">Version History — {sop.title}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-6">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowCompare(v => !v)}>
                <GitCompare className="w-3.5 h-3.5" />{showCompare ? 'Hide Compare' : 'Compare Versions'}
              </Button>
            </div>

            {showCompare && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Select value={compareV1} onValueChange={setCompareV1}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Version A" /></SelectTrigger>
                    <SelectContent>
                      {versionOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <Select value={compareV2} onValueChange={setCompareV2}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Version B" /></SelectTrigger>
                    <SelectContent>
                      {versionOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {compareV1 && compareV2 && compareV1 === compareV2 && (
                  <p className="text-xs text-muted-foreground">Select two different versions to compare.</p>
                )}

                {compareLoading && <Skeleton className="h-32 w-full" />}

                {compareData && (
                  <div className="rounded-md border border-border/60 divide-y divide-border/60 text-xs">
                    <div className="grid grid-cols-3 gap-2 px-3 py-1.5 font-medium text-muted-foreground bg-muted/40">
                      <span>Field</span>
                      <span>v{compareData.v1.version}</span>
                      <span>v{compareData.v2.version}</span>
                    </div>
                    {COMPARE_FIELDS.map(f => {
                      const a = summarizeField(f.key, compareData.v1.snapshot)
                      const b = summarizeField(f.key, compareData.v2.snapshot)
                      const changed = JSON.stringify(a) !== JSON.stringify(b)
                      return (
                        <div key={f.key} className={cn('grid grid-cols-3 gap-2 px-3 py-1.5', changed && 'bg-amber-500/5')}>
                          <span className="font-medium">{f.label}</span>
                          <span className={cn(changed && 'text-amber-400')}>{a}</span>
                          <span className={cn(changed && 'text-amber-400')}>{b}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <div>
                  <span className="text-sm font-medium">v{currentVersion}</span>
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Current</span>
                </div>
                <span className="text-xs text-muted-foreground">{sop.updatedAt ? formatDistanceToNow(new Date(sop.updatedAt), { addSuffix: true }) : ''}</span>
              </div>

              {history.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-6">No earlier versions yet — edits will appear here.</p>
              )}

              {history.map(h => (
                <div key={h.version} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">v{h.version}</span>
                      {h.changes && <span className="text-xs text-muted-foreground truncate">{h.changes}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {h.updatedBy?.name || 'Someone'} · {h.updatedAt ? formatDistanceToNow(new Date(h.updatedAt), { addSuffix: true }) : ''}
                    </p>
                  </div>
                  {isManager && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 shrink-0"
                      disabled={restoreMutation.isPending}
                      onClick={() => { if (confirm(`Restore SOP to v${h.version}? This creates a new version.`)) restoreMutation.mutate(h.version) }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / Edit Modal
// ─────────────────────────────────────────────────────────────────────────────
function SOPFormModal({ editSOP, defaultSopType = 'performance_marketing', onClose, onSuccess }) {
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: editSOP ? {
      title: editSOP.title,
      department: editSOP.department,
      description: editSOP.description,
      estimatedDuration: editSOP.estimatedDuration,
    } : { department: 'operations' },
  })

  const mutation = useMutation({
    mutationFn: d => editSOP ? api.put('/sop/' + editSOP._id, d) : api.post('/sop', { ...d, sopType: defaultSopType }),
    onSuccess: () => { toast.success(editSOP ? 'SOP updated' : 'SOP created'); onSuccess() },
    onError: err => toast.error(err.response?.data?.message || 'Error'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{editSOP ? 'Edit SOP' : 'Create SOP'}</DialogTitle>
          {!editSOP && (
            <span className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md border w-fit mt-1',
              defaultSopType === 'linkedin'
                ? 'bg-[#0A66C2]/10 text-[#0A66C2] border-[#0A66C2]/30'
                : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
            )}>
              {defaultSopType === 'linkedin' ? <Linkedin className="w-3 h-3" /> : <Megaphone className="w-3 h-3" />}
              {defaultSopType === 'linkedin' ? 'LinkedIn SOP' : 'Performance Marketing SOP'}
            </span>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input {...register('title', { required: true })} placeholder="e.g. Meta Ads Campaign Planning" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select onValueChange={v => setValue('department', v)} defaultValue={editSOP?.department || 'operations'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Duration</Label>
              <Input {...register('estimatedDuration')} placeholder="e.g. 2 days" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="What does this SOP cover?"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-400 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Checklist items are managed via the SOP view. After creation, use View to add day-groups and steps.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {editSOP ? 'Update SOP' : 'Create SOP'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn SOPs — Empty State
// ─────────────────────────────────────────────────────────────────────────────
function LinkedInEmptyState({ onCreate }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center text-center py-20 px-6 rounded-xl border border-dashed border-border bg-card/50"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[#0A66C2]/25 blur-2xl rounded-full" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0A66C2] to-[#004182] flex items-center justify-center shadow-lg">
          <Linkedin className="w-10 h-10 text-white" />
        </div>
      </div>
      <p className="font-semibold text-lg mb-1.5">No LinkedIn SOPs Yet</p>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        LinkedIn SOP templates haven't been added yet. Create your first LinkedIn SOP to start building your LinkedIn operations library.
      </p>
      <Button
        className="gap-2 bg-[#0A66C2] hover:bg-[#004182] text-white"
        onClick={onCreate}
      >
        <Plus className="w-4 h-4" />Create LinkedIn SOP
      </Button>
    </motion.div>
  )
}
