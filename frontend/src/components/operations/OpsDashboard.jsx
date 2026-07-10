import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckSquare, BookOpen, CalendarDays, AlertTriangle, TrendingUp, Users, Clock, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import api from '@/services/api'

const REFRESH_MS = 30_000

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', onClick }) {
  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${onClick ? '' : 'cursor-default'}`} onClick={onClick}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`rounded-xl p-2 ${color.replace('text-', 'bg-').replace('-400', '-500/10').replace('-500', '-500/10')}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className={`text-xs ${color}`}>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export default function OpsDashboard({ onTabChange }) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['ops-dashboard'],
    queryFn: () => api.get('/operations/dashboard').then(r => r.data.data),
    refetchInterval: REFRESH_MS,
  })

  const d = data || {}
  const tasks = d.tasks || {}
  const sop   = d.sop   || {}
  const mtg   = d.meetings || {}

  const KPIs = [
    { icon: BookOpen,     label: 'Pending SOPs',      value: sop.pending    ?? 0, color: 'text-amber-400', sub: `${sop.inProgress ?? 0} in progress` },
    { icon: CheckSquare,  label: 'Completed SOPs',    value: sop.completed  ?? 0, color: 'text-green-400' },
    { icon: AlertTriangle,label: 'Overdue Tasks',     value: tasks.overdue  ?? 0, color: 'text-red-400',   sub: tasks.overdue > 0 ? 'Needs attention' : 'All on track' },
    { icon: CheckSquare,  label: 'Pending Tasks',     value: tasks.pending  ?? 0, color: 'text-blue-400',  sub: `${tasks.inProgress ?? 0} in progress` },
    { icon: TrendingUp,   label: 'Completed Tasks',   value: tasks.completed ?? 0, color: 'text-green-400' },
    { icon: Zap,          label: 'Blocked Tasks',     value: tasks.blocked  ?? 0, color: 'text-orange-400' },
    { icon: CalendarDays, label: "Today's Meetings",  value: mtg.today      ?? 0, color: 'text-purple-400' },
    { icon: Clock,        label: 'Upcoming (7 days)', value: (d.tasksByPriority || []).reduce((s, p) => s + p.count, 0), color: 'text-cyan-400', sub: 'total tasks' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KPIs.map((k, i) => <StatCard key={i} {...k} />)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming Meetings */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-purple-400" />Upcoming Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : mtg.upcoming?.length > 0 ? (
              <div className="space-y-2">
                {mtg.upcoming.map(m => (
                  <div key={m._id} className="flex items-start justify-between text-xs">
                    <div>
                      <p className="font-medium">{m.title}</p>
                      <p className="text-muted-foreground">{m.client?.companyName || 'Internal'}</p>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap ml-2">
                      {format(new Date(m.date), 'MMM d, h:mm a')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No meetings this week</p>
            )}
          </CardContent>
        </Card>

        {/* Task Priority Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-blue-400" />Task Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : (
              <div className="space-y-2">
                {[
                  { id: 'urgent', label: 'Urgent', color: 'bg-red-500' },
                  { id: 'high',   label: 'High',   color: 'bg-orange-500' },
                  { id: 'medium', label: 'Medium', color: 'bg-amber-500' },
                  { id: 'low',    label: 'Low',    color: 'bg-green-500' },
                ].map(p => {
                  const count = (d.tasksByPriority || []).find(x => x._id === p.id)?.count || 0
                  const total = (d.tasksByPriority || []).reduce((s, x) => s + x.count, 0) || 1
                  const pct   = Math.round((count / total) * 100)
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{p.label}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full">
                        <div className={`h-1.5 rounded-full ${p.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Productivity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-green-400" />Team Productivity (this month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : (d.teamStats || []).length > 0 ? (
              <div className="space-y-1.5">
                {d.teamStats.map((u, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{(u.name || '?')[0]}</span>
                      <span className="text-muted-foreground truncate max-w-[100px]">{u.name || 'Unknown'}</span>
                    </div>
                    <span className="font-medium text-green-400">{u.completed} tasks</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No activity this month</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SOP Status Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />SOP Assignment Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'not_started',    label: 'Not Started',    color: 'bg-muted text-muted-foreground' },
              { id: 'in_progress',    label: 'In Progress',    color: 'bg-blue-500/10 text-blue-400' },
              { id: 'awaiting_review',label: 'Awaiting Review',color: 'bg-amber-500/10 text-amber-400' },
              { id: 'completed',      label: 'Completed',      color: 'bg-green-500/10 text-green-400' },
              { id: 'overdue',        label: 'Overdue',        color: 'bg-red-500/10 text-red-400' },
            ].map(s => {
              const count = (d.sopsByStatus || []).find(x => x._id === s.id)?.count || 0
              return (
                <div key={s.id} className={`px-3 py-2 rounded-xl text-xs font-medium ${s.color}`}>
                  {s.label}: <span className="font-bold">{count}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
