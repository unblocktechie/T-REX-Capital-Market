import { Check, Copy, ExternalLink, Info, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/cn';
import { shortenWalletAddress } from '@/utils/wallet';

export function FieldWrapper({
  label,
  required = false,
  hint,
  error,
  children,
  className,
  htmlFor,
}) {
  return (
    <div className={cn('issuance-field', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="issuance-field__label">
          {label}
          {required ? <span className="issuance-required" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="issuance-field__error" role="alert">{error}</p>
      ) : hint ? (
        <p className="issuance-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ error, className, ...props }) {
  return (
    <input
      className={cn('issuance-control', error && 'issuance-control--error', className)}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

export function SelectInput({ error, className, children, ...props }) {
  return (
    <select
      className={cn('issuance-control issuance-control--select', error && 'issuance-control--error', className)}
      aria-invalid={Boolean(error)}
      {...props}
    >
      {children}
    </select>
  );
}

export function TextareaInput({ error, className, ...props }) {
  return (
    <textarea
      className={cn('issuance-control issuance-control--textarea', error && 'issuance-control--error', className)}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={cn('issuance-toggle-row', disabled && 'is-disabled')}>
      <span className="min-w-0">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      <span className={cn('issuance-switch', checked && 'is-checked')} aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

export function SectionCard({ title, description, action, children, className }) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section className={cn('issuance-section-card', className)}>
      {hasHeader ? (
        <header className="issuance-section-card__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className="issuance-section-card__body">{children}</div>
    </section>
  );
}

export function InfoCallout({ title, children, tone = 'info', icon: Icon = Info }) {
  return (
    <div className={cn('issuance-callout', `issuance-callout--${tone}`)}>
      <span className="issuance-callout__icon"><Icon size={18} /></span>
      <div>
        {title ? <strong>{title}</strong> : null}
        <p>{children}</p>
      </div>
    </div>
  );
}

export function AddressDisplay({
  address,
  label,
  explorerUrl,
  emptyLabel = 'Not assigned',
  compact = false,
  showFullAddress = false,
  className,
}) {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    if (!address || !navigator?.clipboard) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={cn('issuance-address', compact && 'issuance-address--compact', className)}>
      <div className="min-w-0">
        {label ? <small>{label}</small> : null}
        <code title={address || emptyLabel}>
          {address
            ? showFullAddress
              ? address
              : shortenWalletAddress(address, 8, 8)
            : emptyLabel}
        </code>
      </div>
      {address ? (
        <div className="issuance-address__actions">
          <button type="button" onClick={copyAddress} aria-label="Copy address" title="Copy address">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer" aria-label="Open in explorer" title="Open in explorer">
              <ExternalLink size={16} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SelectionChip({ children, onRemove }) {
  return (
    <span className="issuance-chip">
      <span>{children}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${children}`}>
          <X size={14} />
        </button>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status, children }) {
  return <span className={cn('issuance-status', `issuance-status--${status}`)}>{children || status}</span>;
}
