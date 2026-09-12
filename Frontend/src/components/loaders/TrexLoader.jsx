import { TrexLogo, TrexMark } from '@/components/branding/TrexLogo';
import { cn } from '@/utils/cn';

export function TrexMiniLoader({ className, label = 'Loading', ...props }) {
  return (
    <span className={cn('trex-mini-loader', className)} role="status" aria-label={label} {...props}>
      <span className="trex-mini-loader__ring" aria-hidden="true" />
      <span className="trex-mini-loader__core" aria-hidden="true" />
    </span>
  );
}

export function TrexLoader({
  className,
  title = 'Preparing your workspace',
  message = 'Connecting securely to T-REX Capital Market…',
  eyebrow = 'T-REX secure flow',
  variant = 'page',
  compact = false,
}) {
  return (
    <div
      className={cn(
        'trex-loader',
        `trex-loader--${variant}`,
        compact && 'trex-loader--compact',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`${title}. ${message}`}
    >
      <div className="trex-loader__card">
        <div className="trex-loader__visual" aria-hidden="true">
          <span className="trex-loader__ambient trex-loader__ambient--one" />
          <span className="trex-loader__ambient trex-loader__ambient--two" />
          <span className="trex-loader__orbit trex-loader__orbit--outer">
            <span className="trex-loader__node trex-loader__node--one" />
            <span className="trex-loader__node trex-loader__node--two" />
          </span>
          <span className="trex-loader__orbit trex-loader__orbit--inner">
            <span className="trex-loader__node trex-loader__node--three" />
          </span>
          <span className="trex-loader__scan" />
          <span className="trex-loader__core">
            <TrexMark size={34} />
          </span>
          <span className="trex-loader__pulse" />
        </div>

        <div className="trex-loader__content">
          <div className="trex-loader__brand" aria-hidden="true">
            <TrexLogo className="trex-loader__brand-logo" />
          </div>
          <span className="trex-loader__eyebrow">
            <span />
            {eyebrow}
          </span>
          <h2>{title}</h2>
          <p>{message}</p>
          <div className="trex-loader__progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
