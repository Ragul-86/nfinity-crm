import { format, formatDistanceToNow } from 'date-fns'
import { RefreshCw, Plug, PlugZap, TestTube2, Settings2, MoreHorizontal, Clock, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG } from '@/data/integrationConfig'
import { cn } from '@/utils/cn'

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected
  return <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
}

function SyncInfo({ integration }) {
  const lastSync = integration?.syncSettings?.lastSync
  const nextSync = integration?.syncSettings?.nextSync
  const autoSync = integration?.syncSettings?.autoSync

  if (!lastSync) {
    return <span className="text-xs text-muted-foreground">Never synced</span>
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">
        Last: {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
      </span>
      {autoSync && nextSync && (
        <span className="text-xs text-muted-foreground/70">
          Next: {format(new Date(nextSync), 'h:mm a')}
        </span>
      )}
    </div>
  )
}

export default function IntegrationCard({
  config,           // static config from integrationConfig.js
  integration,      // live data from API (or null if not connected)
  onConnect,        // () => void
  onDisconnect,     // () => void
  onTest,           // () => void
  onSync,           // () => void
  onSettings,       // () => void
  isSyncing,
  isTesting,
  readOnly,
}) {
  const status = integration?.status || 'disconnected'
  const isConnected = status === 'connected'
  const isFailed = status === 'failed' || status === 'expired' || status === 'sync_error'

  // Build display subtitle from config display fields
  let subtitle = null
  if (isConnected && integration?.config) {
    const firstDisplay = config.displayFields?.[0]
    if (firstDisplay && integration.config[firstDisplay]) {
      subtitle = integration.config[firstDisplay]
    }
  }

  return (
    <div
      className={cn(
        'bg-card border rounded-xl p-5 flex flex-col gap-4 transition-shadow hover:shadow-md',
        isConnected ? 'border-border' : 'border-dashed border-border/60',
        isFailed && 'border-destructive/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Integration icon */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: `${config.color}18`, border: `1px solid ${config.color}30` }}
          >
            {config.icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">{config.name}</p>
            {subtitle ? (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            ) : (
              <p className="text-xs text-muted-foreground truncate">{config.description.split('.')[0]}</p>
            )}
          </div>
        </div>

        {/* Three-dot menu (only when connected or for settings) */}
        {(isConnected || isFailed) && !readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onSettings && (
                <DropdownMenuItem onClick={onSettings}>
                  <Settings2 className="w-3.5 h-3.5 mr-2" />
                  Settings
                </DropdownMenuItem>
              )}
              {isConnected && config.supportsTestConnection !== false && (
                <DropdownMenuItem onClick={onTest} disabled={isTesting}>
                  <TestTube2 className="w-3.5 h-3.5 mr-2" />
                  {isTesting ? 'Testing…' : 'Test Connection'}
                </DropdownMenuItem>
              )}
              {isConnected && (
                <DropdownMenuItem onClick={onConnect}>
                  <ArrowRight className="w-3.5 h-3.5 mr-2" />
                  Edit Credentials
                </DropdownMenuItem>
              )}
              {(isFailed || status === 'expired') && (
                <DropdownMenuItem onClick={onConnect}>
                  <PlugZap className="w-3.5 h-3.5 mr-2" />
                  Reconnect
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDisconnect}
              >
                <Plug className="w-3.5 h-3.5 mr-2" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Status + Last Sync */}
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        {isConnected && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <SyncInfo integration={integration} />
          </div>
        )}
      </div>

      {/* Test result banner */}
      {integration?.lastTestResult && (
        <div className={cn(
          'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
          integration.lastTestResult === 'passed'
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        )}>
          <TestTube2 className="w-3 h-3 shrink-0" />
          {integration.lastTestResult === 'passed'
            ? 'Connection verified'
            : integration.lastTestError || 'Test failed'}
        </div>
      )}

      {/* Sync error banner */}
      {status === 'sync_error' && integration?.syncSettings?.lastSyncError && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          <RefreshCw className="w-3 h-3 shrink-0" />
          {integration.syncSettings.lastSyncError}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        {!isConnected && !isFailed ? (
          /* Not connected */
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={onConnect}
            disabled={readOnly}
          >
            <PlugZap className="w-3.5 h-3.5" />
            {config.authType === 'oauth' ? config.oauthLabel || 'Connect' : 'Connect'}
          </Button>
        ) : (
          /* Connected or failed */
          <>
            {isConnected && config.syncIntervalMinutes !== null && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={onSync}
                disabled={isSyncing || readOnly}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </Button>
            )}
            {isConnected && config.supportsTestConnection !== false && (
              <Button
                variant="outline"
                size="sm"
                className={cn(isConnected && config.syncIntervalMinutes !== null ? '' : 'flex-1')}
                onClick={onTest}
                disabled={isTesting || readOnly}
              >
                <TestTube2 className={cn('w-3.5 h-3.5', !isConnected && 'mr-1.5')} />
                {isTesting ? 'Testing…' : 'Test'}
              </Button>
            )}
            {(isFailed || status === 'expired') && !readOnly && (
              <Button size="sm" className="flex-1 gap-1.5" onClick={onConnect}>
                <PlugZap className="w-3.5 h-3.5" />
                Reconnect
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
