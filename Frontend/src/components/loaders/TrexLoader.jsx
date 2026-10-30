import { useState } from 'react';
import { TrexMark } from '@/components/branding/TrexLogo';
import { cn } from '@/utils/cn';

const ORBIT_OUTER_DURATION_MS = 7000;
const ORBIT_INNER_DURATION_MS = 4600;
const PROGRESS_DURATION_MS = 2800;

function getAnimationPhaseStyle() {
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

  return {
    '--trex-orbit-outer-delay': `-${(now % ORBIT_OUTER_DURATION_MS) / 1000}s`,
    '--trex-orbit-inner-delay': `-${(now % ORBIT_INNER_DURATION_MS) / 1000}s`,
    '--trex-progress-delay': `-${(now % PROGRESS_DURATION_MS) / 1000}s`,
  };
}

export function TrexMiniLoader({ className, label = 'Loading', ...props }) {
  return (
    <span className={cn('trex-mini-loader', className)} role="status" aria-label={label} {...props}>
      <span className="trex-mini-loader__ring" aria-hidden="true" />
      <span className="trex-mini-loader__core" aria-hidden="true" />
    </span>
  );
}

/**
 * Minimal, indeterminate loader shared by route, verification and request flows.
 * Keep title/message for assistive technology; the visible treatment stays compact
 * with the animated T-REX mark, product identity and an indeterminate loading track.
 */
export function TrexLoader({
  className,
  title = 'Preparing your workspace',
  message = 'Connecting securely to T-REX Capital Market…',
  variant = 'page',
  compact = false,
}) {
  const [animationPhaseStyle] = useState(getAnimationPhaseStyle);

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
      <div className="trex-loader__body">
        <div className="trex-loader__visual" style={animationPhaseStyle} aria-hidden="true">
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
            <TrexMark size={44} />
          </span>
          <span className="trex-loader__pulse" />
        </div>
        <div className="trex-loader__brand" aria-hidden="true">
          <strong>T-REX</strong>
          <span>CAPITAL MARKET</span>
        </div>
        <div className="trex-loader__progress" role="progressbar" aria-label={title}>
          <span />
        </div>
      </div>
    </div>
  );
}
