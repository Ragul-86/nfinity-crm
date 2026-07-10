import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, MapPin, Clock, Video } from 'lucide-react'
import portalApi from '@/services/portalApi'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const FILTERS = [
  { label: 'Upcoming', value: 'true' },
  { label: 'All Meetings', value: 'false' },
]

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rescheduled: 'bg-amber-100 text-amber-700',
}

export default function PortalMeetings() {
  const [upcoming, setUpcoming] = useState('true')

  const { data = [], isLoading } = useQuery({
    queryKey: ['portal-meetings', upcoming],
    queryFn: () => portalApi.get('/meetings', { params: { upcoming } }).then(r => r.data.data),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Meetings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your scheduled and past meetings</p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setUpcoming(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              upcoming === f.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !data.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CalendarDays className="w-10 h-10 mb-3 opacity-30" />
            <p>{upcoming === 'true' ? 'No upcoming meetings' : 'No meetings found'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map(m => {
            const start = new Date(m.date)
            const durationMins = m.duration || 0
            const end = durationMins ? new Date(start.getTime() + durationMins * 60000) : null
            return (
              <Card key={m._id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex gap-4">
                  {/* Date badge */}
                  <div className="w-12 shrink-0 text-center">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <p className="text-xs text-primary font-medium">{start.toLocaleString('en-IN', { month: 'short' })}</p>
                      <p className="text-xl font-bold text-primary leading-none">{start.getDate()}</p>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm line-clamp-1">{m.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-600'}`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {end && ` – ${end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                      {m.location && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />{m.location}
                        </span>
                      )}
                    </div>
                    {m.agenda && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.agenda}</p>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
