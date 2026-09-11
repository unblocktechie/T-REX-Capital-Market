import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { shortenWalletAddress } from '@/utils/wallet';

const copyFallback = (value) => {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy command was not available.');
};

export function CompactAddress({
  value,
  label = 'Wallet address',
  leading = 5,
  trailing = 5,
  className,
  href = '',
  linkLabel = '',
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  if (!value) return null;

  const handleCopy = async (event) => {
    event.stopPropagation();
    try {
      let completed = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          completed = true;
        } catch {
          completed = false;
        }
      }
      if (!completed) copyFallback(value);
      setCopied(true);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const shortenedValue = shortenWalletAddress(value, leading, trailing);
  const resolvedLinkLabel = linkLabel || `View ${label.toLowerCase()} on block explorer`;

  return (
    <span className={cn('compact-address', href && 'compact-address--linked', className)}>
      {href ? (
        <a
          className="compact-address__value compact-address__value--link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${resolvedLinkLabel}: ${value}`}
          title={resolvedLinkLabel}
        >
          <span className="compact-address__text">{shortenedValue}</span>
          <span className="compact-address__external" aria-hidden="true">
            <ExternalLink size={14} strokeWidth={2} />
          </span>
        </a>
      ) : (
        <span
          className="compact-address__value"
          aria-label={`${label}: ${value}`}
        >
          {shortenedValue}
        </span>
      )}
      <button
        type="button"
        className="compact-address__copy"
        aria-label={`Copy ${label.toLowerCase()}`}
        title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
        onClick={handleCopy}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}
