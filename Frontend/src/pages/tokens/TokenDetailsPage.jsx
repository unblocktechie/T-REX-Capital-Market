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
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AddressDisplay,
  HelpDetails,
  InfoCallout,
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
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenDashboardData } from '@/hooks/useTokenDashboardData';
import { myTokenQueryKey } from '@/hooks/useMyToken';
import { formatMoney, formatNumber } from '@/utils/tokenIssuance';
import { getErrorMessage } from '@/utils/error';
import { tokenPriceChange, validateCurrentTokenPrice } from '@/utils/tokenPrice';
import { getDeploymentTransactionHash } from '@/utils/transactionHash';
import { tokenApi } from '@/api/tokens';
import {
  getPlatformTokenPrice,
  setPlatformTokenPrice,
} from '@/services/blockchain/trexPlatformController.service';
import {
  clearTokenPriceSyncRecovery,
  loadTokenPriceSyncRecovery,
  saveTokenPriceSyncRecovery,
} from '@/services/issuer/tokenPriceSyncRecovery.service';
import { shortenWalletAddress } from '@/utils/wallet';
import { readTrexTokenPaused } from '@/services/trexDeployment.service';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';

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

const mergeCurrentPriceIntoToken = (currentToken, responseToken, currentTokenPrice) => ({
  ...(currentToken || {}),
  ...(responseToken && typeof responseToken === 'object' ? responseToken : {}),
  currentTokenPrice: String(currentTokenPrice).trim(),
  tokenInformation: {
    ...(currentToken?.tokenInformation || currentToken?.information || {}),
    ...(responseToken?.tokenInformation || responseToken?.information || {}),
    currentTokenPrice: String(currentTokenPrice).trim(),
  },
});

function DetailMetric({ icon: Icon, label, value, helper, mono = false, titleValue }) {
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
        {helper ? <p>{helper}</p> : null}
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

const friendlyClaim = (topic = {}) => {
  const rawKey = firstText(
    topic.shortName,
    topic.name,
    topic.claimTopic,
    topic.claimTopicId,
    topic.topic,
    topic.id,
  ).toLowerCase();

  if (
    rawKey === '1' ||
    rawKey.includes('kyc') ||
    rawKey.includes('identity') ||
    rawKey.includes('customer')
  ) {
    return {
      name: 'Identity verification',
      description: 'Confirms the investor’s identity and home address before they can invest.',
    };
  }

  if (
    rawKey === '2' ||
    rawKey.includes('accredit') ||
    rawKey.includes('eligib') ||
    rawKey.includes('income') ||
    rawKey.includes('net worth')
  ) {
    return {
      name: 'Investor eligibility check',
      description: 'Confirms the investor meets the financial or eligibility rules required for this asset.',
    };
  }

  const suppliedName = firstText(topic.shortName, topic.name);
  const safeName = suppliedName && !/^\d+$/.test(suppliedName)
    ? suppliedName
    : 'Required investor check';

  return {
    name: safeName,
    description: firstText(topic.description) || 'This check must be completed before an investor can hold this asset.',
  };
};

export default function TokenDetailsPage() {
  const navigate = useNavigate();
  const { tokenAddress: routeTokenId } = useParams();
  const token = useTokenDashboardData();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const wallet = useWalletConnection();
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [priceError, setPriceError] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [onchainCurrentPrice, setOnchainCurrentPrice] = useState('');
  const [onchainPriceStatus, setOnchainPriceStatus] = useState('loading');
  const [onchainPaused, setOnchainPaused] = useState(null);
  const [transferStateStatus, setTransferStateStatus] = useState('loading');
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const mapped = token.mapped || {};
  const information = mapped.tokenInformation || {};
  const identityClaims = mapped.identityClaims || { claimTopics: [], trustedIssuer: {} };
  const compliance = mapped.compliance || { countries: [] };
  const agents = mapped.agents || {};
  const raw = token.token || {};
  const tokenName = information.name || firstText(raw.tokenName, raw.name) || 'Security Token';
  const symbol = information.symbol || firstText(raw.tokenSymbol, raw.symbol).toUpperCase() || 'TOKEN';
  const candidateTokenContractAddress = rawAddress(
    raw,
    'tokenAddress',
    'contractAddress',
    'proxyAddress',
    'contracts.token',
    'deployment.contracts.token',
    'deployment.tokenAddress',
    'deployment.contractAddress',
  );
  useDocumentTitle(tokenName);

  useEffect(() => {
    if (!candidateTokenContractAddress) {
      setOnchainCurrentPrice('');
      setOnchainPriceStatus('unavailable');
      return undefined;
    }

    let active = true;
    setOnchainPriceStatus('loading');
    getPlatformTokenPrice({ tokenAddress: candidateTokenContractAddress })
      .then((result) => {
        if (!active) return;
        const price = String(result?.currentTokenPrice || '').trim();
        if (price && price !== '0') {
          setOnchainCurrentPrice(price);
          setOnchainPriceStatus('ready');
        } else {
          setOnchainCurrentPrice('');
          setOnchainPriceStatus('unset');
        }
      })
      .catch(() => {
        if (!active) return;
        setOnchainCurrentPrice('');
        setOnchainPriceStatus('unavailable');
      });

    return () => {
      active = false;
    };
  }, [candidateTokenContractAddress]);

  useEffect(() => {
    if (!candidateTokenContractAddress) {
      setOnchainPaused(null);
      setTransferStateStatus('unavailable');
      return undefined;
    }

    let active = true;
    setTransferStateStatus('loading');
    readTrexTokenPaused({ tokenAddress: candidateTokenContractAddress })
      .then((paused) => {
        if (!active) return;
        setOnchainPaused(paused);
        setTransferStateStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setOnchainPaused(null);
        setTransferStateStatus('unavailable');
      });

    return () => {
      active = false;
    };
  }, [candidateTokenContractAddress]);

  useEffect(() => {
    if (!candidateTokenContractAddress) return undefined;
    const pending = loadTokenPriceSyncRecovery(candidateTokenContractAddress);
    if (!pending?.currentTokenPrice) return undefined;

    let active = true;
    tokenApi.updateCurrentPrice(pending.currentTokenPrice)
      .then((updatedToken) => {
        if (!active) return;
        const responseToken = updatedToken?.token && typeof updatedToken.token === 'object'
          ? updatedToken.token
          : updatedToken;
        queryClient.setQueryData(
          myTokenQueryKey(token.userKey),
          (current) => mergeCurrentPriceIntoToken(current, responseToken, pending.currentTokenPrice),
        );
        clearTokenPriceSyncRecovery(candidateTokenContractAddress);
      })
      .catch(() => {
        // The on-chain price is already authoritative. Keep the recovery entry so
        // a later visit can synchronize the account record without another wallet transaction.
      });

    return () => {
      active = false;
    };
  }, [candidateTokenContractAddress, queryClient, token.userKey]);

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

  if (token.isDeploymentPending || token.isConfigurationFailed) {
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
  const tokenContractAddress = candidateTokenContractAddress;
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
  const investorAccessConfigured = Boolean(
    organizationOnchainId && identityRegistryAddress && identityRegistryStorageAddress,
  );
  const managementReady = Boolean(
    agents.identityRegistryAgent?.address && agents.tokenAgent?.address,
  );
  const setupNeedsTransferActivation = transferStateStatus === 'ready' && onchainPaused === true;
  const assetReady = token.isDeployed && !setupNeedsTransferActivation && onchainPriceStatus === 'ready';
  const displayStatus = setupNeedsTransferActivation
    ? 'Setup incomplete'
    : onchainPriceStatus === 'unset'
      ? 'Price setup needed'
      : assetReady
        ? 'Ready for investors'
        : token.isDeployed
          ? 'Created'
          : 'Ready to Create';
  const initialPrice = mapped.supplyPricing?.initialPrice;
  const databaseCurrentPrice = mapped.supplyPricing?.currentPrice || initialPrice;
  const currentPrice = onchainCurrentPrice || databaseCurrentPrice;
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

  const resumeIncompleteSetup = () => {
    if (!transactionHash) {
      toast.error('The confirmed token-creation transaction ID is unavailable.');
      return;
    }
    const retryMode = setupNeedsTransferActivation ? 'configuration' : 'price-confirmation';
    setDeployment({
      status: 'error',
      activeStage: 3,
      transactionHash,
      error: setupNeedsTransferActivation
        ? 'The live token contract is still paused. Finish transfer activation before treating this asset as ready.'
        : 'The live token price still needs confirmation before this asset is fully ready.',
      canRetry: true,
      retryMode,
      pendingSync: {
        transactionHash,
        deploymentAttemptUid: '',
        metadata: {
          tokenUid: token.tokenUid,
          tokenAddress: tokenContractAddress,
          configurationStatus: setupNeedsTransferActivation
            ? 'configuration_failed'
            : 'price_confirmation_required',
          onChainPaused:
            transferStateStatus === 'ready' ? onchainPaused : null,
          failedStep: setupNeedsTransferActivation
            ? 'activate-transfers'
            : 'price-confirmation',
        },
      },
      walletAction: null,
    });
    navigate(ROUTES.tokenDeploying);
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
      if (!tokenContractAddress) {
        throw new Error('The token contract is unavailable. Refresh the page and try again.');
      }
      const approvedWallet = organization.walletAddress || information.treasuryWallet;
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect your Organization Wallet from the header before updating the current price.');
      }
      if (!wallet.isCorrectNetwork) {
        await wallet.switchChain(wallet.requiredChain.id);
      }

      const chainResult = await setPlatformTokenPrice({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        issuerWalletAddress: approvedWallet,
        tokenAddress: tokenContractAddress,
        currentTokenPrice: newPrice,
        chainId: wallet.requiredChain.id,
      });
      const confirmedPrice = chainResult.currentTokenPrice || String(newPrice).trim();
      setOnchainCurrentPrice(confirmedPrice);
      setOnchainPriceStatus('ready');
      saveTokenPriceSyncRecovery(tokenContractAddress, {
        currentTokenPrice: confirmedPrice,
        txHash: chainResult.txHash,
      });

      queryClient.setQueryData(
        myTokenQueryKey(token.userKey),
        (current) => mergeCurrentPriceIntoToken(current, null, confirmedPrice),
      );

      try {
        const updatedToken = await tokenApi.updateCurrentPrice(confirmedPrice);
        const responseToken = updatedToken?.token && typeof updatedToken.token === 'object'
          ? updatedToken.token
          : updatedToken;
        queryClient.setQueryData(
          myTokenQueryKey(token.userKey),
          (current) => mergeCurrentPriceIntoToken(current, responseToken, confirmedPrice),
        );
        clearTokenPriceSyncRecovery(tokenContractAddress);
        setPriceEditorOpen(false);
        toast.success('Current price updated', {
          description: `${tokenName} now uses ${formatTokenPrice(confirmedPrice)} for new purchases and redemptions.`,
        });
      } catch (syncError) {
        setPriceEditorOpen(false);
        toast.warning('Price updated — account display is still syncing', {
          description: 'The new price is active on-chain. We will retry the account update automatically; do not submit another price transaction.',
        });
        console.warn('Token price account synchronization is pending.', syncError);
      }
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
            <span className="eyebrow">Investment asset</span>
            <h1>{tokenName} <span>({symbol})</span></h1>
            <div className="token-dashboard-header__status">
              <StatusBadge status={setupNeedsTransferActivation || onchainPriceStatus === 'unset' ? 'warning' : 'valid'}>{displayStatus}</StatusBadge>
              {transferStateStatus === 'ready' ? (
                <StatusBadge status={onchainPaused ? 'warning' : 'valid'}>
                  {onchainPaused ? 'Transfers paused' : 'Transfers active'}
                </StatusBadge>
              ) : null}
              <span><Network size={16} /> Network: {network}</span>
            </div>
          </div>
        </div>
        <div className="token-dashboard-header__actions">
          {setupNeedsTransferActivation || onchainPriceStatus === 'unset' ? (
            <Button onClick={resumeIncompleteSetup}>
              Finish Setup
            </Button>
          ) : null}
          <Button
            variant="secondary"
            icon={ExternalLink}
            onClick={() => window.open(transactionExplorer, '_blank', 'noopener,noreferrer')}
            disabled={!transactionExplorer}
          >
            View creation transaction
          </Button>
        </div>
        <p className="token-dashboard-header__description">
          {information.description ||
            'Review the price, investor requirements, investment limits, and management access for this asset.'}
        </p>
        <div className="token-dashboard-header__deployment-meta token-dashboard-header__deployment-meta--business">
          <div className="token-dashboard-header__price token-dashboard-header__price--editable">
            <div className="token-dashboard-header__price-label">
              <small>Current investor price</small>
              <button type="button" onClick={openPriceEditor} aria-label="Edit current investor price">
                <PencilLine size={15} /> Edit
              </button>
            </div>
            <strong>{formatTokenPrice(currentPrice)}</strong>
            <span>Used for new purchases. Initial price: {formatTokenPrice(initialPrice)}</span>
            {onchainPriceStatus === 'unset' ? <em className="token-dashboard-header__price-note is-warning">Price activation required before trading</em> : null}
            {onchainPriceStatus === 'unavailable' ? <em className="token-dashboard-header__price-note">Live price check unavailable</em> : null}
          </div>
          <div className="token-dashboard-header__readiness">
            <small>Investor access</small>
            <strong>
              {setupNeedsTransferActivation
                ? 'Not available yet'
                : onchainPriceStatus === 'unset'
                  ? 'Purchases not ready yet'
                  : 'Available to approved investors'}
            </strong>
            <span>
              {setupNeedsTransferActivation
                ? 'Finish setup before investors can receive or transfer this asset.'
                : onchainPriceStatus === 'unset'
                  ? 'Set the current investor price before investors make purchases.'
                  : 'Investor checks and limits are applied automatically before a transaction is accepted.'}
            </span>
          </div>
        </div>
        <div className="token-dashboard-header__contract-summary">
          <div className="token-dashboard-header__contract-copy">
            <small>Asset contract</small>
            <strong>Blockchain address for this asset</strong>
            <span>Use this address when you need to identify or verify this asset.</span>
          </div>
          <AddressDisplay
            address={tokenContractAddress}
            emptyLabel="Contract address not available yet"
            explorerUrl={tokenExplorer}
            compact
            showCopyText
            copyLabel="Copy asset contract address"
            className="token-dashboard-header__contract-address"
          />
        </div>
        <HelpDetails title="View technical details" className="token-dashboard-header__technical">
          <p><strong>Blockchain network:</strong> {network}. The asset contract above is the unique blockchain address for this investment asset. These details are mainly useful for technical support or blockchain verification.</p>
        </HelpDetails>
      </header>

      {setupNeedsTransferActivation ? (
        <InfoCallout title="Setup is not finished" tone="warning" icon={ShieldCheck}>
          Transfers are still paused on the blockchain, so investors cannot receive or transfer this asset yet. Finish Setup retries only the missing activation step and will not create another asset.
        </InfoCallout>
      ) : null}

      <section className="token-dashboard-metrics" aria-label="Asset summary">
        <DetailMetric icon={FileCheck2} label="Asset name" value={tokenName} helper="Shown to investors" />
        <DetailMetric icon={BadgeCheck} label="Asset symbol" value={symbol} helper="Short code used for the asset" />
        <DetailMetric icon={CircleDollarSign} label="Unit precision" value={`${information.decimals || '18'} decimal places`} helper="Controls how small a fractional unit can be" />
        <DetailMetric
          icon={WalletCards}
          label="Funds wallet"
          value={shortenWalletAddress(ownerAddress, 5, 5)}
          titleValue={ownerAddress}
          helper="Receives purchase funds"
          mono
        />
      </section>

      <div className="token-dashboard-grid">
        <section className="token-dashboard-card">
          <header>
            <div><Fingerprint size={20} /><h2>Investor Access</h2></div>
            <StatusBadge status={investorAccessConfigured ? 'valid' : 'warning'}>
              {investorAccessConfigured ? 'Ready' : 'Needs attention'}
            </StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-addresses">
            <p className="token-dashboard-card__intro">
              Only approved investors can hold this asset. The platform checks investor approval automatically.
            </p>
            <div className={`token-dashboard-simple-status ${investorAccessConfigured ? '' : 'is-warning'}`}>
              <ShieldCheck size={18} />
              <div>
                <strong>
                  {investorAccessConfigured
                    ? 'Approved-investor checks are active'
                    : 'Investor access setup needs attention'}
                </strong>
                <span>
                  {investorAccessConfigured
                    ? 'Investors must complete your required checks before they can receive the asset.'
                    : 'One or more technical investor-access records are missing. Open the technical setup below for details.'}
                </span>
              </div>
            </div>
            <HelpDetails title="View technical setup">
              <AddressDisplay
                label="Organization verification record"
                address={organizationOnchainId}
                emptyLabel="Verification record pending"
                explorerUrl={
                  organizationOnchainId && explorerBase
                    ? `${explorerBase}/address/${organizationOnchainId}`
                    : undefined
                }
                showFullAddress
              />
              <AddressDisplay
                label="Approved investor list"
                address={identityRegistryAddress}
                emptyLabel="Investor list address not recorded"
                explorerUrl={
                  identityRegistryAddress && explorerBase
                    ? `${explorerBase}/address/${identityRegistryAddress}`
                    : undefined
                }
                showFullAddress
              />
              <AddressDisplay
                label="Platform registry storage"
                address={identityRegistryStorageAddress}
                emptyLabel="Registry storage address not recorded"
                explorerUrl={
                  identityRegistryStorageAddress && explorerBase
                    ? `${explorerBase}/address/${identityRegistryStorageAddress}`
                    : undefined
                }
                showFullAddress
              />
            </HelpDetails>
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><UsersRound size={20} /><h2>Who Manages This Asset</h2></div>
            <StatusBadge status={managementReady ? 'valid' : 'warning'}>
              {managementReady ? 'Assigned' : 'Needs attention'}
            </StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-addresses">
            <p className="token-dashboard-card__intro">
              These approved organization accounts can manage investor access and day-to-day asset operations.
            </p>
            <div className="token-dashboard-management-list">
              <article>
                <ShieldCheck size={18} />
                <div>
                  <strong>Investor approvals</strong>
                  <span>Reviews and approves who can invest in this asset.</span>
                </div>
                <StatusBadge status={agents.identityRegistryAgent?.address ? 'valid' : 'warning'}>
                  {agents.identityRegistryAgent?.address ? 'Assigned' : 'Not assigned'}
                </StatusBadge>
              </article>
              <article>
                <WalletCards size={18} />
                <div>
                  <strong>Asset operations</strong>
                  <span>Handles asset units and important transfer controls.</span>
                </div>
                <StatusBadge status={agents.tokenAgent?.address ? 'valid' : 'warning'}>
                  {agents.tokenAgent?.address ? 'Assigned' : 'Not assigned'}
                </StatusBadge>
              </article>
            </div>
            <div className="token-dashboard-permissions">
              <span>Approve investors</span>
              <span>Create asset units</span>
              <span>Remove asset units</span>
              <span>Pause or freeze when needed</span>
            </div>
            <HelpDetails title="View management account addresses">
              <AddressDisplay
                label="Investor approval account"
                address={agents.identityRegistryAgent?.address}
                emptyLabel="Not assigned"
                showFullAddress
              />
              <AddressDisplay
                label="Asset operations account"
                address={agents.tokenAgent?.address}
                emptyLabel="Not assigned"
                showFullAddress
              />
            </HelpDetails>
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Fingerprint size={20} /><h2>Investor Checks</h2></div>
            <StatusBadge status="valid">{enabledClaims.length} required</StatusBadge>
          </header>
          <div className="token-dashboard-card__body">
            <p className="token-dashboard-card__intro">
              Every investor must pass these checks before they can receive or invest in this asset.
            </p>
            {enabledClaims.length ? (
              <div className="token-dashboard-claim-grid">
                {enabledClaims.map((topic) => {
                  const claim = friendlyClaim(topic);
                  return (
                    <article key={topic.claimTopicUid || topic.id || claim.name}>
                      <ShieldCheck size={18} />
                      <div>
                        <strong>{claim.name}</strong>
                        <p>{claim.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="token-dashboard-empty">No investor checks are configured for this asset.</p>
            )}
            <HelpDetails title="View verification provider">
              <p>The verification provider is the approved account responsible for confirming investor checks.</p>
              <AddressDisplay
                label="Verification provider account"
                address={identityClaims.trustedIssuer?.address || ownerAddress}
                emptyLabel="Not configured"
                showFullAddress
              />
            </HelpDetails>
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Landmark size={20} /><h2>Investment Limits</h2></div>
            <StatusBadge status="valid">Active</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-settings">
            <p className="token-dashboard-card__intro token-dashboard-card__intro--settings">
              These limits are checked automatically before an investor receives asset units.
            </p>
            <SettingRow
              label="Maximum number of investors"
              value={
                compliance.maximumInvestors
                  ? formatNumber(compliance.maximumInvestors)
                  : 'Unlimited'
              }
            />
            <SettingRow
              label="Maximum amount per investor"
              value={
                compliance.maximumBalance
                  ? formatNumber(compliance.maximumBalance)
                  : 'Unlimited'
              }
            />
            <SettingRow
              label="Blocked countries"
              value={countryNames.length ? `${countryNames.length} blocked` : 'None'}
            />
            {countryNames.length ? (
              <div className="token-dashboard-country-list" aria-label="Blocked countries">
                {countryNames.map((country) => <span key={country}>{country}</span>)}
              </div>
            ) : null}
          </div>
        </section>
      </div>


      <Modal
        open={priceEditorOpen}
        onClose={closePriceEditor}
        title="Update investor price"
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
              Update Price
            </Button>
          </>
        )}
      >
        <div className="token-price-editor__intro">
          <p>Set the price investors will use for new purchases and redemptions. Your approved organization wallet will ask you to confirm the change. The starting price will not be changed.</p>
        </div>
        <div className="token-price-editor__snapshot" aria-label="Token price comparison">
          <div><span>Starting price</span><strong>{formatTokenPrice(initialPrice)}</strong><small>Original price</small></div>
          <div><span>Current investor price</span><strong>{formatTokenPrice(currentPrice)}</strong><small>Price used now</small></div>
        </div>
        <Input
          id="new-current-token-price"
          label="New investor price"
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
          hint="Enter the USDT price for one asset unit. Example: 704 or 704.50."
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
