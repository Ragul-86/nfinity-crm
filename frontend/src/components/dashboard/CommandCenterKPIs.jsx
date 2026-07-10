/**
 * CommandCenterKPIs — Executive KPI cards
 * Uses existing Card + KPI design. Only adds new cards above existing dashboard.
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users, UserPlus, IndianRupee, TrendingUp, AlertCircle, Receipt,
  FileText, Target, CheckSquare, CalendarClock, Building2, RefreshCcw,
  ArrowRight, TrendingDown,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function KPICard({ title, value, sub, icon: Icon, color, href, trend, loading }) {
  const navigate = useNavigate()
  const positive = trend >= 0

  return (
    <Card
      className={`${href ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all' : ''}`}
      onClick={() => href && navigate(href)}
    >
      <CardContent className="pt-4 pb-4">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium leading-tight">{title}</p>
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <p className="text-xl font-bold tracking-tight leading-none">{value}</p>
            {sub && (
              <div className={`flex items-center gap-0.5 mt-1 text-[10px] ${trend !== undefined ? (positive ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                {trend !== undefined && (positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />)}
                <span>{sub}</span>
              </div>
            )}
            {href && <ArrowRight className="w-3 h-3 text-muted-foreground/40 absolute bottom-3 right-3" />}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function CommandCenterKPIs() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-command-center'],
    queryFn: () => api.get('/analytics/command-center').then(r => r.data.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const d = data || {}

  const cards = [
    {
      title:  "Today's Leads",
      value:  d.todayLeads ?? 0,
      icon:   Users,
      color:  'bg-purple-500',
      href:   '/crm-leads',
      sub:    d.leadsMoM != null ? `${Math.abs(d.leadsMoM)}% vs last month` : undefined,
      trend:  d.leadsMoM,
    },
    {
      title: 'New Customers',
      value: d.newCustomers ?? 0,
      icon:  UserPlus,
      color: 'bg-blue-500',
      href:  '/clients',
      sub:   d.clientsMoM != null ? `${Math.abs(d.clientsMoM)}% vs last month` : undefined,
      trend: d.clientsMoM,
    },
    {
      title: "Today's Revenue",
      value: fmt(d.todayRevenue),
      icon:  IndianRupee,
      color: 'bg-green-500',
      href:  '/finance',
      sub:   'collected today',
    },
    {
      title: 'Monthly Revenue',
      value: fmt(d.monthRevenue),
      icon:  TrendingUp,
      color: 'bg-emerald-500',
      href:  '/finance',
      sub:   d.revenueMoM != null ? `${Math.abs(d.revenueMoM)}% vs last month` : undefined,
      trend: d.revenueMoM,
    },
    {
      title: 'Pending Collection',
      value: fmt(d.pendingCollection),
      icon:  AlertCircle,
      color: 'bg-amber-500',
      href:  '/finance',
      sub:   'outstanding',
    },
    {
      title: 'Overdue Invoices',
      value: d.overdueInvoices ?? 0,
      icon:  Receipt,
      color: (d.overdueInvoices || 0) > 0 ? 'bg-red-500' : 'bg-muted-foreground',
      href:  '/finance',
      sub:   'need attention',
    },
    {
      title: 'Invoices Today',
      value: d.invoicesToday ?? 0,
      icon:  Receipt,
      color: 'bg-cyan-500',
      href:  '/finance',
    },
    {
      title: 'Quotations Today',
      value: d.quotationsToday ?? 0,
      icon:  FileText,
      color: 'bg-sky-500',
      href:  '/finance',
    },
    {
      title: 'Lead Conversion',
      value: `${d.conversionRate ?? 0}%`,
      icon:  TrendingUp,
      color: 'bg-violet-500',
      href:  '/pipeline',
      sub:   'overall win rate',
    },
    {
      title: 'Pipeline Value',
      value: fmt(d.pipelineValue),
      icon:  Target,
      color: 'bg-indigo-500',
      href:  '/pipeline',
    },
    {
      title: 'Won Deals',
      value: d.wonDeals ?? 0,
      icon:  TrendingUp,
      color: 'bg-green-600',
      href:  '/pipeline',
    },
    {
      title: 'Tasks Due Today',
      value: d.tasksDueToday ?? 0,
      icon:  CheckSquare,
      color: (d.tasksDueToday || 0) > 0 ? 'bg-orange-500' : 'bg-slate-500',
      href:  '/tasks',
      sub:   'pending today',
    },
    {
      title: 'Follow-ups Due',
      value: d.followUpsDueToday ?? 0,
      icon:  CalendarClock,
      color: 'bg-pink-500',
      href:  '/crm-leads',
    },
    {
      title: 'Active Team',
      value: d.activeTeamMembers ?? 0,
      icon:  Users,
      color: 'bg-teal-500',
      href:  '/team',
    },
    {
      title: 'SOP Completed',
      value: d.sopCompleted ?? 0,
      icon:  CheckSquare,
      color: 'bg-lime-600',
      href:  '/sop',
    },
    {
      title: 'Renewals Due',
      value: d.upcomingRenewals ?? 0,
      icon:  Building2,
      color: (d.upcomingRenewals || 0) > 0 ? 'bg-amber-600' : 'bg-slate-500',
      href:  '/clients',
      sub:   'next 30 days',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      {cards.map((c, i) => (
        <KPICard key={i} {...c} loading={isLoading} />
      ))}
    </div>
  )
}
