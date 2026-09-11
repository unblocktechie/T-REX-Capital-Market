import {
  ArrowRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Coins,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { CountryFlagIcon } from '@/components/common/CountryFlagIcon';
import { MarketplaceStatusBadge } from './MarketplaceStatusBadge';
import { useMarketplaceTokenImageUrl } from './MarketplaceTokenImage';
import { MARKETPLACE_STATUS } from '@/services/investor/investorMarketplaceLocalService';

const STATUS_ACTION = Object.freeze({
  [MARKETPLACE_STATUS.NOT_APPLIED]: 'Submit Interest',
  [MARKETPLACE_STATUS.ACTION_REQUIRED]: 'Complete Documents',
  [MARKETPLACE_STATUS.CLAIM_REQUIRED]: 'Submit Claim',
  [MARKETPLACE_STATUS.CLAIMS_SUBMITTED]: 'View Application',
  [MARKETPLACE_STATUS.PENDING_REVIEW]: 'Review Application',
  [MARKETPLACE_STATUS.APPROVED]: 'View Approval',
  [MARKETPLACE_STATUS.VERIFIED_HOLDER]: 'View Holding',
  [MARKETPLACE_STATUS.READY_TO_INVEST]: 'Invest',
  [MARKETPLACE_STATUS.REJECTED]: 'View Details',
  [MARKETPLACE_STATUS.CANCELLED]: 'View Details',
});

const STATUS_ICON = Object.freeze({
  [MARKETPLACE_STATUS.NOT_APPLIED]: Coins,
  [MARKETPLACE_STATUS.ACTION_REQUIRED]: CircleAlert,
  [MARKETPLACE_STATUS.CLAIM_REQUIRED]: CircleAlert,
  [MARKETPLACE_STATUS.CLAIMS_SUBMITTED]: Clock3,
  [MARKETPLACE_STATUS.PENDING_REVIEW]: ClipboardCheck,
  [MARKETPLACE_STATUS.APPROVED]: ShieldCheck,
  [MARKETPLACE_STATUS.VERIFIED_HOLDER]: ShieldCheck,
  [MARKETPLACE_STATUS.READY_TO_INVEST]: Coins,
  [MARKETPLACE_STATUS.REJECTED]: CircleAlert,
  [MARKETPLACE_STATUS.CANCELLED]: Clock3,
});

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');


const normalizeApplicationStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (['pending', 'pending_review', 'under_review'].includes(status)) return MARKETPLACE_STATUS.PENDING_REVIEW;
  if (['approved', 'final_approval'].includes(status)) return MARKETPLACE_STATUS.APPROVED;
  if (['rejected', 'declined'].includes(status)) return MARKETPLACE_STATUS.REJECTED;
  if (status === 'cancelled') return MARKETPLACE_STATUS.CANCELLED;
  if (['verifiedbyissuer', 'verified_by_issuer', 'verified-by-issuer', 'claim_required', 'verified'].includes(status)) return MARKETPLACE_STATUS.CLAIM_REQUIRED;
  if (['claimsubmitted', 'claim_submitted', 'claim-submitted'].includes(status)) return MARKETPLACE_STATUS.CLAIMS_SUBMITTED;
  if (['action_required', 'documents_required'].includes(status)) return MARKETPLACE_STATUS.ACTION_REQUIRED;
  if (status === 'verified_holder') return MARKETPLACE_STATUS.VERIFIED_HOLDER;
  if (['registered', 'ready_to_invest', 'ready-to-invest'].includes(status)) return MARKETPLACE_STATUS.READY_TO_INVEST;
  return MARKETPLACE_STATUS.NOT_APPLIED;
};

const numericValue = (...values) => {
  const value = firstValue(...values);
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const moneyLabel = (value, currency) => {
  if (value == null) return '—';
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })}${currency ? ` ${currency}` : ''}`;
};

const deriveAccentHue = (token) => {
  const source = String(token?.symbol || token?.tokenSymbol || token?.id || token?.tokenUid || 'token');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
};

const normalizeCardData = (token = {}) => {
  const nestedToken = token.token || token.tokenSummary || {};
  const symbol = String(firstValue(token.symbol, token.tokenSymbol, nestedToken.symbol, nestedToken.tokenSymbol, '—')).toUpperCase();
  const name = firstValue(token.name, token.tokenName, nestedToken.name, nestedToken.tokenName, '—');
  const owner = firstValue(
    token.legalCompanyName,
    token.organizationName,
    token.organization?.legalCompanyName,
    token.organization?.organizationName,
    token.issuer,
    token.company,
    nestedToken.legalCompanyName,
    nestedToken.organizationName,
    nestedToken.organization?.legalCompanyName,
    nestedToken.organization?.organizationName,
    nestedToken.issuer,
  );
  const price = numericValue(token.currentTokenPrice, token.currentPrice, token.price, nestedToken.currentTokenPrice, nestedToken.currentPrice, nestedToken.price, token.initialTokenPrice, token.initialPrice, nestedToken.initialTokenPrice);
  const maxHolders = numericValue(
    token.maxHolders,
    token.maxInvestors,
    token.maximumHolders,
    token.maximumInvestors,
    nestedToken.maxHolders,
    nestedToken.maxInvestors,
  );
  const maxBalance = numericValue(
    token.maxBalancePerInvestor,
    token.maxBalance,
    nestedToken.maxBalancePerInvestor,
    nestedToken.maxBalance,
  );

  return {
    symbol,
    name,
    owner: owner || '—',
    price,
    maxHolders,
    maxBalance,
    countryName: firstValue(
      token.organizationCountryName,
      token.country,
      token.organization?.organizationCountryName,
      nestedToken.organizationCountryName,
      nestedToken.organization?.organizationCountryName,
      nestedToken.country,
      '—',
    ),
    countryCode: firstValue(
      token.organizationCountryCode,
      token.countryCode,
      token.organization?.organizationCountryCode,
      nestedToken.organizationCountryCode,
      nestedToken.organization?.organizationCountryCode,
      nestedToken.countryCode,
      '',
    ),
    currency: String(firstValue(token.currency, nestedToken.currency, 'USDT')).toUpperCase(),
    standard: firstValue(token.standard, token.tokenStandard, nestedToken.standard, 'ERC-3643'),
    status: normalizeApplicationStatus(firstValue(token.applicationStatus, token.interest?.status, token.status)),
  };
};

/**
 * Reusable, data-driven token/application card.
 * The parent owns grid sizing and the navigation handlers.
 */
export function TokenApplicationCard({
  token,
  onReviewApplication,
  onViewTokenDetails,
  primaryActionLabel,
  className = '',
}) {
  const card = normalizeCardData(token);
  const imageUrl = useMarketplaceTokenImageUrl(token);
  const StatusIcon = STATUS_ICON[card.status] || LockKeyhole;
  const accentHue = deriveAccentHue(token);
  const maxBalanceMetric = {
    label: 'Max Balance / Holder',
    value: card.maxBalance == null ? '—' : card.maxBalance.toLocaleString(),
    icon: Landmark,
  };
  const maxHoldersMetric = {
    label: 'Max Holders',
    value: card.maxHolders == null ? '—' : card.maxHolders.toLocaleString(),
    icon: UsersRound,
  };
  const MaxBalanceIcon = maxBalanceMetric.icon;
  const MaxHoldersIcon = maxHoldersMetric.icon;
  const reviewLabel = primaryActionLabel || STATUS_ACTION[card.status] || 'Review Application';

  const review = () => onReviewApplication?.(token);
  const viewDetails = () => onViewTokenDetails?.(token);

  return (
    <article
      className={`token-application-card ${className}`.trim()}
      style={{ '--token-card-accent-hue': accentHue }}
    >
      <div className="token-application-card__content">
        <header className="token-application-card__header">
          <div className="token-application-card__identity">
            <span className="token-application-card__image" aria-hidden="true">
              {imageUrl ? <img src={imageUrl} alt={`${card.symbol} token`} /> : <ShieldCheck size={24} aria-hidden="true" />}
            </span>
            <div className="token-application-card__identity-copy">
              <strong className="token-application-card__symbol">{card.symbol}</strong>
              <h2 title={String(card.name)}>{card.name}</h2>
              <p title={String(card.owner)}>{card.owner}</p>
            </div>
          </div>

          <div className="token-application-card__badges">
            <span className="token-application-card__standard"><ShieldCheck size={13} /> {card.standard}</span>
            <MarketplaceStatusBadge status={card.status} compact />
          </div>
        </header>

        <div className="token-application-card__grid" aria-label={`${card.symbol} investment summary`}>
          {imageUrl ? (
            <div className="token-application-card__watermark" aria-hidden="true">
              <img src={imageUrl} alt="" />
            </div>
          ) : null}
          <div className="token-application-card__metric token-application-card__metric--primary token-application-card__metric--top-left">
            <span>Current Price</span>
            <strong><Coins size={19} /> {moneyLabel(card.price, card.currency)}</strong>
          </div>
          <div className="token-application-card__metric token-application-card__metric--primary token-application-card__metric--top-right">
            <span>{maxBalanceMetric.label}</span>
            <strong><MaxBalanceIcon size={19} /> {maxBalanceMetric.value}</strong>
          </div>
          <div className="token-application-card__metric token-application-card__metric--bottom-left">
            <span>Country</span>
            <strong className="token-application-card__country">
              <CountryFlagIcon countryCode={card.countryCode} countryName={card.countryName} />
              <em>{card.countryName}</em>
            </strong>
          </div>
          <div className="token-application-card__metric token-application-card__metric--bottom-right">
            <span>{maxHoldersMetric.label}</span>
            <strong><MaxHoldersIcon size={19} /> {maxHoldersMetric.value}</strong>
          </div>
        </div>

        <div className="token-application-card__actions">
          <button type="button" className="token-application-card__primary" onClick={review}>
            <span><StatusIcon size={18} /> {reviewLabel}</span>
            <ArrowRight size={19} />
          </button>
          <button type="button" className="token-application-card__secondary" onClick={viewDetails}>
            <span>View Token Details</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
