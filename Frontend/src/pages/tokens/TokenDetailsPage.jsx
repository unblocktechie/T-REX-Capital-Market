import {
  BadgeCheck,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Landmark,
  Network,
  PencilLine,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AddressDisplay,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useTokenDashboardData } from '@/hooks/useTokenDashboardData';
import { getTokenRecordUid, myTokenQueryKey } from '@/hooks/useMyToken';
import { formatMoney, formatNumber } from '@/utils/tokenIssuance';
import { getErrorMessage } from '@/utils/error';
import { tokenPriceChange, validateCurrentTokenPrice } from '@/utils/tokenPrice';
import { getDeploymentTransactionHash } from '@/utils/transactionHash';
import { tokenApi } from '@/api/tokens';
import { shortenWalletAddress } from '@/utils/wallet';

const firstText = (...values) =>
  String(values.find((value) => value !== undefined && value !== null) || '').trim();

const formatTokenPrice = (value) => {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return value ? formatMoney(value, 'USDT') : '—';
  const whole = match[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0';
  const fraction = (match[2] || '').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} USDT`;
};

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
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [priceError, setPriceError] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);
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
  const displayStatus = token.isDeployed ? 'Created' : 'Ready to Create';
  const initialPrice = mapped.supplyPricing?.initialPrice;
  const currentPrice = mapped.supplyPricing?.currentPrice || initialPrice;
  const priceValidationError = newPrice ? validateCurrentTokenPrice(newPrice) : '';
  const priceChange = !priceValidationError && newPrice
    ? tokenPriceChange(currentPrice, newPrice)
    : null;
  const priceUnchanged = priceChange?.direction === 'unchanged';

  const openPriceEditor = () => {
    setNewPrice(String(currentPrice || ''));
    setPriceError('');
    setPriceEditorOpen(true);
  };

  const closePriceEditor = () => {
    if (updatingPrice) return;
    setPriceEditorOpen(false);
    setPriceError('');
  };

  const handlePriceUpdate = async () => {
    const validationError = validateCurrentTokenPrice(newPrice);
    if (validationError) {
      setPriceError(validationError);
      return;
    }
    if (tokenPriceChange(currentPrice, newPrice)?.direction === 'unchanged') {
      setPriceError('Enter a price different from the current price.');
      return;
    }

    setUpdatingPrice(true);
    setPriceError('');
    try {
      const updatedToken = await tokenApi.updateCurrentPrice(newPrice);
      const responseToken = updatedToken?.token && typeof updatedToken.token === 'object'
        ? updatedToken.token
        : updatedToken;
      const nextToken = getTokenRecordUid(responseToken)
        ? responseToken
        : {
            ...raw,
            ...(responseToken && typeof responseToken === 'object' ? responseToken : {}),
            currentTokenPrice: String(newPrice).trim(),
            tokenInformation: {
              ...(raw?.tokenInformation || raw?.information || {}),
              ...(responseToken?.tokenInformation || responseToken?.information || {}),
              currentTokenPrice: String(newPrice).trim(),
            },
          };
      queryClient.setQueryData(myTokenQueryKey(token.userKey), nextToken);
      setPriceEditorOpen(false);
      toast.success('Current price updated', {
        description: `${tokenName} now uses ${formatTokenPrice(newPrice)} as its current trading price.`,
      });
    } catch (error) {
      setPriceError(getErrorMessage(error, 'The current price could not be updated. Please try again.'));
    } finally {
      setUpdatingPrice(false);
    }
  };

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
            <span className="eyebrow">Security token · ERC-3643</span>
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
            'Review investor access, platform permissions, verification requirements and transfer rules from one place.'}
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
          <div className="token-dashboard-header__price token-dashboard-header__price--editable">
            <div className="token-dashboard-header__price-label">
              <small>Current price</small>
              <button type="button" onClick={openPriceEditor} aria-label="Edit current token price">
                <PencilLine size={15} /> Edit
              </button>
            </div>
            <strong>{formatTokenPrice(currentPrice)}</strong>
            <span>Initial price {formatTokenPrice(initialPrice)}</span>
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
            <div><Fingerprint size={20} /><h2>Approved Investor System</h2></div>
            <StatusBadge status="valid">Configured</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-addresses">
            <AddressDisplay
              label="Organization On-chain Identity (ONCHAINID)"
              address={organizationOnchainId}
              emptyLabel="Pending organization on-chain identity"
              explorerUrl={
                organizationOnchainId && explorerBase
                  ? `${explorerBase}/address/${organizationOnchainId}`
                  : undefined
              }
              showFullAddress
            />
            <AddressDisplay
              label="Approved Investor List (Registry)"
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
              label="Technical Registry Storage"
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
            <div><UsersRound size={20} /><h2>Platform Permissions</h2></div>
            <StatusBadge status="valid">Prepared</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-addresses">
            <AddressDisplay
              label="Investor Verification Manager"
              address={agents.identityRegistryAgent?.address}
              emptyLabel="Not assigned"
              showFullAddress
            />
            <AddressDisplay
              label="Token Operations Wallet"
              address={agents.tokenAgent?.address}
              emptyLabel="Not assigned"
              showFullAddress
            />
            <div className="token-dashboard-permissions">
              <span>Investor approval</span>
              <span>Issue tokens</span>
              <span>Remove tokens</span>
              <span>Freeze</span>
            </div>
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Fingerprint size={20} /><h2>Verification Requirements</h2></div>
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
              <p className="token-dashboard-empty">No verification requirements are available for this token.</p>
            )}
            <AddressDisplay
              label="Verification Provider"
              address={identityClaims.trustedIssuer?.address || ownerAddress}
              emptyLabel="Not configured"
              showFullAddress
            />
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Landmark size={20} /><h2>Transfer Rules</h2></div>
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
          <strong>Your core token configuration is locked.</strong>
          <p>The launch configuration stays fixed after creation. You can continue updating the current trading price above.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate(ROUTES.dashboard)}>
          Return to Dashboard
        </Button>
      </footer>


      <Modal
        open={priceEditorOpen}
        onClose={closePriceEditor}
        title="Update current token price"
        trapFocus
        className="token-price-editor"
        footer={(
          <>
            <Button variant="secondary" onClick={closePriceEditor} disabled={updatingPrice}>Cancel</Button>
            <Button
              onClick={handlePriceUpdate}
              loading={updatingPrice}
              disabled={updatingPrice || Boolean(priceValidationError) || !newPrice || priceUnchanged}
            >
              Update Current Price
            </Button>
          </>
        )}
      >
        <div className="token-price-editor__intro">
          <p>Update the trading price investors will see for new purchases, redemptions and transfers. The initial launch price remains unchanged.</p>
        </div>
        <div className="token-price-editor__snapshot" aria-label="Token price comparison">
          <div><span>Initial Price</span><strong>{formatTokenPrice(initialPrice)}</strong><small>Fixed launch price</small></div>
          <div><span>Current Price</span><strong>{formatTokenPrice(currentPrice)}</strong><small>Price in use now</small></div>
        </div>
        <Input
          id="new-current-token-price"
          label="New Price"
          value={newPrice}
          onChange={(event) => {
            const value = event.target.value.replace(/,/g, '');
            if (value === '' || /^\d*(?:\.\d{0,18})?$/.test(value)) {
              setNewPrice(value);
              setPriceError('');
            }
          }}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Enter new price"
          trailing={<span className="token-price-editor__currency">USDT</span>}
          error={priceError || priceValidationError}
          hint="Enter a positive value with up to 18 decimal places."
          disabled={updatingPrice}
          required
        />
        <div className={`token-price-editor__change is-${priceChange?.direction || 'neutral'}`}>
          <span className="token-price-editor__change-icon">
            {priceChange?.direction === 'increase' ? <TrendingUp size={18} /> : priceChange?.direction === 'decrease' ? <TrendingDown size={18} /> : <CircleDollarSign size={18} />}
          </span>
          <div>
            <span>Price Change</span>
            <strong>
              {!priceChange
                ? 'Enter a new price to preview the change'
                : priceChange.direction === 'unchanged'
                  ? 'No change'
                  : `${priceChange.direction === 'increase' ? '+' : '−'}${formatTokenPrice(priceChange.amountExact)}`}
            </strong>
            <small>
              {!priceChange
                ? 'Your change will be shown before you update.'
                : priceChange.direction === 'increase'
                  ? 'The current price will increase by this amount.'
                  : priceChange.direction === 'decrease'
                    ? 'The current price will decrease by this amount.'
                    : 'Choose a different value to update the price.'}
            </small>
          </div>
        </div>
      </Modal>
    </div>
  );
}
