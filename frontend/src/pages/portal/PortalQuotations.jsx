import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, CheckCircle2, XCircle, MessageSquare } from 'lucide-react'
import portalApi from '@/services/portalApi'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import toast from 'react-hot-toast'

function fmt(n) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0) }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  changes_requested: 'bg-amber-100 text-amber-700',
}

export default function PortalQuotations() {
  const qc = useQueryClient()
  const [actionModal, setActionModal] = useState(null) // { quotation, action }
  const [reason, setReason] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['portal-quotations'],
    queryFn: () => portalApi.get('/quotations').then(r => r.data.data),
  })

  const { mutate: doAction, isPending } = useMutation({
    mutationFn: ({ id, action, reason }) =>
      portalApi.put(`/quotations/${id}/action`, { action, reason }).then(r => r.data),
    onSuccess: () => {
      toast.success('Response submitted')
      qc.invalidateQueries({ queryKey: ['portal-quotations'] })
      setActionModal(null)
      setReason('')
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const canAct = (q) => q.status === 'sent' || q.status === 'viewed'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Quotations</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Review and respond to your quotations</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : !data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
            <p>No quotations yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.map(q => (
            <Card key={q._id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{q.quoteNumber || `QT-${q._id.slice(-6).toUpperCase()}`}</CardTitle>
                    <CardDescription className="mt-0.5">{fmtDate(q.createdAt)} · Valid until {fmtDate(q.validUntil)}</CardDescription>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600'}`}>
                    {q.status?.replace('_', ' ')}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Value</p>
                    <p className="text-xl font-bold">{fmt(q.total || q.amount)}</p>
                  </div>
                  {canAct(q) && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5 text-amber-600 border-amber-200"
                        onClick={() => { setActionModal({ quotation: q, action: 'changes_requested' }); setReason('') }}>
                        <MessageSquare className="w-3.5 h-3.5" />
                        Request Changes
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30"
                        onClick={() => { setActionModal({ quotation: q, action: 'rejected' }); setReason('') }}>
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </Button>
                      <Button size="sm" className="gap-1.5"
                        onClick={() => { setActionModal({ quotation: q, action: 'approved' }); setReason('') }}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
                {q.clientNote && (
                  <div className="mt-3 p-2.5 bg-muted rounded-lg text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Your note: </span>{q.clientNote}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionModal} onOpenChange={open => !open && setActionModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {actionModal?.action === 'approved' ? 'Approve Quotation' :
               actionModal?.action === 'rejected' ? 'Reject Quotation' : 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              {actionModal?.quotation?.quoteNumber} · {fmt(actionModal?.quotation?.total)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={actionModal?.action === 'approved' ? 'Optional note (e.g. proceed as discussed)...' : 'Please explain the reason or changes needed...'}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionModal(null)}>Cancel</Button>
            <Button
              variant={actionModal?.action === 'rejected' ? 'destructive' : 'default'}
              disabled={isPending}
              onClick={() => doAction({ id: actionModal.quotation._id, action: actionModal.action, reason })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
