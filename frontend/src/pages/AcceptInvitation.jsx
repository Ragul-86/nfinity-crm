import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Eye, EyeOff, CheckCircle2, AlertCircle, Zap, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
  viewer: 'Viewer',
  super_admin: 'Super Admin',
  client_super_admin: 'Super Admin',
}

export default function AcceptInvitation() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})

  // Validate token on mount
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['invitation-validate', token],
    queryFn: () => api.get(`/invitations/validate/${token}`).then(r => r.data),
    retry: false,
    refetchOnWindowFocus: false,
  })

  const invitation = data?.data

  const acceptMutation = useMutation({
    mutationFn: ({ password }) =>
      api.post(`/invitations/accept/${token}`, { password }).then(r => r.data),
    onSuccess: () => {
      toast.success('Account created! Please log in.')
      navigate('/login')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to accept invitation'),
  })

  const validate = () => {
    const e = {}
    if (!password || password.length < 8) e.password = 'Minimum 8 characters'
    if (password !== confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (validate()) acceptMutation.mutate({ password })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Validating invitation…</p>
        </div>
      </div>
    )
  }

  // Error / expired
  if (isError) {
    const msg = error?.response?.data?.message || 'This invitation is invalid or has expired.'
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Invalid Invitation</h2>
              <p className="text-sm text-muted-foreground">{msg}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Contact your workspace admin to request a new invitation.
            </p>
            <Link to="/login">
              <Button variant="outline" size="sm">Back to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardContent className="pt-8 pb-8 space-y-6">
            {/* Logo */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold">Accept Invitation</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  You've been invited to join{' '}
                  <span className="font-medium text-foreground">{invitation?.tenantName || 'a workspace'}</span>
                </p>
              </div>
            </div>

            {/* Invite details */}
            <div className="bg-muted/50 rounded-lg px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invited as</span>
                <span className="font-medium capitalize">{invitation?.name || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{invitation?.email || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="font-medium">{ROLE_LABELS[invitation?.role] || invitation?.role || '—'}</span>
              </div>
            </div>

            {/* Password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Set Password *</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-3 py-2.5 pr-10 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(p => !p)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Confirm Password *</label>
                <div className="relative mt-1">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="w-full px-3 py-2.5 pr-10 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm(p => !p)}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up account…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" />Create Account & Join</>
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
