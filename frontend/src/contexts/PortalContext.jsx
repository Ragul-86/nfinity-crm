import { createContext, useContext, useState, useCallback } from 'react'
import portalApi from '@/services/portalApi'

const PortalContext = createContext(null)

export function PortalProvider({ children }) {
  const [portalUser, setPortalUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('portalUser')) } catch { return null }
  })

  const login = useCallback(async (email, password) => {
    const { data } = await portalApi.post('/auth/login', { email, password })
    localStorage.setItem('portalToken', data.token)
    localStorage.setItem('portalUser', JSON.stringify(data.user))
    setPortalUser(data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('portalToken')
    localStorage.removeItem('portalUser')
    setPortalUser(null)
  }, [])

  const updateProfile = useCallback(async (updates) => {
    const { data } = await portalApi.put('/profile', updates)
    const updated = data.data
    localStorage.setItem('portalUser', JSON.stringify(updated))
    setPortalUser(updated)
    return updated
  }, [])

  return (
    <PortalContext.Provider value={{ portalUser, login, logout, updateProfile }}>
      {children}
    </PortalContext.Provider>
  )
}

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be inside PortalProvider')
  return ctx
}
