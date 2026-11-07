import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, KeyRound, Search } from 'lucide-react';
import { hasConfiguredAllowlist } from '@/utils/botPolicy';

/** Searchable, keyboard-friendly picker for the issuer's existing API keys. */
export function BotKeyPicker({ keys, selectedUid, onChange, bounds }) {
  const id = useId();
  const rootRef = useRef(null);
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [showAbove, setShowAbove] = useState(false);
  const current = keys.find((item) => item.uid === selectedUid) || keys[0];
  const matches = keys.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!opened) return undefined;
    function dismiss(event) {
      if (!rootRef.current?.contains(event.target)) setOpened(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [opened]);

  useEffect(() => { setOpened(false); setQuery(''); setHighlighted(0); }, [selectedUid]);

  // Keep the floating menu in the viewport without pushing fields down.
  useEffect(() => {
    if (!opened) return undefined;
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      setShowAbove(spaceBelow < 235 && rect.top > spaceBelow + 90);
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [opened]);

  const open = () => {
    setOpened((prev) => !prev);
    setQuery('');
    setHighlighted(0);
  };
  const choose = (key) => { onChange(key.uid); setOpened(false); setQuery(''); };
  const onSearchKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpened(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted((index) => Math.min(index + 1, matches.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted((index) => Math.max(0, index - 1)); }
    if (event.key === 'Enter' && matches[highlighted]) { event.preventDefault(); choose(matches[highlighted]); }
  };

  return (
    <div className="bot-key-picker" ref={rootRef}>
      <label className="bot-config__label" id={`${id}-label`}>Configuration applies to</label>
      <button type="button" className={`bot-key-picker__trigger ${opened ? 'is-open' : ''}`}
        aria-labelledby={`${id}-label ${id}-selected`} aria-haspopup="listbox" aria-expanded={opened}
        aria-controls={`${id}-options`} onClick={open}>
        <span className="bot-key-picker__glyph"><KeyRound size={17} /></span>
        <span className="bot-key-picker__selected" id={`${id}-selected`}>
          <strong>{current?.name || 'Select an API key'}</strong>
          <small>{hasConfiguredAllowlist(current, bounds) ? 'IP allowlist configured' : 'Needs network setup'}</small>
        </span>
        <ChevronDown size={17} className={opened ? 'is-flipped' : ''} />
      </button>
      {opened && (
        <div className={`bot-key-picker__menu ${showAbove ? 'is-above' : ''}`} id={`${id}-options`}>
          <div className="bot-key-picker__search"><Search size={16} aria-hidden="true" />
            <input autoFocus aria-label="Search API keys" placeholder="Search API keys…"
              value={query} onChange={(event) => { setQuery(event.target.value); setHighlighted(0); }}
              onKeyDown={onSearchKeyDown} />
          </div>
          <div role="listbox" aria-labelledby={`${id}-label`} className="bot-key-picker__options">
            {matches.map((key, index) => {
              const configured = hasConfiguredAllowlist(key, bounds);
              return <button type="button" role="option" aria-selected={key.uid === current?.uid}
                className={`bot-key-picker__option ${index === highlighted ? 'is-highlighted' : ''}`}
                key={key.uid} onMouseEnter={() => setHighlighted(index)} onClick={() => choose(key)}>
                <span><strong>{key.name}</strong><small>{configured ? <><CheckCircle2 size={13} /> Network ready</> : <><AlertCircle size={13} /> Allowlist required</>}</small></span>
                {key.uid === current?.uid && <Check size={17} aria-hidden="true" />}
              </button>;
            })}
            {!matches.length && <p className="bot-key-picker__empty">No keys match your search.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
