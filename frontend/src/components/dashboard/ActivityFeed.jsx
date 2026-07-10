/**
 * ActivityFeed — Enhanced live activity feed from ClientActivity
 */
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { Activity, UserPlus, Receipt, CheckSquare, FileText, Building2, BookOpen, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/services/api'

const TYPE_CONFIG = {
  invoice_created:    { icon: Receipt, color: 'text-green-500',  label: 'Invoice created' },
  invoice_paid:       { icon: Receipt, color: 'text-green-600',  label: 'Invoice paid' },
  quotation_created:  { icon: FileText,    color: 'text-blue-500',   label: 'Quotation sent' },
  quotation_approved: { icon: FileText,    color: 'text-green-500',  label: 'Quotation approved' },
  task_completed:     { icon: CheckSquare, color: 'text-emerald-500',label: 'Task completed' },
  lead_created:       { icon: UserPlus,    color: 'text-purple-500', label: 'Lead created' },
  lead_converted:     { icon: UserPlus,    color: 'text-green-500',  label: 'Lead converted' },
  client_created:     { icon: Building2,   color: 'text-blue-500',   label: 'Customer added' },
  sop_completed:      { icon: BookOpen,    color: 'text-amber-500',  label: 'SOP completed' },
  payment_received:   { icon: Receipt, color: 'text-green-500',  label: 'Payment received' },
  meeting_scheduled:  { icon: Activity,    color: 'text-cyan-500',   label: 'Meeting scheduled' },
  file_uploaded:      { icon: Activity,    color: 'text-slate-400',  label: 'File uploaded' },
}

export default function ActivityFeed({ maxItems = 12 }) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-activity', maxItems],
    queryFn: () => api.get(`/analytics/activity-feed?limit=${maxItems}`).then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const activities = data || []

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live Activity
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/notifications')}>
          All <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[340px]">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
        ) : (
          <div className="space-y-2.5">
            {activities.map((a, i) => {
              const cfg = TYPE_CONFIG[a.type] || { icon: Activity, color: 'text-muted-foreground', label: a.type }
              const Ic = cfg.icon
              return (
                <div key={a._id || i} className="flex gap-2.5 text-sm group cursor-pointer hover:bg-accent rounded-lg px-1 py-0.5 transition-colors"
                  onClick={() => a.client && navigate(`/clients/${a.client._id}`)}>
                  <div className={`w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 ${cfg.color}`}>
                    <Ic className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug">
                      <span className="font-medium">{a.performedBy?.name || 'System'}</span>
                      {' — '}
                      <span className="text-muted-foreground">{a.description || cfg.label}</span>
                      {a.client?.companyName && (
                        <span className="text-primary"> · {a.client.companyName}</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {a.createdAt ? formatDistanceToNow(new Date(a.createdAt), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
