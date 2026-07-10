import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'

const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', employee: 'Employee', viewer: 'Viewer' }

const EMPTY = {
  name: '', email: '', phone: '', role: 'employee',
  department: '', designation: '', sendWelcomeEmail: true,
}

export default function InviteUserModal({ open, onClose }) {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  // Load team members for "Reporting Manager" dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users-simple'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data),
    enabled: open,
  })
  const managers = (usersData?.data || []).filter(u =>
    ['super_admin', 'client_super_admin', 'admin', 'manager'].includes(u.role)
  )

  const mutation = useMutation({
    mutationFn: (body) => api.post('/invitations', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Invitation sent successfully!')
      qc.invalidateQueries(['users'])
      onClose()
      setForm(EMPTY)
      setErrors({})
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to send invitation'),
  })

  const f = (field) => (e) => setForm(p => ({ ...p, [field]: typeof e === 'string' ? e : e.target.value }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handle = (e) => {
    e.preventDefault()
    if (validate()) mutation.mutate(form)
  }

  const close = () => { onClose(); setForm(EMPTY); setErrors({}) }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Invite Team Member
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-5">
          {/* Basic Info */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Basic Information</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input placeholder="Jane Smith" value={form.name} onChange={f('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="jane@company.com" value={form.email} onChange={f('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="+1 234 567 8900" value={form.phone} onChange={f('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Select value={form.role} onValueChange={f('role')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Work Details */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Work Details</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Marketing" value={form.department} onChange={f('department')} />
              </div>
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input placeholder="Marketing Manager" value={form.designation} onChange={f('designation')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Reporting Manager</Label>
                <Select value={form.reportingManager || ''} onValueChange={(v) => setForm(p => ({ ...p, reportingManager: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select manager…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {managers.map(m => (
                      <SelectItem key={m._id} value={m._id}>{m.name} ({ROLE_LABELS[m.role] || m.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium">Send Welcome Email</p>
              <p className="text-xs text-muted-foreground">Notify the user with an invitation link</p>
            </div>
            <Switch
              checked={form.sendWelcomeEmail}
              onCheckedChange={(v) => setForm(p => ({ ...p, sendWelcomeEmail: v }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending…' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
