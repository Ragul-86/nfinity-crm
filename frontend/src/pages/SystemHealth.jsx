import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity, Database, Server, Cpu, MemoryStick, Clock,
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Zap
} from 'lucide-react'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

function StatusIcon({ status }) {
  if (status === 'ok') return <CheckCircle2 className="w-5 h-5 text-green-500" />
  if (status === 'error') return <XCircle className="w-5 h-5 text-red-500" />
  return <AlertTriangle className="w-5 h-5 text-amber-500" />
}

function GaugeBar({ value, max = 100, color = 'bg-primary', showLabel = true }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const barColor = pct > 85 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : color
  return (
    <div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <p className="text-xs text-muted-foreground mt-1">{pct}% used</p>}
    </div>
  )
}

export default function SystemHealth() {
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get('/health/details').then(r => r.data),
    refetchInterval: 30000,
  })

  const h = data

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Real-time server and database metrics"
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Last updated {new Date(dataUpdatedAt).toLocaleTimeString()} · Response {h?.responseMs}ms
        </p>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Service Status Row */}
          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(h?.services || {}).map(([key, svc], i) => (
              <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${svc.status === 'ok' ? 'bg-green-100 dark:bg-green-900/20' : 'bg-red-100 dark:bg-red-900/20'}`}>
                      {key === 'database' ? <Database className="w-5 h-5 text-muted-foreground" /> : <Server className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium capitalize">{key === 'api' ? 'API Server' : 'Database'}</p>
                        <StatusIcon status={svc.status} />
                      </div>
                      {svc.state && <p className="text-xs text-muted-foreground capitalize">{svc.state}</p>}
                      {svc.latencyMs !== undefined && <p className="text-xs text-muted-foreground">Latency: {svc.latencyMs}ms</p>}
                      {svc.collections !== undefined && <p className="text-xs text-muted-foreground">{svc.collections} collections</p>}
                    </div>
                    <Badge variant={svc.status === 'ok' ? 'default' : 'destructive'} className="capitalize">{svc.status}</Badge>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Metrics Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Uptime */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />Uptime</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{h?.system?.uptimeHuman}</p>
                <p className="text-xs text-muted-foreground mt-1">Node {h?.system?.nodeVersion}</p>
                <p className="text-xs text-muted-foreground">{h?.system?.platform} · {h?.system?.hostname}</p>
              </CardContent>
            </Card>

            {/* Memory */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><MemoryStick className="w-4 h-4" />System Memory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{h?.system?.memory?.usedMB} MB used</span>
                  <span className="text-muted-foreground">of {h?.system?.memory?.totalMB} MB</span>
                </div>
                <GaugeBar value={h?.system?.memory?.usedPct || 0} />
                <p className="text-xs text-muted-foreground">{h?.system?.memory?.freeMB} MB free</p>
              </CardContent>
            </Card>

            {/* CPU */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Cpu className="w-4 h-4" />CPU</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground truncate">{h?.system?.cpu?.model}</p>
                <p className="text-sm font-medium">{h?.system?.cpu?.cores} cores</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Load avg 1m: {h?.system?.loadAvg?.['1m']}</p>
                  <p>Load avg 5m: {h?.system?.loadAvg?.['5m']}</p>
                  <p>Load avg 15m: {h?.system?.loadAvg?.['15m']}</p>
                </div>
              </CardContent>
            </Card>

            {/* Process Memory */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />Process Memory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  { label: 'Heap Used', value: h?.system?.process?.heapUsedMB },
                  { label: 'Heap Total', value: h?.system?.process?.heapTotalMB },
                  { label: 'RSS', value: h?.system?.process?.rssMB },
                  { label: 'External', value: h?.system?.process?.externalMB },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value} MB</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Response Time */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" />Response Time</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{h?.responseMs}<span className="text-base font-normal text-muted-foreground ml-1">ms</span></p>
                <p className="text-xs text-muted-foreground mt-1">Health endpoint latency</p>
                <div className="mt-3">
                  <GaugeBar value={Math.min(h?.responseMs || 0, 500)} max={500} color="bg-green-500" showLabel={false} />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(h?.responseMs || 0) < 100 ? 'Excellent' : (h?.responseMs || 0) < 300 ? 'Good' : 'Slow'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* DB Latency */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" />DB Latency</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{h?.services?.database?.latencyMs ?? '—'}<span className="text-base font-normal text-muted-foreground ml-1">ms</span></p>
                <p className="text-xs text-muted-foreground mt-1">MongoDB ping round-trip</p>
                <div className="mt-3">
                  <GaugeBar value={Math.min(h?.services?.database?.latencyMs || 0, 200)} max={200} color="bg-blue-500" showLabel={false} />
                  <p className="text-xs text-muted-foreground mt-1">
                    {(h?.services?.database?.latencyMs || 0) < 20 ? 'Excellent' : (h?.services?.database?.latencyMs || 0) < 100 ? 'Good' : 'Slow'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
