import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export function MarketplaceDropdown({
  value,
  options = [],
  onChange,
  icon: Icon,
  ariaLabel,
  prefix,
  align = 'start',
  className,
  placeholder = 'Select',
  disabled = false,
  portal = false,
  menuClassName,
}) {
  const id = useId();
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [portalStyle, setPortalStyle] = useState(null);
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const updatePortalPosition = useCallback(() => {
    if (!portal || !rootRef.current) return;

    const trigger = rootRef.current.querySelector('.marketplace-dropdown__trigger');
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const edge = 12;
    const gap = 6;
    const estimatedMenuHeight = Math.min(Math.max(options.length * 54 + 12, 120), 320);
    const spaceBelow = viewportHeight - rect.bottom - edge;
    const spaceAbove = rect.top - edge;
    const openUpward = spaceBelow < Math.min(estimatedMenuHeight, 240) && spaceAbove > spaceBelow;
    const availableHeight = Math.max(120, (openUpward ? spaceAbove : spaceBelow) - gap);
    const width = Math.min(rect.width, viewportWidth - edge * 2);
    const left = Math.min(Math.max(rect.left, edge), Math.max(edge, viewportWidth - width - edge));

    setPortalStyle({
      position: 'fixed',
      zIndex: 1200,
      left: `${left}px`,
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${Math.min(320, availableHeight)}px`,
      top: openUpward ? 'auto' : `${rect.bottom + gap}px`,
      bottom: openUpward ? `${viewportHeight - rect.top + gap}px` : 'auto',
    });
  }, [options.length, portal]);

  useEffect(() => {
    if (!open) return undefined;

    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);
    if (portal) updatePortalPosition();
    window.requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());

    const closeOutside = (event) => {
      const clickedTrigger = rootRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedMenu) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('.marketplace-dropdown__trigger')?.focus();
      }
    };
    const reposition = () => updatePortalPosition();

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    if (portal) {
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);
    }
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      if (portal) {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      }
    };
  }, [open, portal, selectedIndex, updatePortalPosition]);

  const choose = (nextValue) => {
    if (disabled) return;
    onChange?.(nextValue);
    setOpen(false);
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelector('.marketplace-dropdown__trigger')?.focus();
    });
  };

  const handleMenuKeyDown = (event) => {
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        const next = (current + direction + options.length) % options.length;
        window.requestAnimationFrame(() => optionRefs.current[next]?.focus());
        return next;
      });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : options.length - 1;
      setActiveIndex(next);
      window.requestAnimationFrame(() => optionRefs.current[next]?.focus());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(options[activeIndex]?.value);
    }
  };

  return (
    <div className={cn('marketplace-dropdown', `marketplace-dropdown--${align}`, className)} ref={rootRef}>
      <button
        type="button"
        className={cn('marketplace-dropdown__trigger', open && 'is-open')}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => { if (!disabled) setOpen((current) => !current); }}
        onKeyDown={(event) => {
          if (!disabled && !open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        {prefix ? <span className="marketplace-dropdown__prefix">{prefix}</span> : null}
        <span className={cn('marketplace-dropdown__value', !selected && 'is-placeholder')}>{selected?.label || placeholder}</span>
        <ChevronDown size={15} className="marketplace-dropdown__chevron" aria-hidden="true" />
      </button>

      {open && !disabled ? (() => {
        const menu = (
          <div
            ref={menuRef}
            id={`${id}-menu`}
            className={cn('marketplace-dropdown__menu', portal && 'marketplace-dropdown__menu--portal', menuClassName)}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={handleMenuKeyDown}
            style={portal ? portalStyle || { visibility: 'hidden' } : undefined}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  ref={(node) => { optionRefs.current[index] = node; }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'marketplace-dropdown__option',
                    isSelected && 'is-selected',
                    index === activeIndex && 'is-active',
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option.value)}
                >
                  <span className="marketplace-dropdown__option-copy">
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {isSelected ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        );

        return portal ? createPortal(menu, document.body) : menu;
      })() : null}
    </div>
  );
}
