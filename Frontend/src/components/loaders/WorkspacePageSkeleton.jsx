import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';

/**
 * Lightweight route fallback used after the authenticated application shell is
 * already visible. It intentionally mirrors common workspace page geometry so
 * navigation feels continuous while a lazy route chunk is loading.
 *
 * Individual pages keep their own data-specific skeletons once mounted.
 */
export function WorkspacePageSkeleton({ className, variant = 'default' }) {
  const isCompact = variant === 'compact';

  return (
    <section
      className={cn('workspace-route-skeleton', isCompact && 'workspace-route-skeleton--compact', className)}
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      <div className="workspace-route-skeleton__header" aria-hidden="true">
        <div className="workspace-route-skeleton__heading">
          <Skeleton width="min(42%, 260px)" height={13} radius={999} />
          <Skeleton width="min(68%, 440px)" height={34} radius={12} />
          <Skeleton width="min(78%, 560px)" height={14} radius={999} />
        </div>
        <div className="workspace-route-skeleton__action">
          <Skeleton width="100%" height={40} radius={12} />
        </div>
      </div>

      {!isCompact ? (
        <div className="workspace-route-skeleton__metrics" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height={106} radius={18} />
          ))}
        </div>
      ) : null}

      <div className="workspace-route-skeleton__content" aria-hidden="true">
        <div className="workspace-route-skeleton__primary">
          <Skeleton height={isCompact ? 220 : 300} radius={20} />
          <Skeleton height={isCompact ? 150 : 188} radius={20} />
        </div>
        <div className="workspace-route-skeleton__secondary">
          <Skeleton height={isCompact ? 150 : 192} radius={20} />
          <Skeleton height={isCompact ? 150 : 192} radius={20} />
        </div>
      </div>
    </section>
  );
}

/**
 * Admin routes have a different shell, but use the same principle: preserve
 * navigation chrome and only skeletonize the content area during lazy loading.
 */
export function AdminPageSkeleton({ className }) {
  return (
    <section
      className={cn('admin-route-skeleton', className)}
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      <div className="admin-route-skeleton__header" aria-hidden="true">
        <div className="admin-route-skeleton__heading">
          <Skeleton width="min(56%, 320px)" height={30} radius={10} />
          <Skeleton width="min(76%, 520px)" height={13} radius={999} />
        </div>
        <Skeleton width={126} height={40} radius={12} />
      </div>
      <div className="admin-route-skeleton__grid" aria-hidden="true">
        <Skeleton height={154} radius={18} />
        <Skeleton height={154} radius={18} />
        <Skeleton height={154} radius={18} />
      </div>
      <Skeleton height={360} radius={20} />
    </section>
  );
}
