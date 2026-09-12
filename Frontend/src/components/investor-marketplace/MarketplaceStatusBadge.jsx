import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { MARKETPLACE_STATUS, MARKETPLACE_STATUS_META } from '@/services/investor/investorMarketplaceLocalService';

export function MarketplaceStatusBadge({ status, compact = false, className }) {
  const meta = MARKETPLACE_STATUS_META[status] || MARKETPLACE_STATUS_META[MARKETPLACE_STATUS.NOT_APPLIED];

  return (
    <AppStatusBadge
      status={status}
      label={meta.label}
      tone={meta.tone || 'neutral'}
      compact={compact}
      className={className}
    />
  );
}
