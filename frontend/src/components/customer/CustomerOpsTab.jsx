/**
 * CustomerOpsTab.jsx
 * Phase 10b — Customer Operations Tab
 * Consolidated view: SOPs + Checklist, Tasks, Meetings, Progress, Team, Assign SOP
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, CheckSquare, CalendarDays, Users, ChevronDown, ChevronRight,
  Plus, Circle, CheckCircle2, Clock, AlertCircle, Pause, Ban, SkipForward,
  Loader2, RefreshCcw, Target, TrendingUp, X, AlertTriangle, ClipboardCheck,
  MoreHorizontal, User, Calendar,
} from 'lucide-react'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const REFRESH_MS = 30_000

// ─── Checklist item status config ────────────────────────────────────────────
const ITEM_STATUS = {
  not_started: { label: 'Not Started', icon: Circle,        color: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: Loader2,       color: 'text-blue-400' },
  waiting:     { label: 'Waiting',     icon: Pause,         color: 'text-amber-400' },
  blocked:     { label: 'Blocked',     icon: Ban,           color: 'text-red-400' },
  completed:   { label: 'Completed',   icon: CheckCircle2,  color: 'text-green-400' },
  skipped:     { label: 'Skipped',     icon: SkipForward,   color: 'text-muted-foreground/60' },
}

// ─── SOP assignment status config ─────────────────────────────────────────────
const SOP_STATUS = {
  not_started:     { label: 'Not Started',     color: 'text-muted-foreground', bg: 'bg-muted/30' },
  in_progress:     { label: 'In Progress',     color: 'text-blue-400',         bg: 'bg-blue-500/10' },
  awaiting_review: { label: 'Awaiting Review', color: 'text-amber-400',        bg: 'bg-amber-500/10' },
  completed:       { label: 'Completed',       color: 'text-green-400',        bg: 'bg-green-500/10' },
  overdue:         { label: 'Overdue',         color: 'text-red-400',          bg: 'bg-red-500/10' },
  archived:        { label: 'Archived',        color: 'text-muted-foreground', bg: 'bg-muted/20' },
}

// ─── Task status config ───────────────────────────────────────────────────────
const TASK_STATUS = {
  pending:     { label: 'To Do',       color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  in_progress: { label: 'In Progress', color: 'text-blue-400',         dot: 'bg-blue-400' },
  review:      { label: 'In Review',   color: 'text-purple-400',       dot: 'bg-purple-400' },
  blocked:     { label: 'Blocked',     color: 'text-red-400',          dot: 'bg-red-400' },
  completed:   { label: 'Completed',   color: 'text-green-400',        dot: 'bg-green-400' },
  cancelled:   { label: 'Cancelled',   color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
}

const PRIORITY_COLORS = {
  urgent: 'text-red-400',
  high:   'text-orange-400',
  medium: 'text-amber-400',
  low:    'text-muted-foreground',
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ value = 0, size = 80, stroke = 8, color = '#6366f1' }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
    </svg>
  )
}

// ─── Assign SOP Modal ─────────────────────────────────────────────────────────
function AssignSOPModal({ clientId, open, onClose, onAssigned }) {
  const { user } = useAuth()
  const [selectedSop, setSelectedSop] = useState('')
  const [assignedTo, setAssignedTo] = useState(user?.id || '')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')

  const { data: sopData } = useQuery({
    queryKey: ['sop-templates'],
    queryFn: () => api.get('/sop', { params: { isTemplate: true, limit: 100 } }).then(r => r.data),
    enabled: open,
  })

  const { data: usersData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/employees', { params: { limit: 100 } }).then(r => r.data),
    enabled: open,
  })

  const templates = sopData?.data || []
  const employees = usersData?.data || []

  const assignMut = useMutation({
    mutationFn: () => api.post(`/operations/customer/${clientId}/assign-sop`, {
      sopId: selectedSop, assignedTo, dueDate: dueDate || undefined, priority,
    }),
    onSuccess: () => {
      toast.success('SOP assigned to customer')
      onAssigned()
      onClose()
      setSelectedSop('')
      setDueDate('')
    },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to assign SOP'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Assign SOP Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>SOP Template *</Label>
            <select
              value={selectedSop}
              onChange={e => setSelectedSop(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a template…</option>
              {templates.map(t => (
                <option key={t._id} value={t._id}>{t.title}</option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">No SOP templates found. Mark an SOP as template first.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Assign To *</Label>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select employee…</option>
              {employees.map(u => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {['low', 'medium', 'high'].map(p => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => assignMut.mutate()}
            disabled={!selectedSop || !assignedTo || assignMut.isPending}
          >
            {assignMut.isPending ? 'Assigning…' : 'Assign SOP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── SOP Assignment Card with expandable checklist ────────────────────────────
function SOPCard({ assignment, clientId, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()

  const s = SOP_STATUS[assignment.status] || SOP_STATUS.not_started
  const progress = assignment.progress || 0
  const total = assignment.checklist?.length || 0
  const done  = assignment.checklist?.filter(i => i.isCompleted).length || 0

  const toggleItem = useMutation({
    mutationFn: ({ itemId, isCompleted }) =>
      api.patch(`/operations/assignments/${assignment._id}/items/${itemId}`, { isCompleted }),
    onSuccess: () => {
      qc.invalidateQueries(['customer-ops', clientId])
      qc.invalidateQueries(['customer-sop', clientId])
    },
    onError: () => toast.error('Failed to update item'),
  })

  const changeItemStatus = useMutation({
    mutationFn: ({ itemId, itemStatus }) =>
      api.patch(`/operations/assignments/${assignment._id}/items/${itemId}`, { itemStatus }),
    onSuccess: () => {
      qc.invalidateQueries(['customer-ops', clientId])
      qc.invalidateQueries(['customer-sop', clientId])
    },
    onError: () => toast.error('Failed to update status'),
  })

  // Group checklist by day
  const byDay = useMemo(() => {
    const map = new Map()
    ;(assignment.checklist || []).forEach(item => {
      const key = item.dayNumber ?? 0
      if (!map.has(key)) map.set(key, { dayNumber: key, dayTitle: item.dayTitle || `Day ${key}`, items: [] })
      map.get(key).items.push(item)
    })
    return Array.from(map.values()).sort((a, b) => a.dayNumber - b.dayNumber)
  }, [assignment.checklist])

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* SOP Header */}
      <div
        className="p-4 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.bg}`}>
            <BookOpen className={`w-4 h-4 ${s.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold leading-snug">
                {assignment.sopTitle || assignment.sop?.title || 'SOP'}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium ${s.color}`}>{progress}%</span>
                {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.bg} ${s.color}`}>{s.label}</span>
              {assignment.assignedTo?.name && (
                <span className="text-[10px] text-muted-foreground">→ {assignment.assignedTo.name}</span>
              )}
              {assignment.dueDate && (
                <span className={`text-[10px] ${isPast(new Date(assignment.dueDate)) && assignment.status !== 'completed' ? 'text-red-400' : 'text-muted-foreground'}`}>
                  Due {format(new Date(assignment.dueDate), 'MMM d')}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={progress} className="h-1.5 flex-1" />
              <span className="text-[10px] text-muted-foreground shrink-0">{done}/{total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      {expanded && (
        <div className="border-t border-border">
          {byDay.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No checklist items</div>
          ) : (
            byDay.map(day => (
              <div key={day.dayNumber} className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {day.dayTitle}
                </p>
                <div className="space-y-1.5">
                  {day.items.map(item => {
                    const statusCfg = ITEM_STATUS[item.itemStatus || (item.isCompleted ? 'completed' : 'not_started')]
                    const StatusIcon = statusCfg.icon
                    return (
                      <div key={item._id} className="flex items-center gap-2.5 group">
                        {/* Toggle checkbox */}
                        <button
                          onClick={() => toggleItem.mutate({ itemId: item._id, isCompleted: !item.isCompleted })}
                          className={`shrink-0 transition-colors ${item.isCompleted ? 'text-green-400' : 'text-muted-foreground hover:text-primary'}`}
                          disabled={toggleItem.isPending}
                        >
                          {item.isCompleted
                            ? <CheckCircle2 className="w-4 h-4" />
                            : <Circle className="w-4 h-4" />
                          }
                        </button>
                        {/* Title */}
                        <span className={`text-xs flex-1 ${item.isCompleted ? 'line-through text-muted-foreground' : item.itemStatus === 'skipped' ? 'line-through opacity-50' : ''}`}>
                          {item.title}
                        </span>
                        {/* Status selector */}
                        <select
                          value={item.itemStatus || (item.isCompleted ? 'completed' : 'not_started')}
                          onChange={e => changeItemStatus.mutate({ itemId: item._id, itemStatus: e.target.value })}
                          className="opacity-0 group-hover:opacity-100 text-[10px] rounded border border-border bg-background px-1 py-0.5 transition-opacity"
                          onClick={e => e.stopPropagation()}
                        >
                          {Object.entries(ITEM_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                        <StatusIcon className={`w-3 h-3 shrink-0 ${statusCfg.color}`} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({ task }) {
  const s = TASK_STATUS[task.status] || TASK_STATUS.pending
  const overdue = task.dueDate && isPast(new Date(task.dueDate)) && !['completed', 'cancelled'].includes(task.status)
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${task.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <span className={s.color}>{s.label}</span>
          {task.assignedTo?.length > 0 && (
            <span>→ {task.assignedTo.map(u => u.name).join(', ')}</span>
          )}
          {task.dueDate && (
            <span className={overdue ? 'text-red-400 font-medium' : ''}>
              {overdue ? '⚠ ' : ''}Due {format(new Date(task.dueDate), 'MMM d')}
            </span>
          )}
          {task.priority && (
            <span className={PRIORITY_COLORS[task.priority] || ''}>{task.priority}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Meeting Row ──────────────────────────────────────────────────────────────
function MeetingRow({ meeting }) {
  const upcoming = meeting.date && !isPast(new Date(meeting.date))
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${upcoming ? 'bg-purple-500/10' : 'bg-muted/30'}`}>
        <CalendarDays className={`w-4 h-4 ${upcoming ? 'text-purple-400' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{meeting.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <span>{meeting.date ? format(new Date(meeting.date), 'MMM d, yyyy · h:mm a') : '—'}</span>
          {meeting.duration && <span>{meeting.duration}m</span>}
          <span className={`capitalize px-1 rounded ${
            meeting.status === 'completed' ? 'text-green-400 bg-green-500/10' :
            meeting.status === 'cancelled' ? 'text-red-400 bg-red-500/10' :
            'text-purple-400 bg-purple-500/10'
          }`}>{meeting.status}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main CustomerOpsTab ──────────────────────────────────────────────────────
export default function CustomerOpsTab({ clientId, client }) {
  const qc = useQueryClient()
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [activeSection, setActiveSection] = useState('sops') // sops | tasks | meetings | team

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['customer-ops', clientId],
    queryFn: () => api.get(`/operations/customer/${clientId}/ops`).then(r => r.data.data),
    refetchInterval: REFRESH_MS,
    enabled: !!clientId,
  })

  const sopAssignments = data?.sopAssignments || []
  const tasks = data?.tasks || []
  const meetings = data?.meetings || []
  const teamMembers = data?.teamMembers || []
  const progress = data?.progress || { sop: 0, task: 0, overall: 0 }
  const counts = data?.counts || {}

  const activeSops    = sopAssignments.filter(s => !['archived'].includes(s.status))
  const activeTasks   = tasks.filter(t => !['completed', 'cancelled'].includes(t.status))
  const completedTasks = tasks.filter(t => t.status === 'completed')
  const upcomingMeetings = meetings.filter(m => m.date && !isPast(new Date(m.date)))
  const pastMeetings   = meetings.filter(m => m.date && isPast(new Date(m.date)))

  const SECTIONS = [
    { id: 'sops',     label: 'SOPs',     count: sopAssignments.length,  icon: BookOpen },
    { id: 'tasks',    label: 'Tasks',    count: tasks.length,            icon: CheckSquare },
    { id: 'meetings', label: 'Meetings', count: meetings.length,         icon: CalendarDays },
    { id: 'team',     label: 'Team',     count: teamMembers.length,      icon: Users },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Operations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">SOPs, Tasks, Meetings &amp; Team</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAssignModal(true)}>
            <Plus className="w-3.5 h-3.5" />Assign SOP
          </Button>
        </div>
      </div>

      {/* ── Progress Overview ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Project Progress</p>
        <div className="flex items-center gap-6 flex-wrap">
          {/* Overall ring */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              <ProgressRing value={progress.overall} size={80} color="#6366f1" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold">{progress.overall}%</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Overall</p>
          </div>
          {/* Stats columns */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0">
            {[
              { label: 'SOPs Done', value: `${counts.completedSOPs || 0}/${counts.sops || 0}`, color: 'text-indigo-400', pct: progress.sop },
              { label: 'Tasks Done', value: `${counts.completedTasks || 0}/${counts.tasks || 0}`, color: 'text-blue-400', pct: progress.task },
              { label: 'Overdue Tasks', value: counts.overdueTasks || 0, color: (counts.overdueTasks || 0) > 0 ? 'text-red-400' : 'text-muted-foreground', pct: null },
              { label: 'Upcoming (7d)', value: (counts.upcomingTasks || 0) + (counts.upcomingMeetings || 0), color: 'text-amber-400', pct: null },
            ].map(stat => (
              <div key={stat.label} className="space-y-1">
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                {stat.pct !== null && (
                  <Progress value={stat.pct} className="h-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section nav ── */}
      <div className="flex gap-1 border-b border-border">
        {SECTIONS.map(sec => {
          const Icon = sec.icon
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeSection === sec.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {sec.label}
              {sec.count > 0 && (
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{sec.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Section: SOPs ── */}
      {activeSection === 'sops' && (
        <div className="space-y-3">
          {activeSops.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No SOPs assigned yet</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => setShowAssignModal(true)}>
                <Plus className="w-3.5 h-3.5" />Assign SOP Template
              </Button>
            </div>
          ) : (
            <>
              {activeSops.map(sop => (
                <SOPCard key={sop._id} assignment={sop} clientId={clientId} />
              ))}
              {/* Completed/archived SOPs */}
              {sopAssignments.filter(s => ['archived'].includes(s.status)).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Archived</p>
                  {sopAssignments.filter(s => s.status === 'archived').map(sop => (
                    <SOPCard key={sop._id} assignment={sop} clientId={clientId} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Section: Tasks ── */}
      {activeSection === 'tasks' && (
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-16">
              <CheckSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No tasks for this client</p>
            </div>
          ) : (
            <>
              {/* Active tasks */}
              {activeTasks.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">
                    Active Tasks ({activeTasks.length})
                  </p>
                  <div>
                    {activeTasks.map(task => <TaskRow key={task._id} task={task} />)}
                  </div>
                </div>
              )}
              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">
                    Completed ({completedTasks.length})
                  </p>
                  <div>
                    {completedTasks.slice(0, 10).map(task => <TaskRow key={task._id} task={task} />)}
                    {completedTasks.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{completedTasks.length - 10} more completed
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Section: Meetings ── */}
      {activeSection === 'meetings' && (
        <div className="space-y-4">
          {meetings.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No meetings recorded</p>
            </div>
          ) : (
            <>
              {upcomingMeetings.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">
                    Upcoming ({upcomingMeetings.length})
                  </p>
                  <div>
                    {upcomingMeetings.map(m => <MeetingRow key={m._id} meeting={m} />)}
                  </div>
                </div>
              )}
              {pastMeetings.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">
                    Past ({pastMeetings.length})
                  </p>
                  <div>
                    {pastMeetings.slice(0, 10).map(m => <MeetingRow key={m._id} meeting={m} />)}
                    {pastMeetings.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        +{pastMeetings.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Section: Team ── */}
      {activeSection === 'team' && (
        <div className="space-y-3">
          {teamMembers.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No team members assigned yet</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {teamMembers.map(member => {
                const memberTasks = tasks.filter(t =>
                  Array.isArray(t.assignedTo)
                    ? t.assignedTo.some(u => String(u._id || u) === String(member._id))
                    : String(t.assignedTo) === String(member._id)
                )
                const memberSOPs = sopAssignments.filter(s =>
                  String(s.assignedTo?._id || s.assignedTo) === String(member._id)
                )
                const completedCount = memberTasks.filter(t => t.status === 'completed').length

                return (
                  <div key={member._id} className="flex items-center gap-3 p-4">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                      {member.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{member.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{memberTasks.length} task{memberTasks.length !== 1 ? 's' : ''}</span>
                        <span>{memberSOPs.length} SOP{memberSOPs.length !== 1 ? 's' : ''}</span>
                        {memberTasks.length > 0 && (
                          <span className="text-green-400">{completedCount} done</span>
                        )}
                      </div>
                    </div>
                    {memberTasks.length > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold">
                          {Math.round((completedCount / memberTasks.length) * 100)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">complete</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Assign SOP Modal ── */}
      <AssignSOPModal
        clientId={clientId}
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onAssigned={() => {
          qc.invalidateQueries(['customer-ops', clientId])
          qc.invalidateQueries(['customer-sop', clientId])
        }}
      />
    </div>
  )
}
