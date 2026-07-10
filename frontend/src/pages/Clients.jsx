import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCcw, MoreHorizontal, ExternalLink } from 'lucide-react'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import DataTable from '@/components/common/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const STATUS_VARIANTS = { active: 'success', inactive: 'secondary', prospect: 'info' }
const AUTO_REFRESH_MS = 30_000

export default function Clients() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['clients', page, search],
    queryFn: () => api.get('/clients', { params: { page, limit: 10, search } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm()

  const mutation = useMutation({
    mutationFn: (d) => editClient ? api.put(`/clients/${editClient._id}`, d) : api.post('/clients', d),
    onSuccess: () => {
      queryClient.invalidateQueries(['clients'])
      toast.success(editClient ? 'Client updated' : 'Client created')
      setShowModal(false)
      setEditClient(null)
      reset()
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Action failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/clients/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['clients']); toast.success('Client deleted') },
    onError: (err) => toast.error(err?.response?.data?.message || 'Delete failed'),
  })

  const navigate = useNavigate()
  const openEdit = (client) => { setEditClient(client); reset(client); setShowModal(true) }
  const handleSearch = useCallback((v) => { setSearch(v); setPage(1) }, [])

  const columns = [
    {
      key: 'companyName', label: 'Company', sortable: true,
      render: (v, row) => (
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => navigate(`/clients/${row._id}`)}
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {v?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium group-hover:text-primary transition-colors">{v}</p>
            <p className="text-xs text-muted-foreground">{row.industry}</p>
          </div>
        </div>
      ),
    },
    { key: 'contactPerson', label: 'Contact' },
    {
      key: 'email', label: 'Email',
      render: (v) => <a href={`mailto:${v}`} className="text-primary hover:underline text-sm">{v}</a>,
    },
    { key: 'phone', label: 'Phone' },
    {
      key: 'status', label: 'Status',
      render: (v) => <Badge variant={STATUS_VARIANTS[v] || 'secondary'} className="capitalize">{v}</Badge>,
    },
    { key: 'createdAt', label: 'Added', render: (v) => v ? format(new Date(v), 'MMM d, yyyy') : '—' },
    {
      key: '_id', label: '',
      render: (_, row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/clients/${row._id}`)}>
              <ExternalLink className="w-3.5 h-3.5 mr-2" />Open Workspace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem>
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
        title="Clients"
        description="Manage your client relationships"
        action={{ label: 'Add Client', icon: Plus, onClick: () => { setEditClient(null); reset({}); setShowModal(true) } }}
      />

      <div className="flex items-center justify-end mb-4 gap-2">
        {isRefetching && <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <DataTable
        columns={columns} data={data?.data} loading={isLoading || isRefetching}
        searchable searchPlaceholder="Search clients…"
        onSearch={handleSearch}
        pagination={data ? { page, limit: 10, total: data.total, onChange: setPage } : undefined}
      />

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editClient ? 'Edit Client' : 'Add Client'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'companyName', label: 'Company Name *', placeholder: 'Acme Corp' },
                { id: 'industry', label: 'Industry', placeholder: 'Technology' },
                { id: 'contactPerson', label: 'Contact Person *', placeholder: 'Jane Smith' },
                { id: 'email', label: 'Email *', placeholder: 'contact@acme.com', type: 'email' },
                { id: 'phone', label: 'Phone', placeholder: '+1 234 567 8900' },
                { id: 'website', label: 'Website', placeholder: 'https://acme.com' },
              ].map(({ id, label, placeholder, type }) => (
                <div key={id} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input {...register(id)} type={type || 'text'} placeholder={placeholder} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select onValueChange={(v) => setValue('status', v)} defaultValue={editClient?.status || 'active'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['active', 'inactive', 'prospect'].map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Input {...register('notes')} placeholder="Any additional notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                {editClient ? 'Update' : 'Create'} Client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
