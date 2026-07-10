import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { User, Lock, Bell, Palette, Building2, Shield, Save, Loader2, Sparkles } from 'lucide-react'
import AISettings from '@/pages/settings/AISettings'
import { motion } from 'framer-motion'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import toast from 'react-hot-toast'

export default function Settings() {
  const { user, updateProfile, changePassword } = useAuth()
  const { theme, setTheme } = useTheme()

  const profileForm = useForm({ defaultValues: { name: user?.name, phone: user?.phone, department: user?.department, designation: user?.designation } })
  const passwordForm = useForm()

  const onProfileSave = async (data) => {
    try {
      await updateProfile(data)
      toast.success('Profile updated')
    } catch { toast.error('Failed to update profile') }
  }

  const onPasswordChange = async (data) => {
    if (data.newPassword !== data.confirmPassword) { toast.error("Passwords don't match"); return }
    try {
      await changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword })
      toast.success('Password changed')
      passwordForm.reset()
    } catch { toast.error('Failed to change password') }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and preferences" />

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile" className="gap-2"><User className="w-4 h-4" />Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Lock className="w-4 h-4" />Security</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="w-4 h-4" />Notifications</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2"><Palette className="w-4 h-4" />Appearance</TabsTrigger>
          {['super_admin', 'admin'].includes(user?.role) && (
            <TabsTrigger value="company" className="gap-2"><Building2 className="w-4 h-4" />Company</TabsTrigger>
          )}
          {['platform_super_admin', 'client_super_admin', 'super_admin', 'admin'].includes(user?.role) && (
            <TabsTrigger value="ai" className="gap-2"><Sparkles className="w-4 h-4" />AI Copilot</TabsTrigger>
          )}
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onProfileSave)} className="space-y-5 max-w-lg">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
                    {user?.name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    <Badge variant="secondary" className="mt-1 capitalize">{user?.role?.replace('_', ' ')}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: 'name', label: 'Full Name', autoComplete: 'name' },
                    { id: 'phone', label: 'Phone', autoComplete: 'tel' },
                    { id: 'department', label: 'Department', autoComplete: 'organization-title' },
                    { id: 'designation', label: 'Designation', autoComplete: 'organization-title' },
                  ].map(({ id, label, autoComplete }) => (
                    <div key={id} className="space-y-1.5">
                      <Label htmlFor={id}>{label}</Label>
                      <Input id={id} autoComplete={autoComplete} {...profileForm.register(id)} />
                    </div>
                  ))}
                </div>

                <Button type="submit" className="gap-2" disabled={profileForm.formState.isSubmitting}>
                  {profileForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password regularly to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordChange)} className="space-y-4 max-w-md">
                {/* Hidden username field for browser accessibility/password manager */}
                <input type="text" name="username" autoComplete="username" value={user?.email || ''} readOnly style={{ display: 'none' }} />
                {[
                  { id: 'currentPassword', label: 'Current Password', autoComplete: 'current-password' },
                  { id: 'newPassword', label: 'New Password', autoComplete: 'new-password' },
                  { id: 'confirmPassword', label: 'Confirm New Password', autoComplete: 'new-password' },
                ].map(({ id, label, autoComplete }) => (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={id}>{label}</Label>
                    <Input id={id} type="password" autoComplete={autoComplete} {...passwordForm.register(id, { required: true })} />
                  </div>
                ))}
                <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5 max-w-lg">
                {[
                  { id: 'email', label: 'Email Notifications', desc: 'Receive notifications via email' },
                  { id: 'inApp', label: 'In-App Notifications', desc: 'Show notifications in the app' },
                  { id: 'taskReminders', label: 'Task Reminders', desc: 'Get reminded about upcoming task deadlines' },
                  { id: 'campaignAlerts', label: 'Campaign Alerts', desc: 'Alerts for campaign budget and performance' },
                  { id: 'sopApprovals', label: 'SOP Approvals', desc: 'Notifications for SOP approval requests' },
                ].map(({ id, label, desc }) => (
                  <div key={id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch defaultChecked={user?.notificationPreferences?.[id] !== false} />
                  </div>
                ))}
                <Button className="gap-2 mt-4"><Save className="w-4 h-4" />Save Preferences</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how Ascendia CRM looks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-md space-y-5">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'light', label: 'Light', preview: 'bg-white border-gray-200' },
                      { value: 'dark', label: 'Dark', preview: 'bg-gray-900 border-gray-700' },
                      { value: 'system', label: 'System', preview: 'bg-gradient-to-r from-white to-gray-900' },
                    ].map(({ value, label, preview }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value)}
                        className={`p-3 rounded-lg border-2 transition-all ${theme === value ? 'border-primary' : 'border-border'}`}
                      >
                        <div className={`h-12 rounded-md mb-2 border ${preview}`} />
                        <p className="text-xs font-medium">{label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Copilot */}
        <TabsContent value="ai">
          <AISettings />
        </TabsContent>

        {/* Company */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Company Settings</CardTitle>
              <CardDescription>Manage your organization information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-lg">
                {[
                  { id: 'companyName', label: 'Company Name', placeholder: 'Ascendia Marketing' },
                  { id: 'website', label: 'Website', placeholder: 'https://company.com' },
                  { id: 'email', label: 'Contact Email', placeholder: 'contact@company.com' },
                  { id: 'phone', label: 'Phone', placeholder: '+1 234 567 8900' },
                  { id: 'address', label: 'Address', placeholder: '123 Main St, City, Country' },
                ].map(({ id, label, placeholder }) => (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={id}>{label}</Label>
                    <Input id={id} placeholder={placeholder} />
                  </div>
                ))}
                <Button className="gap-2"><Save className="w-4 h-4" />Save Company Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
