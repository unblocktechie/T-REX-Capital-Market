import {
  BadgeCheck,
  ExternalLink,
  Fingerprint,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { tokenApi } from '@/api/tokens';
import {
  AddressDisplay,
  InfoCallout,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { formatNumber } from '@/utils/tokenIssuance';

export default function TokenDetailsPage() {
  const { tokenAddress } = useParams();
  const storedResult = useTokenIssuanceStore((state) => state.deployment.result);
  const tokenInformation = useTokenIssuanceStore((state) => state.tokenInformation);
  const identityClaims = useTokenIssuanceStore((state) => state.identityClaims);
  const compliance = useTokenIssuanceStore((state) => state.compliance);
  const agents = useTokenIssuanceStore((state) => state.agents);
  const hasStored =
    storedResult?.tokenAddress?.toLowerCase() === tokenAddress?.toLowerCase();
  const query = useQuery({
    queryKey: ['token-details', tokenAddress],
    queryFn: () => tokenApi.getDetails(tokenAddress),
    enabled: Boolean(tokenAddress && !hasStored),
    retry: 1,
  });
  const result = hasStored ? storedResult : query.data;
  const name = result?.tokenName || result?.name || tokenInformation.name || 'Security token';
  const symbol = result?.symbol || tokenInformation.symbol || '—';
  const explorerBase = result?.explorerUrl?.replace(/\/$/, '');
  const addressExplorer = (address) =>
    explorerBase && address ? `${explorerBase}/address/${address}` : undefined;
  const ownerAddress =
    result?.ownerAddress ||
    result?.owner ||
    agents.tokenAgent?.address ||
    tokenInformation.treasuryWallet ||
    '';
  const onchainIdAddress =
    result?.onchainIdAddress ||
    result?.onchainIDAddress ||
    result?.onchainId?.address ||
    '';
  const kyc = identityClaims.claimTopics.find((topic) => topic.id === 'kyc');
  const accredited = identityClaims.claimTopics.find((topic) => topic.id === 'accredited');
  useDocumentTitle(name);

  if (query.isLoading) {
    return (
      <div className="token-details-skeleton">
        <Skeleton height={180} />
        <div className="module-stat-grid">
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
        <Skeleton height={440} />
      </div>
    );
  }

  if (!result && query.isError) {
    return (
      <div className="deployment-page">
        <section className="deployment-card">
          <InfoCallout title="Token details unavailable" tone="warning">
            The token deployment record could not be loaded. Confirm that the token-details
            backend endpoint is available and try again.
          </InfoCallout>
          <AddressDisplay label="Requested token address" address={tokenAddress} />
        </section>
      </div>
    );
  }

  return (
    <div className="token-details-page">
      <header className="token-details-header">
        <div className="token-details-breadcrumb">Token projects / Token details</div>
        <div className="token-details-header__identity">
          <span className="token-details-header__icon">
            <BadgeCheck size={24} />
          </span>
          <div>
            <span className="eyebrow">ERC-3643 token</span>
            <h1>{name}</h1>
            <p>
              {symbol} · {result?.network || tokenInformation.network || 'Network unavailable'}
            </p>
          </div>
        </div>
        <div className="token-details-header__actions">
          <StatusBadge status="valid">Active</StatusBadge>
          {addressExplorer(tokenAddress) ? (
            <a
              className="button button--secondary"
              href={addressExplorer(tokenAddress)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} /> Share Explorer
            </a>
          ) : null}
        </div>
        <AddressDisplay
          className="token-details-header__address"
          label="Token contract"
          address={tokenAddress}
          explorerUrl={addressExplorer(tokenAddress)}
        />
      </header>

      <section className="token-summary-grid">
        {[
          ['Token Name', name, BadgeCheck],
          ['Symbol', symbol, BadgeCheck],
          ['Decimals', tokenInformation.decimals || result?.decimals || '—', BadgeCheck],
          ['Owner Address', ownerAddress || '—', WalletCards],
        ].map(([label, value, Icon]) => (
          <article key={label}>
            <span>
              <Icon size={17} />
            </span>
            <small>{label}</small>
            <strong title={String(value)}>{value}</strong>
          </article>
        ))}
      </section>

      <div className="token-details-content">
        <section className="issuance-section-card">
          <header className="issuance-section-card__header">
            <div>
              <h2>Identity Registry</h2>
              <p>Identity infrastructure used to verify investor transfer eligibility.</p>
            </div>
            <Fingerprint size={20} />
          </header>
          <div className="issuance-section-card__body deployment-address-list">
            <AddressDisplay
              label="Identity Registry Address"
              address={result?.identityRegistryAddress}
              explorerUrl={addressExplorer(result?.identityRegistryAddress)}
            />
            <AddressDisplay
              label="Identity Registry Storage Address"
              address={result?.identityRegistryStorageAddress}
              explorerUrl={addressExplorer(result?.identityRegistryStorageAddress)}
            />
            {onchainIdAddress ? (
              <AddressDisplay
                label="ONCHAINID Address"
                address={onchainIdAddress}
                explorerUrl={addressExplorer(onchainIdAddress)}
              />
            ) : (
              <div className="token-details-status-list">
                <div>
                  <span>ONCHAINID Status</span>
                  <StatusBadge
                    status={result?.identityRegistryAddress ? 'valid' : 'pending'}
                  >
                    {result?.identityRegistryAddress ? 'Integrated' : 'Unavailable'}
                  </StatusBadge>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="issuance-section-card">
          <header className="issuance-section-card__header">
            <div>
              <h2>Management Agents</h2>
              <p>Operational wallets assigned during token deployment.</p>
            </div>
            <UsersRound size={20} />
          </header>
          <div className="issuance-section-card__body deployment-address-list">
            <AddressDisplay
              label="Identity Registry Agent"
              address={agents.identityRegistryAgent?.address}
            />
            <AddressDisplay label="Token Agent" address={agents.tokenAgent?.address} />
            <div className="issuance-review-tags">
              <span>Identity Manager</span>
              <span>Token Operations</span>
            </div>
          </div>
        </section>

        <section className="issuance-section-card">
          <header className="issuance-section-card__header">
            <div>
              <h2>Claim Topics</h2>
              <p>Claims used to determine whether an investor is eligible.</p>
            </div>
            <Fingerprint size={20} />
          </header>
          <div className="issuance-section-card__body">
            <div className="token-details-status-list">
              <div>
                <span>KYC</span>
                <StatusBadge status={kyc?.enabled ? 'valid' : 'pending'}>
                  {kyc?.enabled ? 'Enabled' : 'Disabled'}
                </StatusBadge>
              </div>
              <div>
                <span>Accredited Investor</span>
                <StatusBadge status={accredited?.enabled ? 'valid' : 'pending'}>
                  {accredited?.enabled ? 'Enabled' : 'Disabled'}
                </StatusBadge>
              </div>
            </div>
            <AddressDisplay
              label="Primary Trusted Claim Issuer"
              address={identityClaims.trustedIssuer.address}
            />
          </div>
        </section>

        <section className="issuance-section-card">
          <header className="issuance-section-card__header">
            <div>
              <h2>Compliance Modules</h2>
              <p>Current investor and jurisdiction restrictions.</p>
            </div>
            <ShieldCheck size={20} />
          </header>
          <div className="issuance-section-card__body token-details-status-list">
            <div>
              <span>Max Investors</span>
              <strong>
                {compliance.maximumInvestors
                  ? formatNumber(compliance.maximumInvestors)
                  : '—'}
              </strong>
            </div>
            <div>
              <span>Max Balance</span>
              <strong>
                {compliance.maximumBalance ? formatNumber(compliance.maximumBalance) : '—'}
              </strong>
            </div>
            <div>
              <span>Country Restrictions</span>
              <strong>
                {compliance.countries.length ? compliance.countries.join(', ') : 'None'}
              </strong>
            </div>
            <div>
              <span>Module Status</span>
              <StatusBadge status="valid">Active</StatusBadge>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
