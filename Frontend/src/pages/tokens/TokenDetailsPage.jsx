import {
  BadgeCheck,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Landmark,
  Network,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  AddressDisplay,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useTokenDashboardData } from '@/hooks/useTokenDashboardData';
import { formatMoney, formatNumber } from '@/utils/tokenIssuance';
import { getDeploymentTransactionHash } from '@/utils/transactionHash';
import { shortenWalletAddress } from '@/utils/wallet';

const firstText = (...values) =>
  String(values.find((value) => value !== undefined && value !== null) || '').trim();

const rawAddress = (raw, ...keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], raw);
    if (value) return String(value);
  }
  return '';
};

function DetailMetric({ icon: Icon, label, value, mono = false, titleValue }) {
  return (
    <article className="token-dashboard-metric">
      <span className="token-dashboard-metric__icon"><Icon size={20} /></span>
      <div>
        <small>{label}</small>
        <strong
          className={mono ? 'token-dashboard-metric__mono' : undefined}
          title={String(titleValue || value)}
        >
          {value || '—'}
        </strong>
      </div>
    </article>
  );
}

function SettingRow({ label, value, status }) {
  return (
    <div className="token-dashboard-setting-row">
      <span>{label}</span>
      <div>
        <strong>{value || '—'}</strong>
        {status ? <StatusBadge status="valid">{status}</StatusBadge> : null}
      </div>
    </div>
  );
}

export default function TokenDetailsPage() {
  const navigate = useNavigate();
  const { tokenAddress: routeTokenId } = useParams();
  const token = useTokenDashboardData();
  const { organization } = useOrganization();
  const mapped = token.mapped || {};
  const information = mapped.tokenInformation || {};
  const identityClaims = mapped.identityClaims || { claimTopics: [], trustedIssuer: {} };
  const compliance = mapped.compliance || { countries: [] };
  const agents = mapped.agents || {};
  const raw = token.token || {};
  const tokenName = information.name || firstText(raw.tokenName, raw.name) || 'Security Token';
  const symbol = information.symbol || firstText(raw.tokenSymbol, raw.symbol).toUpperCase() || 'TOKEN';
  useDocumentTitle(tokenName);

  if (token.isLoading) {
    return (
      <div className="token-details-skeleton">
        <Skeleton height={230} />
        <div className="module-stat-grid">
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
        <Skeleton height={520} />
      </div>
    );
  }

  if (!token.hasToken) {
    return <Navigate to={ROUTES.createToken} replace />;
  }

  if (token.isDeploymentPending) {
    return <Navigate to={ROUTES.tokenDeploying} replace />;
  }

  if (token.isReadyToDeploy || token.isDeploymentFailed) {
    return <Navigate to={ROUTES.tokenIssuanceStep('review')} replace />;
  }

  if (!token.isDeployed) {
    return <Navigate to={ROUTES.createToken} replace />;
  }

  if (token.tokenUid && routeTokenId && routeTokenId !== token.tokenUid) {
    return <Navigate to={ROUTES.tokenDetails(token.tokenUid)} replace />;
  }

  const network =
    firstText(raw.network, raw.networkName, information.network) ||
    web3Config.requiredChain.name;
  const explorerBase = web3Config.requiredChain.blockExplorers?.default?.url || '';
  const ownerAddress = information.treasuryWallet || organization.walletAddress || '';
  const organizationOnchainId = organization.contractAddress || '';
  const tokenContractAddress = rawAddress(
    raw,
    'tokenAddress',
    'contractAddress',
    'proxyAddress',
    'contracts.token',
    'deployment.contracts.token',
    'deployment.tokenAddress',
    'deployment.contractAddress',
  );
  const identityRegistryAddress = rawAddress(
    raw,
    'identityRegistryAddress',
    'contracts.ir',
    'contracts.identityRegistryAddress',
    'deployment.contracts.ir',
    'deployment.identityRegistryAddress',
  );
  const identityRegistryStorageAddress = rawAddress(
    raw,
    'identityRegistryStorageAddress',
    'contracts.irs',
    'contracts.identityRegistryStorageAddress',
    'deployment.contracts.irs',
    'deployment.identityRegistryStorageAddress',
  );
  // The token overview never renders the transaction hash itself. The backend's
  // confirmed deployTxHash is used only to build the block-explorer destination
  // for the View Transaction action. Legacy response keys remain supported by
  // the shared resolver so older records keep working.
  const transactionHash = getDeploymentTransactionHash(raw);
  const transactionExplorer = transactionHash && explorerBase
    ? `${explorerBase}/tx/${transactionHash}`
    : undefined;
  const tokenExplorer = tokenContractAddress && explorerBase
    ? `${explorerBase}/address/${tokenContractAddress}`
    : undefined;
  const enabledClaims = (identityClaims.claimTopics || []).filter((topic) => topic.enabled);
  const countryNames = (compliance.countries || [])
    .map((country) => country?.countryName || country?.label || String(country || ''))
    .filter(Boolean);
  const displayStatus = token.isDeployed ? 'Deployed' : 'Ready to Deploy';
  const initialPrice = mapped.supplyPricing?.initialPrice;

  return (
    <div className="token-details-page token-dashboard-page">
      <header className="token-dashboard-header">
        <div className="token-dashboard-header__identity">
          <span className="token-dashboard-logo">
            {information.logo?.dataUrl ? (
              <img src={information.logo.dataUrl} alt={`${tokenName} logo`} />
            ) : (
              <BadgeCheck size={28} />
            )}
          </span>
          <div>
            <span className="eyebrow">ERC-3643 security token</span>
            <h1>{tokenName} <span>({symbol})</span></h1>
            <div className="token-dashboard-header__status">
              <StatusBadge status="valid">{displayStatus}</StatusBadge>
              <span><Network size={16} /> {network}</span>
            </div>
          </div>
        </div>
        <div className="token-dashboard-header__actions">
          <Button
            variant="secondary"
            icon={ExternalLink}
            onClick={() => window.open(transactionExplorer, '_blank', 'noopener,noreferrer')}
            disabled={!transactionExplorer}
          >
            View Transaction
          </Button>
        </div>
        <p className="token-dashboard-header__description">
          {information.description ||
            'Review the token identity, governance agents, enabled claims and compliance rules from one secure dashboard.'}
        </p>
        <div className="token-dashboard-header__deployment-meta">
          <AddressDisplay
            label="Token contract"
            address={tokenContractAddress}
            emptyLabel="Token contract not recorded"
            explorerUrl={tokenExplorer}
            showFullAddress
            className="token-dashboard-header__contract"
          />
          <div className="token-dashboard-header__price">
            <small>Token price</small>
            <strong>{initialPrice ? formatMoney(initialPrice, 'USDT') : '—'}</strong>
          </div>
        </div>
      </header>

      <section className="token-dashboard-metrics" aria-label="Token summary">
        <DetailMetric icon={FileCheck2} label="Token Name" value={tokenName} />
        <DetailMetric icon={BadgeCheck} label="Symbol" value={symbol} />
        <DetailMetric icon={CircleDollarSign} label="Decimals" value={information.decimals || '18'} />
        <DetailMetric
          icon={WalletCards}
          label="Treasury Wallet"
          value={shortenWalletAddress(ownerAddress, 5, 5)}
          titleValue={ownerAddress}
          mono
        />
      </section>

      <div className="token-dashboard-grid">
        <section className="token-dashboard-card">
          <header>
            <div><Fingerprint size={20} /><h2>Identity Registry</h2></div>
            <StatusBadge status="valid">Configured</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-addresses">
            <AddressDisplay
              label="Organization ONCHAINID"
              address={organizationOnchainId}
              emptyLabel="Pending organization identity address"
              explorerUrl={
                organizationOnchainId && explorerBase
                  ? `${explorerBase}/address/${organizationOnchainId}`
                  : undefined
              }
              showFullAddress
            />
            <AddressDisplay
              label="Identity Registry"
              address={identityRegistryAddress}
              emptyLabel="Token contract not recorded"
              explorerUrl={
                identityRegistryAddress && explorerBase
                  ? `${explorerBase}/address/${identityRegistryAddress}`
                  : undefined
              }
              showFullAddress
            />
            <AddressDisplay
              label="Identity Registry Storage"
              address={identityRegistryStorageAddress}
              emptyLabel="Token contract not recorded"
              explorerUrl={
                identityRegistryStorageAddress && explorerBase
                  ? `${explorerBase}/address/${identityRegistryStorageAddress}`
                  : undefined
              }
              showFullAddress
            />
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><UsersRound size={20} /><h2>Management Agents</h2></div>
            <StatusBadge status="valid">Prepared</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-addresses">
            <AddressDisplay
              label="Identity Manager"
              address={agents.identityRegistryAgent?.address}
              emptyLabel="Not assigned"
              showFullAddress
            />
            <AddressDisplay
              label="Token Agent"
              address={agents.tokenAgent?.address}
              emptyLabel="Not assigned"
              showFullAddress
            />
            <div className="token-dashboard-permissions">
              <span>Identity management</span>
              <span>Mint</span>
              <span>Burn</span>
              <span>Freeze</span>
            </div>
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Fingerprint size={20} /><h2>Claim Topics</h2></div>
            <StatusBadge status="valid">{enabledClaims.length} enabled</StatusBadge>
          </header>
          <div className="token-dashboard-card__body">
            {enabledClaims.length ? (
              <div className="token-dashboard-claim-grid">
                {enabledClaims.map((topic) => (
                  <article key={topic.claimTopicUid || topic.id}>
                    <ShieldCheck size={18} />
                    <div>
                      <strong>{topic.shortName || topic.name}</strong>
                      <p>{topic.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="token-dashboard-empty">No claim topics were returned by the backend.</p>
            )}
            <AddressDisplay
              label="Primary Trusted Claim Issuer"
              address={identityClaims.trustedIssuer?.address || ownerAddress}
              emptyLabel="Not configured"
              showFullAddress
            />
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Landmark size={20} /><h2>Compliance Modules</h2></div>
            <StatusBadge status="valid">Active</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-settings">
            <SettingRow
              label="Max Investors"
              value={
                compliance.maximumInvestors
                  ? formatNumber(compliance.maximumInvestors)
                  : 'Unlimited'
              }
              status="Active"
            />
            <SettingRow
              label="Max Balance per Investor"
              value={
                compliance.maximumBalance
                  ? formatNumber(compliance.maximumBalance)
                  : 'Unlimited'
              }
              status="Active"
            />
            <SettingRow
              label="Country Restriction"
              value={countryNames.length ? `${countryNames.length} restricted` : 'No restrictions'}
              status="Active"
            />
            {countryNames.length ? (
              <div className="token-dashboard-country-list" aria-label="Restricted countries">
                {countryNames.map((country) => <span key={country}>{country}</span>)}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="token-dashboard-footer">
        <div>
          <strong>Your token configuration is locked.</strong>
          <p>Create-token pages are no longer available after final validation.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate(ROUTES.dashboard)}>
          Return to Dashboard
        </Button>
      </footer>
    </div>
  );
}
