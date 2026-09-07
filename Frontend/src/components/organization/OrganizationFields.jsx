import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const assignRef = (ref, value) => {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
};

const normalizeOptions = (options = []) =>
  options.map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : { label: option.label, value: option.value },
  );

export const SelectField = forwardRef(function SelectField(
  {
    label,
    error,
    hint,
    options,
    placeholder = 'Select an option',
    id,
    className,
    value,
    defaultValue,
    name,
    onChange,
    onBlur,
    disabled = false,
    searchable,
    required = false,
    ...props
  },
  forwardedRef,
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const listboxId = `${fieldId}-listbox`;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  const rootRef = useRef(null);
  const selectRef = useRef(null);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);
  const controlled = value !== undefined;
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const enableSearch = searchable ?? normalizedOptions.length > 8;
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedValue = controlled ? String(value ?? '') : String(internalValue ?? '');

  const filteredOptions = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      option.label.toLowerCase().includes(trimmedQuery),
    );
  }, [normalizedOptions, query]);

  const selectedOption = normalizedOptions.find(
    (option) => String(option.value) === selectedValue,
  );

  const setCombinedRef = (node) => {
    selectRef.current = node;
    assignRef(forwardedRef, node);
    if (!controlled && node) {
      window.requestAnimationFrame(() => setInternalValue(node.value || ''));
    }
  };

  useEffect(() => {
    if (controlled) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const nextValue = String(selectRef.current?.value || '');
      setInternalValue((current) => (current === nextValue ? current : nextValue));
    });
    return () => window.cancelAnimationFrame(frame);
  });

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
        onBlur?.({ target: selectRef.current, currentTarget: selectRef.current, type: 'blur' });
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
        rootRef.current?.querySelector('.org-select-trigger')?.focus();
      }
    };
    const closeOnResize = () => setOpen(false);

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', closeOnResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open, onBlur]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filteredOptions.findIndex(
      (option) => String(option.value) === selectedValue,
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    window.requestAnimationFrame(() => {
      if (enableSearch) searchRef.current?.focus();
      else optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
    });
  }, [enableSearch, filteredOptions, open, selectedValue]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openMenu = () => {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = Math.min(340, normalizedOptions.length * 43 + (enableSearch ? 66 : 18));
      const below = window.innerHeight - rect.bottom;
      setOpenAbove(below < estimatedHeight && rect.top > below);
    }
    setQuery('');
    setOpen(true);
  };

  const emitValue = (nextValue) => {
    const node = selectRef.current;
    if (node) node.value = String(nextValue);
    if (!controlled) setInternalValue(String(nextValue));
    onChange?.({ target: node, currentTarget: node, type: 'change' });
    setOpen(false);
    setQuery('');
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelector('.org-select-trigger')?.focus();
      onBlur?.({ target: node, currentTarget: node, type: 'blur' });
    });
  };

  const moveActive = (direction) => {
    if (!filteredOptions.length) return;
    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) return filteredOptions.length - 1;
      if (next >= filteredOptions.length) return 0;
      return next;
    });
  };

  const handleMenuKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
    } else if (event.key === 'Enter' && filteredOptions[activeIndex]) {
      event.preventDefault();
      emitValue(filteredOptions[activeIndex].value);
    }
  };

  return (
    <div className={cn('org-field', className)} ref={rootRef}>
      <label id={`${fieldId}-label`} htmlFor={`${fieldId}-trigger`}>
        {label}
        {required ? <span className="org-required-mark" aria-hidden="true">*</span> : null}
      </label>
      <select
        ref={setCombinedRef}
        id={fieldId}
        name={name}
        value={controlled ? selectedValue : undefined}
        defaultValue={!controlled ? defaultValue : undefined}
        onChange={(event) => {
          if (!controlled) setInternalValue(event.target.value);
          onChange?.(event);
        }}
        onBlur={onBlur}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="org-native-control"
        {...props}
        required={required}
      >
        <option value="">{placeholder}</option>
        {normalizedOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>

      <button
        id={`${fieldId}-trigger`}
        type="button"
        className={cn('org-select-trigger', error && 'is-error', open && 'is-open')}
        aria-labelledby={`${fieldId}-label`}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={Boolean(error)}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            if (!open) openMenu();
          }
        }}
      >
        <span className={cn('org-select-trigger__value', !selectedOption && 'is-placeholder')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className={cn('org-select-popover', openAbove && 'is-above')}
          onKeyDown={handleMenuKeyDown}
        >
          {enableSearch ? (
            <div className="org-select-search">
              <Search size={16} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={`Search ${label?.toLowerCase() || 'options'}`}
                aria-label={`Search ${label || 'options'}`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
              />
            </div>
          ) : null}
          <div className="org-select-options" id={listboxId} role="listbox" aria-labelledby={`${fieldId}-label`}>
            {!query ? (
              <button
                type="button"
                className={cn('org-select-option', selectedValue === '' && 'is-selected')}
                role="option"
                aria-selected={selectedValue === ''}
                onClick={() => emitValue('')}
              >
                <span className="is-placeholder">{placeholder}</span>
                {selectedValue === '' ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            ) : null}
            {filteredOptions.map((option, index) => {
              const selected = String(option.value) === selectedValue;
              return (
                <button
                  ref={(node) => { optionRefs.current[index] = node; }}
                  key={option.value}
                  type="button"
                  className={cn(
                    'org-select-option',
                    selected && 'is-selected',
                    index === activeIndex && 'is-active',
                  )}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => emitValue(option.value)}
                >
                  <span>{option.label}</span>
                  {selected ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              );
            })}
            {!filteredOptions.length ? (
              <div className="org-select-empty">No matching options found.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="org-field__error" id={`${fieldId}-error`} role="alert">{error}</p>
      ) : hint ? (
        <p className="org-field__hint" id={`${fieldId}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
});

const parseIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (value) => {
  const date = parseIsoDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2024, index, 1)),
);
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function CalendarSelect({ label, value, options, open, onOpenChange, onChange }) {
  const rootRef = useRef(null);
  const selectedOption = options.find(
    (option) => String(option.value) === String(value),
  );

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) onOpenChange(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onOpenChange, open]);

  return (
    <div className="org-calendar-select" ref={rootRef}>
      <button
        type="button"
        className={cn('org-calendar-select__trigger', open && 'is-open')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Choose ${label}`}
        onClick={() => onOpenChange(!open)}
      >
        <span>{selectedOption?.label || value}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="org-calendar-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={cn('org-calendar-select__option', selected && 'is-selected')}
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export const DateField = forwardRef(function DateField(
  {
    label,
    error,
    hint,
    id,
    className,
    value,
    defaultValue,
    name,
    onChange,
    onBlur,
    min,
    max,
    disabled = false,
    placeholder = 'Select date',
    required = false,
    ...props
  },
  forwardedRef,
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const selectedValue = controlled ? String(value ?? '') : String(internalValue ?? '');
  const selectedDate = parseIsoDate(selectedValue);
  const maxDate = parseIsoDate(max) || null;
  const minDate = parseIsoDate(min) || null;
  const initialView = selectedDate || maxDate || new Date();
  const [viewDate, setViewDate] = useState(new Date(initialView.getFullYear(), initialView.getMonth(), 1));
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const [selectorOpen, setSelectorOpen] = useState('');

  const updatePopoverPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const visualViewport = window.visualViewport;
    const viewportWidth =
      visualViewport?.width || document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = visualViewport?.height || window.innerHeight;
    const viewportLeft = visualViewport?.offsetLeft || 0;
    const viewportTop = visualViewport?.offsetTop || 0;
    const mobile = viewportWidth <= 720;
    const gutter = mobile ? 12 : 14;
    const gap = 8;
    const width = Math.min(
      mobile ? 360 : 336,
      Math.max(260, viewportWidth - gutter * 2),
    );
    const measuredHeight = popoverRef.current?.scrollHeight || 408;
    const calendarHeight = Math.min(measuredHeight, viewportHeight - gutter * 2);
    const minLeft = viewportLeft + gutter;
    const maxLeft = viewportLeft + viewportWidth - width - gutter;
    const left = mobile
      ? viewportLeft + Math.max(gutter, (viewportWidth - width) / 2)
      : Math.min(Math.max(rect.left, minLeft), Math.max(minLeft, maxLeft));
    const viewportBottom = viewportTop + viewportHeight;
    const availableBelow = viewportBottom - rect.bottom - gap - gutter;
    const availableAbove = rect.top - viewportTop - gap - gutter;

    let top;
    if (availableBelow >= calendarHeight) {
      top = rect.bottom + gap;
    } else if (availableAbove >= calendarHeight) {
      top = rect.top - gap - calendarHeight;
    } else {
      top = viewportTop + Math.max(gutter, (viewportHeight - calendarHeight) / 2);
    }

    const maxTop = viewportBottom - calendarHeight - gutter;
    top = Math.min(Math.max(top, viewportTop + gutter), Math.max(viewportTop + gutter, maxTop));

    setPopoverStyle({
      position: 'fixed',
      top,
      right: 'auto',
      bottom: 'auto',
      left,
      width,
      maxWidth: viewportWidth - gutter * 2,
      maxHeight: viewportHeight - gutter * 2,
      overflowX: 'hidden',
      overflowY: measuredHeight > viewportHeight - gutter * 2 ? 'auto' : 'visible',
      boxSizing: 'border-box',
    });
  }, []);

  const setCombinedRef = (node) => {
    inputRef.current = node;
    assignRef(forwardedRef, node);
    if (!controlled && node) {
      window.requestAnimationFrame(() => {
        setInternalValue(node.value || '');
        const date = parseIsoDate(node.value);
        if (date) setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
      });
    }
  };

  useEffect(() => {
    if (controlled) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const nextValue = String(inputRef.current?.value || '');
      setInternalValue((current) => (current === nextValue ? current : nextValue));
    });
    return () => window.cancelAnimationFrame(frame);
  });

  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;

    const handlePointerDown = (event) => {
      const insideField = rootRef.current?.contains(event.target);
      const insideCalendar = popoverRef.current?.contains(event.target);
      if (!insideField && !insideCalendar) {
        setOpen(false);
        setSelectorOpen('');
        onBlur?.({ target: inputRef.current, currentTarget: inputRef.current, type: 'blur' });
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setSelectorOpen('');
        triggerRef.current?.focus();
      }
    };
    const reposition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePopoverPosition);
    };

    updatePopoverPosition();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    };
  }, [open, onBlur, updatePopoverPosition]);

  useEffect(() => {
    const date = parseIsoDate(selectedValue);
    if (date) setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [selectedValue]);

  const minYear = minDate?.getFullYear() ?? 1900;
  const maxYear = maxDate?.getFullYear() ?? new Date().getFullYear() + 10;
  const years = useMemo(() => {
    const result = [];
    for (let year = maxYear; year >= minYear; year -= 1) result.push(year);
    return result;
  }, [maxYear, minYear]);

  const monthOptions = useMemo(
    () =>
      MONTHS.map((month, index) => {
        const monthStart = new Date(viewDate.getFullYear(), index, 1);
        const monthEnd = new Date(viewDate.getFullYear(), index + 1, 0);
        return {
          label: month,
          value: index,
          disabled: Boolean(
            (minDate && monthEnd < minDate) || (maxDate && monthStart > maxDate),
          ),
        };
      }),
    [maxDate, minDate, viewDate],
  );

  const yearOptions = useMemo(
    () => years.map((year) => ({ label: String(year), value: year })),
    [years],
  );

  const days = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const result = Array(firstWeekday).fill(null);
    for (let day = 1; day <= totalDays; day += 1) result.push(new Date(year, month, day));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [viewDate]);

  const isDisabledDate = (date) =>
    Boolean((minDate && date < minDate) || (maxDate && date > maxDate));

  const emitValue = (nextValue, close = true) => {
    const node = inputRef.current;
    if (node) node.value = nextValue;
    if (!controlled) setInternalValue(nextValue);
    onChange?.({ target: node, currentTarget: node, type: 'change' });
    if (close) {
      setOpen(false);
      setSelectorOpen('');
      window.requestAnimationFrame(() => {
        rootRef.current?.querySelector('.org-date-trigger')?.focus();
        onBlur?.({ target: node, currentTarget: node, type: 'blur' });
      });
    }
  };

  const openCalendar = () => {
    if (disabled) return;
    const base = selectedDate || maxDate || new Date();
    setViewDate(new Date(base.getFullYear(), base.getMonth(), 1));
    setSelectorOpen('');
    updatePopoverPosition();
    setOpen(true);
  };

  const changeMonth = (month) => {
    setViewDate(new Date(viewDate.getFullYear(), Number(month), 1));
  };

  const changeYear = (year) => {
    const nextYear = Number(year);
    let nextMonth = viewDate.getMonth();
    if (maxDate && nextYear === maxDate.getFullYear()) {
      nextMonth = Math.min(nextMonth, maxDate.getMonth());
    }
    if (minDate && nextYear === minDate.getFullYear()) {
      nextMonth = Math.max(nextMonth, minDate.getMonth());
    }
    setViewDate(new Date(nextYear, nextMonth, 1));
  };

  const previousMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  const nextMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  const previousDisabled = minDate && previousMonth < new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const nextDisabled = maxDate && nextMonth > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayAllowed = !isDisabledDate(today);

  return (
    <div className={cn('org-field', className)} ref={rootRef}>
      <label id={`${fieldId}-label`} htmlFor={`${fieldId}-trigger`}>
        {label}
        {required ? <span className="org-required-mark" aria-hidden="true">*</span> : null}
      </label>
      <input
        ref={setCombinedRef}
        id={fieldId}
        name={name}
        type="date"
        value={controlled ? selectedValue : undefined}
        defaultValue={!controlled ? defaultValue : undefined}
        min={min}
        max={max}
        onChange={(event) => {
          if (!controlled) setInternalValue(event.target.value);
          onChange?.(event);
        }}
        onBlur={onBlur}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="org-native-control"
        {...props}
        required={required}
      />
      <button
        ref={triggerRef}
        id={`${fieldId}-trigger`}
        type="button"
        className={cn('org-date-trigger', error && 'is-error', open && 'is-open')}
        aria-labelledby={`${fieldId}-label`}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
            setSelectorOpen('');
          } else {
            openCalendar();
          }
        }}
      >
        <span className={cn(!selectedValue && 'is-placeholder')}>
          {formatDisplayDate(selectedValue) || placeholder}
        </span>
        <CalendarDays size={18} aria-hidden="true" />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="org-date-popover"
              style={popoverStyle}
              role="dialog"
              aria-modal="false"
              aria-label={`Choose ${label || 'date'}`}
            >
              <div className="org-calendar__header">
                <button
                  type="button"
                  className="org-calendar__nav"
                  onClick={() => setViewDate(previousMonth)}
                  disabled={previousDisabled}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="org-calendar__selectors">
                  <CalendarSelect
                    label="month"
                    value={viewDate.getMonth()}
                    options={monthOptions}
                    open={selectorOpen === 'month'}
                    onOpenChange={(nextOpen) =>
                      setSelectorOpen(nextOpen ? 'month' : '')
                    }
                    onChange={changeMonth}
                  />
                  <CalendarSelect
                    label="year"
                    value={viewDate.getFullYear()}
                    options={yearOptions}
                    open={selectorOpen === 'year'}
                    onOpenChange={(nextOpen) =>
                      setSelectorOpen(nextOpen ? 'year' : '')
                    }
                    onChange={changeYear}
                  />
                </div>
                <button
                  type="button"
                  className="org-calendar__nav"
                  onClick={() => setViewDate(nextMonth)}
                  disabled={nextDisabled}
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="org-calendar__weekdays" aria-hidden="true">
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="org-calendar__grid">
                {days.map((date, index) => {
                  if (!date) {
                    return (
                      <span
                        key={`blank-${index}`}
                        className="org-calendar__blank"
                      />
                    );
                  }
                  const iso = toIsoDate(date);
                  const selected = iso === selectedValue;
                  const isToday = iso === toIsoDate(today);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={cn(
                        'org-calendar__day',
                        selected && 'is-selected',
                        isToday && 'is-today',
                      )}
                      disabled={isDisabledDate(date)}
                      aria-pressed={selected}
                      aria-label={new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'full',
                      }).format(date)}
                      onClick={() => emitValue(iso)}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="org-calendar__footer">
                <button
                  type="button"
                  onClick={() => emitValue('', false)}
                  disabled={!selectedValue}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => emitValue(toIsoDate(today))}
                  disabled={!todayAllowed}
                >
                  Today
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {error ? (
        <p className="org-field__error" id={`${fieldId}-error`} role="alert">{error}</p>
      ) : hint ? (
        <p className="org-field__hint" id={`${fieldId}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
});

export const TextareaField = forwardRef(function TextareaField(
  { label, error, hint, id, className, rows = 4, required = false, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className={cn('org-field', className)}>
      <label htmlFor={fieldId}>
        {label}
        {required ? <span className="org-required-mark" aria-hidden="true">*</span> : null}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={cn('org-textarea', error && 'is-error')}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...props}
        required={required}
      />
      {error ? (
        <p className="org-field__error" id={`${fieldId}-error`} role="alert">{error}</p>
      ) : hint ? (
        <p className="org-field__hint" id={`${fieldId}-hint`}>{hint}</p>
      ) : null}
    </div>
  );
});
