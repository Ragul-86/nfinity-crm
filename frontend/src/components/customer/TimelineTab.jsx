import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Activity, Phone, Mail, MessageCircle, CalendarDays, FileText,
  CheckSquare2, CreditCard, Receipt, User, Star, AlertCircle,
  Repeat, Clock, Plus, ChevronDown,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'

const TYPE_CONFIG = {
  client_created:          { icon: Star,          color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  lead_converted:          { icon: Repeat,         color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  meeting_scheduled:       { icon: CalendarDays,   color: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
  meeting_completed:       { icon: CalendarDays,   color: 'text-green-400',   bg: 'bg-green-500/10' },
  call_made:               { icon: Phone,          color: 'text-green-400',   bg: 'bg-green-500/10' },
  call_received:           { icon: Phone,          color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  email_sent:              { icon: Mail,           color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  email_received:          { icon: Mail,           color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  whatsapp_sent:           { icon: MessageCircle,  color: 'text-green-400',   bg: 'bg-green-500/10' },
  whatsapp_received:       { icon: MessageCircle,  color: 'text-green-400',   bg: 'bg-green-500/10' },
  invoice_created:         { icon: Receipt,    color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  invoice_paid:            { icon: CreditCard,     color: 'text-green-400',   bg: 'bg-green-500/10' },
  invoice_overdue:         { icon: AlertCircle,    color: 'text-red-400',     bg: 'bg-red-500/10' },
  quotation_created:       { icon: FileText,       color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  quotation_approved:      { icon: FileText,       color: 'text-green-400',   bg: 'bg-green-500/10' },
  task_created:            { icon: CheckSquare2,   color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  task_completed:          { icon: CheckSquare2,   color: 'text-green-400',   bg: 'bg-green-500/10' },
  task_overdue:            { icon: CheckSquare2,   color: 'text-red-400',     bg: 'bg-red-500/10' },
  note_added:              { icon: FileText,       color: 'text-muted-foreground', bg: 'bg-muted/30' },
  file_uploaded:           { icon: FileText,       color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  status_changed:          { icon: Activity,       color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  renewal_reminder:        { icon: Clock,          color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  sop_assigned:            { icon: CheckSquare2,   color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  sop_completed:           { icon: CheckSquare2,   color: 'text-green-400',   bg: 'bg-green-500/10' },
  payment_received:        { icon: CreditCard,     color: 'text-green-400',   bg: 'bg-green-500/10' },
  package_changed:         { icon: Repeat,         color: 'text-purple-400',  bg: 'bg-purple-500/10' },
}

const DEFAULT_TYPE = { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted/30' }

const PAGE_SIZE = 20

export default function TimelineTab({ clientId }) {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['customer-timeline', clientId, page],
    queryFn: () => api.get(`/customers/${clientId}/timeline?page=${page}&limit=${PAGE_SIZE}`).then(r => r.data.data),
    keepPreviousData: true,
  })

  const activities = data?.activities || []
  const hasMore = data?.hasMore

  function formatLabel(type) {
    return type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Activity'
  }

  if (isLoading && page === 1) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Loading timeline…</div>
  }

  if (!activities.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No activity recorded yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {activities.map((act, i) => {
        const cfg = TYPE_CONFIG[act.type] || DEFAULT_TYPE
        const Icon = cfg.icon
        return (
          <div key={act._id || i} className="flex gap-3 group">
            {/* Icon + line */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cfg.bg}`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              {i < activities.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>
            {/* Content */}
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium leading-snug">{formatLabel(act.type)}</p>
                  {act.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{act.description}</p>
                  )}
                  {act.performedBy?.name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by <span className="font-medium">{act.performedBy.name}</span>
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
                  {act.createdAt ? format(new Date(act.createdAt), 'MMM d, h:mm a') : ''}
                </p>
              </div>
            </div>
          </div>
        )
      })}
      {hasMore && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
            <ChevronDown className="w-3.5 h-3.5 mr-1.5" />Load More
          </Button>
        </div>
      )}
    </div>
  )
}
