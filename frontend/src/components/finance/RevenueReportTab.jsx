import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Number(n).toLocaleString('en-IN')}`
}

const STATUS_COLORS = {
  paid:     'bg-green-500/10 text-green-400',
  partial:  'bg-amber-500/10 text-amber-400',
  overdue:  'bg-red-500/10 text-red-400',
  sent:     'bg-blue-500/10 text-blue-400',
  draft:    'bg-muted text-muted-foreground',
}

export default function RevenueReportTab() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data, isLoading } = useQuery({
    queryKey: ['finance-revenue', year],
    queryFn: () => api.get('/finance/revenue', { params: { year } }).then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const monthly    = data?.monthly    || []
  const byStatusArr = data?.byStatus  || []
  const byClient   = data?.byClient   || []
  const yearlyArr  = data?.yearly     || []

  // Build byStatus as object for easy rendering
  const byStatus = byStatusArr.reduce((acc, s) => { acc[s._id] = { total: s.total, count: s.count }; return acc }, {})
  // Build yearly summary for current year
  const yearly = yearlyArr.find(y => y._id?.year === year) || {}

  const maxMonthly = Math.max(...monthly.map(m => m.invoiced || 0), 1)

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Year:</label>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          {[currentYear, currentYear - 1, currentYear - 2].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Annual summary */}
      {yearly && Object.keys(yearly).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">Annual Revenue</p>
            <p className="text-xl font-bold text-green-400 mt-1">{fmt(yearly.invoiced)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-xl font-bold text-blue-400 mt-1">{fmt(yearly.collected)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-xl font-bold text-amber-400 mt-1">{fmt((yearly.invoiced || 0) - (yearly.collected || 0))}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">Collection Rate</p>
            <p className="text-xl font-bold mt-1">
              {yearly.invoiced > 0 ? `${Math.round((yearly.collected / yearly.invoiced) * 100)}%` : '—'}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly bar chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-4">Monthly Revenue — {year}</h3>
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="space-y-2">
                {monthly.map((m, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-8 shrink-0">{m.month}</span>
                    <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden relative">
                      {/* invoiced bar */}
                      <div className="h-full bg-primary/30 rounded absolute left-0"
                        style={{ width: `${((m.invoiced || 0) / maxMonthly) * 100}%` }} />
                      {/* collected bar */}
                      <div className="h-full bg-green-500/60 rounded absolute left-0"
                        style={{ width: `${((m.collected || 0) / maxMonthly) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium w-14 text-right">{fmt(m.invoiced)}</span>
                  </div>
                ))}
                <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-primary/30 inline-block" /> Invoiced</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-500/60 inline-block" /> Collected</span>
                </div>
              </div>
            )}
          </div>

          {/* By status */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-4">Revenue by Invoice Status</h3>
            {Object.keys(byStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(byStatus).map(([status, v]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${STATUS_COLORS[status] || 'bg-muted text-muted-foreground'}`}>
                        {status}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{fmt(v.total)}</span>
                      <span className="text-muted-foreground text-xs ml-2">({v.count} inv.)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top clients */}
      {byClient.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">Top Clients by Revenue</h3>
          <div className="space-y-2">
            {byClient.slice(0, 10).map((c, i) => {
              const maxRev = byClient[0]?.invoiced || 1
              const pct = ((c.invoiced / maxRev) * 100).toFixed(0)
              return (
                <div key={c._id || i} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}</span>
                  <span className="w-36 truncate font-medium">{c.clientName || c._id || '—'}</span>
                  <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                    <div className="h-full bg-primary/50 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold w-16 text-right">{fmt(c.invoiced)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{c.count} inv.</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
