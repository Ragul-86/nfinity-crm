import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ProtectedRoute — guards routes by auth state and optional role list.
 *
 * Props:
 *   roles   – array of allowed role strings. If omitted, any authenticated user passes.
 *   require – 'platformAdmin' | 'tenantUser' | undefined
 *             'platformAdmin'  → only platform_super_admin passes
 *             'tenantUser'     → blocks platform_super_admin (must have a tenant)
 */
export default function ProtectedRoute({ roles, require }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Require platform admin only
  if (require === 'platformAdmin' && user.role !== 'platform_super_admin') {
    return <Navigate to="/unauthorized" replace />
  }

  // Require a tenant user (block platform admin from tenant pages when not impersonating)
  if (require === 'tenantUser' && user.role === 'platform_super_admin') {
    return <Navigate to="/platform" replace />
  }

  // Role allow-list check
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
