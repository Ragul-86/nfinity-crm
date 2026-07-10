import { useState, lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear } from 'date-fns'
import {
  BarChart3, Download, RefreshCcw, TrendingUp, FileText, Users, Building2,
  CheckSquare, BookOpen, UserCheck, Receipt, IndianRupee, Search, Filter,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ─── Config ───────────────────────────────────────────────────────────────────
const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#84cc16','#ec4899','#6366f1']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const AUTO_REFRESH_MS = 30_000

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
  fontSize: '12px',
}

function fmtCur(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// ─── Date Presets ────────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'Today',         fn: () => ({ from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Yesterday',     fn: () => { const d = subDays(new Date(), 1); return { from: format(d,'yyyy-MM-dd'), to: format(d,'yyyy-MM-dd') } } },
  { label: 'Last 7 Days',   fn: () => ({ from: format(subDays(new Date(),6),'yyyy-MM-dd'), to: format(new Date(),'yyyy-MM-dd') }) },
  { label: 'Last 30 Days',  fn: () => ({ from: format(subDays(new Date(),29),'yyyy-MM-dd'), to: format(new Date(),'yyyy-MM-dd') }) },
  { label: 'This Month',    fn: () => ({ from: format(startOfMonth(new Date()),'yyyy-MM-dd'), to: format(endOfMonth(new Date()),'yyyy-MM-dd') }) },
  { label: 'Last Month',    fn: () => { const d = subDays(startOfMonth(new Date()),1); return { from: format(startOfMonth(d),'yyyy-MM-dd'), to: format(endOfMonth(d),'yyyy-MM-dd') } } },
  { label: 'This Quarter',  fn: () => ({ from: format(startOfQuarter(new Date()),'yyyy-MM-dd'), to: format(endOfQuarter(new Date()),'yyyy-MM-dd') }) },
  { label: 'This Year',     fn: () => ({ from: format(startOfYear(new Date()),'yyyy-MM-dd'), to: format(new Date(),'yyyy-MM-dd') }) },
]

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, setFilters, showEmployee = true, showStatus = true, statusOptions = [] }) {
  const [preset, setPreset] = useState('')

  const apply = (p) => {
    setPreset(p.label)
    const { from, to } = p.fn()
    setFilters(f => ({ ...f, dateFrom: from, dateTo: to }))
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map(p => (
          <button key={p.label}
            onClick={() => apply(p)}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${preset === p.label ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}
          >{p.label}</button>
        ))}
        <button onClick={() => { setPreset(''); setFilters(f => ({ ...f, dateFrom: '', dateTo: '' })) }}
          className="text-xs px-2.5 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground">
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input type="date" className="w-38" value={filters.dateFrom || ''} placeholder="From"
          onChange={e => { setPreset(''); setFilters(f => ({ ...f, dateFrom: e.target.value })) }} />
        <Input type="date" className="w-38" value={filters.dateTo || ''} placeholder="To"
          onChange={e => { setPreset(''); setFilters(f => ({ ...f, dateTo: e.target.value })) }} />
        {showStatus && statusOptions.length > 0 && (
          <select value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">All Status</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color = '' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Export Helpers ───────────────────────────────────────────────────────────
function downloadCSV(data, filename) {
  if (!data?.length) return
  const keys = Object.keys(data[0])
  const csv  = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function ExportBar({ data, filename, onPrint }) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCSV(data, filename)}>
        <Download className="w-3.5 h-3.5" />CSV
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
        <Receipt className="w-3.5 h-3.5" />Print
      </Button>
    </div>
  )
}

// ─── Revenue Report ───────────────────────────────────────────────────────────
function RevenueReport() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' })

  const { data, isLoading, isRefetching } = useQuery({
    queryKey: ['report-revenue', filters],
    queryFn: () => api.get('/analytics/revenue', { params: { dateFrom: filters.dateFrom, dateTo: filters.dateTo } }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const monthly = data?.monthly || []
  const quarterly = data?.quarterly || []
  const yearlyTotal = data?.yearlyTotal || 0
  const byClient = data?.byClient || []

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} showStatus={false} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Annual Revenue"    value={fmtCur(yearlyTotal)} color="text-green-500" />
        <StatCard label="Avg Monthly"       value={fmtCur(yearlyTotal / 12)} />
        <StatCard label="Best Quarter"      value={quarterly.reduce((b, q) => q.amount > b.amount ? q : b, quarterly[0] || {})?.quarter || '—'} />
        <StatCard label="Top Client"        value={byClient[0]?.name || '—'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Monthly Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthly}>
                <defs>
                  <linearGradient id="revGrd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtCur(v), 'Revenue']} />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="url(#revGrd)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Quarterly Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={quarterly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtCur(v), 'Revenue']} />
                <Bar dataKey="amount" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {byClient.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Revenue by Client</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byClient.slice(0,10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v)} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtCur(v), 'Revenue']} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <ExportBar data={monthly} filename="revenue-report" />
    </div>
  )
}

// ─── Invoice Report ───────────────────────────────────────────────────────────
function InvoiceReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' })
  const { data, isLoading } = useQuery({
    queryKey: ['report-invoices', filters],
    queryFn: () => api.get('/analytics/reports/invoices', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const s = data?.summary || {}
  const byStatus = data?.byStatus || []
  const monthly  = data?.monthly  || []
  const invoices = data?.invoices  || []

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters}
        statusOptions={['draft','sent','viewed','partial','paid','overdue','cancelled']} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Invoiced" value={fmtCur(s.total)}       color="text-foreground" />
        <StatCard label="Collected"      value={fmtCur(s.paid)}        color="text-green-500" />
        <StatCard label="Outstanding"    value={fmtCur(s.outstanding)} color="text-amber-500" />
        <StatCard label="Invoice Count"  value={s.count ?? 0} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Monthly Invoices</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtCur(v)]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="total" name="Invoiced" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="paid"  name="Collected" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Invoice Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byStatus} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <InvoiceTable invoices={invoices.slice(0,50)} />
      <ExportBar data={invoices} filename="invoice-report" />
    </div>
  )
}

function InvoiceTable({ invoices }) {
  if (!invoices.length) return null
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Invoice List (recent 50)</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="border-b border-border">
              {['Invoice #','Client','Amount','Paid','Outstanding','Status','Date'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map(inv => (
              <tr key={inv._id} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{inv.invoiceNumber}</td>
                <td className="px-3 py-2 text-muted-foreground">{inv.client?.companyName || '—'}</td>
                <td className="px-3 py-2">{fmtCur(inv.total)}</td>
                <td className="px-3 py-2 text-green-400">{fmtCur(inv.paidAmount)}</td>
                <td className="px-3 py-2 text-amber-400">{fmtCur(inv.outstanding)}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    inv.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                    inv.status === 'overdue' ? 'bg-red-500/10 text-red-400' :
                    'bg-muted text-muted-foreground'}`}>{inv.status}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{inv.createdAt ? format(new Date(inv.createdAt),'MMM d, yyyy') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ─── Payment Report ───────────────────────────────────────────────────────────
function PaymentReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', paymentMethod: '' })
  const { data } = useQuery({
    queryKey: ['report-payments', filters],
    queryFn: () => api.get('/analytics/reports/payments', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const s = data?.summary || {}
  const byMethod = data?.byMethod || []
  const monthly  = data?.monthly  || []
  const payments = data?.payments  || []

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} showStatus={false} />
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        <StatCard label="Total Collected" value={fmtCur(s.total)} color="text-green-500" />
        <StatCard label="Payment Count"   value={s.count ?? 0} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Monthly Collections</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtCur(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtCur(v), 'Collected']} />
                <Bar dataKey="total" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">By Payment Method</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byMethod} dataKey="total" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={v => [fmtCur(v)]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <ExportBar data={payments} filename="payment-report" />
    </div>
  )
}

// ─── Lead Report ──────────────────────────────────────────────────────────────
function LeadReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' })
  const { data } = useQuery({
    queryKey: ['report-leads', filters],
    queryFn: () => api.get('/analytics/reports/leads', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const byStatus   = data?.byStatus   || []
  const bySource   = data?.bySource   || []
  const monthly    = data?.monthly    || []
  const byEmployee = data?.byEmployee || []
  const total      = data?.total      || 0

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters}
        statusOptions={['new_lead','contacted','discovery_call','proposal_sent','negotiation','won','lost']} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Leads" value={total} />
        <StatCard label="Won"  value={byStatus.find(s => s._id==='won')?.count ?? 0} color="text-green-500" />
        <StatCard label="Lost" value={byStatus.find(s => s._id==='lost')?.count ?? 0} color="text-red-500" />
        <StatCard label="Active" value={byStatus.filter(s => !['won','lost'].includes(s._id)).reduce((a,s) => a+(s.count||0),0)} color="text-blue-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Leads by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Leads by Source</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={bySource} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id || 'None'} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {bySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {byEmployee.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Lead Owner Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byEmployee} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="count" name="Total" fill="#6366f1" radius={[0,4,4,0]} />
                <Bar dataKey="won"   name="Won"   fill="#10b981" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <ExportBar data={data?.leads || []} filename="lead-report" />
    </div>
  )
}

// ─── Customer Report ──────────────────────────────────────────────────────────
function CustomerReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' })
  const { data } = useQuery({
    queryKey: ['report-customers', filters],
    queryFn: () => api.get('/analytics/reports/customers', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const byStatus  = data?.byStatus  || []
  const monthly   = data?.monthly   || []
  const byPackage = data?.byPackage  || []
  const total     = data?.total     || 0

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} statusOptions={['active','inactive','paused']} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Customers" value={total} />
        <StatCard label="Active"   value={byStatus.find(s => s._id==='active')?.count ?? 0} color="text-green-500" />
        <StatCard label="Inactive" value={byStatus.find(s => s._id==='inactive')?.count ?? 0} color="text-muted-foreground" />
        <StatCard label="Paused"   value={byStatus.find(s => s._id==='paused')?.count ?? 0} color="text-amber-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">New Customers by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Customers by Package</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byPackage} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id||'None'} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byPackage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <ExportBar data={data?.clients || []} filename="customer-report" />
    </div>
  )
}

// ─── Task Report ──────────────────────────────────────────────────────────────
function TaskReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' })
  const { data } = useQuery({
    queryKey: ['report-tasks', filters],
    queryFn: () => api.get('/analytics/reports/tasks', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const byStatus   = data?.byStatus   || []
  const byPriority = data?.byPriority || []
  const byEmployee = data?.byEmployee || []
  const total      = data?.total      || 0
  const statusMap  = Object.fromEntries((byStatus || []).map(s => [s._id, s.count]))
  const prioMap    = Object.fromEntries((byPriority || []).map(s => [s._id, s.count]))

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} statusOptions={['pending','in_progress','completed']} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Tasks"    value={total} />
        <StatCard label="Completed"      value={statusMap['completed']   ?? 0} color="text-green-500" />
        <StatCard label="In Progress"    value={statusMap['in_progress'] ?? 0} color="text-blue-500" />
        <StatCard label="Pending"        value={statusMap['pending']     ?? 0} color="text-amber-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Tasks by Priority</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byPriority.filter(p => p._id)} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {byEmployee.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Employee Productivity</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byEmployee.map(e => ({ ...e, pending: (e.total||0) - (e.completed||0) }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="completed" name="Done"    fill="#10b981" radius={[0,4,4,0]} />
                  <Bar dataKey="pending"   name="Pending" fill="#f59e0b" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
      <ExportBar data={data?.tasks || []} filename="task-report" />
    </div>
  )
}

// ─── SOP Report ───────────────────────────────────────────────────────────────
function SOPReport() {
  const { data } = useQuery({
    queryKey: ['report-sop'],
    queryFn: () => api.get('/analytics/reports/sop').then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const byStatus  = data?.byStatus  || []
  const byType    = data?.byType    || []
  const avgDays   = data?.avgCompletionDays || 0
  const statusMap = Object.fromEntries((byStatus || []).map(s => [s._id, s.count]))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Completed"      value={statusMap['completed']   ?? 0} color="text-green-500" />
        <StatCard label="In Progress"    value={statusMap['in_progress'] ?? 0} color="text-blue-500" />
        <StatCard label="Pending"        value={statusMap['assigned']    ?? 0} color="text-amber-500" />
        <StatCard label="Avg Completion" value={`${avgDays}d`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">SOP Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byStatus.filter(s => s._id)} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {byType.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">SOPs by Department/Type</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="_id" type="category" tick={{ fontSize: 9 }} width={120} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
      <ExportBar data={data?.assignments || []} filename="sop-report" />
    </div>
  )
}

// ─── Sales Report ─────────────────────────────────────────────────────────────
function SalesReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' })
  const { data } = useQuery({
    queryKey: ['report-sales', filters],
    queryFn: () => api.get('/analytics/reports/sales', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const byEmployee = data?.byEmployee || []
  const bySource   = data?.bySource   || []
  const total      = data?.totalWon   || 0

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} showStatus={false} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Won Deals" value={total} color="text-green-500" />
        <StatCard label="Top Performer" value={byEmployee[0]?.name || '—'} />
        <StatCard label="Top Source" value={bySource[0]?._id || '—'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {byEmployee.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Sales by Team Member</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byEmployee} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="deals" name="Deals" fill="#10b981" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {bySource.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Won Deals by Source</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={bySource} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                    label={({ _id, percent }) => `${_id||'None'} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {bySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
      <ExportBar data={data?.wonLeads || []} filename="sales-report" />
    </div>
  )
}

// ─── Employee Report ──────────────────────────────────────────────────────────
function EmployeeReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' })
  const { data } = useQuery({
    queryKey: ['report-employees', filters],
    queryFn: () => api.get('/analytics/reports/employees', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const employees = data || []

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters} showStatus={false} />
      {employees.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Employee Performance</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-border">
                  {['Name','Role','Leads','Won','Conv %','Tasks','Done','Task %','Attendance','SOPs'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((e, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{e.role?.replace(/_/g,' ')}</td>
                    <td className="px-3 py-2">{e.leads}</td>
                    <td className="px-3 py-2 text-green-400">{e.wonLeads}</td>
                    <td className="px-3 py-2">{e.convRate}%</td>
                    <td className="px-3 py-2">{e.tasks}</td>
                    <td className="px-3 py-2 text-green-400">{e.completedTasks}</td>
                    <td className="px-3 py-2">{e.taskCompletion}%</td>
                    <td className="px-3 py-2">{e.attendance}d</td>
                    <td className="px-3 py-2">{e.sopDone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <ExportBar data={employees} filename="employee-report" />
    </div>
  )
}

// ─── Quotation Report ─────────────────────────────────────────────────────────
function QuotationReport() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' })
  const { data } = useQuery({
    queryKey: ['report-quotations', filters],
    queryFn: () => api.get('/analytics/reports/quotations', { params: filters }).then(r => r.data.data),
    refetchInterval: AUTO_REFRESH_MS,
  })

  const byStatus = data?.byStatus || []
  const monthly  = data?.monthly  || []
  const s        = data?.summary  || {}
  const total    = data?.total    || 0

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} setFilters={setFilters}
        statusOptions={['draft','sent','viewed','approved','rejected','converted','expired','cancelled']} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Quotations" value={total} />
        <StatCard label="Total Value"  value={fmtCur(s.total)} />
        <StatCard label="Converted"    value={byStatus.find(s => s._id==='converted')?.count ?? 0} color="text-green-500" />
        <StatCard label="Pending"      value={byStatus.find(s => s._id==='sent')?.count ?? 0} color="text-blue-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Quotations by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#06b6d4" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Quotation Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byStatus.filter(s => s._id)} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75}
                  label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <ExportBar data={data?.quotations || []} filename="quotation-report" />
    </div>
  )
}

// ─── Main Reports Page ────────────────────────────────────────────────────────
const REPORT_TABS = [
  { id: 'revenue',    label: 'Revenue',    icon: TrendingUp,   comp: RevenueReport },
  { id: 'invoices',   label: 'Invoices',   icon: Receipt,  comp: InvoiceReport },
  { id: 'payments',   label: 'Payments',   icon: IndianRupee,  comp: PaymentReport },
  { id: 'leads',      label: 'Leads',      icon: Users,        comp: LeadReport },
  { id: 'customers',  label: 'Customers',  icon: Building2,    comp: CustomerReport },
  { id: 'sales',      label: 'Sales',      icon: TrendingUp,   comp: SalesReport },
  { id: 'tasks',      label: 'Tasks',      icon: CheckSquare,  comp: TaskReport },
  { id: 'sop',        label: 'SOP',        icon: BookOpen,     comp: SOPReport },
  { id: 'employees',  label: 'Employees',  icon: UserCheck,    comp: EmployeeReport },
  { id: 'quotations', label: 'Quotations', icon: FileText,     comp: QuotationReport },
]

export default function Reports() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('revenue')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith('report-') || String(q.queryKey[0]).startsWith('analytics-') })
    setTimeout(() => setIsRefreshing(false), 800)
  }

  const Active = REPORT_TABS.find(t => t.id === activeTab)?.comp

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="Business intelligence across all modules"
        action={{ label: 'Export Report', icon: Download, onClick: () => {} }}
      />

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {REPORT_TABS.map(t => {
            const Ic = t.icon
            return (
              <button key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  activeTab === t.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                <Ic className="w-3 h-3" />
                {t.label}
              </button>
            )
          })}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {Active && <Active />}
    </div>
  )
}
