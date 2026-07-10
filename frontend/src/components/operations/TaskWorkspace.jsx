import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, List, LayoutGrid, MoreHorizontal, Search, RefreshCcw,
  CheckSquare, AlertTriangle, Clock, Tag, MessageSquare, Paperclip,
  Link as LinkIcon, Copy, Trash2, Eye, Edit, Filter,
} from 'lucide-react'
import { format, isPast } from 'date-fns'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = [
  { id: 'pending',     label: 'To Do',      color: 'bg-muted text-muted-foreground',          border: 'border-border' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-500/10 text-blue-400',            border: 'border-blue-500/30' },
  { id: 'review',      label: 'Review',      color: 'bg-amber-500/10 text-amber-400',          border: 'border-amber-500/30' },
  { id: 'blocked',     label: 'Blocked',     color: 'bg-orange-500/10 text-orange-400',        border: 'border-orange-500/30' },
  { id: 'completed',   label: 'Completed',   color: 'bg-green-500/10 text-green-400',          border: 'border-green-500/30' },
  { id: 'cancelled',   label: 'Cancelled',   color: 'bg-muted/60 text-muted-foreground/60',    border: 'border-dashed border-border' },
]
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.id, s]))

const PRIORITIES = [
  { id: 'low',    label: 'Low',    color: 'text-green-400' },
  { id: 'medium', label: 'Medium', color: 'text-amber-400' },
  { id: 'high',   label: 'High',   color: 'text-orange-400' },
  { id: 'urgent', label: 'Urgent', color: 'text-red-400' },
]
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map(p => [p.id, p]))

const REFRESH_MS = 30_000
const KANBAN_COLS = ['pending', 'in_progress', 'review', 'blocked', 'completed', 'cancelled']

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onEdit, onDelete, onDuplicate, onView, onStatusChange }) {
  const overdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== 'completed'
  const st = STATUS_MAP[task.status] || STATUS_MAP['pending']
  const pr = PRIORITY_MAP[task.priority] || PRIORITY_MAP['medium']

  return (
    <div className={`rounded-xl border bg-card p-3 space-y-2 hover:shadow-md transition-shadow ${st.border}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-0.5 rounded hover:bg-accent shrink-0"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(task)}><Eye className="w-3.5 h-3.5 mr-2" />View</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(task)}><Edit className="w-3.5 h-3.5 mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(task._id)}><Copy className="w-3.5 h-3.5 mr-2" />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            {STATUSES.filter(s => s.id !== task.status).slice(0, 3).map(s => (
              <DropdownMenuItem key={s.id} onClick={() => onStatusChange(task._id, s.id)}>
                Move to {s.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task._id)}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-1">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted ${pr.color}`}>{pr.label}</span>
      </div>

      {task.client && (
        <p className="text-[10px] text-muted-foreground truncate">{task.client.companyName}</p>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {task.dueDate ? (
          <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
            <Clock className="w-3 h-3" />{format(new Date(task.dueDate), 'MMM d')}
            {overdue && ' (Overdue)'}
          </span>
        ) : <span />}
        <div className="flex items-center gap-2">
          {task.comments?.length > 0 && (
            <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{task.comments.length}</span>
          )}
          {task.attachments?.length > 0 && (
            <span className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{task.attachments.length}</span>
          )}
          {task.dependencies?.length > 0 && (
            <span className="flex items-center gap-0.5"><LinkIcon className="w-3 h-3" />{task.dependencies.length}</span>
          )}
        </div>
      </div>

      {task.assignedTo?.length > 0 && (
        <div className="flex -space-x-1">
          {task.assignedTo.slice(0, 3).map(u => (
            <div key={u._id || u} title={u.name}
              className="w-5 h-5 rounded-full bg-primary/10 border border-background flex items-center justify-center text-[9px] font-bold text-primary">
              {(u.name || '?')[0]}
            </div>
          ))}
          {task.assignedTo.length > 3 && (
            <div className="w-5 h-5 rounded-full bg-muted border border-background flex items-center justify-center text-[9px] text-muted-foreground">
              +{task.assignedTo.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({ open, onClose, editTask, clients, users, tasks: allTasks }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm({
    defaultValues: editTask || { status: 'pending', priority: 'medium' },
  })

  const mutation = useMutation({
    mutationFn: d => editTask ? api.put(`/tasks/${editTask._id}`, d) : api.post('/tasks', d),
    onSuccess: () => {
      qc.invalidateQueries(['ops-tasks'])
      qc.invalidateQueries(['tasks'])
      toast.success(editTask ? 'Task updated' : 'Task created')
      onClose()
      reset()
    },
    onError: e => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const onSubmit = (data) => {
    mutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTask ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Task Name *</Label>
            <Input {...register('title', { required: true })} placeholder="Enter task name" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea {...register('description')} placeholder="Task description..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...register('status')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <select {...register('priority')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" {...register('startDate')}
                defaultValue={editTask?.startDate ? editTask.startDate.slice(0, 10) : ''} />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" {...register('dueDate')}
                defaultValue={editTask?.dueDate ? editTask.dueDate.slice(0, 10) : ''} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Customer</Label>
              <select {...register('client')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— None —</option>
                {(clients || []).map(c => <option key={c._id} value={c._id}>{c.companyName}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Assigned To</Label>
              <select {...register('assignedTo')} multiple className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-20">
                {(users || []).map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Estimated Hours</Label>
              <Input type="number" min="0" step="0.5" {...register('estimatedHours')} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Tags (comma-separated)</Label>
              <Input {...register('tags')} placeholder="design, urgent, q1" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea {...register('notes')} placeholder="Additional notes..." rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : editTask ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Task View Modal ──────────────────────────────────────────────────────────
function TaskViewModal({ task, open, onClose, onAddComment }) {
  const [comment, setComment] = useState('')
  const qc = useQueryClient()

  const commentMut = useMutation({
    mutationFn: () => api.post(`/tasks/${task._id}/comments`, { content: comment }),
    onSuccess: () => {
      qc.invalidateQueries(['ops-tasks'])
      setComment('')
      toast.success('Comment added')
    },
  })

  if (!task) return null
  const st = STATUS_MAP[task.status] || STATUS_MAP['pending']
  const pr = PRIORITY_MAP[task.priority] || PRIORITY_MAP['medium']

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${st.color}`}>{st.label}</span>
            <span className={`text-xs font-medium px-2 py-1 rounded-md bg-muted ${pr.color}`}>{pr.label}</span>
            {task.dueDate && (
              <span className={`text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-muted ${isPast(new Date(task.dueDate)) && task.status !== 'completed' ? 'text-red-400' : 'text-muted-foreground'}`}>
                <Clock className="w-3 h-3" />Due {format(new Date(task.dueDate), 'MMM d, yyyy')}
              </span>
            )}
          </div>

          {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}

          <div className="grid grid-cols-2 gap-3 text-xs">
            {task.client && <div><span className="text-muted-foreground">Customer: </span>{task.client.companyName}</div>}
            {task.assignedTo?.length > 0 && <div><span className="text-muted-foreground">Assigned: </span>{task.assignedTo.map(u => u.name || u).join(', ')}</div>}
            {task.startDate && <div><span className="text-muted-foreground">Start: </span>{format(new Date(task.startDate), 'MMM d, yyyy')}</div>}
            {task.estimatedHours > 0 && <div><span className="text-muted-foreground">Est. Hours: </span>{task.estimatedHours}h</div>}
          </div>

          {task.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>)}
            </div>
          )}

          {task.dependencies?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Dependencies ({task.dependencies.length})</p>
              <div className="space-y-1">
                {task.dependencies.map(dep => (
                  <div key={dep._id || dep} className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <LinkIcon className="w-3 h-3" />{dep.title || dep}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Comments ({task.comments?.length || 0})</p>
            <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
              {(task.comments || []).map((c, i) => (
                <div key={i} className="text-xs bg-muted/40 rounded-lg p-2">
                  <p className="font-medium">{c.author?.name || 'Unknown'}</p>
                  <p className="text-muted-foreground mt-0.5">{c.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" className="text-sm" />
              <Button size="sm" onClick={() => commentMut.mutate()} disabled={!comment.trim() || commentMut.isLoading}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main TaskWorkspace ───────────────────────────────────────────────────────
export default function TaskWorkspace() {
  const qc = useQueryClient()
  const [view, setView]       = useState('kanban')
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask]   = useState(null)
  const [viewTask, setViewTask]   = useState(null)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['ops-tasks', search, filterStatus, filterPriority],
    queryFn: () => api.get('/tasks', {
      params: { search, status: filterStatus || undefined, priority: filterPriority || undefined, limit: 200 }
    }).then(r => r.data),
    refetchInterval: REFRESH_MS,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { limit: 200 } }).then(r => r.data),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries(['ops-tasks']); toast.success('Task deleted') },
  })

  const duplicateMut = useMutation({
    mutationFn: id => api.post(`/tasks/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries(['ops-tasks']); toast.success('Task duplicated') },
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries(['ops-tasks']),
  })

  const tasks = data?.data || []
  const clients = clientsData?.data || []
  const users = usersData?.data || usersData?.users || []

  const handleEdit = (t) => { setEditTask(t); setShowModal(true) }
  const handleCloseModal = () => { setShowModal(false); setEditTask(null) }

  // ── Kanban View ──
  const KanbanView = () => (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLS.map(col => {
        const s = STATUS_MAP[col]
        const colTasks = tasks.filter(t => t.status === col)
        return (
          <div key={col} className="min-w-[230px] max-w-[260px] flex-shrink-0">
            <div className={`flex items-center justify-between px-2 py-1.5 rounded-lg mb-2 ${s.color}`}>
              <span className="text-xs font-semibold">{s.label}</span>
              <span className="text-xs font-bold">{colTasks.length}</span>
            </div>
            <div className="space-y-2">
              {colTasks.map(t => (
                <TaskCard key={t._id} task={t}
                  onEdit={handleEdit}
                  onDelete={id => deleteMut.mutate(id)}
                  onDuplicate={id => duplicateMut.mutate(id)}
                  onView={t => setViewTask(t)}
                  onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                />
              ))}
              <button
                onClick={() => { setEditTask({ status: col }); setShowModal(true) }}
                className="w-full py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                + Add task
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── List View ──
  const ListView = () => (
    <div className="space-y-1">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-2 px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
        <span>Task</span><span>Status</span><span>Priority</span><span>Due Date</span><span>Assigned To</span><span />
      </div>
      {tasks.map(t => {
        const st = STATUS_MAP[t.status] || STATUS_MAP['pending']
        const pr = PRIORITY_MAP[t.priority] || PRIORITY_MAP['medium']
        const overdue = t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'completed'
        return (
          <div key={t._id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-2 px-3 py-2.5 rounded-lg hover:bg-accent/40 transition-colors text-sm items-center border border-transparent hover:border-border">
            <div>
              <p className="font-medium truncate">{t.title}</p>
              {t.client && <p className="text-[10px] text-muted-foreground">{t.client.companyName}</p>}
            </div>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded w-fit ${st.color}`}>{st.label}</span>
            <span className={`text-xs font-medium ${pr.color}`}>{pr.label}</span>
            <span className={`text-xs ${overdue ? 'text-red-400' : 'text-muted-foreground'}`}>
              {t.dueDate ? format(new Date(t.dueDate), 'MMM d, yyyy') : '—'}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {t.assignedTo?.map(u => u.name || u).join(', ') || '—'}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-muted"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewTask(t)}><Eye className="w-3.5 h-3.5 mr-2" />View</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEdit(t)}><Edit className="w-3.5 h-3.5 mr-2" />Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicateMut.mutate(t._id)}><Copy className="w-3.5 h-3.5 mr-2" />Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => deleteMut.mutate(t._id)}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
      {tasks.length === 0 && !isLoading && (
        <p className="text-center text-muted-foreground text-sm py-10">No tasks found</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8 w-52 h-9 text-sm" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">All Priority</option>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button onClick={() => refetch()} className="p-2 rounded-md border border-border hover:bg-accent text-muted-foreground">
            <RefreshCcw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button onClick={() => setView('kanban')} className={`px-3 py-1.5 text-xs ${view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 text-xs ${view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditTask(null); setShowModal(true) }}>
            <Plus className="w-3.5 h-3.5" />New Task
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : view === 'kanban' ? <KanbanView /> : <ListView />}

      {/* Modals */}
      <TaskModal
        open={showModal} onClose={handleCloseModal}
        editTask={editTask?._id ? editTask : null}
        clients={clients} users={users} tasks={tasks}
      />
      <TaskViewModal open={!!viewTask} task={viewTask} onClose={() => setViewTask(null)} />
    </div>
  )
}
