import { Building2, Phone, Mail, Globe, MapPin, User, Calendar, IndianRupee, Briefcase, FileText, Heart, AlertTriangle, Zap } from 'lucide-react'
import { format } from 'date-fns'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function StatCard({ label, value, sub, color = '' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

const HEALTH_CONFIG = {
  healthy:   { label: 'Healthy',   color: 'text-green-400',  bg: 'bg-green-500/10', Icon: Heart },
  attention: { label: 'Attention', color: 'text-amber-400',  bg: 'bg-amber-500/10', Icon: AlertTriangle },
  critical:  { label: 'Critical',  color: 'text-red-400',    bg: 'bg-red-500/10',   Icon: Zap },
}

function fmt(n) {
  if (!n) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toLocaleString()}`
}

export default function OverviewTab({ client, stats, onEdit }) {
  if (!client) return null

  const h = HEALTH_CONFIG[client.healthStatus || 'healthy']
  const HealthIcon = h.Icon

  const addr = client.address
  const fullAddress = addr ? [addr.street, addr.city, addr.state, addr.country, addr.zip].filter(Boolean).join(', ') : ''

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Revenue"   value={fmt(stats?.totalRevenue)} color="text-green-400" />
        <StatCard label="Outstanding"     value={fmt(stats?.outstandingAmount)} color={(stats?.outstandingAmount || 0) > 0 ? 'text-amber-400' : ''} />
        <StatCard label="Open Tasks"      value={(stats?.tasks?.pending || 0) + (stats?.tasks?.in_progress || 0)} />
        <StatCard label="Invoices"        value={stats?.invoiceCount || 0} sub="total" />
        <StatCard label="SOP Completion"  value={`${Math.round(stats?.sop?.avgProgress || 0)}%`}
          sub={`${stats?.sop?.completed || 0}/${stats?.sop?.total || 0} completed`} />
      </div>

      {/* Health */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${h.bg}`}>
        <HealthIcon className={`w-5 h-5 ${h.color} shrink-0`} />
        <div>
          <p className={`text-sm font-semibold ${h.color}`}>Customer Health: {h.label}</p>
          <p className="text-xs text-muted-foreground">
            Health score: {stats?.healthScore || 0}/100 — based on outstanding payments, tasks, SOP progress, and activity
          </p>
        </div>
      </div>

      {/* Contact Details */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoRow label="Company"        value={client.companyName} />
          <InfoRow label="Brand Name"     value={client.brandName} />
          <InfoRow label="Contact Person" value={client.contactPerson} />
          <InfoRow label="Phone"          value={client.phone} />
          <InfoRow label="Email"          value={client.email} />
          <InfoRow label="Website"        value={client.website} />
          <InfoRow label="Industry"       value={client.industry} />
          <InfoRow label="Business Type"  value={client.businessType} />
          {fullAddress && <div className="sm:col-span-2"><InfoRow label="Address" value={fullAddress} /></div>}
        </div>
      </div>

      {/* Business Details */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Business & Billing</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoRow label="GST Number"    value={client.gstNumber} />
          <InfoRow label="PAN Number"    value={client.panNumber} />
          <InfoRow label="Package"       value={client.package} />
          <InfoRow label="Plan"          value={client.plan} />
          <InfoRow label="Monthly Retainer" value={client.monthlyRetainer > 0 ? fmt(client.monthlyRetainer) : undefined} />
          <InfoRow label="Assigned Manager" value={client.assignedManager?.name} />
          <InfoRow label="Customer Since"   value={client.startDate ? format(new Date(client.startDate), 'MMM d, yyyy') : client.createdAt ? format(new Date(client.createdAt), 'MMM d, yyyy') : undefined} />
          <InfoRow label="Renewal Date"     value={client.renewalDate ? format(new Date(client.renewalDate), 'MMM d, yyyy') : undefined} />
          <InfoRow label="Status"           value={client.status} />
        </div>
      </div>

      {/* Tags */}
      {client.tags?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {client.tags.map(t => (
              <span key={t} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Notes (legacy) */}
      {client.notes && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-2">Notes</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}
    </div>
  )
}
