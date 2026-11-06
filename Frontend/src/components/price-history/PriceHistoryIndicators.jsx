import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  compareHistoryPrices, exactPriceText, priceHistoryMethod, priceHistoryStatus,
} from '@/services/price-history/priceHistory.utils';

const STATUS_LABELS = {
  APPLIED: 'Applied',
  CONFIRMED: 'Confirmed',
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
  ORPHANED: 'Orphaned',
};

const STATUS_DESCRIPTIONS = {
  APPLIED: 'Price update applied',
  CONFIRMED: 'Price update confirmed on-chain',
  PENDING: 'Price update pending',
  SUBMITTED: 'Price update submitted; awaiting confirmation',
  CANCELLED: 'Price update request was cancelled',
  EXPIRED: 'Price update request expired before confirmation',
  FAILED: 'Price update failed',
  ORPHANED: 'Price update needs reconciliation',
};

export function PriceHistoryMethodChip({ row, onchain = false }) {
  // Public indexed events have no bot metadata. Per the backend contract,
  // show the Manual display category without claiming the signer is known.
  const method = onchain ? 'Manual' : priceHistoryMethod(row);
  const kind = method === 'Manual' ? 'manual'
    : method === 'Automated (bot)' ? 'automated' : 'unknown';
  return (
    <span className={`price-history-chip price-history-method price-history-method--${kind}`} title={onchain ? 'Historical on-chain update classified as Manual; this does not prove who signed it' : method === '—' ? 'Update method is not available' : method}>
      {method}
    </span>
  );
}

export function PriceHistoryStatusChip({ status }) {
  const detail = priceHistoryStatus(status);
  const code = detail.text;
  const label = STATUS_LABELS[code] || 'Unknown';
  return (
    <span className={`price-history-chip price-history-status price-history-status--${detail.tone}`} title={STATUS_DESCRIPTIONS[code] || 'Update status not available'}>
      {label}
    </span>
  );
}

// Keep full precision: rounded values can look equal even when the actual price changed.
export function PriceHistoryChangeIndicator({ previous, current, status }) {
  // Only completed on-chain transactions should display a price direction.
  // Pending, cancelled, expired, failed, orphaned, and database-only updates
  // retain their price values without suggesting a confirmed change.
  if (priceHistoryStatus(status).text !== 'CONFIRMED') return null;
  if (exactPriceText(previous) === '—' || exactPriceText(current) === '—') return null;
  const direction = compareHistoryPrices(current, previous);
  if (direction === 0) return null;
  const rising = direction > 0;
  const Icon = rising ? ArrowUp : ArrowDown;
  const description = `Price ${rising ? 'increased' : 'decreased'} from ${exactPriceText(previous)} to ${exactPriceText(current)}`;
  return (
    <span className={`price-history-direction price-history-direction--${rising ? 'up' : 'down'}`} role="img" aria-label={description} title={description}>
      <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
    </span>
  );
}
