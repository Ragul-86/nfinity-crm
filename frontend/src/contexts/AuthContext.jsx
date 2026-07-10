import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '@/services/api'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

// Role hierarchy for permission checks
const ROLE_LEVELS = {
  platform_super_admin: 100,
  client_super_admin: 80,
  super_admin: 80,
  admin: 60,
  manager: 40,
  employee: 20,
  viewer: 10,
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMe() }, [fetchMe])

  const login = async (credentials) => {
    const { data } = await api.post('/auth/login', credentials)
    setUser(data.user)
    return data
  }

  const register = async (userData) => {
    const { data } = await api.post('/auth/register', userData)
    setUser(data.user)
    return data
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    setUser(null)
    toast.success('Logged out successfully')
  }

  const updateProfile = async (profileData) => {
    const { data } = await api.put('/auth/update-profile', profileData)
    setUser(data.user)
    return data
  }

  const changePassword = async (passwords) => {
    const { data } = await api.put('/auth/change-password', passwords)
    return data
  }

  // ── Role helpers ──────────────────────────────────────────────────────────
  const isRole = (...roles) => roles.includes(user?.role)

  const isPlatformAdmin = () => user?.role === 'platform_super_admin'

  const isTenantSuperAdmin = () =>
    user?.role === 'super_admin' || user?.role === 'client_super_admin'

  const isAdminOrAbove = () =>
    ['platform_super_admin', 'client_super_admin', 'super_admin', 'admin'].includes(user?.role)

  const isManagerOrAbove = () =>
    ['platform_super_admin', 'client_super_admin', 'super_admin', 'admin', 'manager'].includes(user?.role)

  const roleLevel = () => ROLE_LEVELS[user?.role] || 0

  const hasRoleAtLeast = (role) => roleLevel() >= (ROLE_LEVELS[role] || 0)

  const can = (permission) => {
    const rolePermissions = {
      platform_super_admin: ['all'],
      client_super_admin: ['all'],
      super_admin: ['all'],
      admin: ['manage_users', 'manage_clients', 'manage_campaigns', 'manage_leads', 'manage_sop', 'manage_projects', 'manage_tasks', 'view_reports'],
      manager: ['manage_clients', 'manage_campaigns', 'manage_leads', 'manage_sop', 'manage_projects', 'manage_tasks', 'view_reports'],
      employee: ['view_clients', 'view_campaigns', 'manage_tasks', 'view_sop'],
      viewer: ['view_clients', 'view_campaigns', 'view_sop', 'view_reports'],
    }
    const perms = rolePermissions[user?.role] || []
    return perms.includes('all') || perms.includes(permission)
  }

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, logout, updateProfile, changePassword, fetchMe,
      isRole, isPlatformAdmin, isTenantSuperAdmin, isAdminOrAbove, isManagerOrAbove,
      roleLevel, hasRoleAtLeast, can,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
