import { motion } from 'framer-motion'
import { Wrench, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Maintenance() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-6">
          <Wrench className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Under Maintenance</h1>
        <p className="text-muted-foreground mb-8">
          We're performing scheduled maintenance. We'll be back shortly.
          Thank you for your patience.
        </p>
        <Button onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="w-4 h-4" />Refresh
        </Button>
      </motion.div>
    </div>
  )
}
