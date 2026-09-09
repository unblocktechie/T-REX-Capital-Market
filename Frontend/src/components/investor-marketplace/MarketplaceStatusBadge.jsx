import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { MARKETPLACE_STATUS, MARKETPLACE_STATUS_META } from '@/services/investor/investorMarketplaceLocalService';

export function MarketplaceStatusBadge({ status, compact = false, className }) {
  const meta = MARKETPLACE_STATUS_META[status] || MARKETPLACE_STATUS_META[MARKETPLACE_STATUS.NOT_APPLIED];
  const tone = status === MARKETPLACE_STATUS.PENDING_REVIEW
    ? 'pending'
    : [MARKETPLACE_STATUS.ACTION_REQUIRED, MARKETPLACE_STATUS.CLAIM_REQUIRED].includes(status)
      ? 'warning'
      : status === MARKETPLACE_STATUS.REJECTED
        ? 'danger'
        : [MARKETPLACE_STATUS.APPROVED, MARKETPLACE_STATUS.VERIFIED_HOLDER].includes(status)
          ? 'success'
          : 'neutral';

  return (
    <AppStatusBadge
      status={status}
      label={meta.label}
      tone={tone}
      compact={compact}
      className={className}
    />
  );
}
