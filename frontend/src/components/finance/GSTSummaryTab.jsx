import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

function fmtCur(n) {
  if (!n && n !== 0) return '₹0'
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function GSTSummaryTab() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data, isLoading } = useQuery({
    queryKey: ['finance-gst', year],
    queryFn: () => api.get('/finance/gst-summary', { params: { year } }).then(r => r.data.data),
    refetchInterval: 30_000,
  })

  const breakdown = data?.breakdown || []
  const totals    = data?.totals    || {}
  const nonGst    = data?.nonGst    || {}

  // Index breakdown by month
  const byMonth = {}
  breakdown.forEach(b => {
    const mo = b._id?.month
    if (!mo) return
    if (!byMonth[mo]) byMonth[mo] = { intra: {}, inter: {} }
    if (b._id?.gstType === 'intra_state') byMonth[mo].intra = b
    if (b._id?.gstType === 'inter_state') byMonth[mo].inter = b
  })

  const monthRows = MONTH_LABELS.map((label, i) => {
    const mo = i + 1
    const intra = byMonth[mo]?.intra || {}
    const inter = byMonth[mo]?.inter || {}
    return {
      label,
      taxableIntra: intra.totalTaxable || 0,
      cgst:         intra.cgst         || 0,
      sgst:         intra.sgst         || 0,
      taxableInter: inter.totalTaxable || 0,
      igst:         inter.igst         || 0,
      total:        (intra.cgst || 0) + (intra.sgst || 0) + (inter.igst || 0),
    }
  })

  const yearTotals = monthRows.reduce((acc, r) => ({
    taxableIntra: acc.taxableIntra + r.taxableIntra,
    cgst:         acc.cgst         + r.cgst,
    sgst:         acc.sgst         + r.sgst,
    taxableInter: acc.taxableInter + r.taxableInter,
    igst:         acc.igst         + r.igst,
    total:        acc.total        + r.total,
  }), { taxableIntra: 0, cgst: 0, sgst: 0, taxableInter: 0, igst: 0, total: 0 })

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Financial Year:</label>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          {[currentYear, currentYear - 1, currentYear - 2].map(y => (
            <option key={y} value={y}>FY {y}–{y + 1}</option>
          ))}
        </select>
      </div>

      {/* Total GST summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Total CGST</p>
          <p className="text-xl font-bold text-blue-400 mt-1">{fmtCur(totals.totalCGST || yearTotals.cgst)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Total SGST</p>
          <p className="text-xl font-bold text-purple-400 mt-1">{fmtCur(totals.totalSGST || yearTotals.sgst)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Total IGST</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{fmtCur(totals.totalIGST || yearTotals.igst)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Total GST Liability</p>
          <p className="text-xl font-bold text-green-400 mt-1">{fmtCur(totals.totalTax || yearTotals.total)}</p>
        </div>
      </div>

      {/* Month-wise table */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Month</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Intra-State Taxable</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-blue-400">CGST</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-purple-400">SGST</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Inter-State Taxable</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-amber-400">IGST</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-green-400">Total GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthRows.map(r => (
                <tr key={r.label} className={`hover:bg-muted/20 transition-colors ${r.total === 0 ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-2.5 font-medium">{r.label} {year}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtCur(r.taxableIntra)}</td>
                  <td className="px-3 py-2.5 text-right text-blue-400">{fmtCur(r.cgst)}</td>
                  <td className="px-3 py-2.5 text-right text-purple-400">{fmtCur(r.sgst)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtCur(r.taxableInter)}</td>
                  <td className="px-3 py-2.5 text-right text-amber-400">{fmtCur(r.igst)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-green-400">{fmtCur(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtCur(yearTotals.taxableIntra)}</td>
                <td className="px-3 py-2.5 text-right text-blue-400">{fmtCur(yearTotals.cgst)}</td>
                <td className="px-3 py-2.5 text-right text-purple-400">{fmtCur(yearTotals.sgst)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtCur(yearTotals.taxableInter)}</td>
                <td className="px-3 py-2.5 text-right text-amber-400">{fmtCur(yearTotals.igst)}</td>
                <td className="px-3 py-2.5 text-right text-green-400">{fmtCur(yearTotals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Non-GST summary */}
      {(nonGst?.count > 0 || nonGst?.total > 0) && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Non-GST Transactions</h3>
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">Transactions: <strong className="text-foreground">{nonGst.count}</strong></span>
            <span className="text-muted-foreground">Taxable Value: <strong className="text-foreground">{fmtCur(nonGst.total)}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}
