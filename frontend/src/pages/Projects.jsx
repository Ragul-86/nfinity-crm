import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCcw } from 'lucide-react'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import DataTable from '@/components/common/DataTable'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const STATUS_VARIANTS = { planning: 'secondary', in_progress: 'info', on_hold: 'warning', completed: 'success' }
const AUTO_REFRESH_MS = 30_000

export default function Projects() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['projects', page, search],
    queryFn: () => api.get('/projects', { params: { page, limit: 10, search } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { limit: 100 } }).then(r => r.data),
  })

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm()

  const mutation = useMutation({
    mutationFn: (d) => editProject ? api.put(`/projects/${editProject._id}`, d) : api.post('/projects', d),
    onSuccess: () => {
      queryClient.invalidateQueries(['projects'])
      toast.success(editProject ? 'Project updated' : 'Project created')
      setShowModal(false)
      reset()
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Action failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['projects'])
      toast.success('Project deleted')
      setConfirmDelete(null)
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Delete failed'),
  })

  const toDateInput = (v) => v ? format(new Date(v), 'yyyy-MM-dd') : ''
  const openEdit = (p) => {
    setEditProject(p)
    reset({ ...p, client: p.client?._id, startDate: toDateInput(p.startDate), endDate: toDateInput(p.endDate) })
    setShowModal(true)
  }

  const columns = [
    {
      key: 'name', label: 'Project', sortable: true,
      render: (v, row) => (
        <div>
          <p className="font-medium">{v}</p>
          <p className="text-xs text-muted-foreground">{row.client?.companyName}</p>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (v) => <Badge variant={STATUS_VARIANTS[v] || 'secondary'} className="capitalize">{v?.replace('_', ' ')}</Badge>,
    },
    {
      key: 'progress', label: 'Progress',
      render: (v) => (
        <div className="min-w-[100px]">
          <div className="flex justify-between text-xs mb-1"><span>{v || 0}%</span></div>
          <Progress value={v || 0} className="h-1.5" />
        </div>
      ),
    },
    {
      key: 'budget', label: 'Budget',
      render: (v, row) => (
        <div className="text-xs">
          <p>₹{(row.budgetSpent || 0).toLocaleString()} / ₹{(v || 0).toLocaleString()}</p>
        </div>
      ),
    },
    {
      key: 'endDate', label: 'Due',
      render: (v) => v ? format(new Date(v), 'MMM d, yyyy') : '—',
    },
    {
      key: 'assignedManager', label: 'Manager',
      render: (v) => v?.name || '—',
    },
    {
      key: '_id', label: '',
      render: (_, row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">•••</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setConfirmDelete(row)}
            >
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
        title="Projects"
        description="Track project progress and timelines"
        action={{ label: 'New Project', icon: Plus, onClick: () => { setEditProject(null); reset({}); setShowModal(true) } }}
      />

      <div className="flex items-center justify-end mb-4 gap-2">
        {isRefetching && <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <DataTable
        columns={columns} data={data?.data} loading={isLoading}
        searchable searchPlaceholder="Search projects..."
        onSearch={useCallback((v) => { setSearch(v); setPage(1) }, [])}
        pagination={data ? { page, limit: 10, total: data.total, onChange: setPage } : undefined}
      />

      {/* Edit / Create Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editProject ? 'Edit Project' : 'New Project'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Project Name *</Label>
                <Input {...register('name', { required: true })} placeholder="Project name" />
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select onValueChange={(v) => setValue('client', v)} defaultValue={editProject?.client?._id}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clientsData?.data?.map(c => <SelectItem key={c._id} value={c._id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select onValueChange={(v) => setValue('status', v)} defaultValue={editProject?.status || 'planning'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['planning', 'in_progress', 'on_hold', 'completed'].map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select onValueChange={(v) => setValue('priority', v)} defaultValue={editProject?.priority || 'medium'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'urgent'].map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Budget (₹)</Label>
                <Input {...register('budget', { valueAsNumber: true })} type="number" placeholder="50000" />
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
                <Label>Progress (%)</Label>
                <Input {...register('progress', { valueAsNumber: true })} type="number" min="0" max="100" placeholder="0" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Input {...register('description')} placeholder="Project description..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                {editProject ? 'Update' : 'Create'} Project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Delete Project"
        description={`Delete "${confirmDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
