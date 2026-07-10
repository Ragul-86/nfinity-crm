import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bell, Send, Building2 } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader } from '@/components/platform/PlatformPageHeader'
import { useQuery } from '@tanstack/react-query'

export default function PlatformNotifications() {
  const [form, setForm] = useState({ title: '', message: '', type: 'info', targetWorkspace: 'all' })
  const [errors, setErrors] = useState({})

  const { data: workspacesData } = useQuery({
    queryKey: ['platform-tenants-minimal'],
    queryFn: () => api.get('/platform/tenants?limit=100&status=active').then(r => r.data),
  })

  const tenants = workspacesData?.tenants || []

  const mutation = useMutation({
    mutationFn: (body) => api.post('/platform/notifications/broadcast', body).then(r => r.data),
    onSuccess: (d) => {
      toast.success(`Broadcast sent to ${d.sentTo || 'all users'}`)
      setForm({ title: '', message: '', type: 'info', targetWorkspace: 'all' })
    },
    onError: err => toast.error(err.response?.data?.message || 'Failed to broadcast'),
  })

  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = 'Required'
    if (!form.message.trim()) e.message = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = () => {
    if (!validate()) return
    mutation.mutate(form)
  }

  const TYPES = [
    { value: 'info',    label: 'Info',    color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
    { value: 'success', label: 'Success', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
    { value: 'warning', label: 'Warning', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' },
    { value: 'error',   label: 'Error',   color: 'bg-red-500/10 text-red-600 border-red-200' },
  ]

  return (
    <div>
      <PlatformPageHeader
        title="Notifications"
        subtitle="Broadcast platform announcements to workspace users"
        icon={Bell}
        breadcrumbs={[{ label: 'Notifications' }]}
      />

      <div className="max-w-xl">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Send className="w-4 h-4 text-primary" />
            <p className="font-semibold text-sm">Broadcast Notification</p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Target Workspace</label>
            <select
              className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.targetWorkspace}
              onChange={e => setForm(f => ({ ...f, targetWorkspace: e.target.value }))}
            >
              <option value="all">All Active Workspaces</option>
              {tenants.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notification Type</label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.type === t.value ? t.color : 'bg-background border-border text-muted-foreground hover:bg-accent'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input
              className={`mt-1 w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${errors.title ? 'border-destructive' : 'border-input'}`}
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Scheduled maintenance on July 10"
            />
            {errors.title && <p className="text-xs text-destructive mt-0.5">{errors.title}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Message *</label>
            <textarea
              rows={4}
              className={`mt-1 w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none ${errors.message ? 'border-destructive' : 'border-input'}`}
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Enter your notification message here…"
            />
            {errors.message && <p className="text-xs text-destructive mt-0.5">{errors.message}</p>}
          </div>

          <div className="pt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {form.targetWorkspace === 'all'
                ? `Will notify users in ${tenants.length} active workspaces`
                : `Will notify users in selected workspace`
              }
            </p>
            <Button size="sm" onClick={submit} disabled={mutation.isPending}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {mutation.isPending ? 'Sending…' : 'Send Broadcast'}
            </Button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
          <p className="text-xs font-medium mb-1">Note</p>
          <p className="text-xs text-muted-foreground">Notifications are delivered in real-time to users currently logged in, and stored for others to see on their next login.</p>
        </div>
      </div>
    </div>
  )
}
