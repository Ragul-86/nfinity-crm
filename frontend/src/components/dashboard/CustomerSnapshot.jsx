import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight } from 'lucide-react'
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

export default function CustomerSnapshot() {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-customer-snapshot'],
    queryFn: () => api.get('/analytics/customer-snapshot').then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const d = data || {}

  const rows = [
    { label: 'Total Clients',        value: d.totalClients  ?? 0, color: 'text-foreground' },
    { label: 'Active',               value: d.totalActive   ?? 0, color: 'text-green-400' },
    { label: 'Inactive',             value: d.totalInactive ?? 0, color: 'text-muted-foreground' },
    { label: 'New This Month',       value: d.newThisMonth  ?? 0, color: 'text-blue-400' },
    { label: 'Renewals Due (30d)',   value: d.renewalsDue   ?? 0, color: d.renewalsDue > 0 ? 'text-amber-400' : 'text-muted-foreground' },
    { label: 'Outstanding Clients',  value: d.outstandingClients ?? 0, color: d.outstandingClients > 0 ? 'text-red-400' : 'text-muted-foreground' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />Customer Snapshot
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/clients')}>
          View <ArrowRight className="w-3 h-3" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
        ) : (
          <>
            <div className="space-y-1.5">
              {rows.map(r => (
                <div key={r.label} className="flex justify-between text-xs cursor-pointer hover:bg-accent rounded px-1 py-0.5 transition-colors"
                  onClick={() => navigate('/clients')}>
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={`font-semibold ${r.color}`}>{r.value}</span>
                </div>
              ))}
            </div>
            {d.topRevClients?.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground mb-1.5">Top Revenue Clients</p>
                <div className="space-y-1">
                  {d.topRevClients.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate text-muted-foreground max-w-[100px]">{c.name}</span>
                      <span className="font-medium text-green-400">{fmt(c.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
