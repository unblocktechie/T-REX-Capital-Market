import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
}) {
  const id = useId();
  const rootRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;

    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);
    window.requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());

    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('.marketplace-dropdown__trigger')?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, selectedIndex]);

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

      {open && !disabled ? (
        <div
          id={`${id}-menu`}
          className="marketplace-dropdown__menu"
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleMenuKeyDown}
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
      ) : null}
    </div>
  );
}
