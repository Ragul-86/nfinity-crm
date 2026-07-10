import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { cn } from '@/utils/cn'
import toast from 'react-hot-toast'

const TYPE_COLORS = {
  task: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50',
  campaign: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50',
  sop_approval: 'bg-orange-100 text-orange-600 dark:bg-orange-950/50',
  lead: 'bg-green-100 text-green-600 dark:bg-green-950/50',
  client: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50',
  project: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-950/50',
}

export default function Notifications() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const markAllMutation = useMutation({
    mutationFn: () => api.put('/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
      queryClient.invalidateQueries(['notifications-count'])
      toast.success('All marked as read')
    },
  })

  const clearAllMutation = useMutation({
    mutationFn: () => api.delete('/notifications'),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
      queryClient.invalidateQueries(['notifications-count'])
      toast.success('All notifications cleared')
    },
  })

  const notifications = data?.data || []
  const unread = notifications.filter(n => !n.isRead)
  const read = notifications.filter(n => n.isRead)

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${data?.unreadCount ?? 0} unread`}
      />

      {/* Actions bar */}
      {notifications.length > 0 && (
        <div className="flex gap-2 mb-4">
          {unread.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
              <CheckCheck className="w-4 h-4 mr-2" /> Mark all read
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => clearAllMutation.mutate()} disabled={clearAllMutation.isPending} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4 mr-2" /> Clear all
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="text-center py-20">
          <Bell className="w-14 h-14 mx-auto mb-3 text-muted-foreground opacity-25" />
          <p className="font-semibold text-lg">All caught up!</p>
          <p className="text-sm text-muted-foreground">No notifications to display</p>
        </div>
      )}

      <div className="space-y-6">
        {unread.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Unread</p>
            <div className="space-y-2">
              <AnimatePresence>
                {unread.map((notif, i) => (
                  <NotifCard key={notif._id} notif={notif} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {read.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earlier</p>
            <div className="space-y-2">
              <AnimatePresence>
                {read.map((notif, i) => (
                  <NotifCard key={notif._id} notif={notif} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NotifCard({ notif, index }) {
  const queryClient = useQueryClient()

  const markReadMutation = useMutation({
    mutationFn: () => api.put(`/notifications/${notif._id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
      queryClient.invalidateQueries(['notifications-count'])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/notifications/${notif._id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications'])
      queryClient.invalidateQueries(['notifications-count'])
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card
        className={cn('transition-colors group', !notif.isRead && 'border-primary/30 bg-primary/5 cursor-pointer')}
        onClick={() => !notif.isRead && markReadMutation.mutate()}
      >
        <CardContent className="flex items-start gap-3 p-4">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', TYPE_COLORS[notif.type] || TYPE_COLORS.system)}>
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{notif.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!notif.isRead && <div className="w-2 h-2 rounded-full bg-primary" />}
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate() }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline" className="text-xs capitalize">{notif.type?.replace('_', ' ')}</Badge>
              <span className="text-xs text-muted-foreground">{format(new Date(notif.createdAt), 'MMM d, h:mm a')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
