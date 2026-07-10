import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { IndianRupee, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function FinanceSnapshot() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-finance-snapshot'],
    queryFn: () => api.get('/analytics/finance-snapshot').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const d = data || {}

  const rows = [
    { label: "Today's Collection", value: fmt(d.todayCollection),   color: 'text-green-500' },
    { label: 'Monthly Collection',  value: fmt(d.monthlyCollection), color: 'text-green-400' },
    { label: 'Outstanding',         value: fmt(d.outstandingAmount), color: 'text-amber-400' },
    { label: 'Overdue',             value: fmt(d.overdueAmount),     color: 'text-red-400' },
    { label: 'Paid Invoices',       value: d.paidInvoices ?? 0,     color: 'text-emerald-400' },
    { label: 'Pending Invoices',    value: d.pendingInvoices ?? 0,  color: 'text-orange-400' },
  ]

  const gst = d.gstMonth || {}

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-muted-foreground" />Finance Snapshot
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/finance')}>
          Open <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {rows.map(r => (
                <div key={r.label}
                  className="flex justify-between text-xs cursor-pointer hover:bg-accent rounded px-1 py-0.5 transition-colors"
                  onClick={() => navigate('/finance')}>
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={`font-semibold ${r.color}`}>{r.value}</span>
                </div>
              ))}
            </div>
            {(gst.total > 0) && (
              <div className="mt-3 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground mb-1.5">GST This Month</p>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-xs font-semibold text-blue-400">{fmt(gst.cgst)}</p>
                    <p className="text-[9px] text-muted-foreground">CGST</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-400">{fmt(gst.sgst)}</p>
                    <p className="text-[9px] text-muted-foreground">SGST</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-400">{fmt(gst.igst)}</p>
                    <p className="text-[9px] text-muted-foreground">IGST</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
