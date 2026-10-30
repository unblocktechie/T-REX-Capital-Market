import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

const VIEWPORT_MARGIN = 12;
const TOOLTIP_GAP = 8;

/**
 * Lightweight accessible tooltip rendered in a portal so table/card overflow
 * cannot clip it. Event listeners only exist while the tooltip is visible.
 */
export function ResponsiveTooltip({ content = '', children, className, ariaLabel }) {
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const enabled = Boolean(content);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current || typeof window === 'undefined') return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const maximumLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
    const centeredLeft = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maximumLeft);

    let top = triggerRect.bottom + TOOLTIP_GAP;
    if (top + tooltipRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
    }
    const maximumTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN);
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), maximumTop);

    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open || !enabled) return;
    updatePosition();
  }, [enabled, open, updatePosition]);

  useEffect(() => {
    if (!open || !enabled) return undefined;

    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [enabled, open, updatePosition]);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setPosition(null);
    }
  }, [enabled]);

  const showTooltip = () => {
    setPosition(null);
    setOpen(true);
  };

  const hideTooltip = () => setOpen(false);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('responsive-tooltip-trigger', className)}
        tabIndex={enabled ? 0 : undefined}
        aria-label={enabled ? (ariaLabel || content) : undefined}
        aria-describedby={enabled && open ? tooltipId : undefined}
        onMouseEnter={enabled ? showTooltip : undefined}
        onMouseLeave={enabled ? hideTooltip : undefined}
        onFocus={enabled ? showTooltip : undefined}
        onBlur={enabled ? hideTooltip : undefined}
      >
        {children}
      </span>

      {enabled && open && typeof document !== 'undefined'
        ? createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className="responsive-value-tooltip"
            style={{
              left: position?.left ?? VIEWPORT_MARGIN,
              top: position?.top ?? VIEWPORT_MARGIN,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {content}
          </span>,
          document.body,
        )
        : null}
    </>
  );
}

export default ResponsiveTooltip;
