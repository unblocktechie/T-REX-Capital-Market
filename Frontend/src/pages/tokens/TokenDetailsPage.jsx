import { paymentContextOf } from '@/config/payment-tokens';
import {
  BadgeCheck,
  CircleDollarSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
  FileCheck2,
  Fingerprint,
  Landmark,
  PencilLine,
  Settings2,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AddressDisplay,
  HelpDetails,
  InfoCallout,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { NetworkIcon } from '@/components/common/NetworkIcon';
import { TokenIcon } from '@/components/common/TokenIcon';
import { TokenPriceValue } from '@/components/common/TokenPriceValue';
import { PriceUpdatesCard } from '@/components/token-issuance/PriceUpdatesCard';
import { IssuerPriceHistory } from '@/components/price-history/IssuerPriceHistory';
import { priceHistoryQueryPrefix } from '@/services/price-history/priceHistory.utils';
import { verifyDirectPriceUntilSynchronized } from '@/services/issuer/directPriceVerification.service';
import { sendPreparedManualPriceTransaction, validatePreparedManualPrice } from '@/services/issuer/manualPriceTransaction.service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useChainConfig } from '@/hooks/useChains';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { usePaymentTokenMetadata } from '@/hooks/usePaymentTokenMetadata';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenDashboardData } from '@/hooks/useTokenDashboardData';
import { myTokenQueryKey } from '@/hooks/useMyToken';
import { formatNumber } from '@/utils/tokenIssuance';
import { blockedCountriesPopoverPosition } from '@/utils/blockedCountriesPopover';
import { getErrorMessage } from '@/utils/error';
import { tokenPriceChange, validateCurrentTokenPrice } from '@/utils/tokenPrice';
import { getDeploymentTransactionHash } from '@/utils/transactionHash';
import { transactionExplorerUrl } from '@/utils/blockExplorer';
import { tokenApi } from '@/api/tokens';
import { chainsApi } from '@/api/chains';
import { organizationApi } from '@/api/organization';
import { getPlatformTokenPrice } from '@/services/blockchain/trexPlatformController.service';
import {
  clearTokenPriceSyncRecovery,
  loadTokenPriceSyncRecovery,
  saveTokenPriceSyncRecovery,
  hasBackendPriceVerificationRejection,
} from '@/services/issuer/tokenPriceSyncRecovery.service';
import { readTrexTokenPaused } from '@/services/trexDeployment.service';
import { tokenServiceWalletAddress } from '@/services/issuer/tokenServiceWallet.utils';
import { resolveTokenServiceWalletController } from '@/services/issuer/tokenServiceWalletController.utils';
import {
  registerIssuerServiceWallet,
  revokeIssuerServiceWallet,
  SERVICE_WALLET_ZERO_ADDRESS,
  readTokenServiceWallet,
} from '@/services/issuer/issuerServiceWallet.service';
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
  const [tokenSearchParams, setTokenSearchParams] = useSearchParams();
  const { tokenAddress: routeTokenId } = useParams();
  const token = useTokenDashboardData();
  const queryClient = useQueryClient();
  const { organization, refresh: refreshOrganization } = useOrganization();
  const mapped = token.mapped || {};
  const information = mapped.tokenInformation || {};
  const identityClaims = mapped.identityClaims || { claimTopics: [], trustedIssuer: {} };
  const compliance = mapped.compliance || { countries: [] };
  const agents = mapped.agents || {};
  const raw = token.token || {};
  const tokenChainId = Number(raw.chainId || raw.deployment?.chainId || information.chainId || 0) || undefined;
  const tokenChainUid = firstText(
    raw.chainUid,
    raw.deployment?.chainUid,
    raw.chain?.chainUid,
    raw.network?.chainUid,
    information.chainUid,
    token.selectedChainUid,
    web3Config.getChainRecordById(tokenChainId)?.chainUid,
  );
  const tokenChainRecord =
    web3Config.getChainRecordById(tokenChainId)
    || web3Config.getChainRecordByUid(tokenChainUid);
  const tokenChainConfig = useChainConfig(tokenChainUid, {
    enabled: Boolean(tokenChainUid),
    staleTime: 30_000,
  });
  const tokenChainPresentation = tokenChainConfig.data || tokenChainRecord;
  // Use the same chain-scoped Platform Controller proxy already configured in
  // Chain Master. A token does not need its own new controller address.
  const serviceWalletControllerAddress = resolveTokenServiceWalletController({
    chainConfig: tokenChainConfig.data,
    chainRecord: tokenChainRecord,
    tokenChainUid,
    tokenChainId,
  });
  const tokenChain = web3Config.getChainById(tokenChainId) || web3Config.requiredChain;
  const wallet = useWalletConnection(tokenChainId);
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [priceAutomationOpen, setPriceAutomationOpen] = useState(false);
  const [serviceWalletAddress, setServiceWalletAddress] = useState('');
  const [serviceWalletError, setServiceWalletError] = useState('');
  const [serviceWalletSuccess, setServiceWalletSuccess] = useState('');
  const [serviceWalletSubmitting, setServiceWalletSubmitting] = useState(false);
  const [serviceWalletRevoking, setServiceWalletRevoking] = useState(false);
  const [serviceWalletPendingSyncAddress, setServiceWalletPendingSyncAddress] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [priceError, setPriceError] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [priceSyncStatus, setPriceSyncStatus] = useState('idle');
  const [priceSyncMessage, setPriceSyncMessage] = useState('');
  const priceVerificationRef = useRef(null);
  const rejectionCancellationRef = useRef(null);
  const [onchainCurrentPrice, setOnchainCurrentPrice] = useState('');
  const [onchainPriceStatus, setOnchainPriceStatus] = useState('loading');
  const [onchainPaused, setOnchainPaused] = useState(null);
  const [transferStateStatus, setTransferStateStatus] = useState('loading');
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const { paymentTokenAddress, controllerAddress, paymentTokenSymbol } = paymentContextOf(raw, mapped.supplyPricing);
  const paymentTokenMetadata = usePaymentTokenMetadata({
    paymentTokenAddress,
    paymentTokenSymbol: paymentTokenSymbol || mapped.supplyPricing?.currency,
    chainUid: tokenChainUid,
    chainId: tokenChainId,
    enabled: Boolean(paymentTokenAddress && (tokenChainUid || tokenChainId)),
  });
  const paymentSymbol = paymentTokenMetadata.symbol || paymentTokenSymbol || mapped.supplyPricing?.currency || 'payment token';
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
  const tokenUid = firstText(raw.tokenUid, information.tokenUid, routeTokenId);
  const registeredServiceWallet = tokenServiceWalletAddress(
    organization?.tokenServiceWallets, tokenUid, tokenChainUid,
  );
  const serviceWalletContext = `${tokenUid}:${tokenChainUid}`;
  const botConfigurationParams = new URLSearchParams({ tab: 'api-keys', tokenUid, chainUid: tokenChainUid });
  const botConfigurationLink = `${ROUTES.issuerApiKeys}?${botConfigurationParams.toString()}`;
  useEffect(() => {
    if (token.isLoading || !tokenUid || tokenSearchParams.get('setup') !== 'service-wallet') return;
    setPriceAutomationOpen(true);
    setTokenSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('setup');
      return next;
    }, { replace: true });
  }, [token.isLoading, tokenUid, tokenSearchParams, setTokenSearchParams]);
  const [onchainServiceWallet, setOnchainServiceWallet] = useState(null);
  const [serviceWalletLoading, setServiceWalletLoading] = useState(false);

  useDocumentTitle(tokenName);

  useEffect(() => {
    if (!priceAutomationOpen) return;
    setServiceWalletAddress(
      String(serviceWalletPendingSyncAddress || registeredServiceWallet || '').trim(),
    );
    setServiceWalletError('');
    setServiceWalletSuccess('');
  }, [registeredServiceWallet, priceAutomationOpen, serviceWalletPendingSyncAddress]);

  useEffect(() => {
    // Do not let pending sync state or contract reads leak into another token.
    setServiceWalletPendingSyncAddress('');
    setServiceWalletAddress('');
    setOnchainServiceWallet(null);
    setServiceWalletError('');
    setServiceWalletSuccess('');
  }, [serviceWalletContext]);

  useEffect(() => {
    // A fresh check runs silently whenever the popup opens. Clear the last
    // result on close so a warning from an earlier viewing cannot flash first.
    if (!priceAutomationOpen) {
      setOnchainServiceWallet(null);
      setServiceWalletLoading(false);
      return;
    }
    if (!candidateTokenContractAddress || !serviceWalletControllerAddress || !tokenChainId) return;
    let active = true;
    setOnchainServiceWallet(null);
    setServiceWalletLoading(true);
    readTokenServiceWallet({
      tokenAddress: candidateTokenContractAddress,
      chainId: tokenChainId,
      platformControllerAddress: serviceWalletControllerAddress,
    }).then((address) => {
      if (active) setOnchainServiceWallet(address);
    }).catch(() => {
      // A failed read is not evidence of registration or revocation.
      if (active) setOnchainServiceWallet(null);
    }).finally(() => {
      if (active) setServiceWalletLoading(false);
    });
    return () => { active = false; };
  }, [priceAutomationOpen, serviceWalletContext, candidateTokenContractAddress, serviceWalletControllerAddress, tokenChainId]);

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

  const runPriceVerification = useCallback(async (pending, { resumed = false } = {}) => {
    if (priceVerificationRef.current) return;
    const controller = new AbortController();
    priceVerificationRef.current = controller;
    setPriceSyncStatus('awaiting');
    setPriceSyncMessage('Awaiting confirmation. Checking the original transaction without reopening MetaMask.');
    try {
      let pendingHistoryRefreshed = false;
      const responseToken = await verifyDirectPriceUntilSynchronized({
        submit: tokenApi.updateCurrentPrice,
        currentTokenPrice: pending.currentTokenPrice,
        txHash: pending.txHash,
        chainUid: pending.chainUid,
        priceUpdateUid: pending.priceUpdateUid,
        signal: controller.signal,
        onPending: () => {
          setPriceSyncStatus('awaiting');
          setPriceSyncMessage('Awaiting confirmation. The network is still processing your transaction.');
          setPriceEditorOpen(false);
          if (!pendingHistoryRefreshed) {
            pendingHistoryRefreshed = true;
            void queryClient.invalidateQueries({ queryKey: priceHistoryQueryPrefix(token.userKey, pending.chainUid) });
          }
        },
        onTemporaryFailure: () => {
          setPriceSyncStatus('awaiting');
          setPriceSyncMessage('Verification is temporarily unavailable. Retrying without another wallet transaction.');
          setPriceEditorOpen(false);
        },
      });
      if (controller.signal.aborted) return;
      clearTokenPriceSyncRecovery(pending.tokenAddress, { chainUid: pending.chainUid, userKey: pending.userKey });
      setPriceSyncStatus('idle');
      setPriceSyncMessage('');
      setPriceEditorOpen(false);
      // The backend may return a price newer than this transaction. Never overwrite it
      // with our submitted value or treat an HTTP 202 response as a confirmed update.
      const resolved = responseToken?.token && typeof responseToken.token === 'object'
        ? responseToken.token : responseToken;
      const synchronizedPrice = firstText(
        resolved?.currentTokenPrice, resolved?.tokenInformation?.currentTokenPrice,
        resolved?.supplyPricing?.currentPrice,
      );
      setOnchainCurrentPrice(synchronizedPrice);
      // Query refetch errors must not undo a successfully verified backend sync.
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: myTokenQueryKey(token.userKey, pending.chainUid) }),
        queryClient.invalidateQueries({ queryKey: priceHistoryQueryPrefix(token.userKey, pending.chainUid) }),
      ]);
      toast.success('Price updated successfully', {
        description: 'Your new price is confirmed and has been added to your price history.',
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      // Preserve the transaction reference for recovery. Never ask MetaMask to submit it again.
      setPriceSyncStatus('attention');
      const code = String(error?.response?.data?.error?.code || error?.response?.data?.code || error?.code || '').toUpperCase();
      if (['INVALID_PRICE_TRANSACTION_TARGET', 'INVALID_PRICE_TRANSACTION_DETAILS'].includes(code)) {
        saveTokenPriceSyncRecovery(pending.tokenAddress, {
          ...pending, verificationIssue: code, verificationIssueSource: 'backend',
        });
      }
      const message = code === 'INVALID_PRICE_TRANSACTION_TARGET'
        ? 'The server could not associate this wallet-executed transaction with the saved price request. It may have succeeded on-chain. Keep the transaction hash and request backend reconciliation; do not submit it again.'
        : code === 'TRANSACTION_FAILED'
          ? 'The price transaction reverted. Review this failed attempt in history before preparing a new one.'
          : getErrorMessage(error, 'Verification could not finish. Do not send another wallet transaction.');
      setPriceSyncMessage(`${message} The saved request remains available for status checks.`);
      if (!resumed) toast.error('Price verification needs attention', { description: message });
      setPriceEditorOpen(false);
    } finally {
      if (priceVerificationRef.current === controller) priceVerificationRef.current = null;
      if (!controller.signal.aborted) setUpdatingPrice(false);
    }
  }, [queryClient, token.userKey]);

  useEffect(() => {
    // When the issuer switches networks, do not leave an unrelated asset's price
    // editor blocked by the previous network's verification indicator.
    setPriceSyncStatus('idle');
    setPriceSyncMessage('');
    setUpdatingPrice(false);
    // Recovery is scoped to the original issuer, asset and chain. Old entries with
    // valid chain pin are ignored by the recovery service.
    const pending = loadTokenPriceSyncRecovery(candidateTokenContractAddress, {
      chainUid: tokenChainUid,
      userKey: token.userKey,
    });
    if (pending && pending.chainUid === token.selectedChainUid) {
      if (pending.txHash && hasBackendPriceVerificationRejection(pending)) {
        // Only an explicit backend rejection is terminal. Older versions saved
        // client-side RPC inspection warnings before ever submitting PATCH.
        // Those hashes must be offered to the authoritative backend verifier.
        setPriceSyncStatus('attention');
        setPriceSyncMessage('The server has not associated this wallet transaction with the saved price request. Keep its hash and check the explorer or request backend reconciliation. Do not send it again.');
      } else if (pending.txHash) {
        void runPriceVerification(pending, { resumed: true });
      } else {
        // A missing hash does not prove no broadcast. A rejected wallet prompt
        // is safe to cancel, while an uncertain outcome must stay protected.
        setPriceSyncStatus('attention');
        setPriceSyncMessage(pending.walletSubmissionStartedAt
          ? 'We could not confirm whether MetaMask sent this transaction. Check your wallet activity. Do not cancel or send it again; contact support if you find a completed transaction.'
          : pending.walletRejectedAt
            ? 'You rejected the MetaMask transaction. Checking whether the saved request can be closed.'
            : pending.walletApprovalAttemptedAt
              ? 'The earlier wallet request did not finish. Check wallet activity; do not submit another transaction.'
              : 'A prepared price request already exists. Check its status before attempting another update.');
      }
      // A saved, explicitly rejected wallet prompt can resume cleanup after a reload.
      // Never cancel a request whose broadcast status is uncertain.
      if (!token.isLoading && token.hasToken && token.isDeployed &&
        pending.walletRejectedAt && !pending.txHash && !pending.walletSubmissionStartedAt) {
        void cancelRejectedPriceRequest(pending);
      }
    }
    return () => {
      priceVerificationRef.current?.abort();
      priceVerificationRef.current = null;
    };
  }, [candidateTokenContractAddress, tokenChainUid, token.selectedChainUid, token.userKey, token.isLoading, token.hasToken, token.isDeployed, runPriceVerification]);

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
  const claimTopics = identityClaims.claimTopics || [];
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
    if (updatingPrice && priceSyncStatus !== 'awaiting') return;
    // Closing our editor is NOT equivalent to rejecting MetaMask. Do not
    // cancel an intent unless the wallet explicitly rejected its transaction.
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

  const handleServiceWalletRegistration = async (nextServiceWalletAddress) => {
    setServiceWalletSubmitting(true);
    setServiceWalletError('');
    setServiceWalletSuccess('');

    try {
      if (!tokenUid || !tokenChainUid || !candidateTokenContractAddress || !tokenChainId) {
        throw new Error('A deployed token address is required before changing its Service Wallet.');
      }
      const issuerWalletAddress = String(organization.walletAddress || '').trim();
      if (!issuerWalletAddress) {
        throw new Error('The approved organization wallet is unavailable. Refresh the page and try again.');
      }
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect the approved organization wallet from the header before registering a Service Wallet.');
      }

      // Read the existing chain-scoped controller proxy from Chain Master.
      // Do not require a controller in the token's payment data.
      const chains = await chainsApi.listPublic();
      const selectedChain = chains.find((chain) =>
        (tokenChainUid && chain.chainUid === tokenChainUid) ||
        (tokenChainId && Number(chain.chainId) === Number(tokenChainId)),
      );
      if (!selectedChain) {
        const error = new Error('The selected network is unavailable. Refresh the network list and try again.');
        error.code = 'SELECTED_CHAIN_MISMATCH';
        throw error;
      }
      const chainController = resolveTokenServiceWalletController({
        chainConfig: tokenChainConfig.data,
        chainRecord: selectedChain,
        tokenChainUid,
        tokenChainId,
      });
      if (!chainController) {
        throw new Error('The Platform Controller for this network is missing from Chain Master. Refresh the network configuration and try again.');
      }

      if (Number(wallet.chainId) !== Number(selectedChain.chainId)) {
        await wallet.switchChain(selectedChain.chainId);
      }

      const requestedAddress = String(nextServiceWalletAddress || '').trim();
      const canRetryBackendSync = Boolean(
        serviceWalletPendingSyncAddress &&
        serviceWalletPendingSyncAddress.toLowerCase() === requestedAddress.toLowerCase(),
      );
      let registeredAddress = serviceWalletPendingSyncAddress;

      if (!canRetryBackendSync) {
        const chainResult = await registerIssuerServiceWallet({
          connector: wallet.connector,
          connectedAddress: wallet.address,
          issuerWalletAddress,
          serviceWalletAddress: requestedAddress,
          tokenAddress: candidateTokenContractAddress,
          chainId: selectedChain.chainId,
          platformControllerAddress: chainController,
          confirmations: selectedChain.requiredConfirmations,
        });
        registeredAddress = chainResult.serviceWalletAddress;
        setServiceWalletPendingSyncAddress(registeredAddress);
      }

      // Only synchronize after the on-chain receipt succeeds. If the backend is
      // briefly behind the selected-chain node, a retry re-runs this PUT only;
      // it does not ask the issuer to send the same blockchain transaction twice.
      await organizationApi.syncServiceWallet(registeredAddress, selectedChain.chainUid, tokenUid);
      const freshOrganization = await refreshOrganization();
      const confirmedAddress = tokenServiceWalletAddress(
        freshOrganization?.tokenServiceWallets, tokenUid, tokenChainUid,
      );
      if (confirmedAddress.toLowerCase() !== registeredAddress.toLowerCase()) {
        throw new Error('The token registration is confirmed on-chain but is not yet reflected in your account. Use Sync Service Wallet to retry without another wallet transaction.');
      }
      setServiceWalletPendingSyncAddress('');
      setServiceWalletAddress(confirmedAddress);
      setOnchainServiceWallet(confirmedAddress);
      setServiceWalletSuccess('Service Wallet registered and synchronized for this asset.');
      toast.success('Service Wallet connected', {
        description: "This wallet can now be used to update this token's price automatically.",
      });
    } catch (error) {
      setServiceWalletError(
        getErrorMessage(error, 'The Service Wallet could not be registered. Please try again.'),
      );
    } finally {
      setServiceWalletSubmitting(false);
    }
  };


  const handleServiceWalletRevoke = async () => {
    if (serviceWalletRevoking || serviceWalletSubmitting || !registeredServiceWallet) return;

    setServiceWalletRevoking(true);
    setServiceWalletError('');
    setServiceWalletSuccess('');

    try {
      if (!tokenUid || !tokenChainUid || !candidateTokenContractAddress || !tokenChainId) {
        throw new Error('A deployed token address is required before changing its Service Wallet.');
      }
      const issuerWalletAddress = String(organization.walletAddress || '').trim();
      if (!issuerWalletAddress) {
        throw new Error('The approved organization wallet is unavailable. Refresh the page and try again.');
      }
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect the approved organization wallet from the header before removing wallet access.');
      }

      const chains = await chainsApi.listPublic();
      const selectedChain = chains.find((chain) =>
        (tokenChainUid && chain.chainUid === tokenChainUid) ||
        (tokenChainId && Number(chain.chainId) === Number(tokenChainId)),
      );
      if (!selectedChain) {
        const error = new Error('The selected network is unavailable. Refresh the network list and try again.');
        error.code = 'SELECTED_CHAIN_MISMATCH';
        throw error;
      }
      const chainController = resolveTokenServiceWalletController({
        chainConfig: tokenChainConfig.data,
        chainRecord: selectedChain,
        tokenChainUid,
        tokenChainId,
      });
      if (!chainController) {
        throw new Error('The Platform Controller for this network is missing from Chain Master. Refresh the network configuration and try again.');
      }

      if (Number(wallet.chainId) !== Number(selectedChain.chainId)) {
        await wallet.switchChain(selectedChain.chainId);
      }

      const canRetryBackendSync = Boolean(
        serviceWalletPendingSyncAddress &&
        serviceWalletPendingSyncAddress.toLowerCase() === SERVICE_WALLET_ZERO_ADDRESS.toLowerCase(),
      );
      let revokedAddress = serviceWalletPendingSyncAddress;

      if (!canRetryBackendSync) {
        const chainResult = await revokeIssuerServiceWallet({
          connector: wallet.connector,
          connectedAddress: wallet.address,
          issuerWalletAddress,
          tokenAddress: candidateTokenContractAddress,
          chainId: selectedChain.chainId,
          platformControllerAddress: chainController,
          confirmations: selectedChain.requiredConfirmations,
        });
        revokedAddress = chainResult.serviceWalletAddress;
        setServiceWalletPendingSyncAddress(revokedAddress);
      }

      await organizationApi.syncServiceWallet(revokedAddress, selectedChain.chainUid, tokenUid);
      const refreshedOrganization = await refreshOrganization();
      if (tokenServiceWalletAddress(refreshedOrganization?.tokenServiceWallets, tokenUid, tokenChainUid)) {
        throw new Error('The token revocation is confirmed on-chain but has not yet refreshed in your account. Try again later without sending a new transaction.');
      }
      setServiceWalletPendingSyncAddress('');
      setServiceWalletAddress('');
      setOnchainServiceWallet('');
      setServiceWalletSuccess('Wallet access removed for this token. Automatic price updates are no longer authorized for it.');
      toast.success('Wallet access removed', {
        description: 'Automatic updates are off for this token. Manual updates and API keys are unchanged.',
      });
    } catch (error) {
      setServiceWalletError(
        getErrorMessage(error, 'Wallet access could not be removed. Please try again.'),
      );
    } finally {
      setServiceWalletRevoking(false);
    }
  };

  const synchronizePriceFromBackend = async (pending) => {
    // Prefer the freshly fetched authoritative token value over a stale local on-chain read.
    setOnchainCurrentPrice('');
    clearTokenPriceSyncRecovery(pending.tokenAddress, { chainUid: pending.chainUid, userKey: pending.userKey });
    setPriceSyncStatus('idle');
    setPriceSyncMessage('');
    setPriceEditorOpen(false);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: myTokenQueryKey(token.userKey, pending.chainUid) }),
      queryClient.invalidateQueries({ queryKey: priceHistoryQueryPrefix(token.userKey, pending.chainUid) }),
    ]);
  };

  // The issuer has opted for cancellation directly on the wallet's explicit
  // rejection event. Never call this for a closed editor, RPC error, missing
  // provider response, submitted hash, or uncertain broadcast.
  const cancelRejectedPriceRequest = async (pending) => {
    if (!pending?.walletRejectedAt || pending.txHash || pending.walletSubmissionStartedAt) return;
    if (rejectionCancellationRef.current) return;
    rejectionCancellationRef.current = pending.priceUpdateUid;
    setPriceSyncStatus('awaiting');
    setPriceSyncMessage('Closing the rejected price request. No new wallet transaction will be sent.');
    try {
      const remote = await tokenApi.getManualPriceUpdate(pending.priceUpdateUid, pending.chainUid);
      const remoteStatus = String(remote?.status || '').toUpperCase();
      if (remote?.txHash) {
        const recovered = saveTokenPriceSyncRecovery(pending.tokenAddress, {
          ...pending, txHash: remote.txHash, status: remoteStatus || 'SUBMITTED',
        });
        setPriceSyncStatus('attention');
        setPriceSyncMessage('A transaction hash is already recorded. The request was not cancelled; keep it for verification.');
        void runPriceVerification(recovered, { resumed: true });
        return;
      }
      if (remoteStatus === 'CONFIRMED' || remoteStatus === 'CANCELLED' || remoteStatus === 'FAILED') {
        await synchronizePriceFromBackend(pending);
        return;
      }
      if (remoteStatus !== 'PENDING') {
        throw new Error('This request cannot be cancelled yet. Its current status must be checked.');
      }
      // This field is sent ONLY following an explicit EIP-1193 wallet rejection
      // (not a generic close/network error). The backend still checks mined and
      // pending wallet nonces and can refuse uncertain cancellation.
      const result = await tokenApi.cancelManualPrice(pending.priceUpdateUid, pending.chainUid, {
        confirmNotBroadcast: true,
      });
      const recoveryStatus = String(result?.recoveryStatus || '').toUpperCase();
      const storedStatus = String(result?.status || '').toUpperCase();
      if (recoveryStatus === 'CANCELLED' || storedStatus === 'CANCELLED' ||
        (storedStatus === 'FAILED' && String(result?.errorCode || '').toUpperCase() === 'USER_CANCELLED')) {
        await synchronizePriceFromBackend(pending);
        toast.info('Price update cancelled', {
          description: 'The unsigned price request was closed. Your price is unchanged.',
        });
        return;
      }
      if (recoveryStatus === 'CONFIRMED' || storedStatus === 'CONFIRMED') {
        await synchronizePriceFromBackend(pending);
        toast.success('Price update confirmed', {
          description: 'The existing transaction was confirmed; no new transaction was sent.',
        });
        return;
      }
      if (result?.txHash) {
        saveTokenPriceSyncRecovery(pending.tokenAddress, {
          ...pending, txHash: result.txHash, status: storedStatus || 'SUBMITTED',
        });
      }
      setPriceSyncStatus('attention');
      setPriceSyncMessage(recoveryStatus === 'BROADCAST_STATUS_UNKNOWN'
        ? 'The network could not verify whether this transaction was sent. Your request is saved; do not send another transaction.'
        : 'Your previous price request is still being checked. No new wallet transaction is needed.');
    } catch (error) {
      setPriceSyncStatus('attention');
      setPriceSyncMessage(getErrorMessage(error, 'The rejected price request could not be closed. It remains saved for recovery.'));
      toast.error('Price request still pending', {
        description: 'The server could not confirm cancellation. The original request has been preserved.',
      });
    } finally {
      rejectionCancellationRef.current = null;
    }
  };

  const submitPreparedWithWallet = async (pending) => {
    if (pending.txHash) {
      void runPriceVerification(pending);
      return;
    }
    if (pending.chainUid !== token.selectedChainUid) throw new Error('Switch to the original asset network to resume the prepared transaction.');
    // Mark the wallet invocation only AFTER sender/network validation and
    // immediately BEFORE the actual provider call. An interrupted prompt may
    // have broadcast successfully even if its hash never reached the page.
    let prompted = pending;
    let hash;
    try {
      hash = await sendPreparedManualPriceTransaction({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        issuerWalletAddress: pending.issuerWalletAddress,
        tokenAddress: pending.tokenAddress,
        chainId: pending.chainId,
        prepared: { ...pending, status: 'PENDING' },
        onBeforeBroadcast: () => {
          prompted = saveTokenPriceSyncRecovery(pending.tokenAddress, {
            ...pending, walletSubmissionStartedAt: new Date().toISOString(),
          });
        },
      });
    } catch (error) {
      // An explicit wallet rejection is the only unambiguous no-broadcast
      // signal. Other failures may occur AFTER the transaction was submitted.
      const code = String(error?.code ?? error?.cause?.code ?? '');
      if (code === '4001' || code === 'ACTION_REJECTED') {
        // This provider invocation was explicitly rejected before returning a hash.
        // The backend still checks the nonce and can leave an uncertain request unresolved.
        const rejected = saveTokenPriceSyncRecovery(pending.tokenAddress, {
          ...prompted, walletSubmissionStartedAt: '', walletRejectedAt: new Date().toISOString(),
        });
        setPriceEditorOpen(false);
        await cancelRejectedPriceRequest(rejected);
        return;
      }
      // Unknown provider/RPC errors after opening MetaMask are NOT safe to cancel.
      setPriceSyncStatus('attention');
      setPriceSyncMessage('MetaMask did not return a transaction hash. Check wallet activity before doing anything else. Do not cancel or send another transaction if it may have been broadcast.');
      setPriceEditorOpen(false);
      return;
    }
    // Match the working frontend: persist the returned hash immediately and
    // let the backend PATCH endpoint verify the saved intent. A wallet's RPC
    // transaction lookup can report wrapped/delayed data and must not block
    // the authoritative request before the backend has checked it.
    // This path never asks MetaMask to send another transaction.
    const broadcast = saveTokenPriceSyncRecovery(pending.tokenAddress, {
      ...prompted, txHash: hash, status: 'SUBMITTED',
    });
    setPriceSyncStatus('awaiting');
    setPriceSyncMessage('Awaiting confirmation. The server is checking the original MetaMask transaction.');
    setPriceEditorOpen(false);
    toast.info('Price update in progress', {
      description: "Your transaction was sent successfully. We'll update your price once it's confirmed.",
    });
    void runPriceVerification(broadcast);
  };

  const handlePriceUpdate = async () => {
    if (updatingPrice || priceSyncStatus !== 'idle') return;
    const previouslyPrepared = loadTokenPriceSyncRecovery(tokenContractAddress, { chainUid: tokenChainUid, userKey: token.userKey });
    if (previouslyPrepared) {
      setPriceError('An earlier price request is still pending. Check its status before starting another update.');
      setPriceSyncStatus('attention');
      return;
    }
    const validationError = validateCurrentTokenPrice(newPrice);
    if (validationError) { setPriceError(validationError); return; }
    if (tokenPriceChange(currentPrice, newPrice)?.direction === 'unchanged') {
      setPriceError('Enter a price different from the current price.');
      return;
    }

    setUpdatingPrice(true);
    setPriceError('');
    try {
      if (!tokenContractAddress) throw new Error('The token contract is unavailable. Refresh and retry.');
      if (!tokenChainUid || token.selectedChainUid !== tokenChainUid) {
        throw new Error('Switch to the token’s original network before updating its price.');
      }
      const approvedWallet = organization.walletAddress || information.treasuryWallet;
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect your approved organization wallet before changing the price.');
      }
      if (!approvedWallet || approvedWallet.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error('The connected wallet is not the organization’s approved issuer wallet.');
      }
      if (!wallet.isCorrectNetwork) await wallet.switchChain(wallet.requiredChain.id);
      const submittedPrice = String(newPrice).trim();
      // Save the intent BEFORE asking MetaMask for a transaction. This prevents
      // a wallet rejection or page close from losing the PENDING audit entry.
      const prepared = await tokenApi.prepareManualPrice(submittedPrice, tokenChainUid);
      validatePreparedManualPrice(prepared, {
        issuerWalletAddress: approvedWallet,
        tokenAddress: tokenContractAddress,
        chainId: tokenChainId || wallet.requiredChain.id,
      });
      const pending = saveTokenPriceSyncRecovery(tokenContractAddress, {
        priceUpdateUid: prepared.priceUpdateUid,
        currentTokenPrice: submittedPrice,
        chainUid: tokenChainUid,
        userKey: token.userKey,
        chainId: prepared.chainId,
        issuerWalletAddress: prepared.issuerWalletAddress,
        controllerAddress: prepared.controllerAddress,
        tokenUid: prepared.tokenUid,
        transactionRequest: prepared.transactionRequest,
        txHash: prepared.txHash || '',
        status: prepared.status,
      });
      // Surface the prepared intent in price history before MetaMask opens.
      void queryClient.invalidateQueries({ queryKey: priceHistoryQueryPrefix(token.userKey, pending.chainUid) });
      if (pending.txHash) {
        // A prepared request already submitted on-chain must NEVER open the wallet.
        void runPriceVerification(pending, { resumed: true });
      } else {
        // Prepare and wallet approval form one user action. Do not add a second
        // wallet approval button or replay a rejected/uncertain request.
        const remote = await tokenApi.getManualPriceUpdate(pending.priceUpdateUid, pending.chainUid);
        const remoteStatus = String(remote?.status || '').toUpperCase();
        if (remote?.txHash) {
          const submitted = saveTokenPriceSyncRecovery(pending.tokenAddress, {
            ...pending, txHash: remote.txHash, status: remoteStatus || 'SUBMITTED',
          });
          void runPriceVerification(submitted, { resumed: true });
        } else if (['CONFIRMED', 'CANCELLED', 'FAILED', 'ORPHANED'].includes(remoteStatus)) {
          await synchronizePriceFromBackend(pending);
        } else if (remoteStatus === 'PENDING') {
          await submitPreparedWithWallet(pending);
        } else {
          setPriceSyncStatus('attention');
          setPriceSyncMessage('The saved price request has an unexpected status. No wallet transaction was sent.');
        }
      }
    } catch (error) {
      const saved = loadTokenPriceSyncRecovery(tokenContractAddress, { chainUid: tokenChainUid, userKey: token.userKey });
      if (saved && !saved.txHash) {
        // Preserve the pending intent; only an unsigned request may be cancelled.
        setPriceSyncStatus('attention');
        setPriceSyncMessage(saved.walletSubmissionStartedAt
          ? 'MetaMask was opened, but no transaction hash was captured. Check wallet activity; do not resend or cancel this request if it may have been broadcast.'
          : 'Your price request was saved but the wallet action did not finish. No new transaction will be sent automatically.');
      }
      setPriceError(getErrorMessage(error, 'The price change could not be prepared or sent.'));
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
                <NetworkIcon chain={tokenChainPresentation || undefined} chainId={tokenChainId} name={network} size="xs" />
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
              <button type="button" onClick={openPriceEditor} disabled={priceSyncStatus !== 'idle'} aria-label="Edit current investor price">
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
            {priceSyncStatus !== 'idle' ? (
              <em className={`token-dashboard-header__price-note ${priceSyncStatus === 'attention' ? 'is-warning' : ''}`} role="status">
                {priceSyncStatus === 'awaiting' ? 'Awaiting confirmation' : 'Price update needs attention'}: {priceSyncMessage}
                {(() => {
                  const saved = loadTokenPriceSyncRecovery(tokenContractAddress, { chainUid: tokenChainUid, userKey: token.userKey });
                  const explorerLink = transactionExplorerUrl(saved?.txHash, saved?.chainId || tokenChainId);
                  return explorerLink ? <> {' '}<a href={explorerLink} target="_blank" rel="noopener noreferrer">View saved transaction on explorer</a></> : null;
                })()}
              </em>
            ) : null}
          </div>
          {hasInitialPrice ? (
            <div className="token-dashboard-pricing__initial">
              <small>Initial price</small>
              <strong><TokenPriceValue value={initialPrice} suffix={` ${paymentSymbol}`} /></strong>
            </div>
          ) : null}
        </div>
        <div className="token-dashboard-header__automation">
          <span className="token-dashboard-header__automation-icon" aria-hidden="true">
            <Settings2 size={18} />
          </span>
          <div className="token-dashboard-header__automation-copy">
            <div>
              <strong>Automatic Price Updates</strong>
              <span className="token-dashboard-header__automation-badge">{registeredServiceWallet ? 'Configured' : 'Optional'}</span>
            </div>
            <span>{registeredServiceWallet ? 'Your Service Wallet is set up for automatic price updates. You can also update prices manually at any time.' : 'Configure a Service Wallet to automatically update asset prices. You can also update prices manually at any time.'}</span>
          </div>
          <div className="token-dashboard-header__automation-actions">
            <Link
              to={botConfigurationLink}
              className="token-dashboard-header__automation-link token-dashboard-header__automation-button"
            >
              Bot Configuration
            </Link>
            <button
              type="button"
              className="token-dashboard-header__automation-button"
              onClick={() => setPriceAutomationOpen(true)}
              aria-haspopup="dialog"
            >
              Manage Service Wallet
            </button>
          </div>
        </div>
      </header>

      {setupNeedsTransferActivation ? (
        <InfoCallout title="Setup is not finished" tone="warning" icon={ShieldCheck}>
          Transfers are still paused, so investors cannot receive or transfer this asset yet. Finish Setup retries only the missing activation step and will not create another asset.
        </InfoCallout>
      ) : null}

      <IssuerPriceHistory
        compact
        key={`${token.userKey}-${token.selectedChainUid}-${token.tokenUid || routeTokenId}`}
        userKey={token.userKey}
        chainUid={tokenChainUid}
        selectedChainUid={token.selectedChainUid}
        tokenUid={token.tokenUid || routeTokenId}
        symbol={paymentSymbol}
        tokenName={paymentTokenMetadata.name}
        imageUrl={paymentTokenMetadata.imageUrl}
        chainId={tokenChainId}
      />

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
        open={priceAutomationOpen}
        onClose={() => setPriceAutomationOpen(false)}
        title="Price update settings"
        trapFocus
        className="token-price-automation-modal"
        bodyClassName="token-price-automation-modal__body"
        footer={(
          <Button variant="primary" onClick={() => setPriceAutomationOpen(false)}>
            Done
          </Button>
        )}
      >
        <div className="token-price-automation-modal__intro">
          <span className="token-price-automation-modal__intro-icon" aria-hidden="true">
            <Settings2 size={19} />
          </span>
          <div>
            <strong>Choose how you want to manage future price updates</strong>
            <p>
              You can still update prices manually. Add an authorized Service Wallet to enable automatic price updates.
            </p>
          </div>
        </div>
        <PriceUpdatesCard
          serviceWalletAlwaysEnabled
          botConfigurationLink={botConfigurationLink}
          serviceWalletAddress={serviceWalletAddress}
          onServiceWalletAddressChange={(value) => {
            setServiceWalletAddress(value);
            if (
              serviceWalletPendingSyncAddress &&
              serviceWalletPendingSyncAddress.toLowerCase() !== String(value || '').trim().toLowerCase()
            ) {
              setServiceWalletPendingSyncAddress('');
            }
            setServiceWalletError('');
            setServiceWalletSuccess('');
          }}
          currentServiceWalletAddress={registeredServiceWallet}
          serviceWalletNetworkName={tokenChainPresentation?.chainName || tokenChainPresentation?.networkName || tokenChain.name}
          serviceWalletSubmitting={serviceWalletSubmitting}
          serviceWalletRevoking={serviceWalletRevoking}
          serviceWalletExternalError={serviceWalletError}
          serviceWalletSuccessMessage={serviceWalletSuccess}
          serviceWalletNeedsSync={Boolean(serviceWalletPendingSyncAddress)}
          serviceWalletNetworkMismatch={Boolean(
            !serviceWalletLoading &&
            !serviceWalletSubmitting &&
            !serviceWalletRevoking &&
            !serviceWalletPendingSyncAddress &&
            onchainServiceWallet !== null &&
            onchainServiceWallet.toLowerCase() !== registeredServiceWallet.toLowerCase()
          )}
          onServiceWalletSubmit={handleServiceWalletRegistration}
          onServiceWalletRevoke={handleServiceWalletRevoke}
          walletFieldId="asset-service-wallet-address"
        />
      </Modal>

      <Modal
        open={priceEditorOpen}
        onClose={closePriceEditor}
        title="Update Price"
        trapFocus
        className="token-price-editor"
        footer={(
          <>
            <Button variant="secondary" onClick={closePriceEditor} disabled={updatingPrice && priceSyncStatus !== 'awaiting'}>
              {priceSyncStatus === 'idle' ? 'Cancel' : 'Close'}
            </Button>
            {priceSyncStatus === 'idle' ? (
              <Button
                onClick={handlePriceUpdate}
                loading={updatingPrice}
                disabled={updatingPrice || Boolean(priceValidationError) || !newPrice || priceUnchanged}
              >Update Price</Button>
            ) : null}
          </>
        )}
      >
        <div className="token-price-editor__intro">
          {priceSyncStatus === 'idle' ? (
            <p>
              Set a new price for future purchases and redemptions.
              Click <strong>Update Price</strong> to open MetaMask, where you can review the request and choose to confirm or reject it.
              The new price will be visible to investors only after you confirm the transaction in MetaMask. Your initial price will remain unchanged.
            </p>
          ) : (
            <p>Your current investor price stays unchanged until the blockchain confirms the update. Your initial price will remain unchanged.</p>
          )}
        </div>
        {priceSyncStatus === 'attention' ? (
          <div className="token-price-editor__guidance" role="status" aria-live="polite">
            <strong>Before you continue</strong>
            <p>{priceSyncMessage}</p>
          </div>
        ) : null}
        <div className="token-price-editor__snapshot" aria-label="Token price comparison">
          <div><span>Initial Price</span><strong><TokenPriceValue value={initialPrice} suffix={` ${paymentSymbol}`} /></strong><small>Original price</small></div>
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
          disabled={updatingPrice || priceSyncStatus !== 'idle'}
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
