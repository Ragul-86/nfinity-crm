import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { User, Bell, Lock, Save, Loader2, Eye, EyeOff } from 'lucide-react'
import portalApi from '@/services/portalApi'
import { usePortal } from '@/contexts/PortalContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import toast from 'react-hot-toast'

export default function PortalProfile() {
  const { portalUser, updateProfile } = usePortal()
  const [showPw, setShowPw] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['portal-profile'],
    queryFn: () => portalApi.get('/profile').then(r => r.data.data),
  })

  const profileForm = useForm({
    values: { name: profile?.name || '', phone: profile?.phone || '' },
  })

  const pwForm = useForm()

  const { mutate: saveProfile, isPending: savingProfile } = useMutation({
    mutationFn: (body) => updateProfile(body),
    onSuccess: () => toast.success('Profile updated'),
    onError: () => toast.error('Failed to update profile'),
  })

  const { mutate: saveNotifs, isPending: savingNotifs } = useMutation({
    mutationFn: (notificationPreferences) => updateProfile({ notificationPreferences }),
    onSuccess: () => toast.success('Notification preferences saved'),
    onError: () => toast.error('Failed to save preferences'),
  })

  const { mutate: changePassword, isPending: changingPw } = useMutation({
    mutationFn: (body) => portalApi.put('/profile/password', body).then(r => r.data),
    onSuccess: () => { toast.success('Password changed'); pwForm.reset() },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const [notifPrefs, setNotifPrefs] = useState(null)
  const prefs = notifPrefs || profile?.notificationPreferences || {}

  const initials = portalUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account information</p>
      </div>

      {/* Avatar header */}
      <div className="flex items-center gap-4">
        <Avatar className="w-16 h-16">
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-lg">{profile?.name}</p>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
        </div>
      </div>

      {/* Profile info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" />Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(saveProfile)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input {...profileForm.register('name', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...profileForm.register('phone')} placeholder="+91 00000 00000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile?.email || ''} disabled className="opacity-60" />
            </div>
            <Button type="submit" disabled={savingProfile} className="gap-2">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />Notification Preferences</CardTitle>
          <CardDescription>Choose which events you want to be notified about</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { key: 'invoice', label: 'Invoice Updates', desc: 'New invoices, payment confirmations' },
              { key: 'quotation', label: 'Quotation Updates', desc: 'New quotations sent for review' },
              { key: 'meeting', label: 'Meeting Reminders', desc: 'Upcoming meeting notifications' },
              { key: 'task', label: 'Task Updates', desc: 'Task assignments and status changes' },
              { key: 'support', label: 'Support Replies', desc: 'Replies on your support tickets' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={prefs[key] !== false}
                  onCheckedChange={checked => {
                    const next = { ...prefs, [key]: checked }
                    setNotifPrefs(next)
                  }}
                />
              </div>
            ))}
            <Button onClick={() => saveNotifs(notifPrefs || prefs)} disabled={savingNotifs} variant="outline" className="gap-2">
              {savingNotifs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4" />Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={pwForm.handleSubmit(data => changePassword(data))} className="space-y-4">
            {[
              { id: 'currentPassword', label: 'Current Password' },
              { id: 'newPassword', label: 'New Password' },
              { id: 'confirmPassword', label: 'Confirm New Password' },
            ].map(({ id, label }) => (
              <div key={id} className="space-y-1.5">
                <Label>{label}</Label>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    {...pwForm.register(id, { required: true })}
                    className="pr-10"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
            <Button type="submit" disabled={changingPw} className="gap-2">
              {changingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
