import { useEffect, useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { UserCog } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'

const ROLE_LABELS = {
  super_admin: 'Super Admin', client_super_admin: 'Super Admin',
  admin: 'Admin', manager: 'Manager', employee: 'Employee', viewer: 'Viewer',
}
const STATUS_LABELS = {
  active: 'Active', inactive: 'Inactive', deactivated: 'Deactivated', suspended: 'Suspended',
}

export default function EditUserModal({ open, onClose, user: targetUser }) {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const isSuperAdmin = ['super_admin', 'client_super_admin'].includes(me?.role)
  const isAdmin = me?.role === 'admin' || isSuperAdmin

  const [form, setForm] = useState({
    name: '', phone: '', department: '', designation: '',
    role: 'employee', status: 'active',
  })

  useEffect(() => {
    if (targetUser) {
      setForm({
        name:        targetUser.name || '',
        phone:       targetUser.phone || '',
        department:  targetUser.department || '',
        designation: targetUser.designation || '',
        role:        targetUser.role || 'employee',
        status:      targetUser.status || (targetUser.isActive ? 'active' : 'inactive'),
      })
    }
  }, [targetUser])

  // Managers dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users-simple'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data),
    enabled: open,
  })
  const managers = (usersData?.data || []).filter(u =>
    ['super_admin', 'client_super_admin', 'admin', 'manager'].includes(u.role) &&
    u._id !== targetUser?._id
  )

  const mutation = useMutation({
    mutationFn: (body) => api.put(`/users/${targetUser._id}`, body).then(r => r.data),
    onSuccess: () => {
      toast.success('User updated')
      qc.invalidateQueries(['users'])
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Update failed'),
  })

  const f = (field) => (e) => setForm(p => ({ ...p, [field]: typeof e === 'string' ? e : e.target.value }))

  const handle = (e) => {
    e.preventDefault()
    const body = { name: form.name, phone: form.phone, department: form.department, designation: form.designation }
    if (isSuperAdmin) { body.role = form.role; body.status = form.status }
    mutation.mutate(body)
  }

  if (!targetUser) return null

  const editableRoles = isSuperAdmin
    ? ['admin', 'manager', 'employee', 'viewer']
    : []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" />
            Edit User — {targetUser.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-5">
          {/* Basic */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Basic Information</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Full Name</Label>
                <Input value={form.name} onChange={f('name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="+1 234 567 8900" value={form.phone} onChange={f('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Marketing" value={form.department} onChange={f('department')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Designation</Label>
                <Input placeholder="Marketing Manager" value={form.designation} onChange={f('designation')} />
              </div>
            </div>
          </div>

          {/* Access — super admin only */}
          {isSuperAdmin && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Access</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={f('role')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {editableRoles.map(r => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={f('status')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
