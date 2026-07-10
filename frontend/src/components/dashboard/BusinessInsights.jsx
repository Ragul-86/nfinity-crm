import { useQuery } from '@tanstack/react-query'
import { Lightbulb, Star, TrendingUp, Clock, DollarSign, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

export default function BusinessInsights() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-business-insights'],
    queryFn: () => api.get('/analytics/business-insights').then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const d = data || {}

  const insights = [
    d.bestLeadSource && {
      icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10',
      label: 'Best Lead Source',
      value: d.bestLeadSource.source || '—',
      sub: `${d.bestLeadSource.count} won deals`,
    },
    d.bestSalesPerson && {
      icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10',
      label: 'Top Sales Person',
      value: d.bestSalesPerson.name || '—',
      sub: `${d.bestSalesPerson.wonDeals} deals this year`,
    },
    d.bestRevenueMonth && {
      icon: DollarSign, color: 'text-blue-400', bg: 'bg-blue-500/10',
      label: 'Best Revenue Month',
      value: d.bestRevenueMonth.label || '—',
      sub: fmt(d.bestRevenueMonth.amount),
    },
    d.avgClosingDays != null && {
      icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/10',
      label: 'Avg Closing Time',
      value: `${d.avgClosingDays} days`,
      sub: 'lead to won',
    },
    d.highestRevCustomer && {
      icon: Star, color: 'text-cyan-400', bg: 'bg-cyan-500/10',
      label: 'Top Revenue Client',
      value: d.highestRevCustomer.name || '—',
      sub: fmt(d.highestRevCustomer.revenue),
    },
    d.mostActiveEmployee && {
      icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10',
      label: 'Most Active Employee',
      value: d.mostActiveEmployee.name || '—',
      sub: `${d.mostActiveEmployee.tasksCompleted} tasks done`,
    },
  ].filter(Boolean)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" />Business Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : insights.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No insights yet — add more data to your CRM</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {insights.map((ins, i) => {
              const Ic = ins.icon
              return (
                <div key={i} className={`rounded-xl p-3 ${ins.bg}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Ic className={`w-3.5 h-3.5 ${ins.color}`} />
                    <span className="text-[10px] text-muted-foreground">{ins.label}</span>
                  </div>
                  <p className="text-sm font-semibold truncate">{ins.value}</p>
                  <p className={`text-[10px] ${ins.color}`}>{ins.sub}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
