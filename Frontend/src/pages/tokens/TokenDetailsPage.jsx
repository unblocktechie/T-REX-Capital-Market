import { paymentContextOf } from '@/config/payment-tokens';
import {
  BadgeCheck,
  CircleDollarSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
  Fingerprint,
  Landmark,
  PencilLine,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AddressDisplay,
  HelpDetails,
  InfoCallout,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { TokenIcon } from '@/components/common/TokenIcon';
import { NetworkIcon } from '@/components/common/NetworkIcon';
import { TokenPriceValue } from '@/components/common/TokenPriceValue';
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
import { usePaymentTokenMetadata } from '@/hooks/usePaymentTokenMetadata';
import { myTokenQueryKey } from '@/hooks/useMyToken';
import { formatNumber } from '@/utils/tokenIssuance';
import { blockedCountriesPopoverPosition } from '@/utils/blockedCountriesPopover';
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
import { readTrexTokenPaused } from '@/services/trexDeployment.service';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';

const firstText = (...values) =>
  String(values.find((value) => value !== undefined && value !== null) || '').trim();

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

/** Collapse lengthy issuer descriptions without losing the saved backend text. */
function TokenDescription({ description }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef(null);
  const textId = useId();

  // Check actual rendered overflow instead of a word count: the same text may
  // fit on desktop but need a toggle on narrower screens or at larger font sizes.
  useLayoutEffect(() => {
    if (expanded || !textRef.current) return undefined;
    const text = textRef.current;
    const measure = () => {
      const overflowing = text.scrollHeight > text.clientHeight + 1;
      setCanExpand((previous) => previous === overflowing ? previous : overflowing);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(text);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [description, expanded]);

  return (
    <div className="token-dashboard-description">
      <p
        id={textId}
        ref={textRef}
        className={`token-dashboard-header__description token-dashboard-description__text${expanded ? '' : ' token-dashboard-description__text--collapsed'}`}
      >
        {description}
      </p>
      {canExpand ? (
        <button
          type="button"
          className="token-dashboard-description__toggle"
          aria-controls={textId}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
          {expanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}

function BlockedCountriesControl({ countries }) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 620px), (max-height: 480px)').matches,
  );
  const [position, setPosition] = useState({});
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const closeRef = useRef(null);
  const popoverId = useId();
  const count = countries.length;
  const countLabel = `${count} ${count === 1 ? 'country' : 'countries'}`;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 620px), (max-height: 480px)');
    const onChange = (event) => setIsMobile(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Measure the actual header + country rows before paint. Using a fixed
  // 360px height for a one-country list previously placed it far above the row.
  useLayoutEffect(() => {
    if (!open || isMobile) return undefined;
    const updatePosition = () => {
      if (!triggerRef.current || !popoverRef.current) return;
      const popover = popoverRef.current;
      const headerHeight = popover.querySelector('.token-dashboard-country-popover__header')?.offsetHeight || 0;
      const listHeight = popover.querySelector('.token-dashboard-country-items')?.scrollHeight || 0;
      setPosition(blockedCountriesPopoverPosition({
        anchor: triggerRef.current.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        contentHeight: headerHeight + listHeight + 2, // includes the popover border
      }));
    };
    const closeOnOutsideClick = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    updatePosition();
    closeRef.current?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, isMobile, count]);

  if (!count) return <span>No blocked countries</span>;

  const list = (
    <div className="token-dashboard-country-scroll" role="region" tabIndex={0} aria-label="Blocked country list">
      <ul className="token-dashboard-country-items">
        {countries.map((country, index) => (
          <li key={`${country}-${index}`}>{country}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="token-dashboard-country-trigger"
        aria-label={`View ${countLabel} blocked from investing`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open && !isMobile ? popoverId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {countLabel}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && !isMobile ? createPortal(
        <section
          id={popoverId}
          ref={popoverRef}
          className="token-dashboard-country-popover"
          style={position}
          role="dialog"
          aria-modal="false"
          aria-label="Blocked countries"
        >
          <header className="token-dashboard-country-popover__header">
            <div>
              <strong>Blocked countries</strong>
              <span>{countLabel}</span>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="token-dashboard-country-popover__close"
              aria-label="Close blocked countries"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {list}
        </section>,
        document.body,
      ) : null}
      {isMobile ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Blocked countries"
          className="token-dashboard-country-modal"
          bodyClassName="token-dashboard-country-modal__body"
          trapFocus
        >
          <p className="token-dashboard-country-modal__count">{countLabel}</p>
          {list}
        </Modal>
      ) : null}
    </>
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
  const mapped = token.mapped || {};
  const information = mapped.tokenInformation || {};
  const identityClaims = mapped.identityClaims || { claimTopics: [], trustedIssuer: {} };
  const compliance = mapped.compliance || { countries: [] };
  const agents = mapped.agents || {};
  const raw = token.token || {};
  const tokenChainId = Number(raw.chainId || raw.deployment?.chainId || information.chainId || 0) || undefined;
  const tokenChain = web3Config.getChainById(tokenChainId) || web3Config.requiredChain;
  const tokenChainRecord = web3Config.getChainRecordById(tokenChainId);
  const wallet = useWalletConnection(tokenChainId);
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [priceError, setPriceError] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [onchainCurrentPrice, setOnchainCurrentPrice] = useState('');
  const [onchainPriceStatus, setOnchainPriceStatus] = useState('loading');
  const [onchainPaused, setOnchainPaused] = useState(null);
  const [transferStateStatus, setTransferStateStatus] = useState('loading');
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const { paymentTokenAddress, controllerAddress, paymentTokenSymbol } = paymentContextOf(raw, mapped.supplyPricing);
  const paymentSymbol = paymentTokenSymbol || mapped.supplyPricing?.currency || 'payment token';
  // The asset's saved payment-token contract selects the icon from this chain's
  // backend catalogue. USDG and other custom currencies have no bundled artwork.
  const paymentTokenMetadata = usePaymentTokenMetadata({
    paymentTokenAddress,
    paymentTokenSymbol: paymentSymbol,
    chainUid: information.chainUid || raw.chainUid || token.selectedChainUid,
    chainId: tokenChainId,
    enabled: Boolean(token.isDeployed && paymentTokenAddress),
  });
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
    getPlatformTokenPrice({ tokenAddress: candidateTokenContractAddress, paymentTokenAddress, controllerAddress, chainId: tokenChain.id })
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
  }, [candidateTokenContractAddress, paymentTokenAddress, controllerAddress, tokenChain.id]);

  useEffect(() => {
    if (!candidateTokenContractAddress) {
      setOnchainPaused(null);
      setTransferStateStatus('unavailable');
      return undefined;
    }

    let active = true;
    setTransferStateStatus('loading');
    readTrexTokenPaused({ tokenAddress: candidateTokenContractAddress, chainId: tokenChain.id })
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
  }, [candidateTokenContractAddress, paymentTokenAddress, controllerAddress, tokenChain.id]);

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
          myTokenQueryKey(token.userKey, token.selectedChainUid),
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
  }, [candidateTokenContractAddress, queryClient, token.selectedChainUid, token.userKey]);

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
    firstText(raw.chainName, raw.network, raw.networkName, information.network) ||
    tokenChain.name;
  const explorerBase = tokenChain.blockExplorers?.default?.url || '';
  const ownerAddress = information.treasuryWallet || organization.walletAddress || '';
  const organizationOnchainId = organization.selectedChainIdentity?.identityAddress || '';
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
  // Keep the full mapped configuration: disabling a requirement must not make its
  // existence disappear from the issuer's review screen.
  const claimTopics = identityClaims.claimTopics || [];
  const countryNames = (compliance.countries || [])
    .map((country) => country?.countryName || country?.label || String(country || ''))
    .filter(Boolean);
  const investorAccessConfigured = Boolean(
    organizationOnchainId && identityRegistryAddress && identityRegistryStorageAddress,
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
  const hasInitialPrice = initialPrice !== undefined && initialPrice !== null && String(initialPrice).trim() !== '';
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
      toast.error('The confirmed asset-creation reference is unavailable.');
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
        paymentTokenAddress, controllerAddress,
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
        myTokenQueryKey(token.userKey, token.selectedChainUid),
        (current) => mergeCurrentPriceIntoToken(current, null, confirmedPrice),
      );

      try {
        const updatedToken = await tokenApi.updateCurrentPrice(confirmedPrice);
        const responseToken = updatedToken?.token && typeof updatedToken.token === 'object'
          ? updatedToken.token
          : updatedToken;
        queryClient.setQueryData(
          myTokenQueryKey(token.userKey, token.selectedChainUid),
          (current) => mergeCurrentPriceIntoToken(current, responseToken, confirmedPrice),
        );
        clearTokenPriceSyncRecovery(tokenContractAddress);
        setPriceEditorOpen(false);
        toast.success('Current price updated', {
          description: <span>{tokenName} now uses <TokenPriceValue value={confirmedPrice} suffix={` ${paymentSymbol}`} /> for new purchases and redemptions.</span>,
        });
      } catch (syncError) {
        setPriceEditorOpen(false);
        toast.warning('Price updated — account display is still syncing', {
          description: 'The new price is active. We will retry the account update automatically; do not submit another price change.',
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
      <header className="token-dashboard-header token-dashboard-header--simplified">
        <div className="token-dashboard-header__identity">
          <span className="token-dashboard-logo">
            {information.logo?.dataUrl ? (
              <img src={information.logo.dataUrl} alt={`${tokenName} logo`} />
            ) : (
              <BadgeCheck size={28} />
            )}
          </span>
          <div>
            <span className="eyebrow">Token Management</span>
            <h1>{tokenName} <span>({symbol})</span></h1>
            <div className="token-dashboard-header__status">
              <StatusBadge status={setupNeedsTransferActivation || onchainPriceStatus === 'unset' ? 'warning' : 'valid'}>{displayStatus}</StatusBadge>
              {transferStateStatus === 'ready' ? (
                <StatusBadge status={onchainPaused ? 'warning' : 'valid'}>
                  {onchainPaused ? 'Transfers paused' : 'Transfers active'}
                </StatusBadge>
              ) : null}
              <span className="token-dashboard-header__network-chip">
                <NetworkIcon chain={tokenChainRecord} chainId={tokenChainId} name={network} size="xs" />
                <span>{network}</span>
              </span>
            </div>
          </div>
        </div>
        {setupNeedsTransferActivation || onchainPriceStatus === 'unset' ? (
          <div className="token-dashboard-header__actions">
            <Button onClick={resumeIncompleteSetup}>Finish Setup</Button>
          </div>
        ) : null}
        {information.description ? (
          <TokenDescription key={information.description} description={information.description} />
        ) : null}
        <div className="token-dashboard-pricing">
          <div className="token-dashboard-header__price token-dashboard-header__price--editable">
            <div className="token-dashboard-header__price-label">
              <small>Current investor price</small>
              <button type="button" onClick={openPriceEditor} aria-label="Edit current investor price">
                <PencilLine size={15} /> Edit Price
              </button>
            </div>
            <strong className="token-dashboard-header__price-value">
              <TokenIcon
                symbol={paymentSymbol}
                name={paymentTokenMetadata.name || paymentSymbol}
                imageUrl={paymentTokenMetadata.imageUrl}
                size="sm"
              />
              <TokenPriceValue value={currentPrice} suffix={` ${paymentSymbol}`} />
            </strong>
            {onchainPriceStatus === 'unset' ? <em className="token-dashboard-header__price-note is-warning">Price activation required before trading</em> : null}
            {onchainPriceStatus === 'unavailable' ? <em className="token-dashboard-header__price-note">Live price check unavailable</em> : null}
          </div>
          {hasInitialPrice ? (
            <div className="token-dashboard-pricing__initial">
              <small>Initial price</small>
              <strong><TokenPriceValue value={initialPrice} suffix={` ${paymentSymbol}`} /></strong>
            </div>
          ) : null}
        </div>
      </header>

      {setupNeedsTransferActivation ? (
        <InfoCallout title="Setup is not finished" tone="warning" icon={ShieldCheck}>
          Transfers are still paused, so investors cannot receive or transfer this asset yet. Finish Setup retries only the missing activation step and will not create another asset.
        </InfoCallout>
      ) : null}

      <div className="token-dashboard-grid token-dashboard-grid--simplified">
        <section className="token-dashboard-card">
          <header>
            <div><Fingerprint size={20} /><h2>Investor Access</h2></div>
            <StatusBadge status={investorAccessConfigured ? 'valid' : 'warning'}>
              {investorAccessConfigured ? 'Ready' : 'Needs attention'}
            </StatusBadge>
          </header>
          <div className="token-dashboard-card__body">
            <div className="token-dashboard-access-summary">
              <strong>{setupNeedsTransferActivation
                ? 'Not available yet'
                : onchainPriceStatus === 'unset'
                  ? 'Purchases not ready yet'
                  : investorAccessConfigured
                    ? 'Approved investors only'
                    : 'Investor access setup needs attention'}</strong>
              <span>{setupNeedsTransferActivation
                ? 'Complete transfer activation before investors can receive this asset.'
                : onchainPriceStatus === 'unset'
                  ? 'Set the current investor price before new purchases.'
                  : investorAccessConfigured
                    ? 'Investors must pass the selected verification checks.'
                    : 'One or more investor-access records are missing. See Technical Details.'}</span>
            </div>
            {claimTopics.length ? (
              <div className="token-dashboard-check-list" aria-label="Investor verification requirements">
                {claimTopics.map((topic) => {
                  const claim = friendlyClaim(topic);
                  const enabled = Boolean(topic.enabled);
                  const available = topic.available !== false;
                  const claimStatus = !available ? 'Unavailable' : !enabled ? 'Not required' : topic.required === false ? 'Active' : 'Required';
                  return (
                    <div className="token-dashboard-check-row" key={topic.claimTopicUid || topic.id || claim.name}>
                      <div>
                        <ShieldCheck size={17} aria-hidden="true" />
                        <span className="token-dashboard-check-name" title={claim.description}>
                          <span>{claim.name}</span>
                          {claim.name !== 'Identity verification' && claim.name !== 'Investor eligibility check' ? (
                            <small>{claim.description}</small>
                          ) : null}
                        </span>
                      </div>
                      <StatusBadge status={enabled && available ? 'valid' : 'pending'}>{claimStatus}</StatusBadge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="token-dashboard-empty">No investor checks are configured for this asset.</p>
            )}
          </div>
        </section>

        <section className="token-dashboard-card">
          <header>
            <div><Landmark size={20} /><h2>Investment Limits</h2></div>
            <StatusBadge status="valid">Active</StatusBadge>
          </header>
          <div className="token-dashboard-card__body token-dashboard-settings">
            <SettingRow
              label="Maximum investors"
              value={compliance.maximumInvestors ? formatNumber(compliance.maximumInvestors) : 'Unlimited'}
            />
            <SettingRow
              label="Maximum units per investor"
              value={compliance.maximumBalance ? formatNumber(compliance.maximumBalance) : 'Unlimited'}
            />
            <SettingRow
              label="Blocked countries"
              value={<BlockedCountriesControl countries={countryNames} />}
            />
          </div>
        </section>
      </div>

      <section id="asset-technical-details" className="token-dashboard-technical-section" aria-label="Technical Details">
        <HelpDetails title="Technical Details" className="token-dashboard-technical">
          <div className="token-dashboard-technical__group">
            <h3>Asset Information</h3>
            <SettingRow label="Network" value={network} />
            <SettingRow label="Unit precision" value={`${information.decimals ?? 18} decimal places`} />
            <AddressDisplay
              label="Asset contract address"
              address={tokenContractAddress}
              emptyLabel="Contract address not available yet"
              explorerUrl={tokenExplorer}
              compact
              showCopyText
              copyLabel="Copy asset contract address"
            />
            <AddressDisplay
              label="Organization payment account"
              address={ownerAddress}
              emptyLabel="Payment account not available"
              showFullAddress
            />
            {transactionExplorer ? (
              <a className="token-dashboard-technical__transaction" href={transactionExplorer} target="_blank" rel="noopener noreferrer">
                <span>View asset creation confirmation</span>
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            ) : (
              <SettingRow label="Asset creation transaction" value="Not available" />
            )}
          </div>

          <div className="token-dashboard-technical__group">
            <h3>Investor Verification</h3>
            <AddressDisplay
              label="Organization verification record"
              address={organizationOnchainId}
              emptyLabel="Verification record pending"
              explorerUrl={organizationOnchainId && explorerBase ? `${explorerBase}/address/${organizationOnchainId}` : undefined}
              showFullAddress
            />
            <AddressDisplay
              label="Approved investor list"
              address={identityRegistryAddress}
              emptyLabel="Investor list address not recorded"
              explorerUrl={identityRegistryAddress && explorerBase ? `${explorerBase}/address/${identityRegistryAddress}` : undefined}
              showFullAddress
            />
            <AddressDisplay
              label="Platform registry storage"
              address={identityRegistryStorageAddress}
              emptyLabel="Registry storage address not recorded"
              explorerUrl={identityRegistryStorageAddress && explorerBase ? `${explorerBase}/address/${identityRegistryStorageAddress}` : undefined}
              showFullAddress
            />
            <AddressDisplay
              label="Verification provider account"
              address={identityClaims.trustedIssuer?.address || ownerAddress}
              emptyLabel="Not configured"
              showFullAddress
            />
          </div>

          <div className="token-dashboard-technical__group">
            <h3>Management Accounts</h3>
            <div className="token-dashboard-role-grid">
              <article className="token-dashboard-role">
                <div className="token-dashboard-role__heading">
                  <div>
                    <strong>Investor Approvals</strong>
                    <p>Reviews and approves who can invest in this asset.</p>
                  </div>
                  <StatusBadge status={agents.identityRegistryAgent?.address ? 'valid' : 'warning'}>
                    {agents.identityRegistryAgent?.address ? 'Assigned' : 'Not assigned'}
                  </StatusBadge>
                </div>
                <AddressDisplay
                  label="Investor approval account"
                  address={agents.identityRegistryAgent?.address}
                  emptyLabel="Not assigned"
                  showFullAddress
                />
              </article>
              <article className="token-dashboard-role">
                <div className="token-dashboard-role__heading">
                  <div>
                    <strong>Asset Operations</strong>
                    <p>Handles asset units and important transfer controls.</p>
                  </div>
                  <StatusBadge status={agents.tokenAgent?.address ? 'valid' : 'warning'}>
                    {agents.tokenAgent?.address ? 'Assigned' : 'Not assigned'}
                  </StatusBadge>
                </div>
                <AddressDisplay
                  label="Asset operations account"
                  address={agents.tokenAgent?.address}
                  emptyLabel="Not assigned"
                  showFullAddress
                />
              </article>
            </div>
          </div>
        </HelpDetails>
      </section>

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
          <div><span>Starting price</span><strong><TokenPriceValue value={initialPrice} suffix={` ${paymentSymbol}`} /></strong><small>Original price</small></div>
          <div><span>Current investor price</span><strong><TokenPriceValue value={currentPrice} suffix={` ${paymentSymbol}`} /></strong><small>Price used now</small></div>
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
          trailing={<span className="token-price-editor__currency">{paymentSymbol}</span>}
          error={priceError || priceValidationError}
          hint={`Enter the price in ${paymentSymbol}. The payment token cannot be changed.`}
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
                  : <>
                    {priceChange.direction === 'increase' ? '+' : '−'}
                    <TokenPriceValue value={priceChange.amountExact} suffix={` ${paymentSymbol}`} />
                  </>}
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
