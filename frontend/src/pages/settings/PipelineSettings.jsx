/**
 * PipelineSettings.jsx
 *
 * Pipeline Management UI for Client Admins.
 * Accessible via Settings → Pipelines tab.
 *
 * Features:
 *  - List all workspace pipelines with lead counts
 *  - Create new pipeline (from scratch or industry template)
 *  - Edit pipeline: rename, add/remove/reorder stages, set stage types
 *  - Set default pipeline
 *  - Deactivate/archive pipeline (with safety check for leads)
 *  - Manage Ad → Pipeline mappings
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'
import {
  Plus, X, GripVertical, Trash2, Star, StarOff,
  Edit2, GitBranch, Settings2, ArrowRight, AlertCircle,
  CheckCircle2, XCircle, Circle,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'

// ── Stage type config ─────────────────────────────────────────────────────────
const STAGE_TYPES = [
  { value: 'open', label: 'Open',  icon: Circle,       color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
  { value: 'won',  label: 'Won',   icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { value: 'lost', label: 'Lost',  icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-950/30' },
]

const STAGE_COLORS = [
  '#6366f1','#3b82f6','#8b5cf6','#06b6d4','#0ea5e9',
  '#f59e0b','#f97316','#fb923c','#10b981','#22c55e',
  '#ef4444','#ec4899','#84cc16','#64748b',
]

function stageTypeInfo(type) {
  return STAGE_TYPES.find(t => t.value === type) || STAGE_TYPES[0]
}

// ── Industry template selector ─────────────────────────────────────────────────
function IndustrySelector({ value, onChange }) {
  const { data } = useQuery({
    queryKey: ['industry-templates'],
    queryFn: () => api.get('/pipeline-defs/industry-templates').then(r => r.data.data || []),
    staleTime: Infinity,
  })
  const industries = data || []
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select industry template (optional)" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="none">-- No template --</SelectItem>
        {industries.map(i => (
          <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Stage editor row ─────────────────────────────────────────────────────────
function StageRow({ stage, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const typeInfo = stageTypeInfo(stage.type)
  const TypeIcon = typeInfo.icon

  return (
    <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg border border-border/50">
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          title="Move up"
        >
          <span className="text-xs leading-none">▲</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          title="Move down"
        >
          <span className="text-xs leading-none">▼</span>
        </button>
      </div>

      {/* Color dot */}
      <div
        className="w-4 h-4 rounded-full shrink-0 border border-border/50 cursor-pointer"
        style={{ background: stage.color || '#6366f1' }}
        title="Click to cycle color"
        onClick={() => {
          const idx = STAGE_COLORS.indexOf(stage.color)
          onChange('color', STAGE_COLORS[(idx + 1) % STAGE_COLORS.length])
        }}
      />

      {/* Stage name */}
      <Input
        className="flex-1 h-8 text-sm"
        value={stage.name}
        onChange={e => onChange('name', e.target.value)}
        placeholder="Stage name"
      />

      {/* Stage type */}
      <Select value={stage.type || 'open'} onValueChange={v => onChange('type', v)}>
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_TYPES.map(t => {
            const Icon = t.icon
            return (
              <SelectItem key={t.value} value={t.value}>
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('w-3.5 h-3.5', t.color)} />
                  <span>{t.label}</span>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <button type="button" onClick={onRemove} className="text-destructive hover:text-red-600 transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Pipeline editor dialog ─────────────────────────────────────────────────────
function PipelineEditorDialog({ open, onClose, pipeline, onSaved }) {
  const isEdit = !!pipeline
  const qc = useQueryClient()

  const buildDefaultStages = () => [
    { name: 'New Lead',  type: 'open', color: '#6366f1', order: 0 },
    { name: 'Contacted', type: 'open', color: '#3b82f6', order: 1 },
    { name: 'Won',       type: 'won',  color: '#10b981', order: 2 },
    { name: 'Lost',      type: 'lost', color: '#ef4444', order: 3 },
  ]

  const [name, setName] = useState(pipeline?.name || '')
  const [description, setDescription] = useState(pipeline?.description || '')
  const [stages, setStages] = useState(
    pipeline?.stages?.length
      ? [...pipeline.stages].sort((a, b) => a.order - b.order)
      : buildDefaultStages()
  )
  const [industry, setIndustry] = useState('')
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  // Reset when dialog opens with new pipeline
  useState(() => {
    if (open) {
      setName(pipeline?.name || '')
      setDescription(pipeline?.description || '')
      setStages(pipeline?.stages?.length
        ? [...pipeline.stages].sort((a, b) => a.order - b.order)
        : buildDefaultStages())
      setIndustry('')
    }
  })

  const saveMut = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/pipeline-defs/${pipeline._id}`, data).then(r => r.data)
      : api.post('/pipeline-defs', data).then(r => r.data),
    onSuccess: (d) => {
      toast.success(isEdit ? 'Pipeline updated' : 'Pipeline created')
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      onSaved?.(d.data)
      onClose()
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed to save pipeline'),
  })

  const handleLoadTemplate = async () => {
    if (!industry || industry === 'none') return
    setLoadingTemplate(true)
    try {
      const r = await api.post('/pipeline-defs/from-industry', { industry })
      if (r.data.data?.length) {
        const first = r.data.data[0]
        if (!name) setName(first.name)
        setStages([...first.stages].sort((a, b) => a.order - b.order))
        toast.success(`Template loaded: ${first.name}`)
        qc.invalidateQueries({ queryKey: ['pipelines'] })
        onClose() // template auto-created pipeline, close dialog
      } else {
        toast('Template pipelines already exist in your workspace')
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load template')
    } finally {
      setLoadingTemplate(false)
    }
  }

  const addStage = () => setStages(prev => [
    ...prev,
    { name: '', type: 'open', color: '#6366f1', order: prev.length },
  ])

  const updateStage = (i, key, val) => setStages(prev =>
    prev.map((s, j) => j === i ? { ...s, [key]: val } : s)
  )

  const removeStage = (i) => setStages(prev => prev.filter((_, j) => j !== i))

  const moveStage = (i, dir) => {
    const next = [...stages]
    const swap = i + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[i], next[swap]] = [next[swap], next[i]]
    setStages(next)
  }

  const handleSave = () => {
    if (!name.trim()) return toast.error('Pipeline name is required')
    if (stages.some(s => !s.name.trim())) return toast.error('All stages must have names')
    saveMut.mutate({
      name: name.trim(),
      description,
      stages: stages.map((s, i) => ({ ...s, order: i })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Pipeline' : 'Create Pipeline'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Industry template loader (only for new pipelines) */}
          {!isEdit && (
            <div className="p-3 bg-muted/40 rounded-lg border border-border/50">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Load from industry template (optional)
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <IndustrySelector value={industry} onChange={setIndustry} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!industry || industry === 'none' || loadingTemplate}
                  onClick={handleLoadTemplate}
                >
                  {loadingTemplate ? 'Loading…' : 'Load Template'}
                </Button>
              </div>
            </div>
          )}

          {/* Pipeline name & description */}
          <div className="grid gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Pipeline Name *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sales Pipeline, Recruitment Pipeline"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>

          <Separator />

          {/* Stages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Stages ({stages.length})
              </Label>
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add Stage
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Use <strong>▲▼</strong> to reorder. Set <strong>Won</strong> / <strong>Lost</strong> type for closed stages. Click the colour dot to change it.
            </p>
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <StageRow
                  key={i}
                  stage={stage}
                  index={i}
                  total={stages.length}
                  onChange={(k, v) => updateStage(i, k, v)}
                  onRemove={() => removeStage(i)}
                  onMoveUp={() => moveStage(i, -1)}
                  onMoveDown={() => moveStage(i, 1)}
                />
              ))}
              {stages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No stages yet. Add at least one.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saveMut.isPending} onClick={handleSave}>
            {saveMut.isPending ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Pipeline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Pipeline card ─────────────────────────────────────────────────────────────
function PipelineCard({ pipeline, onEdit, onSetDefault, onDelete, pipelines }) {
  const qc = useQueryClient()
  const sortedStages = [...(pipeline.stages || [])].sort((a, b) => a.order - b.order)

  const setDefaultMut = useMutation({
    mutationFn: () => api.post(`/pipeline-defs/${pipeline._id}/default`).then(r => r.data),
    onSuccess: () => { toast.success(`"${pipeline.name}" set as default`); qc.invalidateQueries({ queryKey: ['pipelines'] }) },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  })

  return (
    <Card className={cn('transition-all', pipeline.isDefault && 'ring-1 ring-primary/40')}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base truncate">{pipeline.name}</CardTitle>
              {pipeline.isDefault && <Badge variant="secondary" className="text-[10px] shrink-0">Default</Badge>}
              {pipeline.industry && <Badge variant="outline" className="text-[10px] shrink-0">{pipeline.industry}</Badge>}
            </div>
            {pipeline.description && (
              <CardDescription className="mt-0.5 text-xs">{pipeline.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!pipeline.isDefault && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Set as default"
                onClick={() => setDefaultMut.mutate()}
                disabled={setDefaultMut.isPending}
              >
                <StarOff className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            )}
            {pipeline.isDefault && (
              <Star className="w-3.5 h-3.5 text-amber-500 mx-1" />
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(pipeline)}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(pipeline)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {pipeline.leadCount || 0} lead{pipeline.leadCount !== 1 ? 's' : ''} · {sortedStages.length} stage{sortedStages.length !== 1 ? 's' : ''}
        </p>
      </CardHeader>

      <CardContent>
        {/* Stage flow visualization */}
        <div className="flex flex-wrap gap-1 items-center">
          {sortedStages.map((stage, i) => {
            const typeInfo = stageTypeInfo(stage.type)
            return (
              <div key={String(stage._id)} className="flex items-center gap-1">
                <span
                  className="px-2 py-0.5 rounded text-[10px] text-white font-medium"
                  style={{ background: stage.color || '#6366f1' }}
                  title={`${stage.name} (${stage.type})`}
                >
                  {stage.name}
                </span>
                {i < sortedStages.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Delete pipeline dialog ─────────────────────────────────────────────────────
function DeletePipelineDialog({ pipeline, pipelines, open, onClose }) {
  const qc = useQueryClient()
  const [moveTo, setMoveTo] = useState('')

  const deleteMut = useMutation({
    mutationFn: (payload) => api.delete(`/pipeline-defs/${pipeline._id}`, { data: payload }).then(r => r.data),
    onSuccess: (d) => {
      toast.success(d.moved > 0 ? `Pipeline archived. ${d.moved} leads moved.` : 'Pipeline archived.')
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      onClose()
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  })

  if (!pipeline) return null
  const leadCount = pipeline.leadCount || 0
  const otherPipelines = pipelines.filter(p => p._id !== pipeline._id && p.isActive !== false)

  const handleDelete = () => {
    if (leadCount > 0 && !moveTo) {
      return toast.error('Select where to move leads, or choose to unassign them.')
    }
    deleteMut.mutate(leadCount > 0 ? { force: true, moveTo: moveTo || undefined } : {})
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive Pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {leadCount > 0 ? (
            <div className="flex gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  This pipeline has {leadCount} lead{leadCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Select another pipeline to move them to, or leave blank to unassign them.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Archive "<strong>{pipeline.name}</strong>"? This can be undone by re-activating it.
            </p>
          )}

          {leadCount > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Move leads to</Label>
              <Select value={moveTo || 'unassign'} onValueChange={v => setMoveTo(v === 'unassign' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassign leads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassign">Unassign (no pipeline)</SelectItem>
                  {otherPipelines.map(p => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={deleteMut.isPending} onClick={handleDelete}>
            {deleteMut.isPending ? 'Archiving…' : 'Archive Pipeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Ad → Pipeline mapping tab ─────────────────────────────────────────────────
function MappingsTab({ pipelines }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ pipelineId: '', adId: '', adName: '', metaFormId: '', sheetName: '', source: '', label: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: mappingData, isLoading } = useQuery({
    queryKey: ['pipeline-mappings'],
    queryFn: () => api.get('/pipeline-defs/mappings').then(r => r.data.data || []),
  })
  const mappings = mappingData || []

  const createMut = useMutation({
    mutationFn: (data) => api.post('/pipeline-defs/mappings', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Mapping created')
      qc.invalidateQueries({ queryKey: ['pipeline-mappings'] })
      setShowCreate(false)
      setForm({ pipelineId: '', adId: '', adName: '', metaFormId: '', sheetName: '', source: '', label: '' })
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/pipeline-defs/mappings/${id}`),
    onSuccess: () => { toast.success('Mapping deleted'); qc.invalidateQueries({ queryKey: ['pipeline-mappings'] }) },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  })

  const handleCreate = () => {
    if (!form.pipelineId) return toast.error('Select a pipeline')
    if (!form.adId && !form.metaFormId && !form.sheetName && !form.source) {
      return toast.error('Set at least one match criterion (Ad ID, Form ID, Sheet Name, or Source)')
    }
    createMut.mutate(form)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Ad → Pipeline Mappings</p>
          <p className="text-xs text-muted-foreground">Route incoming leads to specific pipelines based on their Meta Ad, Form, Sheet tab, or Source.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(s => !s)}>
          <Plus className="w-3.5 h-3.5 mr-1" />{showCreate ? 'Cancel' : 'Add Mapping'}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Target Pipeline *</Label>
              <Select value={form.pipelineId} onValueChange={v => set('pipelineId', v)}>
                <SelectTrigger><SelectValue placeholder="Select pipeline" /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Meta Ad ID</Label>
                <Input value={form.adId} onChange={e => set('adId', e.target.value)} placeholder="e.g. 120202..." />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Meta Form ID</Label>
                <Input value={form.metaFormId} onChange={e => set('metaFormId', e.target.value)} placeholder="e.g. 987654..." />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Sheet Tab Name</Label>
                <Input value={form.sheetName} onChange={e => set('sheetName', e.target.value)} placeholder="e.g. Digital Marketing Leads" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Source</Label>
                <Input value={form.source} onChange={e => set('source', e.target.value)} placeholder="e.g. facebook_ads" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Label (optional)</Label>
              <Input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Hiring Ad → Recruitment Pipeline" />
            </div>
            <Button size="sm" disabled={createMut.isPending} onClick={handleCreate}>
              {createMut.isPending ? 'Creating…' : 'Create Mapping'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mappings list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading mappings…</p>
      ) : mappings.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No mappings yet.</p>
          <p className="text-xs mt-1">Add a mapping to automatically route leads to the right pipeline.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {mappings.map(m => (
            <Card key={m._id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {m.label && <p className="text-sm font-medium truncate">{m.label}</p>}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {m.adId      && <Badge variant="outline" className="text-[10px]">Ad: {m.adId}</Badge>}
                    {m.metaFormId && <Badge variant="outline" className="text-[10px]">Form: {m.metaFormId}</Badge>}
                    {m.sheetName && <Badge variant="outline" className="text-[10px]">Sheet: {m.sheetName}</Badge>}
                    {m.source    && <Badge variant="outline" className="text-[10px]">Source: {m.source}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <ArrowRight className="w-3 h-3 inline mr-0.5" />
                    {m.pipelineId?.name || 'Unknown pipeline'}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  onClick={() => { if (window.confirm('Delete this mapping?')) deleteMut.mutate(m._id) }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main PipelineSettings component ──────────────────────────────────────────
export default function PipelineSettings() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const canManage = ['client_super_admin', 'super_admin', 'admin'].includes(user?.role)

  const { data, isLoading, error } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.get('/pipeline-defs').then(r => r.data.data || []),
    refetchInterval: 30000,
  })
  const pipelines = data || []

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading pipelines…</p>
  if (error) return <p className="text-sm text-red-500 py-4">Failed to load pipelines: {error.message}</p>

  return (
    <div className="space-y-5">
      <Tabs defaultValue="pipelines">
        <TabsList>
          <TabsTrigger value="pipelines" className="gap-2">
            <Settings2 className="w-3.5 h-3.5" />Pipelines
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="mappings" className="gap-2">
              <GitBranch className="w-3.5 h-3.5" />Ad Mappings
            </TabsTrigger>
          )}
        </TabsList>

        {/* Pipelines tab */}
        <TabsContent value="pipelines" className="space-y-4 mt-4">
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />New Pipeline
              </Button>
            </div>
          )}

          {pipelines.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No pipelines yet</p>
              <p className="text-xs mt-1">Create a pipeline or load one from an industry template.</p>
              {canManage && (
                <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Create Pipeline
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {pipelines.map(p => (
                <PipelineCard
                  key={p._id}
                  pipeline={p}
                  pipelines={pipelines}
                  onEdit={canManage ? setEditTarget : undefined}
                  onSetDefault={canManage ? () => {} : undefined}
                  onDelete={canManage ? setDeleteTarget : undefined}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Mappings tab */}
        {canManage && (
          <TabsContent value="mappings" className="mt-4">
            <MappingsTab pipelines={pipelines} />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      {showCreate && (
        <PipelineEditorDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          pipeline={null}
          onSaved={() => qc.invalidateQueries({ queryKey: ['pipelines'] })}
        />
      )}
      {editTarget && (
        <PipelineEditorDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          pipeline={editTarget}
          onSaved={() => qc.invalidateQueries({ queryKey: ['pipelines'] })}
        />
      )}
      {deleteTarget && (
        <DeletePipelineDialog
          open={!!deleteTarget}
          pipeline={deleteTarget}
          pipelines={pipelines}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
