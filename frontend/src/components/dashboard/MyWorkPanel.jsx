import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CheckSquare, Phone, CalendarClock, BookOpen, Users, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import api from '@/services/api'

function Section({ title, icon: Icon, items, emptyText, renderItem }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5" />{title}
      </p>
      {items.length === 0
        ? <p className="text-xs text-muted-foreground pl-5">{emptyText}</p>
        : <div className="space-y-1.5 pl-1">{items.map(renderItem)}</div>
      }
    </div>
  )
}

export default function MyWorkPanel() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-my-work'],
    queryFn: () => api.get('/analytics/my-work').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const d = data || {}

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">My Work Today</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">My Work Today</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Tasks Due" icon={CheckSquare} items={d.myTasksToday || []} emptyText="No tasks due today ✓"
          renderItem={t => (
            <div key={t._id} className="flex items-center justify-between text-xs">
              <span className="truncate text-muted-foreground max-w-[160px]">{t.title}</span>
              <Badge variant={t.priority === 'high' ? 'destructive' : 'secondary'} className="text-[9px]">{t.priority}</Badge>
            </div>
          )}
        />

        <Section title="Follow-ups Due" icon={Phone} items={d.followUpsToday || []} emptyText="No follow-ups today"
          renderItem={f => (
            <div key={f._id} className="text-xs text-muted-foreground truncate">
              {f.lead?.name || f.client?.companyName || 'Follow-up'}
              {f.scheduledAt && ` · ${format(new Date(f.scheduledAt), 'h:mm a')}`}
            </div>
          )}
        />

        <Section title="Upcoming Meetings" icon={CalendarClock} items={d.upcomingMeetings || []} emptyText="No meetings scheduled"
          renderItem={m => (
            <div key={m._id} className="text-xs">
              <span className="font-medium">{m.title || 'Meeting'}</span>
              {m.client?.companyName && <span className="text-muted-foreground"> · {m.client.companyName}</span>}
              {m.date && <span className="text-muted-foreground"> · {format(new Date(m.date), 'MMM d, h:mm a')}</span>}
            </div>
          )}
        />

        <Section title="Pending SOPs" icon={BookOpen} items={d.pendingSOPs || []} emptyText="All SOPs up to date ✓"
          renderItem={s => (
            <div key={s._id} className="text-xs text-muted-foreground truncate">
              {s.sop?.title || 'SOP'} · <span className="capitalize">{s.status}</span>
            </div>
          )}
        />

        <Section title="Assigned Leads" icon={Users} items={d.assignedLeads || []} emptyText="No leads assigned"
          renderItem={l => (
            <div key={l._id} className="flex items-center justify-between text-xs">
              <span className="truncate text-muted-foreground max-w-[160px]">{l.name || l.email || 'Lead'}</span>
              <span className="text-muted-foreground capitalize">{l.status?.replace('_', ' ')}</span>
            </div>
          )}
        />
      </CardContent>
    </Card>
  )
}
