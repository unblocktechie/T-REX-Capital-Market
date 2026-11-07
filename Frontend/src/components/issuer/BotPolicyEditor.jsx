import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Info, LockKeyhole, Save, Shield, SlidersHorizontal, CalendarClock, RotateCcw, Clock3, ChevronRight, Check, Hourglass, RefreshCw, CalendarDays, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { organizationApi } from '@/api/organization';
import { Button } from '@/components/ui/Button';
import { BotKeyPicker } from './BotKeyPicker';
import { BotIpAllowlistInput } from './BotIpAllowlistInput';
import { getErrorMessage } from '@/utils/error';
import {
  WEEKDAYS, visibleAllowedDays, hasConfiguredAllowlist, normalizePolicy,
  normalizePolicyOptions, serializePolicy, validatePolicy, getUnsavedPolicySections,
} from '@/utils/botPolicy';
import { COOLDOWN_UNITS, preferredCooldownUnit, cooldownAmountFromSeconds, cooldownAmountToSeconds } from '@/utils/cooldownUnits';

const metadata = {
  network: {
    title: 'Network Security', icon: Shield,
    description: 'Allow requests only from the IP addresses approved for this API key.',
  },
  protection: {
    title: 'Price Protection', icon: SlidersHorizontal,
    description: 'Limit how far a bot can change the confirmed token price.',
  },
  schedule: {
    title: 'Update Schedule', icon: CalendarClock,
    description: 'Choose permitted days, times, and the minimum time between bot updates.',
  },
};

const FREQUENCY_CHOICES = [
  { value: '', title: 'No minimum', description: 'No frequency restriction' },
  { value: 'hourly', title: 'Hourly', description: 'At least 1 hour apart' },
  { value: 'daily', title: 'Daily', description: 'At least 24 hours apart' },
  { value: 'weekly', title: 'Weekly', description: 'At least 7 days apart' },
  { value: 'monthly', title: 'Monthly', description: 'One calendar month apart' },
];
const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const isSameDays = (left, right) => left.length === right.length && left.every((day) => right.includes(day));
// Price limits are decimal strings; do not round values during editing or preview.
const isValidPricePercent = (text) => !text || (/^\d{1,3}(?:\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= 100);
const protectionRules = (policy) => [
  policy.threshold ? `Per update: Maximum ${policy.threshold}% increase or decrease` : 'Per update: No percentage limit',
  policy.maxCumulative24hPercent ? `Within 24 hours: Maximum ${policy.maxCumulative24hPercent}% total movement` : 'Within 24 hours: No cumulative limit',
];

function ProtectionLimit({ id, title, description, help, value, onChange, presetLabel }) {
  const valid = isValidPricePercent(value);
  return <section className="bot-protection__rule" aria-labelledby={`${id}-title`}>
    <div className="bot-protection__rule-heading">
      <h3 id={`${id}-title`}>{title}</h3>
      <p>{description}</p>
    </div>
    <div className="bot-protection__presets" role="group" aria-label={presetLabel}>
      {['5', '10', '25'].map((preset) => <button type="button" key={preset}
        className={value === preset ? 'is-selected' : ''} aria-pressed={value === preset}
        onClick={() => onChange(preset)}>{preset}%</button>)}
      <button type="button" className={!value ? 'is-selected' : ''} aria-pressed={!value}
        onClick={() => onChange('')}>Off</button>
    </div>
    <label className="bot-protection__custom-label" htmlFor={id}>Custom limit (%)</label>
    <div className={`bot-config__input-suffix bot-protection__input ${!valid ? 'is-invalid' : ''}`}>
      <input id={id} type="text" autoComplete="off" inputMode="decimal"
        placeholder="Disabled" value={value} aria-invalid={!valid}
        aria-describedby={`${id}-help${!valid ? ` ${id}-error` : ''}`}
        onChange={(event) => onChange(event.target.value)} />
      <span aria-hidden="true">%</span>
    </div>
    {!valid && <p id={`${id}-error`} className="bot-protection__error" role="status">Use a value greater than 0 and up to 100, with at most 2 decimal places.</p>}
    <p id={`${id}-help`} className="bot-protection__rule-help">{help}</p>
  </section>;
}

// Styled cooldown units share the same wire format as the earlier native select:
// only the user's display unit changes; the policy continues to store seconds.
const COOLDOWN_UNIT_META = {
  seconds: { abbreviation: 'sec', equivalent: '1 second' },
  minutes: { abbreviation: 'min', equivalent: '60 seconds' },
  hours: { abbreviation: 'hr', equivalent: '3,600 seconds' },
  days: { abbreviation: 'day', equivalent: '86,400 seconds' },
};

function CooldownUnitSelect({ value, onChange }) {
  const listId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [showAbove, setShowAbove] = useState(false);
  const selectedIndex = Math.max(0, COOLDOWN_UNITS.findIndex((unit) => unit.value === value));
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);
  const selected = COOLDOWN_UNITS[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const placeMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setShowAbove(window.innerHeight - rect.bottom < 255 && rect.top > 255);
    };
    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  const openOptions = (index = selectedIndex) => {
    setFocusedIndex(index);
    setOpen(true);
  };
  const choose = (unit) => {
    onChange(unit.value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const handleTriggerKeyDown = (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openOptions(event.key === 'ArrowUp' ? COOLDOWN_UNITS.length - 1 : selectedIndex);
    }
  };
  const handleOptionKeyDown = (event) => {
    const last = COOLDOWN_UNITS.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setFocusedIndex((index) => event.key === 'Home' ? 0 : event.key === 'End' ? last
        : event.key === 'ArrowDown' ? (index + 1) % COOLDOWN_UNITS.length : (index + last) % COOLDOWN_UNITS.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(COOLDOWN_UNITS[focusedIndex]);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return <div ref={rootRef} className="bot-schedule__cooldown-unit">
    <button id="bot-cooldown-unit" ref={triggerRef} className={`bot-schedule__unit-trigger ${open ? 'is-open' : ''}`}
      type="button" aria-label={`Cooldown time unit: ${selected.label}`} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={listId}
      onClick={() => open ? setOpen(false) : openOptions()}
      onKeyDown={handleTriggerKeyDown}>
      <span>{selected.label}</span><ChevronDown size={16} className={open ? 'is-flipped' : ''} aria-hidden="true" />
    </button>
    {open && <div id={listId} role="listbox" aria-label="Cooldown time units" className={`bot-schedule__unit-menu ${showAbove ? 'is-above' : ''}`} onKeyDown={handleOptionKeyDown}>
      {COOLDOWN_UNITS.map((unit, index) => <button key={unit.value} type="button" role="option"
        ref={(node) => { optionRefs.current[index] = node; }}
        tabIndex={-1} aria-selected={unit.value === value}
        className={`bot-schedule__unit-option ${unit.value === value ? 'is-selected' : ''}`}
        onMouseEnter={() => setFocusedIndex(index)} onClick={() => choose(unit)}>
        <span className="bot-schedule__unit-abbr" aria-hidden="true">{COOLDOWN_UNIT_META[unit.value].abbreviation}</span>
        <span className="bot-schedule__unit-label"><strong>{unit.label}</strong><small>{COOLDOWN_UNIT_META[unit.value].equivalent}</small></span>
        {unit.value === value && <Check size={16} className="bot-schedule__unit-check" aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}

const describeCooldown = (value) => {
  if (!value) return 'No minimum';
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Custom';
  if (seconds % 86400 === 0) return `${seconds / 86400} ${seconds === 86400 ? 'day' : 'days'}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} ${seconds === 3600 ? 'hour' : 'hours'}`;
  if (seconds % 60 === 0) return `${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}`;
  return `${value} seconds`;
};
const describeHours = (start, end) => {
  if (!start || !end) return 'Not restricted';
  return `${start} – ${end}${end < start ? ' · overnight' : ''}`;
};

function FrequencyChoices({ value, onChange }) {
  return <fieldset className="bot-config__option-field">
    <legend className="bot-config__label">Minimum update frequency <span className="bot-config__optional">Optional</span></legend>
    <p className="bot-config__field-hint">Minimum gap after the last confirmed bot update.</p>
    <div className="bot-config__frequency-choices">
      {FREQUENCY_CHOICES.map((choice) => <label key={choice.value}
        className={`bot-config__choice ${value === choice.value ? 'is-selected' : ''}`}>
        <input type="radio" name="bot-update-frequency" value={choice.value}
          checked={value === choice.value} onChange={() => onChange(choice.value)} />
        <span className="bot-config__choice-dot" aria-hidden="true" />
        <span className="bot-config__choice-copy"><strong>{choice.title}</strong><small>{choice.description}</small></span>
      </label>)}
    </div>
  </fieldset>;
}



export function BotPolicyEditor({ section, keys, selectedUid, onSelectedUidChange, onNavigateNetwork, optionsQuery, onDirtyChange, onSectionDirtyChange }) {
  const queryClient = useQueryClient();
  const activeKeys = useMemo(() => keys.filter((key) => key.isActive), [keys]);
  const selected = activeKeys.find((key) => key.uid === selectedUid) || activeKeys[0];
  const saved = selected?.policy;
  const savedFingerprint = JSON.stringify(saved ?? null);
  const [draft, setDraft] = useState(() => normalizePolicy(saved));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingUid, setPendingUid] = useState('');
  const [pendingIp, setPendingIp] = useState('');
  const [ipResetCounter, setIpResetCounter] = useState(0);
  const [cooldownUnit, setCooldownUnit] = useState(() => preferredCooldownUnit(normalizePolicy(saved).cooldownSeconds));
  const [cooldownAmount, setCooldownAmount] = useState(() => {
    const seconds = normalizePolicy(saved).cooldownSeconds;
    return cooldownAmountFromSeconds(seconds, preferredCooldownUnit(seconds));
  });
  const [cooldownError, setCooldownError] = useState('');
  const bounds = useMemo(() => normalizePolicyOptions(optionsQuery.data), [optionsQuery.data]);
  const sectionInfo = metadata[section] || metadata.network;
  const Icon = sectionInfo.icon;
  const effectiveDays = visibleAllowedDays(draft.allowedDays);
  const scheduleHasLegacyZone = section === 'schedule' && Boolean(draft.timezone) && draft.timezone !== 'UTC';
  const scheduleDaysText = effectiveDays.length === 7 ? 'Every day' : effectiveDays.join(', ');
  const scheduleFrequencyText = FREQUENCY_CHOICES.find((choice) => choice.value === draft.frequency)?.title || 'Custom';
  const priceRulesText = protectionRules(draft);


  useEffect(() => {
    setDraft(normalizePolicy(saved));
    setError('');
    setPendingUid('');
    setPendingIp('');
    const initialSeconds = normalizePolicy(saved).cooldownSeconds;
    const initialUnit = preferredCooldownUnit(initialSeconds);
    setCooldownUnit(initialUnit);
    setCooldownAmount(cooldownAmountFromSeconds(initialSeconds, initialUnit));
    setCooldownError('');
    // Reset on key selection or actual server policy changes, not when switching tabs.
  }, [selected?.uid, savedFingerprint]);

  // Unsaved status must come from the latest draft, not independently updated state.
  // Add address updates the list and clears the entry in the same React batch;
  // a stale setDirty in the entry-clear callback previously disabled Save.
  const unsavedSections = useMemo(
    () => {
      const sections = getUnsavedPolicySections(draft, saved, pendingIp);
      return { ...sections, schedule: sections.schedule || Boolean(cooldownError) };
    },
    [draft, savedFingerprint, pendingIp, cooldownError],
  );
  const dirty = Object.values(unsavedSections).some(Boolean);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onSectionDirtyChange?.(unsavedSections); }, [unsavedSections, onSectionDirtyChange]);
  const hasUnsavedPolicyChanges = dirty;

  const switchKey = (uid) => {
    if (uid === selected?.uid) return;
    if (dirty) setPendingUid(uid);
    else onSelectedUidChange(uid);
  };

  const change = (field, val) => {
    setDraft((current) => JSON.stringify(current[field]) === JSON.stringify(val)
      ? current : { ...current, [field]: val });
    setError('');
  };

  const changeCooldownPreset = (seconds) => {
    change('cooldownSeconds', seconds);
    const unit = preferredCooldownUnit(seconds);
    setCooldownUnit(unit);
    setCooldownAmount(cooldownAmountFromSeconds(seconds, unit));
    setCooldownError('');
  };

  const changeCooldownUnit = (unit) => {
    setCooldownUnit(unit);
    setCooldownAmount(cooldownAmountFromSeconds(draft.cooldownSeconds, unit));
    setCooldownError('');
    setError('');
  };

  const changeCooldownAmount = (amount) => {
    setCooldownAmount(amount);
    const converted = cooldownAmountToSeconds(amount, cooldownUnit, bounds);
    setCooldownError(converted.error);
    if (!converted.error) change('cooldownSeconds', converted.seconds);
  };

  const resetCooldown = () => {
    const seconds = normalizePolicy(saved).cooldownSeconds;
    const unit = preferredCooldownUnit(seconds);
    setCooldownUnit(unit);
    setCooldownAmount(cooldownAmountFromSeconds(seconds, unit));
    setCooldownError('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!selected?.uid || saving || !optionsQuery.isSuccess) return;
    if (section === 'network' && pendingIp) {
      setError('Click Add address to include the typed IP before saving.');
      return;
    }
    if (cooldownError) {
      setError(cooldownError);
      return;
    }
    if (!bounds.valid) {
      setError('The administrator must correct the policy limits before changes can be saved.');
      return;
    }
    if (section === 'schedule' && scheduleHasLegacyZone) {
      setError('Review the saved time window and select Use UTC before saving this schedule.');
      return;
    }
    const validation = validatePolicy(draft, bounds);
    if (validation) { setError(validation); return; }
    setSaving(true);
    try {
      // PUT replaces the complete policy. Preserve other tabs' saved fields.
      await organizationApi.updateApiKeyPolicy(selected.uid, serializePolicy(section === 'schedule' ? { ...draft, timezone: 'UTC' } : draft));
      await queryClient.invalidateQueries({ queryKey: ['organization', 'api-keys'] });
      toast.success('Bot policy saved', { description: 'The backend will enforce the updated rules on future API-key requests.' });
    } catch (err) {
      const code = err?.response?.data?.code || err?.response?.data?.error?.code;
      setError(getErrorMessage(err, code === 'API_KEY_POLICY_SETTINGS_INVALID'
        ? 'Ask an admin to correct the API-key policy limits.' : 'Policy was not saved. Review your values and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bot-config__panel" aria-labelledby="bot-policy-heading">
      <header className="bot-config__panel-heading">
        <span className="bot-config__panel-icon"><Icon size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="bot-policy-heading">{sectionInfo.title}</h2>
          <p>{sectionInfo.description}</p>
        </div>
      </header>
      {!activeKeys.length ? (
        <div className="bot-config__notice" role="status"><Info size={18} aria-hidden="true" /><span>Create an API key first. Add its allowed IP addresses during creation.</span></div>
      ) : (
        <>
          <div className="bot-config__key-select">
            <BotKeyPicker keys={activeKeys} selectedUid={selected?.uid || ''} onChange={switchKey} bounds={bounds} />
            <span className={`bot-config__key-status ${hasConfiguredAllowlist(selected, bounds) ? 'is-configured' : 'is-needed'}`}>
              {hasConfiguredAllowlist(selected, bounds)
                ? <><CheckCircle2 size={16} /> IP allowlist saved</>
                : <><AlertCircle size={16} /> Network setup required</>}
            </span>
          </div>
          {pendingUid && (
            <div className="bot-config__notice bot-config__notice--warning bot-config__unsaved" role="alert">
              <AlertCircle size={18} /><span>You have unsaved changes. Switching keys will discard those edits.</span>
              <div className="bot-config__notice-actions">
                <button type="button" className="bot-config__text-action" onClick={() => setPendingUid('')}>Keep editing</button>
                <button type="button" className="bot-config__text-action is-danger" onClick={() => { onSelectedUidChange(pendingUid); setPendingUid(''); }}>Discard and switch</button>
              </div>
            </div>
          )}
          {optionsQuery.isPending ? <p role="status">Loading allowed policy limits…</p> : null}
          {optionsQuery.isError ? (
            <div className="bot-config__notice bot-config__notice--warning" role="alert">
              <AlertCircle size={18} /><span>Policy limits could not be loaded. Editing is unavailable until this request succeeds.</span>
              <Button size="sm" variant="secondary" onClick={() => optionsQuery.refetch()}>Retry</Button>
            </div>
          ) : null}
          {optionsQuery.isSuccess && !bounds.valid ? <div className="bot-config__notice bot-config__notice--warning" role="alert">Policy bounds are inconsistent. Ask an administrator to review the API-key settings.</div> : null}
          {section !== 'network' && !hasConfiguredAllowlist(selected, bounds) ? (
            <div className="bot-config__notice bot-config__notice--warning" role="status">
              <AlertCircle size={18} aria-hidden="true" />
              <span>Save allowed IP addresses in Network Security before enabling optional rules for this key.</span>
              <button type="button" className="bot-config__retry" onClick={onNavigateNetwork}>Set up IPs</button>
            </div>
          ) : null}
          <form onSubmit={save} className="bot-config__policy-form">
            {section === 'network' && (
              <>
                <div className="bot-config__notice"><LockKeyhole size={18} aria-hidden="true" /><span><strong>Required.</strong> API-key requests will be rejected until this key has a valid saved allowlist. Changes do not require a blockchain transaction.</span></div>
                <div className="bot-config__field">
                  <BotIpAllowlistInput key={`${selected?.uid}-${ipResetCounter}`} id="bot-allowed-ips" bounds={bounds}
                    value={draft.allowedIps} onChange={(next) => change('allowedIps', next)}
                    onPendingChange={setPendingIp} disabled={!optionsQuery.isSuccess || !bounds.valid || saving} />
                </div>
                <p className="bot-config__hint">Your bot must send requests from one of these addresses. If the IP address your bot uses changes, update this list before running it.</p>
              </>
            )}
            {section === 'protection' && (
              <div className="bot-protection">
                <div className="bot-protection__rules">
                  <ProtectionLimit
                    id="bot-threshold" title="Maximum change per update"
                    description="Limit how much the price can increase or decrease in a single update."
                    help="Applies to both price increases and decreases."
                    presetLabel="Maximum change per update presets"
                    value={draft.threshold} onChange={(value) => change('threshold', value)} />
                  <ProtectionLimit
                    id="bot-cumulative" title="24-hour total movement"
                    description="Limit the total movement of all confirmed price changes within 24 hours."
                    help="Includes confirmed manual and bot price updates."
                    presetLabel="Suggested 24-hour limits"
                    value={draft.maxCumulative24hPercent} onChange={(value) => change('maxCumulative24hPercent', value)} />
                </div>
                <section className="bot-protection__summary" aria-label="Protection rules preview">
                  <div className="bot-protection__summary-top">
                    <div className="bot-protection__summary-title">
                      <Info size={17} aria-hidden="true" />
                      <div>
                        <h3>Your protection rules</h3>
                        <p>{dirty ? 'Preview of unsaved changes — save to activate these limits.' : saved ? 'Current settings saved for this API key.' : 'No percentage limits saved for this key yet.'}</p>
                      </div>
                    </div>
                  </div>
                  <ul className="bot-protection__summary-list">
                    {priceRulesText.map((rule) => <li key={rule}><CheckCircle2 size={15} aria-hidden="true" /> <span>{rule}</span></li>)}
                  </ul>
                </section>
              </div>
            )}
            {section === 'schedule' && (
              <div className="bot-schedule">
                <div className="bot-config__schedule-intro"><Clock3 size={17} /> These rules limit <strong>when a bot may update</strong> prices. They do not automatically run your bot.</div>
                {scheduleHasLegacyZone && (
                  <div className="bot-config__notice bot-config__notice--warning bot-schedule__legacy-zone" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>This key has an older schedule in <strong>{draft.timezone}</strong>. The saved hours are shown unchanged, not converted. Review them before switching to UTC.</span>
                    <button type="button" className="bot-config__retry" onClick={() => change('timezone', 'UTC')}>Use UTC</button>
                  </div>
                )}
                <div className="bot-schedule__rows">
                  <div className="bot-schedule__row">
                    <div className="bot-schedule__row-heading">
                      <span className="bot-schedule__glyph"><Hourglass size={19} aria-hidden="true" /></span>
                      <div><h3>Minimum cooldown <span className="bot-config__optional">Optional</span></h3><p>Time between two confirmed bot updates.</p></div>
                    </div>
                    <div className="bot-schedule__row-controls">
                      <div className="bot-config__presets" role="group" aria-label="Minimum cooldown presets">
                        {[{ value: '', text: 'Off' }, { value: '300', text: '5 min' }, { value: '1800', text: '30 min' }, { value: '3600', text: '1 hour' }].map(({ value, text }) => <button type="button" key={text} disabled={Boolean(value) && (Number(value) < bounds.cooldownMin || Number(value) > bounds.cooldownMax)} className={draft.cooldownSeconds === value && !cooldownError ? 'is-selected' : ''} aria-pressed={draft.cooldownSeconds === value && !cooldownError} onClick={() => changeCooldownPreset(value)}>{text}</button>)}
                      </div>
                      <div className="bot-schedule__custom-cooldown">
                        <label htmlFor="bot-cooldown">Custom cooldown</label>
                        <div className={`bot-schedule__cooldown-entry ${cooldownError ? 'is-invalid' : ''}`}>
                          <input id="bot-cooldown" type="text" autoComplete="off" inputMode={cooldownUnit === 'seconds' ? 'numeric' : 'decimal'} placeholder="Enter duration" value={cooldownAmount} aria-invalid={Boolean(cooldownError)} aria-describedby={cooldownError ? 'bot-cooldown-error' : undefined} onChange={(event) => changeCooldownAmount(event.target.value)} />
                          <CooldownUnitSelect value={cooldownUnit} onChange={changeCooldownUnit} />
                        </div>
                        {cooldownError && <p id="bot-cooldown-error" role="alert" className="bot-schedule__cooldown-error">{cooldownError}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="bot-schedule__row">
                    <div className="bot-schedule__row-heading">
                      <span className="bot-schedule__glyph"><RefreshCw size={19} aria-hidden="true" /></span>
                      <div><h3>Minimum update frequency <span className="bot-config__optional">Optional</span></h3><p>Choose how often your bot can update prices.</p></div>
                    </div>
                    <div className="bot-schedule__row-controls"><FrequencyChoices value={draft.frequency} onChange={(value) => change('frequency', value)} /></div>
                  </div>
                  <div className="bot-schedule__row">
                    <div className="bot-schedule__row-heading">
                      <span className="bot-schedule__glyph"><CalendarDays size={19} aria-hidden="true" /></span>
                      <div><h3>Allowed days <span className="bot-config__optional">Optional</span></h3><p>Choose which <strong>UTC calendar days</strong> your bot can update prices.</p></div>
                    </div>
                    <fieldset className="bot-schedule__row-controls bot-config__weekdays">
                      <legend className="sr-only">Allowed days in UTC</legend>
                      <div className="bot-config__day-presets" role="group" aria-label="Quick day selection">
                        {[
                          { label: 'Every day', days: WEEKDAYS },
                          { label: 'Weekdays', days: WEEKDAYS.slice(0, 5) },
                          { label: 'Weekends', days: WEEKDAYS.slice(5) },
                        ].map(({ label, days }) => {
                          const chosen = isSameDays(effectiveDays, days);
                          return <button type="button" key={label} className={chosen ? 'is-selected' : ''} aria-pressed={chosen} onClick={() => change('allowedDays', label === 'Every day' ? [] : days)}>{label}</button>;
                        })}
                        <span className="bot-schedule__selection-note">{isSameDays(effectiveDays, WEEKDAYS) ? '7 days selected' : `${effectiveDays.length} of 7 selected`}</span>
                      </div>
                      <div className="bot-config__weekday-options">
                        {WEEKDAYS.map((day) => (
                          <label key={day} title={DAY_NAMES[day]} className={effectiveDays.includes(day) ? 'is-selected' : ''}>
                            <input type="checkbox" checked={effectiveDays.includes(day)} aria-label={DAY_NAMES[day]} onChange={(event) => {
                              const next = event.target.checked
                                ? WEEKDAYS.filter((v) => v === day || effectiveDays.includes(v))
                                : effectiveDays.filter((v) => v !== day);
                              // Zero selected cannot mean "block every day" in the backend: zero means all days.
                              change('allowedDays', next.length === WEEKDAYS.length || !next.length ? [] : next);
                            }} />
                            <span className="bot-config__weekday-tick" aria-hidden="true"><Check size={12} /></span>{day}
                          </label>
                        ))}
                      </div>
                      <p className="bot-config__field-hint">Days are evaluated using UTC. Every day allows Monday through Sunday.</p>
                    </fieldset>
                  </div>
                  <div className="bot-schedule__row">
                    <div className="bot-schedule__row-heading">
                      <span className="bot-schedule__glyph"><Clock3 size={19} aria-hidden="true" /></span>
                      <div><h3>Allowed hours <span className="bot-config__optional">Optional</span></h3><p>Set the daily time window in UTC, including overnight hours.</p></div>
                    </div>
                    <div className="bot-schedule__row-controls bot-schedule__hours">
                      <div className="bot-schedule__time-grid">
                        <div className="bot-schedule__time-field">
                          <label htmlFor="bot-start-utc">Start time (UTC)</label>
                          <div className="bot-schedule__time-input"><input id="bot-start-utc" type="time" step="60" lang="en-GB" value={draft.startTime} onChange={(event) => change('startTime', event.target.value)} /><span aria-hidden="true">UTC</span></div>
                          <small>Inclusive — updates can start here</small>
                        </div>
                        <div className="bot-schedule__time-field">
                          <label htmlFor="bot-end-utc">End time (UTC)</label>
                          <div className="bot-schedule__time-input"><input id="bot-end-utc" type="time" step="60" lang="en-GB" value={draft.endTime} onChange={(event) => change('endTime', event.target.value)} /><span aria-hidden="true">UTC</span></div>
                          <small>Exclusive — updates stop here</small>
                        </div>
                      </div>
                      <p className="bot-schedule__time-guidance">
                        {draft.startTime && draft.endTime && draft.endTime < draft.startTime
                          ? `Overnight window: from ${draft.startTime} UTC until ${draft.endTime} UTC the next day.`
                          : 'Overnight windows are supported (e.g., 18:00–09:00). Leave both fields empty for no hourly restriction.'}
                      </p>
                    </div>
                  </div>
                </div>
                <section className="bot-schedule__summary" aria-label="Schedule preview">
                  <div className="bot-schedule__summary-heading"><strong>Schedule preview</strong><span>{scheduleHasLegacyZone ? 'Legacy timezone · review' : `${dirty ? 'Unsaved preview' : 'Current saved settings'} · UTC`}</span></div>
                  <div className="bot-schedule__summary-items">
                    <div><Hourglass size={17} aria-hidden="true" /><span><small>Cooldown</small><strong>{describeCooldown(draft.cooldownSeconds)}</strong></span></div>
                    <div><RefreshCw size={17} aria-hidden="true" /><span><small>Update frequency</small><strong>{scheduleFrequencyText}</strong></span></div>
                    <div><CalendarDays size={17} aria-hidden="true" /><span><small>Allowed days</small><strong>{scheduleDaysText}</strong></span></div>
                    <div><Clock3 size={17} aria-hidden="true" /><span><small>Allowed hours ({scheduleHasLegacyZone ? draft.timezone : 'UTC'})</small><strong>{describeHours(draft.startTime, draft.endTime)}</strong></span></div>
                  </div>
                  <p>Allowed days use the actual UTC calendar day, including after midnight. These are API-key limits, not an automatic execution schedule.</p>
                </section>
              </div>
            )}
            <div className="bot-config__panel-footer">
              <div className="bot-config__footer-summary">
                {hasUnsavedPolicyChanges && <span className="bot-config__edited" role="status">{saving ? 'Saving changes…' : 'Unsaved changes'}</span>}
              </div>
              <div className="bot-config__footer-actions">
                {dirty && <button type="button" className="bot-config__reset" disabled={saving} onClick={() => { setDraft(normalizePolicy(saved)); setPendingIp(''); setIpResetCounter((counter) => counter + 1); resetCooldown(); setError(''); }}><RotateCcw size={15} /> Reset</button>}
              
              <Button type="submit" icon={Save} loading={saving} disabled={!selected?.uid || !optionsQuery.isSuccess || !bounds.valid || !dirty}>
                Save changes <ChevronRight size={16} aria-hidden="true" />
              </Button>
              </div>
            </div>
            {error && <p className="bot-config__form-error" role="alert">{error}</p>}
          </form>
        </>
      )}
    </section>
  );
}
