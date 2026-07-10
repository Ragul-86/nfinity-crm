/**
 * QuickActions — Role-aware quick action buttons
 * Uses existing button design system.
 */
import { useNavigate } from 'react-router-dom'
import {
  UserPlus, Building2, FileText, Receipt, CheckSquare,
  Upload, Clipboard, UserCheck, Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'

const ROLE_LEVELS = {
  platform_super_admin: 100, client_super_admin: 80, super_admin: 80,
  admin: 60, manager: 40, employee: 20, viewer: 10,
}
function rl(r) { return ROLE_LEVELS[r] || 0 }

const ACTIONS = [
  { label: 'Add Lead',         icon: UserPlus,   href: '/crm-leads?action=new',      color: 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20', minRole: 'employee' },
  { label: 'Add Customer',     icon: Building2,  href: '/clients?action=new',         color: 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20',     minRole: 'manager' },
  { label: 'Create Quotation', icon: FileText,   href: '/finance?tab=quotations&action=new', color: 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20', minRole: 'manager' },
  { label: 'Create Invoice',   icon: Receipt,href: '/finance?tab=invoices&action=new',   color: 'bg-green-500/10 text-green-500 hover:bg-green-500/20', minRole: 'manager' },
  { label: 'Create Lead Form', icon: Clipboard,  href: '/lead-forms',                color: 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20', minRole: 'manager' },
  { label: 'Schedule Task',    icon: CheckSquare,href: '/tasks?action=new',          color: 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',   minRole: 'employee' },
  { label: 'Upload File',      icon: Upload,     href: '/clients',                   color: 'bg-slate-500/10 text-slate-400 hover:bg-slate-500/20',   minRole: 'employee' },
  { label: 'Invite Member',    icon: UserCheck,  href: '/settings/team',             color: 'bg-pink-500/10 text-pink-500 hover:bg-pink-500/20',      minRole: 'admin' },
]

export default function QuickActions() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const level = rl(user?.role)

  const visible = ACTIONS.filter(a => level >= rl(a.minRole))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {visible.map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.href)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${a.color}`}
            >
              <a.icon className="w-3.5 h-3.5" />
              {a.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
