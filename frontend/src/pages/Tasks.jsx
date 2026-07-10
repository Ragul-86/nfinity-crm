import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCcw, List, Kanban, MoreHorizontal } from 'lucide-react'
import { motion } from 'framer-motion'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import DataTable from '@/components/common/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/utils/cn'

const STATUS_VARIANTS = { pending: 'secondary', in_progress: 'info', review: 'warning', completed: 'success' }
const PRIORITY_VARIANTS = { low: 'secondary', medium: 'info', high: 'warning', urgent: 'destructive' }
const KANBAN_COLS = ['pending', 'in_progress', 'review', 'completed']
const AUTO_REFRESH_MS = 30_000

export default function Tasks() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['tasks', page, search],
    queryFn: () => api.get('/tasks', { params: { page, limit: 20, search } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm()

  const mutation = useMutation({
    mutationFn: (d) => editTask ? api.put(`/tasks/${editTask._id}`, d) : api.post('/tasks', d),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks'])
      toast.success(editTask ? 'Task updated' : 'Task created')
      setShowModal(false)
      reset()
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Action failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['tasks']); toast.success('Task deleted') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Delete failed'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/tasks/${id}`, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries(['tasks'])
      toast.success(`Task marked as ${status.replace('_', ' ')}`)
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Status update failed'),
  })

  const toDateInput = (v) => v ? format(new Date(v), 'yyyy-MM-dd') : ''
  const openEdit = (t) => { setEditTask(t); reset({ ...t, dueDate: toDateInput(t.dueDate) }); setShowModal(true) }

  const allTasks = data?.data || []

  const columns = [
    {
      key: 'title', label: 'Task', sortable: true,
      render: (v, row) => (
        <div>
          <p className="font-medium">{v}</p>
          <p className="text-xs text-muted-foreground">{row.project?.name}</p>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (v) => <Badge variant={STATUS_VARIANTS[v] || 'secondary'} className="capitalize">{v?.replace('_', ' ')}</Badge>,
    },
    {
      key: 'priority', label: 'Priority',
      render: (v) => <Badge variant={PRIORITY_VARIANTS[v] || 'secondary'} className="capitalize">{v}</Badge>,
    },
    {
      key: 'assignedTo', label: 'Assigned',
      render: (v) => (
        <div className="flex -space-x-1">
          {(v || []).slice(0, 3).map((u, i) => (
            <div key={i} className="w-6 h-6 rounded-full bg-primary/20 border border-background flex items-center justify-center text-xs text-primary font-medium">
              {u.name?.charAt(0)}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'dueDate', label: 'Due',
      render: (v) => {
        if (!v) return '—'
        const d = new Date(v)
        const overdue = d < new Date()
        return <span className={overdue ? 'text-destructive font-medium' : ''}>{format(d, 'MMM d, yyyy')}</span>
      },
    },
    {
      key: '_id', label: '',
      render: (_, row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            {KANBAN_COLS.map(s => (
              <DropdownMenuItem
                key={s}
                disabled={row.status === s || statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: row._id, status: s })}
                className="capitalize"
              >
                Mark as {s.replace('_', ' ')}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(row._id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Manage and track all tasks"
        action={{ label: 'New Task', icon: Plus, onClick: () => { setEditTask(null); reset({}); setShowModal(true) } }}
      />

      <div className="flex items-center justify-end mb-4 gap-2">
        {isRefetching && <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-2"><List className="w-4 h-4" />List</TabsTrigger>
          <TabsTrigger value="kanban" className="gap-2"><Kanban className="w-4 h-4" />Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <DataTable
            columns={columns} data={allTasks} loading={isLoading || isRefetching}
            searchable searchPlaceholder="Search tasks…"
            onSearch={useCallback((v) => { setSearch(v); setPage(1) }, [])}
            pagination={data ? { page, limit: 20, total: data.total, onChange: setPage } : undefined}
          />
        </TabsContent>

        <TabsContent value="kanban">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {KANBAN_COLS.map(col => {
              const colTasks = allTasks.filter(t => t.status === col)
              return (
                <div key={col} className="bg-muted/30 rounded-xl p-3 min-h-[400px]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold capitalize">{col.replace('_', ' ')}</span>
                    <Badge variant={STATUS_VARIANTS[col]} className="text-xs">{colTasks.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {colTasks.map(task => (
                      <motion.div
                        key={task._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow"
                        onClick={() => openEdit(task)}
                      >
                        <p className="text-sm font-medium mb-1 line-clamp-2">{task.title}</p>
                        <div className="flex items-center justify-between">
                          <Badge variant={PRIORITY_VARIANTS[task.priority]} className="text-xs capitalize">{task.priority}</Badge>
                          {task.dueDate && (
                            <span className={cn('text-xs', new Date(task.dueDate) < new Date() && task.status !== 'completed' ? 'text-destructive' : 'text-muted-foreground')}>
                              {format(new Date(task.dueDate), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editTask ? 'Edit Task' : 'New Task'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Title *</Label>
                <Input {...register('title', { required: true })} placeholder="Task title" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Input {...register('description')} placeholder="Task description..." />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select onValueChange={(v) => setValue('priority', v)} defaultValue={editTask?.priority || 'medium'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'urgent'].map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select onValueChange={(v) => setValue('status', v)} defaultValue={editTask?.status || 'pending'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KANBAN_COLS.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input {...register('dueDate')} type="date" />
              </div>
              <div className="space-y-1.5">
                <Label>Estimated Hours</Label>
                <Input {...register('estimatedHours', { valueAsNumber: true })} type="number" placeholder="2" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                {editTask ? 'Update' : 'Create'} Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
