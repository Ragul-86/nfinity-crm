import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users, ArrowRight, Trophy, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/services/api'

export default function TeamSnapshot() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-team-snapshot'],
    queryFn: () => api.get('/analytics/team-snapshot').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const d = data || {}

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />Team Snapshot
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/team')}>
          View <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Active Employees', value: d.activeEmployees ?? 0, color: 'text-blue-400' },
                { label: 'Pending Tasks',    value: d.pendingTasks    ?? 0, color: 'text-amber-400' },
                { label: 'Done Today',       value: d.completedTasksToday ?? 0, color: 'text-green-400' },
                { label: 'Follow-ups',       value: '—', color: 'text-muted-foreground' },
              ].map(r => (
                <div key={r.label} className="bg-muted/20 rounded-lg p-2 text-center">
                  <p className={`text-lg font-bold ${r.color}`}>{r.value}</p>
                  <p className="text-[9px] text-muted-foreground">{r.label}</p>
                </div>
              ))}
            </div>
            {d.topPerformer && (
              <div className="mt-2 p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                <div className="flex items-center gap-2 text-xs">
                  <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div>
                    <p className="font-medium">{d.topPerformer.name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.topPerformer.wonDeals} deals won this month</p>
                  </div>
                </div>
              </div>
            )}
            {d.mostActiveEmployee && (
              <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-2 text-xs">
                  <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <div>
                    <p className="font-medium">{d.mostActiveEmployee.name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.mostActiveEmployee.tasksCompleted} tasks completed</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
