import { useNavigate } from 'react-router-dom'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

export default function AccessDenied() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleBack = () => {
    if (user?.role === 'platform_super_admin') {
      navigate('/platform')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-destructive mb-1">403</h1>
          <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            You don't have permission to view this page. Contact your administrator if you believe this is a mistake.
          </p>
        </div>
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Go Back
          </Button>
          <Button size="sm" onClick={handleBack}>
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
