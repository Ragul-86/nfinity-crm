import { ChevronRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/**
 * @param {object} props
 * @param {string}   props.title
 * @param {string}   props.subtitle
 * @param {node}     props.icon
 * @param {Array}    props.breadcrumbs  — [{ label, href }]
 * @param {node}     props.actions      — buttons / menus on the right
 */
export function PlatformPageHeader({ title, subtitle, icon: Icon, breadcrumbs = [], actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="space-y-1">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Link to="/platform" className="hover:text-foreground transition-colors">
              <Home className="w-3 h-3" />
            </Link>
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                {b.href ? (
                  <Link to={b.href} className="hover:text-foreground transition-colors">{b.label}</Link>
                ) : (
                  <span className="text-foreground font-medium">{b.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        {/* Title */}
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-primary" />}
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

/**
 * KPI stat card
 * @param {string} props.title
 * @param {*}      props.value
 * @param {node}   props.icon
 * @param {string} props.color   — tailwind bg class e.g. 'bg-indigo-500'
 * @param {string} props.sub
 * @param {string} props.trend   — '+12%' or '-3%'
 * @param {boolean} props.loading
 */
export function PlatformStatCard({ title, value, icon: Icon, color = 'bg-primary', sub, trend, loading }) {
  const trendUp = trend?.startsWith('+')
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-7 w-16 bg-muted rounded" />
          <div className="h-3 w-20 bg-muted rounded" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground truncate pr-2">{title}</p>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              {Icon && <Icon className="w-4 h-4 text-white" />}
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums">
            {value !== undefined && value !== null ? value.toLocaleString?.() ?? value : '—'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
            {trend && (
              <span className={`text-xs font-medium ml-auto shrink-0 ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {trend}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Confirmation dialog used across all platform pages */
export function ConfirmDialog({ open, onClose, title, description, confirmLabel = 'Confirm', confirmVariant = 'destructive', onConfirm, loading }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4 z-10">
        <h3 className="font-semibold text-base">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Status badge */
export function StatusBadge({ status }) {
  const map = {
    active:    'bg-emerald-500/10 text-emerald-600 border-emerald-200',
    trial:     'bg-blue-500/10 text-blue-600 border-blue-200',
    suspended: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    deleted:   'bg-red-500/10 text-red-600 border-red-200',
    pending:   'bg-orange-500/10 text-orange-600 border-orange-200',
    inactive:  'bg-gray-500/10 text-gray-500 border-gray-200',
    open:      'bg-blue-500/10 text-blue-600 border-blue-200',
    closed:    'bg-gray-500/10 text-gray-500 border-gray-200',
    resolved:  'bg-emerald-500/10 text-emerald-600 border-emerald-200',
    revoked:   'bg-red-500/10 text-red-600 border-red-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${map[status] || 'bg-muted text-muted-foreground border-border'}`}>
      {status}
    </span>
  )
}

/** Plan badge */
export function PlanBadge({ plan }) {
  const map = {
    trial:        'bg-blue-500/10 text-blue-700 border-blue-200',
    starter:      'bg-violet-500/10 text-violet-700 border-violet-200',
    professional: 'bg-indigo-500/10 text-indigo-700 border-indigo-200',
    enterprise:   'bg-amber-500/10 text-amber-700 border-amber-200',
    custom:       'bg-pink-500/10 text-pink-700 border-pink-200',
  }
  const labels = { trial: 'Trial', starter: 'Starter', professional: 'Pro', enterprise: 'Enterprise', custom: 'Custom' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[plan] || 'bg-muted text-muted-foreground border-border'}`}>
      {labels[plan] || plan}
    </span>
  )
}
