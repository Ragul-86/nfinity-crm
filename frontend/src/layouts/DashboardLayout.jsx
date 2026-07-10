import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldAlert, ArrowLeft, X } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import AICopilot from '@/components/ai/AICopilot'

const MOBILE_BP = 768

// ── Impersonation Banner ───────────────────────────────────────────────────────
function ImpersonationBanner() {
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('impersonating_workspace')
      if (raw) setWorkspace(JSON.parse(raw))
    } catch {}
  }, [])

  if (!workspace) return null

  const returnToPlatform = () => {
    const platformToken = localStorage.getItem('platform_token')
    if (platformToken) {
      localStorage.setItem('token', platformToken)
      localStorage.removeItem('platform_token')
      localStorage.removeItem('impersonating_workspace')
      window.location.href = '/platform/workspaces'
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-amber-950">
      <div className="flex items-center justify-between px-4 py-2 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            You are logged in as <strong>Client Super Admin</strong> in workspace:{' '}
            <strong>{workspace.name}</strong>. All actions are audited.
          </span>
        </div>
        <button
          type="button"
          onClick={returnToPlatform}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-md bg-amber-800/20 hover:bg-amber-800/40 transition-colors shrink-0 ml-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Return to Platform Admin
        </button>
      </div>
    </div>
  )
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BP
  )
  const isImpersonating = typeof window !== 'undefined' && !!localStorage.getItem('platform_token')

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`)
    const handler = (e) => {
      setIsMobile(e.matches)
      if (!e.matches) setMobileOpen(false)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation warning banner — sits above everything */}
      {isImpersonating && <ImpersonationBanner />}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        isMobile={isMobile}
      />
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Header
        sidebarCollapsed={collapsed}
        isMobile={isMobile}
        onMobileToggle={() => setMobileOpen(o => !o)}
      />
      <motion.main
        animate={{ marginLeft: isMobile ? 0 : (collapsed ? 72 : 260) }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={isImpersonating ? 'pt-24 min-h-screen' : 'pt-16 min-h-screen'}
      >
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </motion.main>

      {/* Floating AI CRM Copilot */}
      <AICopilot />
    </div>
  )
}
