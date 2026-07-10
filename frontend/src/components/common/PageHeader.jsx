import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

export default function PageHeader({ title, description, action, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-start justify-between gap-3 mb-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-sm mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        {action && (
          <Button onClick={action.onClick} size="sm" className="gap-2">
            {action.icon && <action.icon className="w-4 h-4" />}
            {action.label}
          </Button>
        )}
      </div>
    </motion.div>
  )
}
