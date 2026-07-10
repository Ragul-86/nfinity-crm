import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  User, Mail, Phone, Building2, Briefcase, Target, CheckSquare,
  Clock, Calendar, Shield, Activity, Hash,
} from 'lucide-react'
import api from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

const ROLE_VARIANTS = {
  super_admin: 'destructive', client_super_admin: 'destructive',
  admin: 'warning', manager: 'info', employee: 'secondary', viewer: 'outline',
}
const ROLE_LABELS = {
  super_admin: 'Super Admin', client_super_admin: 'Super Admin',
  admin: 'Admin', manager: 'Manager', employee: 'Employee', viewer: 'Viewer',
}
const STATUS_VARIANTS = {
  active: 'success', inactive: 'warning', deactivated: 'destructive',
  pending_invitation: 'info', suspended: 'warning',
}
const STATUS_LABELS = {
  active: 'Active', inactive: 'Inactive', deactivated: 'Deactivated',
  pending_invitation: 'Pending Invitation', suspended: 'Suspended',
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-medium mt-0.5 break-all">{value || '—'}</p>
      </div>
    </div>
  )
}

function StatPill({ label, value, loading }) {
  return (
    <div className="flex-1 bg-muted/50 rounded-lg p-3 text-center">
      {loading ? (
        <Skeleton className="h-6 w-8 mx-auto mb-1" />
      ) : (
        <p className="text-xl font-bold">{value ?? 0}</p>
      )}
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

export default function UserProfileModal({ open, onClose, userId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => api.get(`/users/${userId}`).then(r => r.data),
    enabled: open && !!userId,
  })

  const u = data?.data
  const status = u?.status || (u?.isActive ? 'active' : 'inactive')

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            User Profile
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {/* Avatar + name header */}
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={u?.avatar} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                  {u?.name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-base truncate">{u?.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{u?.email}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge variant={ROLE_VARIANTS[u?.role] || 'secondary'} className="text-xs">
                    {ROLE_LABELS[u?.role] || u?.role}
                  </Badge>
                  <Badge variant={STATUS_VARIANTS[status] || 'secondary'} className="text-xs">
                    {STATUS_LABELS[status] || status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-3">
              <StatPill label="Assigned Leads" value={u?.assignedLeads} loading={isLoading} />
              <StatPill label="Open Tasks" value={u?.assignedTasks} loading={isLoading} />
            </div>

            {/* Details */}
            <div>
              <InfoRow icon={Mail} label="Email" value={u?.email} />
              <InfoRow icon={Phone} label="Phone" value={u?.phone} />
              <InfoRow icon={Building2} label="Department" value={u?.department} />
              <InfoRow icon={Briefcase} label="Designation" value={u?.designation} />
              <InfoRow icon={Shield} label="Role" value={ROLE_LABELS[u?.role] || u?.role} />
              <InfoRow icon={Activity} label="Status" value={STATUS_LABELS[status] || status} />
              <InfoRow icon={Hash} label="Employee ID" value={u?.employeeId} />
              {u?.invitedBy && (
                <InfoRow icon={User} label="Invited By" value={u.invitedBy?.name || 'System'} />
              )}
              <InfoRow
                icon={Clock}
                label="Last Active"
                value={u?.lastLogin ? format(new Date(u.lastLogin), 'MMM d, yyyy h:mm a') : 'Never logged in'}
              />
              <InfoRow
                icon={Calendar}
                label="Joined Date"
                value={u?.createdAt ? format(new Date(u.createdAt), 'MMM d, yyyy') : '—'}
              />
              {u?.invitationAcceptedAt && (
                <InfoRow
                  icon={CheckSquare}
                  label="Invite Accepted"
                  value={format(new Date(u.invitationAcceptedAt), 'MMM d, yyyy')}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
