import { useQuery } from '@tanstack/react-query'
import { BookOpen, CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import portalApi from '@/services/portalApi'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

export default function PortalSOP() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['portal-sop'],
    queryFn: () => portalApi.get('/sop').then(r => r.data.data),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">SOPs</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Standard operating procedures assigned to your account</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : !data.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BookOpen className="w-10 h-10 mb-3 opacity-30" />
            <p>No SOPs assigned yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {data.map(item => {
            const pct = item.progress || 0
            const isComplete = pct >= 100 || item.status === 'completed'
            return (
              <Card key={item._id} className="hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{item.sop?.title || item.title || 'Untitled SOP'}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">{item.sop?.category || ''}</CardDescription>
                    </div>
                    {isComplete
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      : <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    }
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: isComplete ? 'rgb(34 197 94)' : 'hsl(var(--primary))' }}
                      />
                    </div>
                  </div>
                  {item.dueDate && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />Due {fmtDate(item.dueDate)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
