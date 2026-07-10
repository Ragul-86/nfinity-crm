import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, isPast } from 'date-fns'
import { Plus, CheckSquare2, Circle, AlertCircle, Edit2, Trash2 } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: 'bg-muted text-muted-foreground' },
  medium:   { label: 'Medium',   color: 'bg-blue-500/10 text-blue-400' },
  high:     { label: 'High',     color: 'bg-amber-500/10 text-amber-400' },
  urgent:   { label: 'Urgent',   color: 'bg-red-500/10 text-red-400' },
}

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']

function TaskFormDialog({ open, onClose, clientId, task, onSaved }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: task ? {
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'medium',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      status: task.status || 'pending',
    } : { title: '', description: '', priority: 'medium', dueDate: '', status: 'pending' },
  })

  const onSubmit = async (data) => {
    try {
      if (task) {
        await api.put(`/customers/tasks/${task._id}`, data)
        toast.success('Task updated')
      } else {
        await api.post(`/customers/${clientId}/tasks`, data)
        toast.success('Task created')
      }
      onSaved()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input {...register('title', { required: true })} placeholder="Task title" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input {...register('description')} placeholder="Details…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select {...register('priority')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" {...register('dueDate')} />
            </div>
          </div>
          {task && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select {...register('status')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{task ? 'Update' : 'Create Task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function TasksTab({ clientId }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [filter, setFilter] = useState('all')

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['customer-tasks', clientId],
    queryFn: () => api.get(`/customers/${clientId}/tasks`).then(r => r.data.data),
  })

  const toggleMut = useMutation({
    mutationFn: task => api.put(`/customers/tasks/${task._id}`, {
      status: task.status === 'completed' ? 'pending' : 'completed'
    }),
    onSuccess: () => qc.invalidateQueries(['customer-tasks', clientId]),
  })

  const invalidate = () => {
    qc.invalidateQueries(['customer-tasks', clientId])
    qc.invalidateQueries(['customer-workspace', clientId])
  }

  const filtered = filter === 'all' ? tasks
    : filter === 'open' ? tasks.filter(t => !['completed', 'cancelled'].includes(t.status))
    : tasks.filter(t => t.status === filter)

  const counts = {
    all: tasks.length,
    open: tasks.filter(t => !['completed', 'cancelled'].includes(t.status)).length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter pills */}
        <div className="flex gap-1.5">
          {[['all', 'All'], ['open', 'Open'], ['completed', 'Done']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                filter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}>
              {label} ({counts[k] ?? 0})
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Add Task
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckSquare2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tasks</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>Create Task</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
            const isDone = task.status === 'completed'
            const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isDone
            return (
              <div key={task._id} className={`bg-card border rounded-xl p-4 flex items-start gap-3 transition-opacity ${isDone ? 'opacity-60' : ''} ${isOverdue ? 'border-red-500/30' : 'border-border'}`}>
                <button onClick={() => toggleMut.mutate(task)} className="mt-0.5 shrink-0">
                  {isDone
                    ? <CheckSquare2 className="w-5 h-5 text-green-400" />
                    : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                  {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.color}`}>{p.label}</span>
                    {task.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {isOverdue && <AlertCircle className="w-3 h-3" />}
                        {format(new Date(task.dueDate), 'MMM d')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">{task.status?.replace('_', ' ')}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditTask(task)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <TaskFormDialog open={showCreate} onClose={() => setShowCreate(false)} clientId={clientId} onSaved={invalidate} />
      {editTask && (
        <TaskFormDialog open={!!editTask} onClose={() => setEditTask(null)} clientId={clientId} task={editTask}
          onSaved={() => { invalidate(); setEditTask(null) }} />
      )}
    </div>
  )
}
