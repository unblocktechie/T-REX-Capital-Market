import { cn } from '@/utils/cn';

export function Badge({ children, tone = 'neutral' }) {
  return <span className={cn('badge', `badge--${tone}`)}>{children}</span>;
}
