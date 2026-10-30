import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { resolveMasterImageUrl } from '@/utils/masterImage';

const getEnvironmentLabel = (chain) => (chain?.isTestnet ? 'Testnet' : 'Mainnet');

export function ChainSelector({
  chains = [],
  value = '',
  onChange,
  label = 'Blockchain network',
  description = 'Choose the network for this action.',
  disabled = false,
  onlyUnlocked = false,
  error = '',
  id = 'chain-selector',
}) {
  const generatedId = useId();
  const listboxId = `${id || generatedId}-listbox`;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState(null);

  const selectedIndex = useMemo(
    () => chains.findIndex((chain) => chain.chainUid === value),
    [chains, value],
  );
  const selected = selectedIndex >= 0 ? chains[selectedIndex] : null;
  const selectedImage = resolveMasterImageUrl(selected);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const edge = 12;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const desiredWidth = Math.max(rect.width, 330);
    const width = Math.min(desiredWidth, viewportWidth - edge * 2);
    const estimatedHeight = Math.min(408, 76 + chains.length * 76);
    const spaceBelow = viewportHeight - rect.bottom - edge;
    const spaceAbove = rect.top - edge;
    const openAbove = spaceBelow < Math.min(estimatedHeight, 260) && spaceAbove > spaceBelow;
    const availableHeight = Math.max(160, (openAbove ? spaceAbove : spaceBelow) - gap);
    const left = Math.min(
      Math.max(rect.left, edge),
      Math.max(edge, viewportWidth - width - edge),
    );

    setMenuStyle({
      position: 'fixed',
      zIndex: 1800,
      left: `${left}px`,
      width: `${width}px`,
      maxWidth: `calc(100vw - ${edge * 2}px)`,
      maxHeight: `${Math.min(408, availableHeight)}px`,
      top: openAbove ? 'auto' : `${rect.bottom + gap}px`,
      bottom: openAbove ? `${viewportHeight - rect.top + gap}px` : 'auto',
    });
  }, [chains.length]);

  useEffect(() => {
    if (!open) return undefined;

    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);
    updateMenuPosition();

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[nextIndex]?.focus();
    });

    const handleOutside = (event) => {
      const clickedTrigger = rootRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedMenu) setOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const reposition = () => updateMenuPosition();

    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, selectedIndex, updateMenuPosition]);

  const emitChange = (nextValue) => {
    if (disabled) return;
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
      type: 'change',
    });
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const chooseChain = (chain) => {
    if (!chain || (onlyUnlocked && !chain.isUnlocked)) return;
    emitChange(chain.chainUid);
  };

  const moveActive = (direction) => {
    if (!chains.length) return;
    setActiveIndex((current) => {
      let next = current;
      for (let attempts = 0; attempts < chains.length; attempts += 1) {
        next = (next + direction + chains.length) % chains.length;
        if (!(onlyUnlocked && !chains[next]?.isUnlocked)) break;
      }
      window.requestAnimationFrame(() => optionRefs.current[next]?.focus());
      return next;
    });
  };

  const handleMenuKeyDown = (event) => {
    if (!chains.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const start = event.key === 'Home' ? 0 : chains.length - 1;
      const step = event.key === 'Home' ? 1 : -1;
      let next = start;
      while (onlyUnlocked && !chains[next]?.isUnlocked && next >= 0 && next < chains.length) next += step;
      if (next >= 0 && next < chains.length) {
        setActiveIndex(next);
        window.requestAnimationFrame(() => optionRefs.current[next]?.focus());
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && chains[activeIndex]) {
      event.preventDefault();
      chooseChain(chains[activeIndex]);
    }
  };

  return (
    <div className="grid min-w-0 gap-2" ref={rootRef}>
      <label htmlFor={`${id}-trigger`} className="text-sm font-semibold text-slate-900">{label}</label>
      <p className="m-0 text-sm leading-5 text-slate-500">{description}</p>

      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open ? listboxId : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled || open) return;
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'group relative flex min-h-[62px] w-full min-w-0 items-center gap-3 rounded-2xl border bg-white px-3.5 py-2.5 text-left shadow-sm transition',
          'hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary-500)_12%,transparent)]',
          open && 'border-[var(--primary-500)] ring-4 ring-[color-mix(in_srgb,var(--primary-500)_10%,transparent)]',
          error ? 'border-rose-400' : 'border-slate-200',
          disabled && 'cursor-not-allowed bg-slate-50 opacity-65 hover:shadow-sm',
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
          {selectedImage ? (
            <img src={selectedImage} alt="" className="size-full object-contain p-1" />
          ) : (
            <Network size={20} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-950">{selected.chainName}</span>
                {selected.isDefault ? (
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Default</span>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <span className="block text-sm font-semibold text-slate-700">Select a network</span>
              <span className="mt-0.5 block text-xs text-slate-500">Choose from {chains.length} supported {chains.length === 1 ? 'network' : 'networks'}</span>
            </>
          )}
        </span>

        <ChevronDown
          size={18}
          className={cn('shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-600', open && 'rotate-180 text-slate-700')}
          aria-hidden="true"
        />
      </button>

      {open && !disabled && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.20)]"
          style={menuStyle || { visibility: 'hidden' }}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <p className="m-0 text-sm font-semibold text-slate-950">Choose network</p>
            <p className="mt-0.5 mb-0 text-xs text-slate-500">
              Select the blockchain network to use for this step.
            </p>
          </div>

          <div className="max-h-[330px] overflow-y-auto p-1.5">
            {chains.length ? chains.map((chain, index) => {
              const image = resolveMasterImageUrl(chain);
              const isSelected = chain.chainUid === value;
              const locked = onlyUnlocked && !chain.isUnlocked;
              return (
                <button
                  key={chain.chainUid}
                  ref={(node) => { optionRefs.current[index] = node; }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={locked || undefined}
                  disabled={locked}
                  onMouseEnter={() => { if (!locked) setActiveIndex(index); }}
                  onClick={() => chooseChain(chain)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition',
                    'hover:bg-slate-50 focus:bg-slate-50 focus:ring-2 focus:ring-inset focus:ring-[var(--primary-500)]',
                    isSelected && 'bg-blue-50/80',
                    locked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                    index === activeIndex && !locked && !isSelected && 'bg-slate-50',
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                    {image ? <img src={image} alt="" className="size-full object-contain p-1" /> : <Network size={19} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <strong className="truncate text-sm font-semibold text-slate-950">{chain.chainName}</strong>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        chain.isTestnet ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700',
                      )}>
                        {getEnvironmentLabel(chain)}
                      </span>
                      {chain.isDefault ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Default</span> : null}
                      {locked ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Locked</span> : null}
                    </span>
                  </span>
                  {isSelected ? (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--primary-500)] text-white">
                      <Check size={16} strokeWidth={2.5} />
                    </span>
                  ) : null}
                </button>
              );
            }) : (
              <div className="px-4 py-7 text-center">
                <Network className="mx-auto text-slate-300" size={24} />
                <p className="mt-2 mb-0 text-sm font-medium text-slate-700">No networks available</p>
                <p className="mt-1 mb-0 text-xs text-slate-500">Supported networks will appear here when they are available.</p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}

      {selected ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Chain ID {selected.chainId}</span>
          {selected.isUnlocked ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> Unlocked</span> : null}
          {selected.nativeCurrencySymbol ? <span>Gas: {selected.nativeCurrencySymbol}</span> : null}
        </div>
      ) : null}
      {error ? <p id={`${id}-error`} className="m-0 text-sm font-medium text-rose-600" role="alert">{error}</p> : null}
    </div>
  );
}
