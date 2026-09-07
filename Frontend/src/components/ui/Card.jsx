import { cn } from '@/utils/cn';

export function Card({ children, className, ...props }) {
  return (
    <section className={cn('card', className)} {...props}>
      {children}
    </section>
  );
}
