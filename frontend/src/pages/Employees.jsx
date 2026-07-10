import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Plus, RefreshCcw, MoreHorizontal, UserCheck, UserX, ShieldOff,
  UserPlus, Key, Shield, Ban, Mail, Trash2, Eye, LogIn,
  Users, Lock, ClipboardList, Target, CheckSquare, Download, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils/cn'

import PageHeader from '@/components/common/PageHeader'
import DataTable from '@/components/common/DataTable'
import MemberCard from '@/components/team/MemberCard'
import UserProfileModal from '@/components/team/UserProfileModal'
import InviteUserModal from '@/components/team/InviteUserModal'
import EditUserModal from '@/components/team/EditUserModal'
import PermissionMatrix from '@/components/team/PermissionMatrix'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_VARIANTS = {
  super_admin: 'destructive', client_super_admin: 'destructive',
  admin: 'warning', manager: 'info', employee: 'secondary', viewer: 'outline',
}
const ROLE_LABELS = {
  super_admin: 'Super Admin', client_super_admin: 'Super Admin',
  admin: 'Admin', manager: 'Manager', employee: 'Employee', viewer: 'Viewer',
}
const STATUS_CONFIG = {
  active:             { label: 'Active',      variant: 'success' },
  inactive:           { label: 'Inactive',    variant: 'warning' },
  deactivated:        { label: 'Deactivated', variant: 'destructive' },
  pending_invitation: { label: 'Invited',     variant: 'info' },
  suspended:          { label: 'Suspended',   variant: 'warning' },
}

const AUTO_REFRESH_MS = 30_000
const TABS = [
  { key: 'team',        label: 'Team Members', icon: Users },
  { key: 'permissions', label: 'Permissions',  icon: Lock },
  { key: 'audit',       label: 'Audit Log',    icon: ClipboardList },
]

function resolveStatus(row) {
  return row.status || (row.isActive ? 'active' : 'inactive')
}

function StatusBadge({ row }) {
  const s = resolveStatus(row)
  const cfg = STATUS_CONFIG[s] || STATUS_CONFIG.inactive
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
}

// ── Confirm Dialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({ open, onClose, onConfirm, action, user: targetUser, loading }) {
  const CONFIG = {
    deactivate:     { title: 'Deactivate Member',   variant: 'destructive', desc: `Deactivate <b>${targetUser?.name}</b>? They will immediately lose all system access.` },
    suspend:        { title: 'Suspend Member',       variant: 'default',     desc: `Suspend <b>${targetUser?.name}</b>? They cannot log in until unsuspended.` },
    remove_access:  { title: 'Remove Access',        variant: 'destructive', desc: `Remove all access for <b>${targetUser?.name}</b>? This is equivalent to deactivation.` },
    change_role:    { title: 'Change Role',          variant: 'default',     desc: `This will update <b>${targetUser?.name}</b>'s access permissions. Continue?` },
    impersonate:    { title: 'Secure Impersonate',   variant: 'default',     desc: `You will be logged in as the super admin of <b>${targetUser?.name}'s workspace</b>. This action is audited.` },
  }
  const c = CONFIG[action] || {}
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby="confirm-desc">
        <DialogHeader>
          <DialogTitle className={c.variant === 'destructive' ? 'text-destructive' : ''}>
            {c.title}
          </DialogTitle>
        </DialogHeader>
        <p
          id="confirm-desc"
          className="text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: c.desc || '' }}
        />
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={c.variant === 'destructive' ? 'destructive' : 'default'} disabled={loading} onClick={onConfirm}>
            {loading ? 'Processing…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Change Role Dialog ─────────────────────────────────────────────────────────
function ChangeRoleDialog({ open, onClose, user: targetUser }) {
  const [role, setRole] = useState(targetUser?.role || 'employee')
  const [confirm, setConfirm] = useState(false)
  const qc = useQueryClient()

  useEffect(() => { if (targetUser) setRole(targetUser.role || 'employee') }, [targetUser])

  const mutation = useMutation({
    mutationFn: (r) => api.patch(`/users/${targetUser._id}/change-role`, { role: r }).then(d => d.data),
    onSuccess: () => {
      toast.success('Role updated successfully')
      qc.invalidateQueries(['users'])
      setConfirm(false)
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Role change failed'),
  })

  if (!targetUser) return null
  return (
    <>
      <Dialog open={open && !confirm} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Change Role — {targetUser.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current role: <Badge variant={ROLE_VARIANTS[targetUser.role] || 'secondary'} className="text-xs ml-1">
                {ROLE_LABELS[targetUser.role] || targetUser.role}
              </Badge>
            </p>
            <div className="space-y-1.5">
              <Label>New Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['admin', 'manager', 'employee', 'viewer'].map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => setConfirm(true)} disabled={role === targetUser.role}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => mutation.mutate(role)}
        action="change_role"
        user={targetUser}
        loading={mutation.isPending}
      />
    </>
  )
}

// ── Reset Password Dialog ──────────────────────────────────────────────────────
function ResetPasswordDialog({ open, onClose, user: targetUser }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: (p) => api.patch(`/users/${targetUser._id}/reset-password`, { password: p }).then(d => d.data),
    onSuccess: () => { toast.success('Password reset'); setPw(''); onClose() },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const handle = (e) => {
    e.preventDefault()
    if (!pw || pw.length < 8) { setErr('Minimum 8 characters'); return }
    setErr('')
    mutation.mutate(pw)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setPw(''); setErr('') } }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            Reset Password — {targetUser?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-4">
          <p className="text-sm text-muted-foreground">Set a new password. The user will be able to change it after logging in.</p>
          <div className="space-y-1.5">
            <Label>New Password *</Label>
            <Input type="password" placeholder="Min 8 characters" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" />
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); setPw(''); setErr('') }}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Resetting…' : 'Reset Password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Audit Log Tab ──────────────────────────────────────────────────────────────
const AUDIT_LABELS = {
  user_invited: 'User Invited', user_created: 'User Created', user_updated: 'User Updated',
  role_changed: 'Role Changed', status_changed: 'Status Changed', user_deactivated: 'Deactivated',
  user_suspended: 'Suspended', user_activated: 'Activated', invite_resent: 'Invite Resent',
  password_reset: 'Password Reset', access_removed: 'Access Removed', user_impersonated: 'Impersonated',
  permission_changed: 'Permission Changed',
}

const AUDIT_MODULES = ['team', 'leads', 'pipeline', 'customers', 'campaigns', 'sop', 'tasks', 'reports', 'analytics', 'settings', 'finance']
const AUDIT_ACTIONS_LIST = [...Object.keys(AUDIT_LABELS), 'login', 'logout']

function getDevice(ua) {
  if (!ua) return '—'
  if (/mobile/i.test(ua)) return 'Mobile'
  if (/tablet|ipad/i.test(ua)) return 'Tablet'
  return 'Desktop'
}

function AuditLogTab() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs-team', page, debouncedSearch, filterAction, filterModule, dateFrom, dateTo],
    queryFn: () => api.get('/audit', {
      params: {
        page, limit: 20,
        q: debouncedSearch || undefined,
        action: filterAction || undefined,
        module: filterModule || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
    }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: AUTO_REFRESH_MS,
  })

  const totalPages = data ? Math.ceil((data.total || 0) / 20) : 0

  const exportCSV = () => {
    const rows = data?.data || []
    if (!rows.length) { toast.error('No data to export'); return }
    const headers = ['User', 'Email', 'Role', 'Action', 'Module', 'IP Address', 'Device', 'Date & Time']
    const csvRows = rows.map(log => [
      log.performedBy?.name || '—',
      log.performedBy?.email || '—',
      log.performedBy?.role || '—',
      AUDIT_LABELS[log.action] || log.action,
      log.module || '—',
      log.ipAddress || '—',
      getDevice(log.userAgent),
      log.createdAt ? format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss') : '—',
    ])
    const csv = [headers, ...csvRows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetFilters = () => {
    setSearch(''); setFilterAction(''); setFilterModule('')
    setDateFrom(''); setDateTo(''); setPage(1)
  }

  const hasFilters = search || filterAction || filterModule || dateFrom || dateTo

  return (
    <div className="space-y-4">
      {/* Search + Filters + Export */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1 min-w-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8 text-xs w-44"
              placeholder="Search logs…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={filterAction || 'all'} onValueChange={v => { setFilterAction(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {AUDIT_ACTIONS_LIST.map(a => (
                <SelectItem key={a} value={a}>{AUDIT_LABELS[a] || a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterModule || 'all'} onValueChange={v => { setFilterModule(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {AUDIT_MODULES.map(m => (
                <SelectItem key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date" className="h-8 text-xs w-32"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          />
          <Input
            type="date" className="h-8 text-xs w-32"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </div>
        <Button
          variant="outline" size="sm" className="gap-1.5 shrink-0"
          onClick={exportCSV}
          disabled={!(data?.data?.length)}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">User</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Action</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">Module</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden lg:table-cell">IP Address</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap hidden lg:table-cell">Device</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((__, j) => (
                      <td key={j} className="px-4 py-2.5">
                        <Skeleton className="h-4 w-full max-w-[90px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (data?.data || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {hasFilters ? 'No logs match your filters.' : 'No audit logs yet.'}
                  </td>
                </tr>
              ) : (data?.data || []).map(log => (
                <tr key={log._id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                          {log.performedBy?.name?.charAt(0)?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[120px]">{log.performedBy?.name || '—'}</p>
                        <p className="text-muted-foreground truncate max-w-[120px]">{log.performedBy?.email || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <Badge
                      variant={ROLE_VARIANTS[log.performedBy?.role] || 'secondary'}
                      className="text-xs capitalize"
                    >
                      {ROLE_LABELS[log.performedBy?.role] || log.performedBy?.role || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{AUDIT_LABELS[log.action] || log.action}</span>
                    {log.details?.newRole && (
                      <span className="text-muted-foreground ml-1">→ {log.details.newRole}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <Badge variant="outline" className="text-xs capitalize">
                      {log.module || 'team'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono hidden lg:table-cell">
                    {log.ipAddress || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">
                    {getDevice(log.userAgent)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {log.createdAt ? format(new Date(log.createdAt), 'MMM d, h:mm a') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {(data?.total || 0) > 20 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {Math.min((page - 1) * 20 + 1, data.total)}–{Math.min(page * 20, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              Prev
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Employees page ────────────────────────────────────────────────────────
export default function Employees() {
  const { user: me } = useAuth()
  const isPlatformAdmin = me?.role === 'platform_super_admin'
  const isSuperAdmin    = ['super_admin', 'client_super_admin'].includes(me?.role)
  const isAdmin         = me?.role === 'admin' || isSuperAdmin
  const qc = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') || 'team'
  const [activeTab, setActiveTab] = useState(tabFromUrl)

  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [isMobile, setIsMobile]   = useState(window.innerWidth < 768)

  // Dialog states
  const [profileId,      setProfileId]      = useState(null)
  const [showInvite,     setShowInvite]      = useState(false)
  const [editUser,       setEditUser]        = useState(null)
  const [changeRoleUser, setChangeRoleUser]  = useState(null)
  const [resetPwUser,    setResetPwUser]     = useState(null)
  const [confirmDialog,  setConfirmDialog]   = useState(null) // { action, user }

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Sync tab from URL when it changes externally (e.g. browser back/forward)
  useEffect(() => {
    const tab = searchParams.get('tab') || 'team'
    setActiveTab(tab)
  }, [searchParams])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', key)
      return next
    })
  }

  // Top-level search handler (must NOT be inside conditional JSX — Rules of Hooks)
  const handleSearch = useCallback((v) => { setSearch(v); setPage(1) }, [])

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => api.get('/users', { params: { page, limit: 10, search } }).then(r => r.data),
    keepPreviousData: true,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/users/${id}/status`, { status }),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries(['users'])
      toast.success(`Status updated to ${STATUS_CONFIG[status]?.label || status}`)
      setConfirmDialog(null)
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Status update failed'),
  })

  const resendMutation = useMutation({
    mutationFn: (userId) => api.post(`/invitations/resend-by-user/${userId}`).then(r => r.data),
    onSuccess: () => { toast.success('Invitation resent'); qc.invalidateQueries(['users']) },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to resend'),
  })

  const openConfirm = (action, user) => setConfirmDialog({ action, user })

  const executeConfirm = () => {
    const { action, user: target } = confirmDialog
    const map = { deactivate: 'deactivated', suspend: 'suspended', remove_access: 'deactivated' }
    statusMutation.mutate({ id: target._id, status: map[action] || 'deactivated' })
  }

  // Build per-row action menu items based on role
  const buildMenuItems = (row) => {
    if (row._id === me?._id) return []
    const status = resolveStatus(row)
    const isPending     = status === 'pending_invitation'
    const isDeactivated = status === 'deactivated'
    const isSuspended   = status === 'suspended'
    const items = []

    if (isPlatformAdmin) {
      // Platform Super Admin menu
      items.push({ label: 'View User',    icon: Eye,       onClick: () => setProfileId(row._id) })
      items.push({ separator: true })
      if (!isDeactivated && !isSuspended)
        items.push({ label: 'Suspend User',    icon: Ban,       className: 'text-yellow-700', onClick: () => openConfirm('suspend', row) })
      if (isSuspended || isDeactivated)
        items.push({ label: 'Activate User',   icon: UserCheck, className: 'text-emerald-600', onClick: () => statusMutation.mutate({ id: row._id, status: 'active' }) })
      if (!isDeactivated)
        items.push({ label: 'Deactivate User', icon: ShieldOff, variant: 'destructive', onClick: () => openConfirm('deactivate', row) })
      items.push({ separator: true })
      items.push({ label: 'Remove Access', icon: Trash2, variant: 'destructive', onClick: () => openConfirm('remove_access', row) })
      return items
    }

    if (isSuperAdmin) {
      // Client Super Admin menu
      items.push({ label: 'View Profile',   icon: Eye,  onClick: () => setProfileId(row._id) })
      items.push({ label: 'Edit User',      icon: null, onClick: () => setEditUser(row) })
      if (!isPending)
        items.push({ label: 'Change Role',  icon: Shield, onClick: () => setChangeRoleUser(row) })
      if (!isPending)
        items.push({ label: 'Reset Password', icon: Key, onClick: () => setResetPwUser(row) })
      if (isPending)
        items.push({
          label: 'Resend Invite', icon: Mail,
          onClick: () => resendMutation.mutate(row._id),
          disabled: resendMutation.isPending,
        })
      items.push({ separator: true })
      if (isDeactivated || isSuspended)
        items.push({ label: 'Make Active',   icon: UserCheck, className: 'text-emerald-600', onClick: () => statusMutation.mutate({ id: row._id, status: 'active' }) })
      if (!isDeactivated && !isSuspended)
        items.push({ label: 'Make Inactive', icon: UserX,     className: 'text-amber-600',   onClick: () => statusMutation.mutate({ id: row._id, status: 'inactive' }) })
      if (!isSuspended && !isDeactivated)
        items.push({ label: 'Suspend',       icon: Ban,       className: 'text-yellow-700',  onClick: () => openConfirm('suspend', row) })
      if (!isDeactivated)
        items.push({ label: 'Deactivate',    icon: ShieldOff, variant: 'destructive',        onClick: () => openConfirm('deactivate', row) })
      items.push({ separator: true })
      items.push({ label: 'Remove Access', icon: Trash2, variant: 'destructive', onClick: () => openConfirm('remove_access', row) })
      return items
    }

    if (isAdmin) {
      // Client Admin — view only + resend invite
      items.push({ label: 'View Profile', icon: Eye, onClick: () => setProfileId(row._id) })
      if (isPending)
        items.push({ label: 'Resend Invite', icon: Mail, onClick: () => resendMutation.mutate(row._id) })
      return items
    }

    return []
  }

  // ── Table columns ────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name', label: 'Member', sortable: true,
      render: (v, row) => (
        <button
          className="flex items-center gap-3 text-left group"
          onClick={() => setProfileId(row._id)}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={row.avatar} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {v?.charAt(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">{v}</p>
            <p className="text-xs text-muted-foreground truncate">{row.email}</p>
          </div>
        </button>
      ),
    },
    {
      key: 'phone', label: 'Phone',
      render: (v) => <span className="text-sm text-muted-foreground">{v || '—'}</span>,
    },
    {
      key: 'role', label: 'Role',
      render: (v) => (
        <Badge variant={ROLE_VARIANTS[v] || 'secondary'} className="text-xs capitalize">
          {ROLE_LABELS[v] || v?.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (_, row) => <StatusBadge row={row} />,
    },
    {
      key: 'department', label: 'Department',
      render: (v) => <span className="text-sm text-muted-foreground">{v || '—'}</span>,
    },
    {
      key: 'assignedLeads', label: 'Leads',
      render: (v) => (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Target className="w-3 h-3" />
          {v ?? 0}
        </div>
      ),
    },
    {
      key: 'assignedTasks', label: 'Tasks',
      render: (v) => (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <CheckSquare className="w-3 h-3" />
          {v ?? 0}
        </div>
      ),
    },
    {
      key: 'lastLogin', label: 'Last Active',
      render: (v) => (
        <span className="text-xs text-muted-foreground">
          {v ? format(new Date(v), 'MMM d, yyyy') : 'Never'}
        </span>
      ),
    },
    {
      key: 'createdAt', label: 'Joined',
      render: (v) => (
        <span className="text-xs text-muted-foreground">
          {v ? format(new Date(v), 'MMM d, yyyy') : '—'}
        </span>
      ),
    },
    {
      key: '_id', label: '',
      render: (_, row) => {
        const items = buildMenuItems(row)
        if (!items.length) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {items.map((item, i) =>
                item.separator ? (
                  <DropdownMenuSeparator key={`sep-${i}`} />
                ) : (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={cn(
                      item.variant === 'destructive' && 'text-destructive focus:text-destructive',
                      item.className
                    )}
                  >
                    {item.icon && <item.icon className="w-3.5 h-3.5 mr-2" />}
                    {item.label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  // Tabs available per role:
  // super_admin / client_super_admin → all 3 tabs (Team + Permissions + Audit Log)
  // admin → Team + Audit Log (read-only audit; no permission editing)
  // others → Team only
  const availableTabs = isSuperAdmin
    ? TABS
    : isAdmin
      ? [TABS[0], TABS[2]]   // team + audit
      : [TABS[0]]            // team only

  return (
    <div>
      <PageHeader
        title="Team Management"
        description={`${data?.total ?? 0} members in your workspace`}
        action={isAdmin ? {
          label: 'Add Member',
          icon: Plus,
          onClick: () => setShowInvite(true),
        } : undefined}
      >
        {(isSuperAdmin || isAdmin) && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowInvite(true)}>
            <UserPlus className="w-3.5 h-3.5" />
            Invite
          </Button>
        )}
      </PageHeader>

      {/* Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex gap-1 bg-muted/40 p-1 rounded-lg w-fit mb-5 flex-wrap">
          {availableTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Team Tab ── */}
      {activeTab === 'team' && (
        <>
          <div className="flex items-center justify-end mb-4 gap-2">
            {isRefetching && <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Mobile: card grid */}
          {isMobile ? (
            <div className="space-y-3">
              {isLoading ? (
                [...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
              ) : (data?.data || []).length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">No team members found</p>
              ) : (
                (data?.data || []).map(row => (
                  <MemberCard key={row._id} row={row} menuItems={buildMenuItems(row)} />
                ))
              )}
              {data?.total > 10 && (
                <div className="flex justify-center gap-2 pt-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <span className="text-sm text-muted-foreground self-center">Page {page}</span>
                  <Button variant="outline" size="sm" disabled={page * 10 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </div>
          ) : (
            /* Desktop: full DataTable */
            <DataTable
              columns={columns}
              data={data?.data}
              loading={isLoading || isRefetching}
              searchable
              searchPlaceholder="Search name, email, department…"
              onSearch={handleSearch}
              pagination={data ? { page, limit: 10, total: data.total, onChange: setPage } : undefined}
            />
          )}
        </>
      )}

      {/* ── Permissions Tab ── */}
      {activeTab === 'permissions' && <PermissionMatrix />}

      {/* ── Audit Log Tab ── */}
      {activeTab === 'audit' && <AuditLogTab />}

      {/* ── Modals ── */}
      <UserProfileModal
        open={!!profileId}
        onClose={() => setProfileId(null)}
        userId={profileId}
      />

      <InviteUserModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
      />

      {editUser && (
        <EditUserModal
          open={!!editUser}
          onClose={() => setEditUser(null)}
          user={editUser}
        />
      )}

      {changeRoleUser && (
        <ChangeRoleDialog
          open={!!changeRoleUser}
          onClose={() => setChangeRoleUser(null)}
          user={changeRoleUser}
        />
      )}

      {resetPwUser && (
        <ResetPasswordDialog
          open={!!resetPwUser}
          onClose={() => setResetPwUser(null)}
          user={resetPwUser}
        />
      )}

      <ConfirmDialog
        open={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={executeConfirm}
        action={confirmDialog?.action}
        user={confirmDialog?.user}
        loading={statusMutation.isPending}
      />
    </div>
  )
}
