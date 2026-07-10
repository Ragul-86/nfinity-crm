import { MoreVertical, Mail, Phone, Building2, Target, CheckSquare } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

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
  pending_invitation: 'Invited', suspended: 'Suspended',
}

function resolveStatus(row) {
  return row.status || (row.isActive ? 'active' : 'inactive')
}

export default function MemberCard({ row, menuItems }) {
  const status = resolveStatus(row)

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={row.avatar} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
              {row.name?.charAt(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{row.name}</p>
            <p className="text-xs text-muted-foreground truncate">{row.designation || row.department || '—'}</p>
          </div>
        </div>
        {menuItems?.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-0.5 -mr-1">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {menuItems.map((item, i) =>
                item.separator ? (
                  <DropdownMenuSeparator key={`sep-${i}`} />
                ) : (
                  <DropdownMenuItem
                    key={item.label}
                    className={item.variant === 'destructive' ? 'text-destructive focus:text-destructive' : item.className}
                    onClick={item.onClick}
                    disabled={item.disabled}
                  >
                    {item.icon && <item.icon className="w-3.5 h-3.5 mr-2" />}
                    {item.label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={ROLE_VARIANTS[row.role] || 'secondary'} className="text-xs">
          {ROLE_LABELS[row.role] || row.role}
        </Badge>
        <Badge variant={STATUS_VARIANTS[status] || 'secondary'} className="text-xs">
          {STATUS_LABELS[status] || status}
        </Badge>
      </div>

      {/* Detail rows */}
      <div className="space-y-1.5 pt-1 border-t border-border/60">
        {row.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{row.email}</span>
          </div>
        )}
        {row.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="w-3 h-3 shrink-0" />
            <span>{row.phone}</span>
          </div>
        )}
        {row.department && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="w-3 h-3 shrink-0" />
            <span>{row.department}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 pt-1 border-t border-border/60 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          <span>{row.assignedLeads ?? 0} leads</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckSquare className="w-3 h-3" />
          <span>{row.assignedTasks ?? 0} tasks</span>
        </div>
        {row.lastLogin && (
          <div className="ml-auto text-[11px]">
            {format(new Date(row.lastLogin), 'MMM d')}
          </div>
        )}
      </div>
    </div>
  )
}
