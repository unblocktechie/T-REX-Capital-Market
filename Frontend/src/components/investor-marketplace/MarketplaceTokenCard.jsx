import { TokenApplicationCard } from './TokenApplicationCard';

export function MarketplaceTokenCard({ token, onOpen }) {
  return (
    <TokenApplicationCard
      token={token}
      onReviewApplication={onOpen}
      onViewTokenDetails={onOpen}
    />
  );
}
