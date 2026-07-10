import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, CheckSquare, CalendarDays, Users2, RefreshCcw,
  Search, Plus, MoreHorizontal, Archive, Copy, Eye, Edit, Trash2, ClipboardCheck,
  Filter, Tag, TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import toast from 'react-hot-toast'

import OpsDashboard    from '@/components/operations/OpsDashboard'
import TaskWorkspace   from '@/components/operations/TaskWorkspace'
import OpsCalendar     from '@/components/operations/OpsCalendar'
import MeetingsTab     from '@/components/operations/MeetingsTab'

const REFRESH_MS = 30_000

// ─── SOP Category config ──────────────────────────────────────────────────────
const SOP_CATEGORIES = [
  { id: 'sales',             label: 'Sales' },
  { id: 'marketing',         label: 'Marketing' },
  { id: 'meta_ads',          label: 'Meta Ads' },
  { id: 'google_ads',        label: 'Google Ads' },
  { id: 'creative',          label: 'Creative' },
  { id: 'design',            label: 'Design' },
  { id: 'video_editing',     label: 'Video Editing' },
  { id: 'development',       label: 'Development' },
  { id: 'client_onboarding', label: 'Client Onboarding' },
  { id: 'finance',           label: 'Finance' },
  { id: 'hr',                label: 'HR' },
  { id: 'seo',               label: 'SEO' },
  { id: 'reporting',         label: 'Reporting' },
  { id: 'general',           label: 'General' },
]

const DEPT_COLORS = {
  marketing:      'bg-purple-500/10 text-purple-400',
  sales:          'bg-blue-500/10 text-blue-400',
  operations:     'bg-indigo-500/10 text-indigo-400',
  hr:             'bg-orange-500/10 text-orange-400',
  technical:      'bg-cyan-500/10 text-cyan-400',
  finance:        'bg-yellow-500/10 text-yellow-400',
  client_success: 'bg-green-500/10 text-green-400',
}

const STATUS_COLORS = {
  draft:    'bg-muted text-muted-foreground',
  active:   'bg-green-500/10 text-green-400',
  archived: 'bg-orange-500/10 text-orange-400',
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'sops',      label: 'SOP Library', icon: BookOpen },
  { id: 'tasks',     label: 'Tasks',       icon: CheckSquare },
  { id: 'calendar',  label: 'Calendar',    icon: CalendarDays },
  { id: 'meetings',  label: 'Meetings',    icon: Users2 },
]

// ─── SOP Library Tab ──────────────────────────────────────────────────────────
function SOPLibraryTab() {
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [dept, setDept]         = useState('')
  const [category, setCategory] = useState('')
  const [onlyTemplates, setOnlyTemplates] = useState(false)
  const [showArchived, setShowArchived]   = useState(false)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['ops-sops', search, dept, category, onlyTemplates],
    queryFn: () => api.get('/sop', {
      params: {
        search: search || undefined,
        department: dept || undefined,
        category: category || undefined,
        isTemplate: onlyTemplates || undefined,
        limit: 200,
      }
    }).then(r => r.data),
    refetchInterval: REFRESH_MS,
  })

  const dupMut = useMutation({
    mutationFn: id => api.post(`/sop/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries(['ops-sops']); toast.success('SOP duplicated') },
  })

  const archiveMut = useMutation({
    mutationFn: id => api.put(`/sop/${id}/archive`),
    onSuccess: () => { qc.invalidateQueries(['ops-sops']); toast.success('SOP archived') },
  })

  const sops = (data?.data || []).filter(s => showArchived ? true : s.status !== 'archived')

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8 w-48 h-9 text-sm" placeholder="Search SOPs…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">All Departments</option>
            {Object.keys(DEPT_COLORS).map(d => <option key={d} value={d}>{d.replace(/_/g,' ')}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">All Categories</option>
            {SOP_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button
            onClick={() => setOnlyTemplates(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${onlyTemplates ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            Templates Only
          </button>
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showArchived ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            Show Archived
          </button>
          <button onClick={() => refetch()} className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCcw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Total SOPs',  value: (data?.data || []).length,                               color: 'text-foreground' },
          { label: 'Active',      value: (data?.data || []).filter(s => s.status === 'active').length,   color: 'text-green-400' },
          { label: 'Templates',   value: (data?.data || []).filter(s => s.isTemplate).length,     color: 'text-blue-400' },
          { label: 'Archived',    value: (data?.data || []).filter(s => s.status === 'archived').length, color: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* SOP Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : sops.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No SOPs found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sops.map(sop => {
            const deptColor = DEPT_COLORS[sop.department] || 'bg-muted text-muted-foreground'
            const statusColor = STATUS_COLORS[sop.status] || ''
            const dayCount = sop.days?.length || 0
            const itemCount = sop.days?.reduce((s, d) => s + (d.items?.length || 0), 0) || 0

            return (
              <Card key={sop._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor}`}>{sop.status}</span>
                        {sop.isTemplate && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Template</span>}
                      </div>
                      <p className="text-sm font-semibold leading-snug line-clamp-2">{sop.title}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-0.5 rounded hover:bg-accent shrink-0"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => dupMut.mutate(sop._id)}><Copy className="w-3.5 h-3.5 mr-2" />Duplicate / Clone</DropdownMenuItem>
                        {sop.status !== 'archived' && (
                          <DropdownMenuItem onClick={() => archiveMut.mutate(sop._id)}><Archive className="w-3.5 h-3.5 mr-2" />Archive</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${deptColor}`}>
                      {sop.department?.replace(/_/g, ' ')}
                    </span>
                    {sop.category && sop.category !== 'general' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                        {SOP_CATEGORIES.find(c => c.id === sop.category)?.label || sop.category}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">v{sop.version}</span>
                  </div>

                  {sop.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{sop.description}</p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
                    <span>{dayCount} day{dayCount !== 1 ? 's' : ''} · {itemCount} task{itemCount !== 1 ? 's' : ''}</span>
                    {sop.estimatedDuration && <span>Est: {sop.estimatedDuration}</span>}
                    {sop.updatedAt && <span>Updated {format(new Date(sop.updatedAt), 'MMM d')}</span>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main OperationsWorkspace ─────────────────────────────────────────────────
export default function OperationsWorkspace() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const { user } = useAuth()

  const tabVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
    exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <OpsDashboard onTabChange={setActiveTab} />
      case 'sops':      return <SOPLibraryTab />
      case 'tasks':     return <TaskWorkspace />
      case 'calendar':  return <OpsCalendar />
      case 'meetings':  return <MeetingsTab />
      default:          return null
    }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Operations Workspace</h1>
          <p className="text-sm text-muted-foreground mt-0.5">SOPs · Tasks · Calendar · Meetings · Progress</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-0">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} variants={tabVariants} initial="initial" animate="animate" exit="exit">
          {renderTab()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
