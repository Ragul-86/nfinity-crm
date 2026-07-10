import { Navigate } from 'react-router-dom'
import { usePortal } from '@/contexts/PortalContext'

export default function PortalRoute({ children }) {
  const { portalUser } = usePortal()
  if (!portalUser) return <Navigate to="/portal/login" replace />
  return children
}
