import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Megaphone, BookOpen, KanbanSquare,
  CheckSquare, Building2, BarChart3, Settings, ChevronLeft,
  ChevronRight, Zap, UserCog, Clock, Briefcase, X,
  Globe, Shield, Plug2, Users, FileText, IndianRupee, Layers,
  ScrollText, Activity,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'

// ── Tenant workspace nav (all roles except platform_super_admin) ──────────────
const TENANT_NAV = [
  { label: 'Dashboard',        icon: LayoutDashboard, href: '/',             minRole: 'employee' },
  { label: 'Sales Pipeline',   icon: KanbanSquare,    href: '/pipeline',     minRole: 'manager' },
  { label: 'Leads',            icon: Users,           href: '/crm-leads',    minRole: 'employee' },
  { label: 'Lead Forms',       icon: FileText,        href: '/lead-forms',   minRole: 'manager' },
  { label: 'Meta Leads',       icon: Zap,             href: '/leads',        minRole: 'manager' },
  { label: 'Clients',          icon: Building2,       href: '/clients',      minRole: 'manager' },
  { label: 'Finance',          icon: IndianRupee,     href: '/finance',      minRole: 'manager' },
  { label: 'Campaigns',        icon: Megaphone,       href: '/campaigns',    minRole: 'manager' },
  { label: 'My Campaigns',     icon: Briefcase,       href: '/my-campaigns', minRole: 'employee' },
  { label: 'Operations',        icon: Layers,          href: '/operations',   minRole: 'employee' },
  { label: 'Tasks',            icon: CheckSquare,     href: '/tasks',        minRole: 'employee' },
  { label: 'Attendance',       icon: Clock,           href: '/attendance',   minRole: 'employee' },
  { label: 'SOP Management',   icon: BookOpen,        href: '/sop',          minRole: 'employee' },
  { label: 'Team Management',  icon: UserCog,         href: '/team',         minRole: 'admin' },
  { label: 'Reports',          icon: BarChart3,       href: '/reports',      minRole: 'manager' },
  { label: 'Audit Logs',       icon: ScrollText,      href: '/audit-logs',    minRole: 'admin' },
  { label: 'System Health',    icon: Activity,        href: '/system-health', minRole: 'admin' },
  { label: 'Settings',         icon: Settings,        href: '/settings',      minRole: 'admin' },
  { label: 'Integrations',     icon: Plug2,           href: '/settings/integrations', minRole: 'super_admin' },
]

// ── Platform Super Admin nav ──────────────────────────────────────────────────
const PLATFORM_NAV = [
  { label: 'Platform Overview', icon: Shield,    href: '/platform',            minRole: 'platform_super_admin' },
  { label: 'Workspaces',        icon: Globe,     href: '/platform/workspaces', minRole: 'platform_super_admin' },
]

const ROLE_ORDER = {
  platform_super_admin: 100,
  client_super_admin: 80,
  super_admin: 80,
  admin: 60,
  manager: 40,
  employee: 20,
  viewer: 10,
}

function roleLevel(role) {
  return ROLE_ORDER[role] || 0
}

function NavLink({ item, allItems, collapsed, isMobile, onClick }) {
  const location = useLocation()
  const path = location.pathname

  // This item matches if the path equals it exactly OR starts with it as a prefix segment
  const selfMatches = path === item.href ||
    (item.href !== '/' && path.startsWith(item.href + '/'))

  // A sibling with a LONGER href also matches — that sibling wins (most-specific match)
  const moreSpecificSiblingExists = allItems.some(
    (other) =>
      other.href !== item.href &&
      other.href.length > item.href.length &&
      (path === other.href || (other.href !== '/' && path.startsWith(other.href + '/')))
  )

  const isActive = selfMatches && !moreSpecificSiblingExists

  return (
    <Link
      to={item.href}
      onClick={onClick}
      title={collapsed && !isMobile ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all group relative',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <item.icon className={cn('shrink-0', collapsed && !isMobile ? 'w-5 h-5 mx-auto' : 'w-4 h-4')} />
      <AnimatePresence>
        {(!collapsed || isMobile) && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="truncate flex-1"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {collapsed && !isMobile && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-popover border border-border rounded-md text-xs text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-md">
          {item.label}
        </div>
      )}
    </Link>
  )
}

function UserFooter({ collapsed, isMobile }) {
  const { user } = useAuth()
  const roleLabel = user?.role === 'platform_super_admin'
    ? 'Platform Admin'
    : user?.role?.replace(/_/g, ' ')
  return (
    <div className="p-3 border-t border-border shrink-0">
      <div className={cn('flex items-center gap-3 px-2 py-2 rounded-lg', collapsed && !isMobile ? 'justify-center' : '')}>
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <AnimatePresence>
          {(!collapsed || isMobile) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-w-0"
            >
              <p className="text-xs font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize truncate">{roleLabel}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, isMobile }) {
  const { user } = useAuth()

  const isPlatform = user?.role === 'platform_super_admin'
  const navItems = isPlatform ? PLATFORM_NAV : TENANT_NAV

  const filteredNav = navItems.filter(item =>
    roleLevel(user?.role) >= roleLevel(item.minRole)
  )

  const SidebarContent = ({ onNavClick }) => (
    <>
      {/* Nav */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto overflow-x-hidden">
        {isPlatform && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {(!collapsed || isMobile) ? 'Platform Admin' : '·'}
          </p>
        )}
        <div className="space-y-1">
          {filteredNav.map(item => (
            <NavLink
              key={item.href}
              item={item}
              allItems={filteredNav}
              collapsed={collapsed}
              isMobile={isMobile}
              onClick={onNavClick}
            />
          ))}
        </div>
      </nav>
      <UserFooter collapsed={collapsed} isMobile={isMobile} />
    </>
  )

  /* ── Mobile drawer ── */
  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-40 flex flex-col"
          >
            <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-lg tracking-tight whitespace-nowrap">TEAM UPDATE</span>
              </div>
              <button
                onClick={onMobileClose}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent onNavClick={onMobileClose} />
          </motion.aside>
        )}
      </AnimatePresence>
    )
  }

  /* ── Desktop sidebar ── */
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col overflow-hidden"
    >
      {/* Logo + toggle */}
      <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="font-bold text-lg tracking-tight whitespace-nowrap"
              >
                TEAM UPDATE
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <SidebarContent onNavClick={undefined} />
    </motion.aside>
  )
}
