import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { BookOpen, CheckCircle, Clock, AlertCircle, Circle } from 'lucide-react'
import api from '@/services/api'

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', icon: Circle,       color: 'text-muted-foreground', bg: 'bg-muted/20' },
  in_progress: { label: 'In Progress', icon: Clock,        color: 'text-blue-400',          bg: 'bg-blue-500/10' },
  completed:   { label: 'Completed',   icon: CheckCircle,  color: 'text-green-400',         bg: 'bg-green-500/10' },
  overdue:     { label: 'Overdue',     icon: AlertCircle,  color: 'text-red-400',           bg: 'bg-red-500/10' },
  paused:      { label: 'Paused',      icon: Clock,        color: 'text-amber-400',         bg: 'bg-amber-500/10' },
}

function ProgressBar({ value, max = 100 }) {
  const pct = Math.min(100, Math.round((value / max) * 100)) || 0
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : pct > 50 ? 'bg-blue-400' : 'bg-amber-400'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function SOPTab({ clientId }) {
  const { data: sops = [], isLoading } = useQuery({
    queryKey: ['customer-sop', clientId],
    queryFn: () => api.get(`/customers/${clientId}/sop`).then(r => r.data.data),
  })

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  if (!sops.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No SOPs assigned to this client</p>
        <p className="text-xs mt-1">Assign SOPs from the SOP module</p>
      </div>
    )
  }

  const totalCompleted = sops.filter(s => s.status === 'completed').length
  const avgProgress = sops.length > 0
    ? Math.round(sops.reduce((sum, s) => sum + (s.progress || 0), 0) / sops.length)
    : 0

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold">{sops.length}</p>
          <p className="text-xs text-muted-foreground">Total SOPs</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-green-400">{totalCompleted}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-blue-400">{avgProgress}%</p>
          <p className="text-xs text-muted-foreground">Avg Progress</p>
        </div>
      </div>

      {/* SOP list */}
      <div className="space-y-3">
        {sops.map(sop => {
          const s = STATUS_CONFIG[sop.status] || STATUS_CONFIG.not_started
          const StatusIcon = s.icon
          const progress = sop.progress || 0
          return (
            <div key={sop._id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${s.bg}`}>
                  <StatusIcon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{sop.sop?.title || sop.title || 'SOP'}</p>
                    <span className={`text-xs font-medium shrink-0 ${s.color}`}>{progress}%</span>
                  </div>
                  {sop.sop?.sopType && (
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {sop.sop.sopType.replace(/_/g, ' ')}
                    </p>
                  )}
                  <div className="mt-2">
                    <ProgressBar value={progress} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded ${s.bg} ${s.color}`}>{s.label}</span>
                    {sop.startDate && <span>Started: {format(new Date(sop.startDate), 'MMM d, yyyy')}</span>}
                    {sop.completionDate && <span>Completed: {format(new Date(sop.completionDate), 'MMM d, yyyy')}</span>}
                    {sop.assignedTo?.name && <span>Assigned: {sop.assignedTo.name}</span>}
                  </div>
                  {/* Step progress */}
                  {sop.steps?.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {sop.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          {step.completed
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            : <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          }
                          <span className={step.completed ? 'line-through text-muted-foreground' : ''}>{step.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
