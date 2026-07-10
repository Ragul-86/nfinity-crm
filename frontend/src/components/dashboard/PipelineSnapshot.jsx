import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight, Target } from 'lucide-react'
import api from '@/services/api'

const STAGE_CONFIG = {
  new_lead:       { label: 'New',         color: 'bg-indigo-500' },
  contacted:      { label: 'Contacted',   color: 'bg-blue-500' },
  discovery_call: { label: 'Discovery',   color: 'bg-cyan-500' },
  proposal_sent:  { label: 'Proposal',    color: 'bg-amber-500' },
  negotiation:    { label: 'Negotiation', color: 'bg-orange-500' },
  won:            { label: 'Won',         color: 'bg-green-500' },
  lost:           { label: 'Lost',        color: 'bg-red-500' },
}

function fmtVal(n) {
  if (!n) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n}`
}

export default function PipelineSnapshot() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-pipeline-snapshot'],
    queryFn: () => api.get('/analytics/pipeline-snapshot').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const stages = data?.stages || []
  const maxCount = Math.max(...stages.map(s => s.count), 1)

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />Pipeline Snapshot
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/pipeline')}>
          View <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {stages.map(s => {
              const cfg = STAGE_CONFIG[s.key] || { label: s.key, color: 'bg-muted-foreground' }
              const pct = Math.round((s.count / maxCount) * 100)
              return (
                <div
                  key={s.key}
                  className="cursor-pointer hover:bg-accent rounded-lg p-1.5 transition-colors"
                  onClick={() => navigate(`/pipeline?stage=${s.key}`)}
                >
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{cfg.label}</span>
                    <div className="flex gap-2 text-right">
                      <span className="font-medium">{s.count}</span>
                      {s.value > 0 && <span className="text-muted-foreground">{fmtVal(s.value)}</span>}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cfg.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <div className="pt-2 border-t border-border grid grid-cols-3 text-center gap-2">
              <div>
                <p className="text-sm font-bold text-green-500">{data?.wonPct ?? 0}%</p>
                <p className="text-[10px] text-muted-foreground">Win Rate</p>
              </div>
              <div>
                <p className="text-sm font-bold">{data?.avgClosingDays ?? 0}d</p>
                <p className="text-[10px] text-muted-foreground">Avg Close</p>
              </div>
              <div>
                <p className="text-sm font-bold text-primary">{fmtVal(data?.pipelineValue)}</p>
                <p className="text-[10px] text-muted-foreground">Pipeline</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
