import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  DollarSign, FileText, CheckSquare, CalendarDays,
  TrendingUp, AlertCircle, Clock, ArrowRight
} from 'lucide-react'
import { Link } from 'react-router-dom'
import portalApi from '@/services/portalApi'
import { usePortal } from '@/contexts/PortalContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function fmt(n) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0) }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

const STATUS_COLORS = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  unpaid: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  todo: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default function PortalDashboard() {
  const { portalUser } = usePortal()
  const { data, isLoading } = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: () => portalApi.get('/dashboard').then(r => r.data.data),
    refetchInterval: 60000,
  })

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )

  const fin = data?.financial || {}

  const stats = [
    { label: 'Total Invoiced', value: fmt(fin.totalInvoiced), icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Total Paid',     value: fmt(fin.totalPaid),     icon: TrendingUp,  color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: 'Outstanding',    value: fmt(fin.totalOutstanding), icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Overdue Count',  value: fin.overdueCount || 0,  icon: Clock, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {portalUser?.name?.split(' ')[0]}!</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{data?.client?.company || data?.client?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Invoices */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Invoices</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs h-7">
              <Link to="/portal/invoices">View all <ArrowRight className="w-3 h-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data?.recentInvoices?.length ? (
              <div className="space-y-3">
                {data.recentInvoices.map(inv => (
                  <div key={inv._id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{inv.invoiceNumber || '—'}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(inv.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{fmt(inv.total)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[inv.status] || ''}`}>{inv.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-6">No invoices yet</p>}
          </CardContent>
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Upcoming Meetings</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs h-7">
              <Link to="/portal/meetings">View all <ArrowRight className="w-3 h-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data?.upcomingMeetings?.length ? (
              <div className="space-y-3">
                {data.upcomingMeetings.map(m => (
                  <div key={m._id} className="flex items-start gap-3 text-sm">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0 text-primary">
                      <span className="text-xs font-bold leading-none">{new Date(m.date).getDate()}</span>
                      <span className="text-[10px] leading-none">{new Date(m.date).toLocaleString('en-IN', { month: 'short' })}</span>
                    </div>
                    <div>
                      <p className="font-medium line-clamp-1">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {m.location && ` · ${m.location}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-6">No upcoming meetings</p>}
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Pending Tasks</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs h-7">
              <Link to="/portal/tasks">View all <ArrowRight className="w-3 h-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data?.pendingTasks?.length ? (
              <div className="space-y-2">
                {data.pendingTasks.map(t => (
                  <div key={t._id} className="flex items-center gap-3 text-sm">
                    <CheckSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-muted-foreground">Due {fmtDate(t.dueDate)}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${STATUS_COLORS[t.status] || ''}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-6">No pending tasks</p>}
          </CardContent>
        </Card>

        {/* SOP Progress */}
        {data?.sopAssignments?.length > 0 && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">SOP Progress</CardTitle>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-xs h-7">
                <Link to="/portal/sop">View all <ArrowRight className="w-3 h-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.sopAssignments.map(s => (
                  <div key={s._id}>
                    <div className="flex justify-between text-sm mb-1">
                      <p className="font-medium truncate">{s.title}</p>
                      <span className="text-muted-foreground">{s.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${s.progress || 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
