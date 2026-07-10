import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Clock, Filter } from 'lucide-react'
import portalApi from '@/services/portalApi'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null }

const PRIORITY_COLORS = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' }
const STATUS_COLORS = { completed: 'bg-green-100 text-green-700', in_progress: 'bg-blue-100 text-blue-700', pending: 'bg-gray-100 text-gray-600', review: 'bg-purple-100 text-purple-700', blocked: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400' }

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
]

export default function PortalTasks() {
  const [filter, setFilter] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['portal-tasks', filter],
    queryFn: () => portalApi.get('/tasks', { params: { status: filter || undefined } }).then(r => r.data.data),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Track tasks assigned to your account</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === f.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !data.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CheckSquare className="w-10 h-10 mb-3 opacity-30" />
            <p>No tasks found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map(t => (
            <Card key={t._id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-2 h-10 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-green-500' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${t.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.assignedTo && <span className="text-xs text-muted-foreground">Assigned to {t.assignedTo.name}</span>}
                    {t.dueDate && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />{fmtDate(t.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {t.priority && <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[t.priority] || ''}`}>{t.priority}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[t.status] || ''}`}>{t.status?.replace('_', ' ')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
