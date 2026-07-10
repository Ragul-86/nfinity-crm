import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  Globe, Building2, Users, Activity, TrendingUp, CreditCard,
  RefreshCcw, AlertCircle, CheckCircle2, PauseCircle, ShieldCheck,
  ArrowRight, DollarSign, Clock, Key, HardDrive, HelpCircle,
  BarChart3, UserCheck, Zap, Award,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PlatformStatCard } from '@/components/platform/PlatformPageHeader'

const AUTO_REFRESH = 30_000
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PLAN_COLORS  = { trial: '#60a5fa', starter: '#a78bfa', professional: '#6366f1', enterprise: '#f59e0b', custom: '#ec4899' }
const STATUS_COLOR = {
  active:    'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  trial:     'bg-blue-500/10 text-blue-600 border-blue-200',
  suspended: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  deleted:   'bg-red-500/10 text-red-600 border-red-200',
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }
function fmtCurrency(n) { return `₹${fmt(n)}` }

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6']

export default function PlatformDashboard() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['platform-stats-v2'],
    queryFn: () => api.get('/platform/stats').then(r => r.data),
    refetchInterval: AUTO_REFRESH,
  })

  const stats   = data?.stats   || {}
  const charts  = data?.charts  || {}
  const recent  = data?.recent  || {}

  const refresh = () => qc.invalidateQueries({ queryKey: ['platform-stats-v2'] })

  // Build revenue trend data
  const revTrend = (charts.revenueTrend || []).map(d => ({
    name: `${MONTH_LABELS[(d._id.month || 1) - 1]} ${d._id.year}`,
    revenue: d.amount || 0,
  }))

  // Build workspace growth
  const wsGrowth = (charts.workspaceGrowth || []).map(d => ({
    name: `${MONTH_LABELS[(d._id.month || 1) - 1]}`,
    count: d.count || 0,
  }))

  // Plan distribution
  const planData = (charts.planDist || []).map(d => ({
    name: d._id ? (d._id.charAt(0).toUpperCase() + d._id.slice(1)) : 'Unknown',
    value: d.count,
    color: PLAN_COLORS[d._id] || '#94a3b8',
  }))

  const KPI_CARDS = [
    { title: 'Total Workspaces',   value: stats.totalTenants,    icon: Globe,      color: 'bg-indigo-500',  sub: `${stats.activeTenants ?? 0} active` },
    { title: 'Active Workspaces',  value: stats.activeTenants,   icon: CheckCircle2,color: 'bg-emerald-500', sub: `${stats.newTenantsThisMonth ?? 0} this month` },
    { title: 'Trial Workspaces',   value: stats.trialTenants,    icon: Clock,       color: 'bg-blue-500' },
    { title: 'Suspended',          value: stats.suspendedTenants,icon: PauseCircle, color: 'bg-yellow-500' },
    { title: 'Total Users',        value: stats.totalUsers,       icon: Users,       color: 'bg-violet-500', sub: `${stats.newUsersThisMonth ?? 0} this month` },
    { title: 'Total Leads',        value: stats.totalLeads,       icon: Activity,    color: 'bg-cyan-500' },
    { title: 'Total Clients',      value: stats.totalClients,     icon: Building2,   color: 'bg-blue-500' },
    { title: 'Open Tasks',         value: stats.openTasks,        icon: AlertCircle, color: 'bg-orange-500' },
    { title: 'Monthly Revenue',    value: stats.monthRevenue !== undefined ? fmtCurrency(stats.monthRevenue) : undefined, icon: TrendingUp, color: 'bg-emerald-600' },
    { title: 'Annual Revenue',     value: stats.yearRevenue !== undefined ? fmtCurrency(stats.yearRevenue) : undefined,   icon: Award,      color: 'bg-amber-500' },
    { title: 'Pending Payments',   value: stats.pendingAmount !== undefined ? fmtCurrency(stats.pendingAmount) : undefined, icon: CreditCard, color: 'bg-red-500' },
    { title: 'Active Campaigns',   value: stats.activeCampaigns,  icon: Zap,         color: 'bg-pink-500' },
    { title: 'Active Integrations',value: stats.activeIntegrations ?? 0, icon: Key,    color: 'bg-teal-500' },
    { title: 'Storage Used',       value: `${fmt(stats.storageUsed ?? 0)} MB`, icon: HardDrive, color: 'bg-slate-500' },
    { title: 'Active API Keys',    value: stats.activeApiKeys ?? 0, icon: Key,        color: 'bg-violet-600' },
    { title: 'Open Tickets',       value: stats.openTickets ?? 0,   icon: HelpCircle, color: 'bg-rose-500' },
  ]

  const Loading = () => (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-24 bg-muted rounded" />
      <div className="h-7 w-16 bg-muted rounded" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Platform Overview</h1>
            <p className="text-xs text-muted-foreground">Enterprise SaaS Admin · Last updated {format(new Date(), 'HH:mm')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/platform/workspaces')}>
            <Building2 className="w-3.5 h-3.5 mr-1.5" />
            New Workspace
          </Button>
        </div>
      </div>

      {/* KPI Grid — 4 cols desktop, 2 cols tablet, 1 col mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {KPI_CARDS.map((card, i) => (
          <PlatformStatCard key={i} {...card} loading={isLoading} />
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Revenue Trend</p>
              <p className="text-xs text-muted-foreground">Last 6 months</p>
            </div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse bg-muted rounded-lg" />
          ) : revTrend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No revenue data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={revTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={v => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Subscription Distribution */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Plan Distribution</p>
              <p className="text-xs text-muted-foreground">By workspace plan</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse bg-muted rounded-lg" />
          ) : planData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={planData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {planData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {planData.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-medium">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Workspace Growth */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Workspace Growth</p>
              <p className="text-xs text-muted-foreground">New workspaces per month</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-40 animate-pulse bg-muted rounded-lg" />
          ) : wsGrowth.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No growth data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={wsGrowth} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent Payments */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Recent Payments</p>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/platform/billing')}>
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : (recent.recentPayments || []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No payments yet</div>
            ) : (
              (recent.recentPayments || []).slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{p.client?.companyName || 'Unknown Client'}</p>
                    <p className="text-[10px] text-muted-foreground">{p.paymentDate ? format(new Date(p.paymentDate), 'MMM d, yyyy') : '—'}</p>
                  </div>
                  <p className="text-xs font-semibold text-emerald-600 shrink-0 ml-2">₹{(p.amount || 0).toLocaleString('en-IN')}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Workspaces table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Recent Workspaces</p>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/platform/workspaces')}>
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Workspace','Owner','Plan','Status','Users','Created'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : (recent.recentTenants || []).length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No workspaces yet</td></tr>
              ) : (
                (recent.recentTenants || []).map((t, i) => (
                  <motion.tr
                    key={t._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => navigate('/platform/workspaces')}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                          {t.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate max-w-32">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{t.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{t.owner?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize text-muted-foreground">{t.plan || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${STATUS_COLOR[t.status] || 'bg-muted'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{t.userCount ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {t.createdAt ? format(new Date(t.createdAt), 'MMM d, yyyy') : '—'}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
