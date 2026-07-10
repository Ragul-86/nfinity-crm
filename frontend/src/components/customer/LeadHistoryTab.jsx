import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Clock, User, Phone, Mail, Building2, Tag, ArrowRight } from 'lucide-react'
import api from '@/services/api'

const STAGE_COLORS = {
  new_lead:        'bg-slate-500/10 text-slate-400',
  contacted:       'bg-blue-500/10 text-blue-400',
  discovery_call:  'bg-cyan-500/10 text-cyan-400',
  proposal_sent:   'bg-amber-500/10 text-amber-400',
  negotiation:     'bg-orange-500/10 text-orange-400',
  won:             'bg-green-500/10 text-green-400',
  lost:            'bg-red-500/10 text-red-400',
  converted:       'bg-purple-500/10 text-purple-400',
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  )
}

export default function LeadHistoryTab({ clientId }) {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['customer-lead-history', clientId],
    queryFn: () => api.get(`/customers/${clientId}/lead-history`).then(r => r.data.data),
  })

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  if (!leads.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No lead history found</p>
        <p className="text-xs mt-1">Lead records associated with this client will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{leads.length} original lead record{leads.length !== 1 ? 's' : ''} found</p>
      {leads.map(lead => {
        const stageColor = STAGE_COLORS[lead.status] || STAGE_COLORS.new_lead
        return (
          <div key={lead._id} className="bg-card border border-border rounded-xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{lead.name}</h3>
                <p className="text-sm text-muted-foreground">{lead.company}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${stageColor}`}>
                  {lead.status?.replace('_', ' ')}
                </span>
                {lead.createdAt && (
                  <p className="text-xs text-muted-foreground">{format(new Date(lead.createdAt), 'MMM d, yyyy')}</p>
                )}
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoRow icon={Phone} label="Phone" value={lead.phone} />
              <InfoRow icon={Mail} label="Email" value={lead.email} />
              <InfoRow icon={Building2} label="Source" value={lead.source?.replace(/_/g, ' ')} />
              <InfoRow icon={User} label="Assigned To" value={lead.assignedTo?.name} />
              <InfoRow icon={Tag} label="Priority" value={lead.priority} />
              {lead.value > 0 && (
                <InfoRow icon={ArrowRight} label="Lead Value"
                  value={`₹${Number(lead.value).toLocaleString()}`} />
              )}
            </div>

            {/* Pipeline stage */}
            {lead.pipelineStage && lead.pipelineStage !== lead.status && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Pipeline:</span>
                <span className={`px-2 py-0.5 rounded font-medium capitalize ${STAGE_COLORS[lead.pipelineStage] || ''}`}>
                  {lead.pipelineStage.replace('_', ' ')}
                </span>
              </div>
            )}

            {/* Lost reason */}
            {lead.lostReason && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs text-red-400 font-medium mb-0.5">Lost Reason</p>
                <p className="text-sm">{lead.lostReason}</p>
                {lead.lostNote && <p className="text-xs text-muted-foreground mt-1">{lead.lostNote}</p>}
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Tags */}
            {lead.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map(t => (
                  <span key={t} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}

            {/* Dates */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1 border-t border-border">
              <span>Created: {format(new Date(lead.createdAt), 'MMM d, yyyy')}</span>
              {lead.closedAt && <span>Closed: {format(new Date(lead.closedAt), 'MMM d, yyyy')}</span>}
              {lead.convertedAt && <span>Converted: {format(new Date(lead.convertedAt), 'MMM d, yyyy')}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
