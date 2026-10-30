import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseUnits } from 'viem';
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, ExternalLink, Fuel, LoaderCircle, ShieldCheck } from 'lucide-react';
import { NetworkIcon } from '@/components/common/NetworkIcon';
import { TokenIcon } from '@/components/common/TokenIcon';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { readWalletNativeBalance, readWalletTokenBalance } from '@/services/wallet/walletAssets.service';
import { bridgeExplorerUrl, createUsdcBridgeSession, executeUsdcBridgeSession, getUsdcBridgeRoute, isBridgeStepEventComplete, isBridgeStepEventFailed, isUsdcBridgeResultComplete, normalizeBridgeStepName, revalidateUsdcBridgeSession } from '@/services/wallet/usdcBridge.service';
import { shortenWalletAddress } from '@/utils/wallet';

const clean = (value) => String(value ?? '').trim();
const positive = (value) => /^\d+(?:\.\d+)?$/.test(clean(value)) && /[1-9]/.test(clean(value));
const usdcUnits = (value) => {
  const [whole = '0', fraction = ''] = clean(value).split('.');
  return parseUnits(`${whole || '0'}${fraction ? `.${fraction.slice(0, 6)}` : ''}`, 6);
};
const displayAmount = (value, digits = 6) => {
  const normalized = clean(value);
  if (!normalized) return '—';
  const [whole = '0', fraction = ''] = normalized.split('.');
  const clipped = fraction.slice(0, digits).replace(/0+$/, '');
  const grouped = (whole.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}${clipped ? `.${clipped}` : ''}`;
};

const friendlyNetworkName = (side) => {
  const name = clean(side?.networkName);
  return /^arc$/i.test(name) ? 'Arc' : (name || 'this network');
};

const networkFeeTokenLabel = (side) => {
  const symbol = clean(side?.nativeSymbol);
  if (symbol.toUpperCase() === 'USDC') return 'USDC';
  const nativeName = clean(side?.nativeName).replace(/\bEther\b/gi, 'ETH');
  if (nativeName) return nativeName;
  if (symbol.toUpperCase() === 'ETH') {
    const networkName = friendlyNetworkName(side);
    if (/arbitrum/i.test(networkName)) return 'Arbitrum ETH';
    if (/sepolia/i.test(networkName)) return 'Sepolia ETH';
  }
  return symbol || 'the network fee token';
};

const NetworkFeeNote = ({ side, transactionSide, query, balance }) => {
  const networkName = friendlyNetworkName(side);
  const tokenLabel = networkFeeTokenLabel(side);
  const hasWarning = query.isError || (!query.isLoading && !positive(balance));
  return (
    <div className={`wallet-bridge-gas-note${hasWarning ? ' is-warning' : ''}`}>
      <Fuel size={17} />
      <span>
        <strong>{networkName} network fee</strong>
        <small>You need <b>{tokenLabel} on {networkName}</b> in your wallet to complete the {transactionSide} transaction.</small>
      </span>
    </div>
  );
};

const uniqueSides = (routes, key) => {
  const map = new Map();
  (routes || []).forEach((route) => {
    const side = route?.[key];
    if (side?.chainId && !map.has(Number(side.chainId))) map.set(Number(side.chainId), side);
  });
  return [...map.values()];
};

function NetworkSelect({ label, side, options, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const handleKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="wallet-bridge-network-select" ref={rootRef}>
      <span className="wallet-bridge-network-select__label">{label}</span>
      <button
        type="button"
        className="wallet-bridge-network-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <NetworkIcon chainId={side?.chainId} name={side?.networkName} imageUrl={side?.chainImageUrl} size="md" />
        <span className="wallet-bridge-network-select__copy">
          <strong>{side?.networkName}</strong>
          <small>{side?.nativeSymbol} gas · {side?.isTestnet ? 'Testnet' : 'Mainnet'}</small>
        </span>
        <ChevronDown className={open ? 'is-open' : ''} size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="wallet-bridge-network-select__menu" role="listbox">
          {options.map((option) => {
            const selected = Number(option.chainId) === Number(side?.chainId);
            return (
              <button
                key={option.chainId}
                type="button"
                role="option"
                aria-selected={selected}
                className={`wallet-bridge-network-select__option${selected ? ' is-selected' : ''}`}
                onClick={() => { onChange(option.chainId); setOpen(false); }}
              >
                <NetworkIcon chainId={option.chainId} name={option.networkName} imageUrl={option.chainImageUrl} size="sm" />
                <span>
                  <strong>{option.networkName}</strong>
                  <small>Gas token: {option.nativeSymbol}</small>
                </span>
                <span className="wallet-bridge-network-select__check">{selected ? <Check size={15} /> : null}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DirectionSelector({ routes, route, disabled, onChange }) {
  const sources = useMemo(() => uniqueSides(routes, 'source'), [routes]);
  const destinations = useMemo(
    () => uniqueSides(routes.filter((item) => Number(item.source?.chainId) === Number(route?.source?.chainId)), 'destination'),
    [route?.source?.chainId, routes],
  );
  const handleSourceChange = (chainId) => {
    const preferred = routes.find((item) => Number(item.source?.chainId) === Number(chainId) && Number(item.destination?.chainId) === Number(route?.destination?.chainId));
    const next = preferred || routes.find((item) => Number(item.source?.chainId) === Number(chainId));
    if (next) onChange(next.id);
  };
  const handleDestinationChange = (chainId) => {
    const next = routes.find((item) => Number(item.source?.chainId) === Number(route?.source?.chainId) && Number(item.destination?.chainId) === Number(chainId));
    if (next) onChange(next.id);
  };

  return (
    <section className="wallet-bridge-route-picker" aria-label="USDC bridge route">
      <div className="wallet-bridge-route-picker__heading">
        <div>
          <small>Bridge route</small>
          <strong>Choose source and destination</strong>
        </div>
        <TokenIcon symbol="USDC" name="USD Coin" imageUrl={route?.source?.usdcImageUrl || route?.destination?.usdcImageUrl} size="sm" />
      </div>
      <div className="wallet-bridge-route-picker__controls">
        <NetworkSelect label="From" side={route?.source} options={sources} disabled={disabled} onChange={handleSourceChange} />
        <span className="wallet-bridge-route-picker__arrow" aria-hidden="true"><ArrowRight size={18} /></span>
        <NetworkSelect label="To" side={route?.destination} options={destinations} disabled={disabled} onChange={handleDestinationChange} />
      </div>
      <div className="wallet-bridge-route-picker__note">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>Only configured Circle USDC routes are shown. Selecting a route does not submit a transaction.</span>
      </div>
    </section>
  );
}

const feeAmount = (fee) => clean(fee?.amount ?? fee?.fee ?? fee?.value ?? fee?.fees?.fee ?? fee?.fees?.amount ?? fee?.fees?.value);
const feeToken = (fee, fallback = 'USDC') => clean(fee?.token || fee?.symbol || fee?.currency || fee?.fees?.token || fee?.fees?.symbol || fallback);
const feeDescriptor = (fee) => clean(fee?.step || fee?.method || fee?.action || fee?.type || fee?.name || fee?.label).toLowerCase();
const isGasFeeRecord = (fee) => /gas|approval|approve|burn|deposit|mint|receive|destination|source/i.test(feeDescriptor(fee)) || feeToken(fee, '').toUpperCase() !== 'USDC';
const feeRecordKey = (fee) => [feeDescriptor(fee), feeAmount(fee), feeToken(fee, '')].join(':');
const feeMatchesNetwork = (fee, side) => {
  const haystack = [fee?.chain, fee?.chainName, fee?.network, fee?.networkName, fee?.blockchain, fee?.chainId, fee?.networkId]
    .map((value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  const needles = [side?.networkName, side?.appKitChain, side?.chainId]
    .map((value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  return haystack.some((value) => needles.includes(value));
};
const gasFeePresentation = ({ fee, route, gasIndex, gasCount }) => {
  const descriptor = feeDescriptor(fee);
  const sourceName = friendlyNetworkName(route?.source);
  const destinationName = friendlyNetworkName(route?.destination);
  const source = { networkName: sourceName, token: clean(route?.source?.nativeSymbol) };
  const destination = { networkName: destinationName, token: clean(route?.destination?.nativeSymbol) };
  if (/approv/.test(descriptor)) return { label: `${sourceName} USDC approval gas`, tokenFallback: source.token };
  if (/burn|deposit|source/.test(descriptor)) return { label: `${sourceName} bridge transaction gas`, tokenFallback: source.token };
  if (/mint|receive|destination/.test(descriptor)) return { label: `${destinationName} mint transaction gas`, tokenFallback: destination.token };
  if (feeMatchesNetwork(fee, route?.source)) return { label: `${sourceName} network gas`, tokenFallback: source.token };
  if (feeMatchesNetwork(fee, route?.destination)) return { label: `${destinationName} network gas`, tokenFallback: destination.token };

  // Circle can return gas estimates without step metadata. Keep each line useful by
  // mapping the normal CCTP sequence instead of repeating the generic "Bridge fee" label.
  if (!route?.source?.usdcIsNative && gasCount >= 3) {
    if (gasIndex === 0) return { label: `${sourceName} USDC approval gas`, tokenFallback: source.token };
    if (gasIndex === gasCount - 1) return { label: `${destinationName} mint transaction gas`, tokenFallback: destination.token };
    const suffix = gasCount > 3 ? ` ${gasIndex}` : '';
    return { label: `${sourceName} bridge transaction gas${suffix}`, tokenFallback: source.token };
  }
  if (gasCount >= 2) {
    if (gasIndex === gasCount - 1) return { label: `${destinationName} mint transaction gas`, tokenFallback: destination.token };
    const suffix = gasCount > 2 ? ` ${gasIndex + 1}` : '';
    return { label: `${sourceName} bridge transaction gas${suffix}`, tokenFallback: source.token };
  }
  return { label: `${sourceName} network gas`, tokenFallback: source.token };
};
const nonGasFeeLabel = (fee) => {
  const descriptor = feeDescriptor(fee);
  if (/relay|forwarder/.test(descriptor)) return 'Circle relay fee';
  if (/custom|developer/.test(descriptor)) return 'Developer fee';
  if (/fast|provider|protocol|cctp/.test(descriptor) || feeToken(fee).toUpperCase() === 'USDC') return 'Circle fast-transfer fee';
  return 'Circle bridge service fee';
};
function FeeRows({ estimate, route }) {
  const fees = Array.isArray(estimate?.fees) ? estimate.fees : [];
  const rawGasFees = Array.isArray(estimate?.gasFees)
    ? estimate.gasFees
    : estimate?.gasFees && typeof estimate.gasFees === 'object'
      ? Object.values(estimate.gasFees).filter(Boolean)
      : [];
  const gasFees = rawGasFees.length ? rawGasFees : fees.filter(isGasFeeRecord);
  const gasKeys = new Set(gasFees.map(feeRecordKey));
  const serviceFees = fees.filter((fee) => !gasKeys.has(feeRecordKey(fee)) && !isGasFeeRecord(fee));
  const rows = [
    ...serviceFees.map((fee) => ({ fee, label: nonGasFeeLabel(fee), kind: 'service' })),
    ...gasFees.map((fee, gasIndex) => ({ fee, ...gasFeePresentation({ fee, route, gasIndex, gasCount: gasFees.length }), kind: 'gas' })),
  ];
  if (!rows.length) return <div className="wallet-bridge-fee-row"><span>Estimated fees</span><strong>Calculated by Circle at confirmation</strong></div>;
  return <>{rows.map(({ fee, label, kind, tokenFallback }, index) => <div className="wallet-bridge-fee-row" key={`${kind}-${feeRecordKey(fee)}-${index}`}><span>{label}</span><strong>{feeAmount(fee) ? `${displayAmount(feeAmount(fee), 8)} ${feeToken(fee, kind === 'gas' ? tokenFallback : 'USDC')}` : 'Included in estimate'}</strong></div>)}</>;
}

const bridgeStepsFor = (route) => [
  { id: 'approve', label: route.source.usdcIsNative ? `Prepare ${route.source.networkName} USDC` : `Approve ${route.source.networkName} USDC`, detail: 'Prepare the source USDC transfer.' },
  { id: 'burn', label: `Send from ${route.source.networkName}`, detail: 'Submit the source CCTP transfer.' },
  { id: 'attestation', label: 'Verify cross-chain transfer', detail: 'Circle confirms the CCTP message.' },
  { id: 'mint', label: `Receive on ${route.destination.networkName}`, detail: 'Submit the destination mint using the connected wallet.' },
];
const initialSteps = (steps) => Object.fromEntries(steps.map((step) => [step.id, 'waiting']));

export function UsdcBridgeModal({ open, onClose, walletAddress, getProvider, switchWalletChain, routes = [], initialRouteId = '', onBridgeCompleted, onViewDestinationBalance }) {
  const validInitial = routes.some((route) => route.id === initialRouteId) ? initialRouteId : routes[0]?.id || '';
  const [routeId, setRouteId] = useState(validInitial);
  const [stage, setStage] = useState('amount');
  const [amount, setAmount] = useState('');
  const [session, setSession] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [error, setError] = useState('');
  const [steps, setSteps] = useState({});
  const [stepLinks, setStepLinks] = useState({});
  const [result, setResult] = useState(null);
  const bridgeInFlightRef = useRef(false);

  const route = useMemo(() => {
    const id = routeId || validInitial;
    if (!id || !routes.length) return null;
    return getUsdcBridgeRoute(routes, id);
  }, [routes, routeId, validInitial]);
  const bridgeSteps = useMemo(() => route ? bridgeStepsFor(route) : [], [route]);
  const queryEnabled = open && Boolean(walletAddress && route?.source?.chainId);
  const sourceGasQuery = useQuery({ queryKey: ['bridge-source-gas', walletAddress, route?.source?.chainId], queryFn: () => readWalletNativeBalance({ walletAddress, chainId: route.source.chainId }), enabled: queryEnabled, staleTime: 10_000, retry: 1 });
  const destinationGasQuery = useQuery({ queryKey: ['bridge-destination-gas', walletAddress, route?.destination?.chainId], queryFn: () => readWalletNativeBalance({ walletAddress, chainId: route.destination.chainId }), enabled: queryEnabled, staleTime: 10_000, retry: 1 });
  const sourceUsdcQuery = useQuery({
    queryKey: ['bridge-source-usdc', walletAddress, route?.source?.chainId, route?.source?.usdcAddress || 'native'],
    queryFn: () => readWalletTokenBalance({ tokenAddress: route.source.usdcAddress, walletAddress, chainId: route.source.chainId, decimals: route.source.usdcDecimals || 6 }),
    enabled: queryEnabled && !route?.source?.usdcIsNative && Boolean(route?.source?.usdcAddress), staleTime: 10_000, retry: 1,
  });
  const sourceUsdcBalance = clean(route?.source?.usdcIsNative ? sourceGasQuery.data?.formatted : sourceUsdcQuery.data?.formatted);
  const sourceUsdcLoading = route?.source?.usdcIsNative ? sourceGasQuery.isLoading : sourceUsdcQuery.isLoading;
  const sourceUsdcError = route?.source?.usdcIsNative ? sourceGasQuery.isError : sourceUsdcQuery.isError;
  const sourceGasBalance = clean(sourceGasQuery.data?.formatted);
  const destinationGasBalance = clean(destinationGasQuery.data?.formatted);

  const reset = useCallback((nextId) => {
    const next = getUsdcBridgeRoute(routes, nextId);
    setRouteId(next.id); setStage('amount'); setAmount(''); setSession(null); setEstimate(null); setPreflight(null); setEstimating(false); setError(''); setSteps(initialSteps(bridgeStepsFor(next))); setStepLinks({}); setResult(null);
  }, [routes]);
  useEffect(() => { if (open && validInitial) reset(validInitial); }, [open, validInitial, reset]);

  const amountValidation = useMemo(() => {
    if (!route) return '';
    const normalized = clean(amount);
    if (!normalized) return '';
    if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) return 'Enter a valid USDC amount with up to 6 decimals.';
    if (!positive(normalized)) return 'Enter an amount greater than 0 USDC.';
    if (sourceUsdcError) return `Unable to read the ${route.source.networkName} USDC balance.`;
    if (!positive(sourceUsdcBalance)) return `This wallet does not have ${route.source.networkName} USDC available to bridge.`;
    try {
      const requested = usdcUnits(normalized);
      const available = usdcUnits(sourceUsdcBalance);
      if (requested > available) return `You only have ${displayAmount(sourceUsdcBalance, 6)} USDC on ${route.source.networkName}.`;
      if (route.source.usdcIsNative && requested >= available) return `Leave some USDC on ${route.source.networkName} to pay source-chain gas.`;
    } catch { return 'Unable to validate this USDC amount.'; }
    return '';
  }, [amount, route, sourceUsdcBalance, sourceUsdcError]);
  const canReview = !sourceUsdcLoading && !sourceGasQuery.isLoading && !destinationGasQuery.isLoading && !sourceUsdcError && !sourceGasQuery.isError && !destinationGasQuery.isError && positive(sourceGasBalance) && positive(destinationGasBalance) && positive(amount) && !amountValidation;

  const handleReview = async () => {
    if (!canReview || estimating) return;
    setEstimating(true); setError('');
    try {
      await switchWalletChain?.(route.source.chainId);
      const provider = await getProvider?.();
      const next = await createUsdcBridgeSession({ provider, walletAddress, amount, route });
      setSession(next); setEstimate(next.estimate); setPreflight(next.preflight); setStage('review');
    } catch (e) { setError(clean(e?.shortMessage || e?.message || e) || 'Unable to estimate this bridge right now.'); }
    finally { setEstimating(false); }
  };
  const handleBridgeEvent = (payload) => {
    const name = normalizeBridgeStepName(payload);
    const index = bridgeSteps.findIndex((step) => step.id === name);
    if (index < 0) return;
    const complete = isBridgeStepEventComplete(payload);
    const failed = isBridgeStepEventFailed(payload);
    setSteps((current) => {
      const next = { ...current };
      bridgeSteps.forEach((step, i) => { if (i < index) next[step.id] = 'complete'; });
      next[name] = complete ? 'complete' : 'active';
      if (complete && bridgeSteps[index + 1]) next[bridgeSteps[index + 1].id] = 'active';
      if (failed) next[name] = 'active';
      return next;
    });
    const url = bridgeExplorerUrl(payload); if (url) setStepLinks((current) => ({ ...current, [name]: url }));
  };
  const handleExecute = async () => {
    if (!session || bridgeInFlightRef.current || bridging || !preflight?.ok) return;
    // Set the ref synchronously before any wallet/provider call. This prevents a
    // backdrop/Escape close from racing React's state update while MetaMask is
    // opening or moving between the approval, burn and mint confirmations.
    bridgeInFlightRef.current = true;
    setBridging(true); setError(''); let started = false;
    try {
      await switchWalletChain?.(route.source.chainId);
      const refreshed = await revalidateUsdcBridgeSession(session);
      setSession(refreshed); setEstimate(refreshed.estimate); setPreflight(refreshed.preflight); setStage('processing'); setSteps({ ...initialSteps(bridgeSteps), [bridgeSteps[0].id]: 'active' }); started = true;
      const bridgeResult = await executeUsdcBridgeSession({ session: refreshed, onEvent: handleBridgeEvent });
      if (!isUsdcBridgeResultComplete(bridgeResult)) {
        const failed = (bridgeResult?.steps || []).find((step) => step?.error || /error|failed|failure|rejected|cancelled|canceled/i.test(clean(step?.state || step?.status)));
        const detail = clean(failed?.error?.message || failed?.error || failed?.message);
        throw new Error(detail || 'The bridge has not completed its final destination transaction yet.');
      }
      setSteps(Object.fromEntries(bridgeSteps.map((step) => [step.id, 'complete']))); setResult(bridgeResult); setStage('success');
      // Notify the parent only after full-result validation so balance refresh
      // and the completion toast can run. The modal intentionally remains open
      // on its success screen until the user explicitly closes it.
      await onBridgeCompleted?.({ result: bridgeResult, route, amount: clean(amount) });
    } catch (e) {
      bridgeInFlightRef.current = false;
      setError(clean(e?.shortMessage || e?.message || e) || 'The bridge could not be completed.');
      setStage(started ? 'error' : 'review');
    } finally {
      bridgeInFlightRef.current = false;
      setBridging(false);
    }
  };
  const safeClose = () => { if (!bridgeInFlightRef.current && !bridging) onClose?.(); };
  if (!routes.length || !route) return null;

  const footer = stage === 'amount' ? <><Button variant="secondary" onClick={safeClose}>Cancel</Button><Button loading={estimating} onClick={handleReview} disabled={!canReview}>Review bridge</Button></>
    : stage === 'review' ? <><Button variant="secondary" onClick={() => { setStage('amount'); setError(''); }}>Back</Button><Button loading={bridging} onClick={handleExecute} disabled={!preflight?.ok}>{route.label}</Button></>
      : stage === 'success' ? <><Button variant="secondary" onClick={safeClose}>Close</Button><Button onClick={() => { onViewDestinationBalance?.(route.destination.chainId); safeClose(); }}>View destination balance</Button></>
        : stage === 'error' ? <><Button variant="secondary" onClick={safeClose}>Close</Button><Button onClick={() => reset(route.id)}>Review again</Button></> : null;

  return (
    <Modal open={open} onClose={safeClose} title="Bridge USDC" className="wallet-bridge-modal sm:max-w-2xl" bodyClassName="wallet-bridge-modal__body" footer={footer} trapFocus>
      <DirectionSelector routes={routes} route={route} disabled={bridging || estimating || !['amount', 'review'].includes(stage)} onChange={reset} />
      {stage === 'amount' ? <div className="wallet-bridge-section-stack">
        <section className="wallet-bridge-panel"><div className="wallet-bridge-panel__heading"><div><small>Amount to bridge</small><strong>{route.source.networkName} USDC</strong></div><TokenIcon symbol="USDC" name="USD Coin" imageUrl={route.source.usdcImageUrl} size="md" /></div>
          <label className="wallet-bridge-amount-field"><span className="sr-only">USDC amount</span><input type="text" inputMode="decimal" value={amount} onChange={(e) => { const next = e.target.value.replace(/,/g, '').trim(); if (next === '' || /^\d*(?:\.\d{0,6})?$/.test(next)) setAmount(next); }} placeholder="0.00" /><span>USDC</span></label>
          <div className="wallet-bridge-balance-line"><span>Available on {route.source.networkName}</span>{route.source.usdcIsNative ? <strong>{sourceUsdcLoading ? 'Loading…' : `${displayAmount(sourceUsdcBalance || '0', 6)} USDC`}</strong> : <button type="button" onClick={() => setAmount(displayAmount(sourceUsdcBalance, 6).replace(/,/g, ''))} disabled={!positive(sourceUsdcBalance) || sourceUsdcLoading}>{sourceUsdcLoading ? 'Loading…' : `${displayAmount(sourceUsdcBalance || '0', 6)} USDC · Max`}</button>}</div>
          {amountValidation ? <p className="wallet-bridge-field-error"><AlertCircle size={14} /> {amountValidation}</p> : null}
        </section>
        <NetworkFeeNote side={route.source} transactionSide="source" query={sourceGasQuery} balance={sourceGasBalance} />
        <NetworkFeeNote side={route.destination} transactionSide="destination" query={destinationGasQuery} balance={destinationGasBalance} />
        <div className="wallet-bridge-trust-note"><ShieldCheck size={17} /><span>No bridge transaction is submitted until the USDC and gas checks pass.</span></div>
      </div> : null}
      {stage === 'review' ? <div className="wallet-bridge-section-stack"><section className="wallet-bridge-panel"><div className="wallet-bridge-review-amount"><span><small>You are bridging</small><strong>{displayAmount(amount, 6)} USDC</strong></span><TokenIcon symbol="USDC" name="USD Coin" imageUrl={route.source.usdcImageUrl} size="lg" /></div><div className="wallet-bridge-fees"><div className="wallet-bridge-fee-row"><span>Source wallet</span><strong>{shortenWalletAddress(walletAddress, 7, 6)}</strong></div><div className="wallet-bridge-fee-row"><span>Route</span><strong>{route.source.networkName} → {route.destination.networkName}</strong></div><FeeRows estimate={estimate} route={route} /></div></section>
        {preflight?.ok ? <section className="wallet-bridge-panel"><div className="wallet-bridge-panel__heading"><div><small>Preflight validation</small><strong>Required balances verified</strong></div><CheckCircle2 size={20} /></div><div className="wallet-bridge-fees"><div className="wallet-bridge-fee-row"><span>Source USDC</span><strong>{displayAmount(preflight.sourceToken.balance, 6)} available</strong></div><div className="wallet-bridge-fee-row"><span>{friendlyNetworkName(route.source)} gas reserve</span><strong>~{displayAmount(preflight.sourceGas.required, 8)} {preflight.sourceGas.symbol}</strong></div><div className="wallet-bridge-fee-row"><span>{friendlyNetworkName(route.destination)} gas reserve</span><strong>~{displayAmount(preflight.destinationGas.required, 8)} {preflight.destinationGas.symbol}</strong></div></div></section> : null}
      </div> : null}
      {stage === 'processing' ? <div className="wallet-bridge-section-stack"><div className="wallet-bridge-processing-head"><span className="wallet-bridge-processing-spinner"><LoaderCircle size={24} /></span><div><strong>{route.label}: {displayAmount(amount, 6)} USDC</strong><p>Keep this window open and complete each wallet confirmation when prompted.</p></div></div><div className="wallet-bridge-progress">{bridgeSteps.map((step) => { const status = steps[step.id] || 'waiting'; return <div className={`wallet-bridge-progress__step is-${status}`} key={step.id}><span className="wallet-bridge-progress__icon">{status === 'complete' ? <Check size={15} /> : status === 'active' ? <LoaderCircle size={15} /> : <span />}</span><div><strong>{step.label}</strong><small>{status === 'complete' ? 'Completed' : status === 'active' ? 'In progress' : step.detail}</small></div>{stepLinks[step.id] ? <a href={stepLinks[step.id]} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a> : null}</div>; })}</div></div> : null}
      {stage === 'success' ? <div className="wallet-bridge-result is-success"><span className="wallet-bridge-result__icon"><CheckCircle2 size={28} /></span><h3>USDC bridged to {route.destination.networkName}</h3><p>{displayAmount(result?.amount || amount, 6)} USDC completed the Circle bridge flow.</p></div> : null}
      {stage === 'error' ? <div className="wallet-bridge-result is-error"><span className="wallet-bridge-result__icon"><AlertCircle size={28} /></span><h3>Bridge needs attention</h3><p>{error}</p></div> : null}
      {error && stage !== 'error' ? <div className="wallet-bridge-inline-error"><AlertCircle size={16} /><span>{error}</span></div> : null}
    </Modal>
  );
}
export default UsdcBridgeModal;
