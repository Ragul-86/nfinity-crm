import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, FunnelChart, Funnel, LabelList
} from 'recharts'
import {
  Building2, Target, Megaphone, CheckSquare, TrendingUp,
  TrendingDown, IndianRupee, AlertCircle, Clock, BookOpen, Users, ArrowRight,
  Briefcase, Bell, CalendarClock, ClipboardList, CalendarCheck, RefreshCcw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/contexts/AuthContext'
import { format, formatDistanceToNow } from 'date-fns'
// ── Phase 9: Executive Command Center widgets ──────────────────────────────
import CommandCenterKPIs  from '@/components/dashboard/CommandCenterKPIs'
import QuickActions       from '@/components/dashboard/QuickActions'
import ActivityFeed       from '@/components/dashboard/ActivityFeed'
import PipelineSnapshot   from '@/components/dashboard/PipelineSnapshot'
import FinanceSnapshot    from '@/components/dashboard/FinanceSnapshot'
import TeamSnapshot       from '@/components/dashboard/TeamSnapshot'
import CustomerSnapshot   from '@/components/dashboard/CustomerSnapshot'
import BusinessInsights   from '@/components/dashboard/BusinessInsights'
import MyWorkPanel        from '@/components/dashboard/MyWorkPanel'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const PIPELINE_STAGES = [
  { key: 'new_lead', label: 'New Lead', color: '#6366f1' },
  { key: 'contacted', label: 'Contacted', color: '#3b82f6' },
  { key: 'discovery_call', label: 'Discovery', color: '#06b6d4' },
  { key: 'proposal_sent', label: 'Proposal', color: '#f59e0b' },
  { key: 'negotiation', label: 'Negotiation', color: '#f97316' },
  { key: 'won', label: 'Won', color: '#10b981' },
  { key: 'lost', label: 'Lost', color: '#ef4444' },
]

const STATUS_VARIANTS = {
  active: 'success', paused: 'warning', completed: 'info',
  draft: 'secondary', cancelled: 'destructive',
  new_lead: 'info', contacted: 'secondary', discovery_call: 'purple',
  proposal_sent: 'warning', negotiation: 'warning', won: 'success', lost: 'destructive',
}

function KPICard({ title, value, icon: Icon, color, change, prefix, suffix, loading }) {
  const isPositive = change >= 0
  return (
    <Card>
      <CardContent className="pt-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground font-medium">{title}</p>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
            </p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 mt-1.5 text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{Math.abs(change)}% vs last month</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }
const ADMIN_ROLES = ['super_admin', 'admin', 'manager']
const AUTO_REFRESH_MS = 30_000

export default function Dashboard() {
  const { user } = useAuth()
  return ADMIN_ROLES.includes(user?.role) ? <AdminDashboard /> : <EmployeeDashboard />
}

function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard/stats').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const { data: billingStats } = useQuery({
    queryKey: ['billing-stats'],
    queryFn: () => api.get('/billing/stats').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const { data: monthlyRevenue } = useQuery({
    queryKey: ['monthly-revenue'],
    queryFn: () => api.get('/billing/monthly').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const { data: pipelineSummary } = useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: () => api.get('/pipeline/summary').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const { data: pendingTasks } = useQuery({
    queryKey: ['tasks-pending'],
    queryFn: () => api.get('/tasks', { params: { status: 'pending', limit: 5 } }).then(r => r.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const { data: sopStats } = useQuery({
    queryKey: ['sop-stats'],
    queryFn: () => api.get('/sop/stats').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const { data: activeCampaigns } = useQuery({
    queryKey: ['campaigns-active'],
    queryFn: () => api.get('/campaigns', { params: { status: 'active', limit: 5 } }).then(r => r.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const { data: recentActivity } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: () => api.get('/notifications').then(r => r.data.data?.slice(0, 8)),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const handleRefresh = () => {
    queryClient.invalidateQueries({ predicate: () => true })
  }

  const kpis = data?.kpis || {}

  const revenueChartData = (monthlyRevenue || []).map(d => ({
    month: MONTHS[d.month - 1],
    revenue: d.total || 0,
    count: d.count || 0,
  }))

  const funnelData = PIPELINE_STAGES.filter(s => s.key !== 'lost').map(s => ({
    name: s.label,
    value: pipelineSummary?.[s.key] || 0,
    fill: s.color,
  }))

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Here's what's happening with your agency today.</p>
        </div>
        <Button
          variant="outline" size="sm" className="gap-1.5 shrink-0 mt-1"
          onClick={handleRefresh} disabled={isRefetching}
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          {isRefetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </motion.div>

      {/* ── Executive Command Center ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
        <CommandCenterKPIs />
      </motion.div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <QuickActions />
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-5 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <KPICard
          title="Total Clients"
          value={kpis.totalClients || 0}
          icon={Building2}
          color="bg-blue-500"
          change={kpis.clientGrowth}
          loading={isLoading}
        />
        <KPICard
          title="Pipeline Leads"
          value={pipelineSummary ? PIPELINE_STAGES.reduce((a, s) => a + (pipelineSummary[s.key] || 0), 0) : 0}
          icon={Target}
          color="bg-purple-500"
          loading={!pipelineSummary}
        />
        <KPICard
          title="Active Campaigns"
          value={kpis.activeCampaigns || 0}
          icon={Megaphone}
          color="bg-cyan-500"
          loading={isLoading}
        />
        <KPICard
          title="Monthly Revenue"
          value={billingStats?.totalRevenue || 0}
          icon={IndianRupee}
          color="bg-green-500"
          prefix="₹"
          loading={!billingStats}
        />
        <KPICard
          title="Outstanding"
          value={billingStats?.outstanding || 0}
          icon={AlertCircle}
          color="bg-orange-500"
          prefix="₹"
          loading={!billingStats}
        />
      </motion.div>

      {/* Row 2: Revenue Chart + Pipeline Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No billing data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                    tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`₹${v.toLocaleString()}`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Sales Pipeline</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/pipeline')}>
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {PIPELINE_STAGES.map(s => {
                const count = pipelineSummary?.[s.key] || 0
                const total = Math.max(1, PIPELINE_STAGES.reduce((a, st) => a + (pipelineSummary?.[st.key] || 0), 0))
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.round((count / total) * 100)}%`, backgroundColor: s.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
              <span className="text-muted-foreground">Pipeline Value</span>
              <span className="font-bold">₹{(pipelineSummary?.totalPipelineValue || 0).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Activity Feed + Pending Tasks + SOP Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live Team Activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              )}
              {(recentActivity || []).map((n, i) => (
                <div key={n._id || i} className="flex gap-2.5 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug line-clamp-2">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              ))}
              {!recentActivity && Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
              Pending Tasks
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/tasks')}>
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingTasks?.data?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">All caught up! ✓</p>
              )}
              {(pendingTasks?.data || []).map(task => (
                <div key={task._id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent transition-colors">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug truncate">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {format(new Date(task.dueDate), 'MMM d')}
                        </span>
                      )}
                      <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="text-[9px] px-1 py-0">
                        {task.priority}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
              {!pendingTasks && Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SOP Progress + Campaigns */}
        <div className="space-y-4">
          {/* SOP Progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                SOP Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sopStats ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Completion Rate</span>
                    <span className="font-bold text-green-500">{sopStats.completionRate || 0}%</span>
                  </div>
                  <Progress value={sopStats.completionRate || 0} className="h-2" />
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: 'Active', value: sopStats.active, color: 'text-blue-500' },
                      { label: 'Done', value: sopStats.completed, color: 'text-green-500' },
                      { label: 'Overdue', value: sopStats.overdue, color: 'text-red-500' },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className={`text-lg font-bold ${s.color}`}>{s.value || 0}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-2 w-full" />
                  <div className="grid grid-cols-3 gap-2">
                    {[0,1,2].map(i => <Skeleton key={i} className="h-8" />)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campaigns Requiring Attention */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-muted-foreground" />
                Active Campaigns
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/campaigns')}>
                View <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activeCampaigns?.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No active campaigns</p>
                )}
                {(activeCampaigns?.data || []).slice(0, 3).map(c => (
                  <div key={c._id} className="flex items-center justify-between py-1">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.client?.companyName || '—'}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs font-medium">₹{(c.spend || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">/ ₹{(c.budget || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {!activeCampaigns && <Skeleton className="h-12 w-full" />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Phase 9: Snapshot Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PipelineSnapshot />
        <FinanceSnapshot />
        <TeamSnapshot />
        <CustomerSnapshot />
      </div>

      {/* ── Phase 9: Activity Feed + Business Insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ActivityFeed maxItems={12} />
        <div className="lg:col-span-2"><BusinessInsights /></div>
      </div>
    </div>
  )
}

// ─── Employee Dashboard ────────────────────────────────────────────────────
// Widgets scoped to the logged-in employee: My Campaigns, Assigned Leads,
// My Tasks, SOP Assignments, Attendance Summary, Upcoming Deadlines,
// Notifications. No company-wide financials here — that's admin-only.
function EmployeeDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isRefetching } = useQuery({
    queryKey: ['employee-dashboard'],
    queryFn: () => api.get('/dashboard/employee-stats').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
  })

  const w = data?.widgets || {}
  const attendance = data?.attendanceSummary || {}
  const deadlines = data?.upcomingDeadlines || []
  const notifications = data?.recentNotifications || []

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Here's what's on your plate today.</p>
        </div>
        <Button
          variant="outline" size="sm" className="gap-1.5 shrink-0 mt-1"
          onClick={() => queryClient.invalidateQueries(['employee-dashboard'])}
          disabled={isRefetching}
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          {isRefetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <KPICard title="My Campaigns" value={w.myCampaigns || 0} icon={Briefcase} color="bg-cyan-500" loading={isLoading} />
        <KPICard title="Assigned Leads" value={w.assignedLeads || 0} icon={Users} color="bg-purple-500" loading={isLoading} />
        <KPICard title="My Tasks" value={w.myTasks || 0} icon={CheckSquare} color="bg-blue-500" loading={isLoading} />
        <KPICard title="SOP Assignments" value={w.sopAssignments || 0} icon={BookOpen} color="bg-green-500" loading={isLoading} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick links */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jump back in</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'My Campaigns', icon: Briefcase, href: '/my-campaigns', badge: w.myCampaigns },
                { label: 'My Tasks', icon: CheckSquare, href: '/tasks', badge: w.overdueTasks ? `${w.overdueTasks} overdue` : null },
                { label: 'SOPs', icon: BookOpen, href: '/sop', badge: w.sopAwaitingReview ? `${w.sopAwaitingReview} in review` : null },
                { label: 'Attendance', icon: CalendarCheck, href: '/attendance' },
              ].map(item => (
                <button
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  className="flex flex-col items-start gap-2 p-3 rounded-xl border border-border hover:bg-accent transition-colors text-left"
                >
                  <item.icon className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.badge ? <Badge variant="warning" className="text-[10px]">{item.badge}</Badge> : null}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Attendance Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" /> Attendance Summary
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/attendance')}>
              View <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-2 w-full" /></div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">This month</span>
                  <span className="font-bold text-green-500">{attendance.attendanceRate || 0}%</span>
                </div>
                <Progress value={attendance.attendanceRate || 0} className="h-2" />
                <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                  <div>
                    <p className="text-lg font-bold text-blue-500">{attendance.presentDaysThisMonth || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Present Days</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-500">{attendance.leaveDaysThisMonth || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Leave Days</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── My Work Panel (Phase 9) ── */}
      <MyWorkPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" /> Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {!isLoading && deadlines.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nothing due in the next 7 days ✓</p>
              )}
              {deadlines.map(task => (
                <div key={task._id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors">
                  <ClipboardList className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug truncate">{task.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {task.campaign?.name || task.project?.name || 'General'} · Due {task.dueDate ? format(new Date(task.dueDate), 'MMM d') : '—'}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" /> Notifications
              {w.unreadNotifications > 0 && <Badge variant="destructive" className="text-[9px] px-1.5">{w.unreadNotifications} new</Badge>}
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/notifications')}>
              View all <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {!isLoading && notifications.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No notifications</p>
              )}
              {notifications.map((n, i) => (
                <div key={n._id || i} className="flex gap-2.5 text-sm">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.isRead ? 'bg-muted-foreground/30' : 'bg-primary'}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug line-clamp-2">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1"><Skeleton className="h-3 w-full" /><Skeleton className="h-2 w-16" /></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
