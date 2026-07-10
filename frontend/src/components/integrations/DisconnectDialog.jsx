import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export default function DisconnectDialog({ open, onClose, config }) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.delete(`/integrations/${config?.id}`).then(r => r.data),
    onSuccess: (data) => {
      toast.success(data.message || `${config?.name} disconnected`)
      qc.invalidateQueries(['integrations'])
      onClose()
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Disconnect failed'),
  })

  if (!config) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby="disconnect-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Unplug className="w-4 h-4" />
            Disconnect {config.name}
          </DialogTitle>
        </DialogHeader>
        <p id="disconnect-desc" className="text-sm text-muted-foreground">
          This will remove all stored credentials and tokens for{' '}
          <strong>{config.name}</strong>. Your data in the third-party service
          will not be affected. You can reconnect at any time.
        </p>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
