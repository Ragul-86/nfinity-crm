import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  PieChart as PieIcon, RefreshCcw, TrendingUp, Users, Building2,
  DollarSign, Activity, BarChart2, FileText, Calendar, ChevronDown,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { PlatformPageHeader, PlatformStatCard } from '@/components/platform/PlatformPageHeader'

const PIE_COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444']

// ── Date range presets ────────────────────────────────────────────────────────
const today = () => format(new Date(), 'yyyy-MM-dd')
const yesterday = () => format(subDays(new Date(), 1), 'yyyy-MM-dd')
const daysAgo = (n) => format(subDays(new Date(), n), 'yyyy-MM-dd')

const PRESETS = [
  { label: 'Today',       value: 'today',      getRange: () => ({ start: today(),        end: today() }) },
  { label: 'Yesterday',   value: 'yesterday',  getRange: () => ({ start: yesterday(),    end: yesterday() }) },
  { label: 'Last 7 Days', value: '7d',         getRange: () => ({ start: daysAgo(6),     end: today() }) },
  { label: 'Last 30 Days',value: '30d',        getRange: () => ({ start: daysAgo(29),    end: today() }) },
  { label: 'This Month',  value: 'this_month', getRange: () => ({ start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: today() }) },
  { label: 'Last Month',  value: 'last_month', getRange: () => {
    const lm = subMonths(new Date(), 1)
    return { start: format(startOfMonth(lm), 'yyyy-MM-dd'), end: format(endOfMonth(lm), 'yyyy-MM-dd') }
  }},
  { label: 'Last 90 Days',value: '90d',        getRange: () => ({ start: daysAgo(89),    end: today() }) },
  { label: 'Custom Range',value: 'custom',     getRange: null },
]

export default function PlatformAnalytics() {
  const [preset, setPreset] = useState('30d')
  const [customRange, setCustomRange] = useState({ start: daysAgo(29), end: today() })
  const [showCustom, setShowCustom] = useState(false)

  const getDateRange = useCallback(() => {
    if (preset === 'custom') return customRange
    return PRESETS.find(p => p.value === preset)?.getRange() || { start: daysAgo(29), end: today() }
  }, [preset, customRange])

  const range = getDateRange()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-analytics', preset, range.start, range.end],
    queryFn: () => api.get(`/platform/analytics?start=${range.start}&end=${range.end}`).then(r => r.data),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const stats = data?.stats || {}
  const revenueChart    = data?.revenueChart    || []
  const workspaceGrowth = data?.workspaceGrowth || []
  const planDistribution = data?.planDistribution || []
  const userGrowth      = data?.userGrowth      || []

  const handlePresetChange = (p) => {
    setPreset(p)
    if (p === 'custom') setShowCustom(true)
    else setShowCustom(false)
  }

  const selectedLabel = PRESETS.find(p => p.value === preset)?.label || 'Custom'

  return (
    <div>
      <PlatformPageHeader
        title="Platform Analytics"
        subtitle={`Business intelligence · ${selectedLabel} (${range.start} → ${range.end})`}
        icon={PieIcon}
        breadcrumbs={[{ label: 'Platform Analytics' }]}
        actions={
          <div className="flex items-center gap-2">
            {/* Preset picker */}
            <div className="relative">
              <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg">
                {PRESETS.filter(p => p.value !== 'custom').map(p => (
                  <button
                    key={p.value}
                    onClick={() => handlePresetChange(p.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                      preset === p.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >{p.label}</button>
                ))}
                <button
                  onClick={() => handlePresetChange('custom')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    preset === 'custom' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Calendar className="w-3 h-3" />Custom
                </button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* Custom date range picker */}
      {showCustom && (
        <div className="mb-5 flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input type="date" className="mt-0.5 block px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={customRange.start}
                max={customRange.end}
                onChange={e => setCustomRange(r => ({ ...r, start: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input type="date" className="mt-0.5 block px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={customRange.end}
                min={customRange.start}
                max={today()}
                onChange={e => setCustomRange(r => ({ ...r, end: e.target.value }))} />
            </div>
            <div className="self-end">
              <Button size="sm" onClick={() => { refetch(); setShowCustom(false) }}>Apply</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground ml-auto hidden sm:block">
            {range.start} → {range.end}
          </p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <PlatformStatCard title="Total Revenue"         value={`₹${((stats.totalRevenue || 0)/1000).toFixed(1)}K`} icon={DollarSign}  color="bg-emerald-500" trend={stats.revenueTrend}   loading={isLoading} />
        <PlatformStatCard title="Active Workspaces"     value={stats.activeWorkspaces || 0}   icon={Building2}  color="bg-primary"     trend={stats.workspaceTrend} loading={isLoading} />
        <PlatformStatCard title="Total Users"           value={stats.totalUsers || 0}          icon={Users}      color="bg-blue-500"    trend={stats.userTrend}      loading={isLoading} />
        <PlatformStatCard title="Active Users"          value={stats.activeUsers || 0}         icon={Activity}   color="bg-violet-500"  loading={isLoading} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <PlatformStatCard title="Leads"      value={stats.totalLeads || 0}     icon={TrendingUp}  color="bg-pink-500"    loading={isLoading} />
        <PlatformStatCard title="Clients"    value={stats.totalClients || 0}   icon={Users}       color="bg-cyan-500"    loading={isLoading} />
        <PlatformStatCard title="Campaigns"  value={stats.activeCampaigns || 0}icon={BarChart2}   color="bg-amber-500"   loading={isLoading} />
        <PlatformStatCard title="Open Tasks" value={stats.openTasks || 0}      icon={FileText}    color="bg-indigo-500"  loading={isLoading} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">Revenue Trend</p>
          {isLoading ? <div className="h-48 bg-muted rounded animate-pulse" /> : revenueChart.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No revenue data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueChart}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revenueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">Plan Distribution</p>
          {isLoading ? <div className="h-48 bg-muted rounded animate-pulse" /> : planDistribution.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={planDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="count" nameKey="plan">
                    {planDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {planDistribution.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs capitalize flex-1">{item.plan}</span>
                    <span className="text-xs font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">Workspace Growth</p>
          {isLoading ? <div className="h-48 bg-muted rounded animate-pulse" /> : workspaceGrowth.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No workspace data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workspaceGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} name="New Workspaces" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="font-medium text-sm mb-4">User Growth</p>
          {isLoading ? <div className="h-48 bg-muted rounded animate-pulse" /> : userGrowth.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No user data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={userGrowth}>
                <defs>
                  <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="users" stroke="#10b981" fill="url(#userGrad)" strokeWidth={2} name="Users" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
