import { useEffect, useId, useState } from 'react';
import { CheckCircle2, Plus, Trash2, AlertCircle } from 'lucide-react';
import { isValidIpAddress, splitIps, validateAllowedIps, DEFAULT_POLICY_LIMITS } from '@/utils/botPolicy';

/**
 * Controlled, add-one-at-a-time IP allowlist.
 * Only explicit additions change the parent value; no example or local IP is inserted.
 */
export function BotIpAllowlistInput({ value = '', onChange, bounds = DEFAULT_POLICY_LIMITS, onPendingChange, disabled = false, id, compact = false }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [pending, setPending] = useState('');
  const [entryError, setEntryError] = useState('');
  const addresses = splitIps(value);
  const max = bounds.ipMax || DEFAULT_POLICY_LIMITS.ipMax;
  const min = bounds.ipMin || DEFAULT_POLICY_LIMITS.ipMin;

  useEffect(() => {
    setPending('');
    setEntryError('');
    onPendingChange?.('');
    // Caller remounts this component on key change. Do not erase the entry on every edit.
  }, [inputId]);

  const updatePending = (next) => {
    setPending(next);
    setEntryError('');
    onPendingChange?.(next.trim());
  };
  const add = () => {
    const next = pending.trim();
    if (!next) { setEntryError('Enter an IP address first.'); return; }
    if (next.includes(',') || /\s/.test(next) || !isValidIpAddress(next)) {
      setEntryError('Enter one valid IPv4 or IPv6 address (no CIDR ranges).');
      return;
    }
    if (addresses.some((ip) => ip.toLowerCase() === next.toLowerCase())) {
      setEntryError('This IP address is already in the list.');
      return;
    }
    if (addresses.length >= max) {
      setEntryError(`A maximum of ${max} addresses is allowed.`);
      return;
    }
    onChange([...addresses, next].join('\n'));
    updatePending('');
  };
  const remove = (index) => {
    onChange(addresses.filter((_, i) => i !== index).join('\n'));
    setEntryError('');
  };
  const listError = addresses.length ? validateAllowedIps(addresses, bounds) : '';

  return <div className={`bot-ip-list ${compact ? 'bot-ip-list--compact' : ''}`}>
    <div className="bot-ip-list__entry">
      <div className="bot-ip-list__entry-field">
        <label className="bot-config__label" htmlFor={inputId}>IP address (IPv4 or IPv6)</label>
        <input id={inputId} autoComplete="off" spellCheck={false} inputMode="text"
          placeholder="Enter an IPv4 or IPv6 address" value={pending} disabled={disabled || addresses.length >= max}
          onChange={(event) => updatePending(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
          aria-invalid={Boolean(entryError)} aria-describedby={`${inputId}-hint ${entryError ? `${inputId}-error` : ''}`} />
      </div>
      <button className="bot-ip-list__add" type="button" onClick={add} disabled={disabled || addresses.length >= max}>
        <Plus size={17} aria-hidden="true" /> Add address
      </button>
    </div>
    <p className="bot-config__field-hint" id={`${inputId}-hint`}>Add each address separately. {min}–{max} IP {max === 1 ? 'address' : 'addresses'} allowed, including private IPs; no CIDR ranges.</p>
    {entryError && <p className="bot-ip-list__error" id={`${inputId}-error`} role="alert"><AlertCircle size={15} aria-hidden="true" />{entryError}</p>}
    <div className="bot-ip-list__head"><strong>Allowed addresses</strong><span>{addresses.length} / {max}</span></div>
    {addresses.length ? (
      <ul className="bot-ip-list__addresses" aria-label="Allowed IP addresses">
        {addresses.map((address, index) => (
          <li key={`${address}-${index}`}><span className="bot-ip-list__address"><CheckCircle2 size={16} aria-hidden="true" /><code>{address}</code></span>
            <button type="button" onClick={() => remove(index)} disabled={disabled} aria-label={`Remove ${address}`} title={`Remove ${address}`}><Trash2 size={16} aria-hidden="true" /><span>Remove</span></button>
          </li>
        ))}
      </ul>
    ) : <p className="bot-ip-list__empty">No IP addresses added. Enter the IP address your bot will use above.</p>}
    {listError && addresses.length > 0 && <p className="bot-ip-list__subtle" role="status">{listError}</p>}
  </div>;
}
