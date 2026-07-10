import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import AICopilot from '@/components/ai/AICopilot'
import {
  LayoutDashboard, Building2, Users, CreditCard, BarChart3,
  Shield, Settings, X, ChevronLeft, ChevronRight, Zap,
  Globe, UserCog, Lock, Layers, BookOpen, FileText, KanbanSquare,
  TrendingUp, ScrollText, Activity, Bell, HelpCircle, Database,
  Key, Webhook, Mail, MessageSquare, Bot, ShieldCheck, HardDrive,
  Sliders, Award, PieChart, FileBarChart, UserCheck, Wrench,
  ChevronDown, Sun, Moon, Monitor, LogOut, User, ShieldAlert,
  BellRing, KeyRound, Menu,
} from 'lucide-react'

const PLATFORM_NAV = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard',     icon: LayoutDashboard, href: '/platform' },
    ],
  },
  {
    group: 'Management',
    items: [
      { label: 'Workspaces',         icon: Building2,    href: '/platform/workspaces' },
      { label: 'Client Management',  icon: Globe,        href: '/platform/clients' },
      { label: 'Subscriptions',      icon: CreditCard,   href: '/platform/subscriptions' },
      { label: 'Billing & Payments', icon: TrendingUp,   href: '/platform/billing' },
      { label: 'Global Users',       icon: Users,        href: '/platform/users' },
    ],
  },
  {
    group: 'Access & Roles',
    items: [
      { label: 'Global Roles',   icon: UserCog,  href: '/platform/roles' },
      { label: 'Permissions',    icon: Lock,     href: '/platform/permissions' },
      { label: 'Feature Management', icon: Layers, href: '/platform/features' },
    ],
  },
  {
    group: 'Templates',
    items: [
      { label: 'SOP Templates',      icon: BookOpen,    href: '/platform/templates/sop' },
      { label: 'Lead Form Templates',icon: FileText,    href: '/platform/templates/lead-forms' },
      { label: 'Pipeline Templates', icon: KanbanSquare,href: '/platform/templates/pipelines' },
    ],
  },
  {
    group: 'Analytics & Reports',
    items: [
      { label: 'Platform Analytics', icon: PieChart,     href: '/platform/analytics' },
      { label: 'Reports',            icon: FileBarChart, href: '/platform/reports' },
      { label: 'Audit Logs',         icon: ScrollText,   href: '/platform/audit-logs' },
      { label: 'Activity Logs',      icon: Activity,     href: '/platform/activity-logs' },
    ],
  },
  {
    group: 'Communication',
    items: [
      { label: 'Notifications', icon: Bell,         href: '/platform/notifications' },
      { label: 'Support Center',icon: HelpCircle,   href: '/platform/support' },
    ],
  },
  {
    group: 'Infrastructure',
    items: [
      { label: 'Storage Management', icon: HardDrive,  href: '/platform/storage' },
      { label: 'API Management',     icon: Key,        href: '/platform/api-keys' },
      { label: 'Webhook Management', icon: Webhook,    href: '/platform/webhooks' },
    ],
  },
  {
    group: 'Integrations',
    items: [
      { label: 'Email (SMTP)',  icon: Mail,         href: '/platform/email-settings' },
      { label: 'WhatsApp',     icon: MessageSquare, href: '/platform/whatsapp' },
      { label: 'AI Settings',  icon: Bot,           href: '/platform/ai-settings' },
    ],
  },
  {
    group: 'Security & System',
    items: [
      { label: 'Security Center', icon: ShieldCheck, href: '/platform/security' },
      { label: 'Backup & Restore',icon: Database,    href: '/platform/backups' },
      { label: 'System Settings', icon: Wrench,      href: '/platform/settings' },
      { label: 'License Management', icon: Award,    href: '/platform/license' },
    ],
  },
]

const MOBILE_BP = 768

// ── Platform-specific Header ───────────────────────────────────────────────────
function PlatformHeader({ sidebarCollapsed, isMobile, onMobileToggle }) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const profileRef = useRef(null)
  const themeRef = useRef(null)

  const themeIcons = { light: Sun, dark: Moon, system: Monitor }
  const ThemeIcon = themeIcons[theme] || Monitor

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const PROFILE_MENU = [
    { label: 'My Profile',             icon: User,       action: () => navigate('/platform/settings') },
    { label: 'Account Settings',        icon: Settings,   action: () => navigate('/platform/settings') },
    { label: 'Security Settings',       icon: ShieldAlert,action: () => navigate('/platform/security') },
    { label: 'Notification Settings',   icon: BellRing,   action: () => navigate('/platform/notifications') },
    { label: 'Change Password',         icon: KeyRound,   action: () => navigate('/platform/security') },
  ]

  return (
    <header
      className="fixed top-0 right-0 h-16 bg-background/80 backdrop-blur-md border-b border-border z-30 flex items-center px-4 gap-3 transition-all duration-300"
      style={{ left: isMobile ? 0 : (sidebarCollapsed ? 72 : 260) }}
    >
      {isMobile && (
        <button onClick={onMobileToggle} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Title */}
      <div className="flex-1">
        <span className="text-sm font-semibold text-muted-foreground hidden sm:block">Platform Administration</span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Theme toggle */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setThemeOpen(o => !o)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
          >
            <ThemeIcon className="w-4 h-4" />
          </button>
          {themeOpen && (
            <div className="absolute right-0 top-10 w-36 bg-popover border border-border rounded-xl shadow-lg py-1 z-50">
              {[['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']].map(([val, Icon, label]) => (
                <button
                  key={val}
                  onClick={() => { setTheme(val); setThemeOpen(false) }}
                  className={cn('w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors', theme === val && 'bg-accent')}
                >
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium hidden sm:block max-w-[100px] truncate">{user?.name}</span>
            <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', profileOpen && 'rotate-180')} />
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-10 w-56 bg-popover border border-border rounded-xl shadow-lg py-1 z-50"
              >
                {/* User info */}
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 font-medium">Platform Admin</span>
                </div>
                {/* Menu items */}
                {PROFILE_MENU.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setProfileOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    {item.label}
                  </button>
                ))}
                <div className="border-t border-border mt-1 pt-1">
                  <button
                    onClick={() => { logout(); setProfileOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}

function NavItem({ item, collapsed, isMobile, onClick }) {
  const location = useLocation()
  const isActive = location.pathname === item.href ||
    (item.href !== '/platform' && location.pathname.startsWith(item.href))

  return (
    <Link
      to={item.href}
      onClick={onClick}
      title={collapsed && !isMobile ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all group relative',
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
            transition={{ duration: 0.12 }}
            className="truncate flex-1 text-[13px]"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {/* Tooltip when collapsed */}
      {collapsed && !isMobile && (
        <div className="absolute left-full ml-2.5 px-2 py-1 bg-popover border border-border rounded-md text-xs text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-md">
          {item.label}
        </div>
      )}
    </Link>
  )
}

function SidebarContent({ collapsed, isMobile, onNavClick }) {
  const { user } = useAuth()
  return (
    <>
      {/* Scrollable Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        {PLATFORM_NAV.map((group) => (
          <div key={group.group} className="mb-1">
            {/* Group label */}
            <AnimatePresence>
              {(!collapsed || isMobile) && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-2.5 mb-1 mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 first:mt-0"
                >
                  {group.group}
                </motion.p>
              )}
            </AnimatePresence>
            {collapsed && !isMobile && (
              <div className="my-2 border-t border-border/50" />
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  isMobile={isMobile}
                  onClick={onNavClick}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-border shrink-0">
        <div className={cn('flex items-center gap-3 px-2 py-2 rounded-lg', collapsed && !isMobile ? 'justify-center' : '')}>
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <AnimatePresence>
            {(!collapsed || isMobile) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-w-0">
                <p className="text-xs font-medium truncate">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">Platform Admin</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}

export default function PlatformLayout() {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile]     = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BP)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`)
    const handler = (e) => { setIsMobile(e.matches); if (!e.matches) setMobileOpen(false) }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const Logo = () => (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
        <ShieldCheck className="w-4 h-4 text-primary-foreground" />
      </div>
      <AnimatePresence>
        {(!collapsed || isMobile) && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            <p className="font-bold text-sm leading-tight whitespace-nowrap">NFINITY CRM</p>
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">Platform Admin</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  /* ── Mobile drawer ── */
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        <AnimatePresence>
          {mobileOpen && (
            <>
              <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
              <motion.aside
                initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-40 flex flex-col"
              >
                <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
                  <Logo />
                  <button onClick={() => setMobileOpen(false)} className="ml-auto p-1.5 rounded-lg hover:bg-accent transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <SidebarContent collapsed={false} isMobile onNavClick={() => setMobileOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>
        <PlatformHeader sidebarCollapsed={false} isMobile onMobileToggle={() => setMobileOpen(o => !o)} />
        <main className="pt-16 min-h-screen">
          <div className="p-4"><Outlet /></div>
        </main>
        <AICopilot />
      </div>
    )
  }

  /* ── Desktop ── */
  return (
    <div className="min-h-screen bg-background">
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col overflow-hidden"
      >
        <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
          <Logo />
          <button onClick={() => setCollapsed(c => !c)} className="ml-auto p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <SidebarContent collapsed={collapsed} isMobile={false} onNavClick={undefined} />
      </motion.aside>

      <PlatformHeader
        sidebarCollapsed={collapsed}
        isMobile={false}
        onMobileToggle={() => setMobileOpen(o => !o)}
      />
      <motion.main
        animate={{ marginLeft: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="pt-16 min-h-screen"
      >
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </motion.main>
      <AICopilot />
    </div>
  )
}
