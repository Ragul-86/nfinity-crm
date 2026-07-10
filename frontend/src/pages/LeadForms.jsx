import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'react-hot-toast'
import {
  Plus, Search, MoreVertical, Copy, Archive, Trash2,
  Eye, ExternalLink, BarChart2, FileText, Users,
  CheckCircle, XCircle, Clock, Link, Code2, Settings,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { format, formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

async function apiFetch(url, opts = {}) {
  const r = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.message || 'Request failed')
  return d
}

const STATUS_BADGES = {
  active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  inactive: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const DEFAULT_FIELDS = [
  { id: 'field_name',    type: 'text',  label: 'Full Name',    required: true,  leadField: 'name',    order: 0 },
  { id: 'field_phone',   type: 'phone', label: 'Phone Number', required: true,  leadField: 'phone',   order: 1 },
  { id: 'field_email',   type: 'email', label: 'Email',        required: false, leadField: 'email',   order: 2 },
  { id: 'field_company', type: 'text',  label: 'Company Name', required: false, leadField: 'company', order: 3 },
  { id: 'field_message', type: 'textarea', label: 'Message',  required: false, leadField: null,       order: 4 },
]

// ── Create / Edit Form Dialog ─────────────────────────────────────────────────
function FormEditorDialog({ open, onClose, existing }) {
  const qc = useQueryClient()
  const isEdit = !!existing

  const [form, setForm] = useState({
    name:        existing?.name        || '',
    description: existing?.description || '',
    status:      existing?.status      || 'active',
    settings: {
      thankYouMessage:   existing?.settings?.thankYouMessage   || 'Thank you! We will contact you shortly.',
      redirectUrl:       existing?.settings?.redirectUrl       || '',
      preventDuplicates: existing?.settings?.preventDuplicates ?? true,
      duplicateField:    existing?.settings?.duplicateField    || 'phone',
      defaultPriority:   existing?.settings?.defaultPriority   || 'medium',
      assignmentMode:    existing?.settings?.assignmentMode    || 'none',
    },
    fields: existing?.fields || DEFAULT_FIELDS,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setSetting = (k, v) => setForm(f => ({
    ...f,
    settings: { ...f.settings, [k]: v },
  }))

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? apiFetch(`/api/lead-forms/${existing._id}`, { method: 'PUT', body: JSON.stringify(data) })
      : apiFetch('/api/lead-forms', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-forms'] })
      toast.success(isEdit ? 'Form updated' : 'Form created')
      onClose()
    },
    onError: e => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Form' : 'Create Lead Form'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-1.5">
            <Label>Form Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Website Contact Form"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Internal description…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Settings</p>

            <div className="space-y-1.5">
              <Label>Thank You Message</Label>
              <Textarea
                rows={2}
                value={form.settings.thankYouMessage}
                onChange={e => setSetting('thankYouMessage', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Redirect URL (optional)</Label>
              <Input
                placeholder="https://yoursite.com/thank-you"
                value={form.settings.redirectUrl}
                onChange={e => setSetting('redirectUrl', e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Prevent Duplicates</p>
                <p className="text-xs text-muted-foreground">Block same phone/email submitting twice</p>
              </div>
              <Switch
                checked={form.settings.preventDuplicates}
                onCheckedChange={v => setSetting('preventDuplicates', v)}
              />
            </div>

            {form.settings.preventDuplicates && (
              <div className="space-y-1.5 pl-4 border-l">
                <Label>Check duplicate by</Label>
                <Select value={form.settings.duplicateField} onValueChange={v => setSetting('duplicateField', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default Priority</Label>
                <Select value={form.settings.defaultPriority} onValueChange={v => setSetting('defaultPriority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Auto-Assignment</Label>
                <Select value={form.settings.assignmentMode} onValueChange={v => setSetting('assignmentMode', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="specific">Specific User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending ? 'Saving…' : isEdit ? 'Update Form' : 'Create Form'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Submissions Dialog ─────────────────────────────────────────────────────────
function SubmissionsDialog({ open, onClose, form }) {
  const { data, isLoading } = useQuery({
    queryKey: ['form-submissions', form?._id],
    queryFn: () => apiFetch(`/api/lead-forms/${form._id}/submissions`).then(d => d.data),
    enabled: !!form && open,
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Submissions — {form?.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {form?.submissionsCount || 0} total · {form?.conversionsCount || 0} converted to leads
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : !data?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No submissions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.map(sub => (
                <div key={sub._id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {sub.data?.field_name && <span className="text-sm font-medium">{sub.data.field_name}</span>}
                      {sub.data?.field_phone && <span className="text-sm text-muted-foreground">{sub.data.field_phone}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(sub.submittedAt), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sub.isDuplicate ? (
                      <Badge variant="outline" className="text-xs text-yellow-600">Duplicate</Badge>
                    ) : sub.convertedToLead ? (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700">Lead Created</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pending</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Form Card ─────────────────────────────────────────────────────────────────
function FormCard({ form, onEdit, onViewSubmissions, onRefresh }) {
  const qc = useQueryClient()

  const duplicateMut = useMutation({
    mutationFn: () => apiFetch(`/api/lead-forms/${form._id}/duplicate`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-forms'] }); toast.success('Form duplicated') },
    onError: e => toast.error(e.message),
  })

  const archiveMut = useMutation({
    mutationFn: () => apiFetch(`/api/lead-forms/${form._id}/archive`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-forms'] }); toast.success('Form archived') },
    onError: e => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiFetch(`/api/lead-forms/${form._id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-forms'] }); toast.success('Form deleted') },
    onError: e => toast.error(e.message),
  })

  const publicUrl = `${window.location.origin}/forms/${form.publicToken}`
  const embedCode = `<script src="${API}/embed/form/${form.publicToken}.js"></script>`

  const convRate = form.submissionsCount > 0
    ? Math.round((form.conversionsCount / form.submissionsCount) * 100)
    : 0

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_BADGES[form.status])}>
              {form.status}
            </span>
          </div>
          <h3 className="font-semibold text-sm truncate">{form.name}</h3>
          {form.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{form.description}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit(form)}>
              <Settings className="w-4 h-4 mr-2" /> Edit Form
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewSubmissions(form)}>
              <FileText className="w-4 h-4 mr-2" /> View Submissions
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(publicUrl, '_blank')}>
              <Eye className="w-4 h-4 mr-2" /> Preview Form
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link copied!') }}>
              <Link className="w-4 h-4 mr-2" /> Copy Public Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(embedCode); toast.success('Embed code copied!') }}>
              <Code2 className="w-4 h-4 mr-2" /> Copy Embed Code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => duplicateMut.mutate()} disabled={duplicateMut.isPending}>
              <Copy className="w-4 h-4 mr-2" /> Duplicate
            </DropdownMenuItem>
            {form.status !== 'archived' && (
              <DropdownMenuItem onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>
                <Archive className="w-4 h-4 mr-2" /> Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (window.confirm(`Delete "${form.name}"? This cannot be undone.`)) {
                  deleteMut.mutate()
                }
              }}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-muted/40 rounded-lg p-2 text-center">
          <p className="text-base font-bold">{form.submissionsCount || 0}</p>
          <p className="text-[10px] text-muted-foreground">Submissions</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-2 text-center">
          <p className="text-base font-bold text-emerald-600">{form.conversionsCount || 0}</p>
          <p className="text-[10px] text-muted-foreground">Leads Created</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-2 text-center">
          <p className="text-base font-bold text-blue-600">{convRate}%</p>
          <p className="text-[10px] text-muted-foreground">Conv. Rate</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2.5">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {form.fields?.length || 0} fields
        </span>
        <span>
          {form.lastSubmissionAt
            ? `Last: ${formatDistanceToNow(new Date(form.lastSubmissionAt), { addSuffix: true })}`
            : `Created ${format(new Date(form.createdAt), 'MMM d')}`}
        </span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeadForms() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editForm, setEditForm]   = useState(null)
  const [submForm, setSubmForm]   = useState(null)

  const canManage = ['super_admin', 'admin', 'manager'].includes(user?.role)

  const { data, isLoading } = useQuery({
    queryKey: ['lead-forms'],
    queryFn: () => apiFetch('/api/lead-forms').then(d => d.data),
    refetchInterval: 30000,
  })

  const forms = (data || []).filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lead Forms</h1>
          <p className="text-sm text-muted-foreground">
            Capture leads via embeddable forms · {data?.length || 0} form{data?.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Create Form
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search forms…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !forms.length ? (
        <div className="flex flex-col items-center py-20 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mb-4 opacity-30" />
          <h3 className="font-medium mb-1">{search ? 'No forms match your search' : 'No lead forms yet'}</h3>
          {!search && canManage && (
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create your first form
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map(f => (
            <FormCard
              key={f._id}
              form={f}
              onEdit={setEditForm}
              onViewSubmissions={setSubmForm}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <FormEditorDialog open onClose={() => setShowCreate(false)} />
      )}
      {editForm && (
        <FormEditorDialog open onClose={() => setEditForm(null)} existing={editForm} />
      )}
      {submForm && (
        <SubmissionsDialog open onClose={() => setSubmForm(null)} form={submForm} />
      )}
    </div>
  )
}
