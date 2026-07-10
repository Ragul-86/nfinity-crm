import { cn } from '@/utils/cn'

const Skeleton = ({ className, ...props }) => (
  <div className={cn('skeleton rounded-md bg-muted', className)} {...props} />
)

export { Skeleton }
