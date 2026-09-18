import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Fuel,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { ArcNetworkIcon } from '@/components/common/ArcNetworkIcon';
import { TokenIcon } from '@/components/common/TokenIcon';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { web3Config } from '@/config/web3';
import {
  bridgeExplorerUrl,
  createUsdcBridgeSession,
  executeUsdcBridgeSession,
  getUsdcBridgeRoute,
  normalizeBridgeStepName,
  revalidateUsdcBridgeSession,
} from '@/services/wallet/usdcBridge.service';
import { shortenWalletAddress } from '@/utils/wallet';

const clean = (value) => String(value ?? '').trim();
const hasPositiveDecimal = (value) => /^\d+(?:\.\d+)?$/.test(clean(value)) && /[1-9]/.test(clean(value));
const displayAmount = (value, digits = 6) => {
  const normalized = clean(value);
  if (!normalized) return '—';
  const [whole = '0', fraction = ''] = normalized.split('.');
  const clipped = fraction.slice(0, digits).replace(/0+$/, '');
  const grouped = (whole.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}${clipped ? `.${clipped}` : ''}`;
};

const feeLabel = (type) => {
  switch (String(type || '').toLowerCase()) {
    case 'provider': return 'CCTP provider fee';
    case 'kit': return 'Application fee';
    case 'gasfee': return 'Network gas';
    default: return 'Bridge fee';
  }
};

const feeAmount = (fee) => clean(
  fee?.amount
  ?? fee?.fee
  ?? fee?.value
  ?? fee?.fees?.fee
  ?? fee?.fees?.amount
  ?? fee?.fees?.value,
);
const feeToken = (fee, fallback = 'USDC') => clean(
  fee?.token || fee?.symbol || fee?.fees?.token || fee?.fees?.symbol || fallback,
);

function EthereumMark() {
  return (
    <span className="wallet-bridge-chain-mark wallet-bridge-chain-mark--ethereum" aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M16 3 8.5 16 16 20.2 23.5 16 16 3Z" fill="currentColor" opacity="0.92" />
        <path d="m16 21.8-7.5-4.3L16 29l7.5-11.5-7.5 4.3Z" fill="currentColor" opacity="0.62" />
      </svg>
    </span>
  );
}

function ChainMark({ chainId }) {
  const arcChainId = web3Config.requiredChain.id;
  return Number(chainId) === Number(arcChainId)
    ? <ArcNetworkIcon size="md" decorative />
    : <EthereumMark />;
}

function DirectionSelector({ routeId, disabled, onChange }) {
  const routes = web3Config.usdcBridge.routes;
  return (
    <div className="wallet-bridge-direction" role="group" aria-label="USDC bridge direction">
      {Object.values(routes).map((route) => {
        const active = route.id === routeId;
        return (
          <button
            key={route.id}
            type="button"
            className={`wallet-bridge-direction__option${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(route.id)}
          >
            <ChainMark chainId={route.destination.chainId} />
            <span>
              <strong>{route.label}</strong>
              <small>{route.source.networkName} → {route.destination.networkName}</small>
            </span>
            {active ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function BridgeRoute({ route }) {
  return (
    <div className="wallet-bridge-route" aria-label={`Bridge route from ${route.source.networkName} to ${route.destination.networkName}`}>
      <div className="wallet-bridge-route__chain">
        <ChainMark chainId={route.source.chainId} />
        <span><small>From</small><strong>{route.source.networkName}</strong></span>
      </div>
      <span className="wallet-bridge-route__arrow" aria-hidden="true"><ArrowRight size={18} /></span>
      <div className="wallet-bridge-route__chain">
        <ChainMark chainId={route.destination.chainId} />
        <span><small>To</small><strong>{route.destination.networkName}</strong></span>
      </div>
    </div>
  );
}

function FeeRows({ estimate }) {
  const fees = Array.isArray(estimate?.fees) ? estimate.fees : [];
  const gasFees = Array.isArray(estimate?.gasFees)
    ? estimate.gasFees
    : estimate?.gasFees && typeof estimate.gasFees === 'object'
      ? Object.values(estimate.gasFees).filter(Boolean)
      : [];

  if (!fees.length && !gasFees.length) {
    return (
      <div className="wallet-bridge-fee-row">
        <span>Estimated fees</span>
        <strong>Calculated by Circle at confirmation</strong>
      </div>
    );
  }

  return (
    <>
      {fees.map((fee, index) => (
        <div className="wallet-bridge-fee-row" key={`${fee?.type || 'fee'}-${index}`}>
          <span>{feeLabel(fee?.type)}</span>
          <strong>{feeAmount(fee) ? `${displayAmount(feeAmount(fee), 8)} ${feeToken(fee)}` : 'Included in estimate'}</strong>
        </div>
      ))}
      {gasFees.map((fee, index) => (
        <div className="wallet-bridge-fee-row" key={`gas-${index}`}>
          <span>{clean(fee?.chain || fee?.blockchain) ? `${clean(fee?.chain || fee?.blockchain)} gas` : 'Network gas estimate'}</span>
          <strong>{feeAmount(fee) ? `${displayAmount(feeAmount(fee), 8)} ${feeToken(fee, 'ETH')}` : 'Estimated at confirmation'}</strong>
        </div>
      ))}
    </>
  );
}

const buildBridgeSteps = (route) => [
  {
    id: 'approve',
    label: route.source.usdcIsNative ? `Prepare ${route.source.networkName} USDC` : `Approve ${route.source.networkName} USDC`,
    detail: route.source.usdcIsNative
      ? 'App Kit prepares the source transfer if an approval is required.'
      : 'Allow Circle CCTP to use the bridge amount.',
  },
  { id: 'burn', label: `Send from ${route.source.networkName}`, detail: 'Burn the source USDC for the cross-chain transfer.' },
  { id: 'attestation', label: 'Verify cross-chain transfer', detail: 'Circle confirms the CCTP message.' },
  { id: 'mint', label: `Receive USDC on ${route.destination.networkName}`, detail: `Use the same Privy wallet to submit the destination mint on ${route.destination.networkName}.` },
];

const initialStepState = (bridgeSteps) => Object.fromEntries(bridgeSteps.map((step) => [step.id, 'waiting']));

export function UsdcBridgeModal({
  open,
  onClose,
  walletAddress,
  getProvider,
  initialDirection = 'toArc',
  bridgeBalances = {},
  onBridgeCompleted,
  onViewDestinationBalance,
}) {
  const [routeId, setRouteId] = useState(initialDirection);
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

  const route = useMemo(() => getUsdcBridgeRoute(routeId), [routeId]);
  const bridgeSteps = useMemo(() => buildBridgeSteps(route), [route]);
  const balanceState = bridgeBalances?.[routeId] || {};
  const sourceUsdcBalance = clean(balanceState.usdcBalance);
  const sourceGasBalance = clean(balanceState.gasBalance);
  const destinationGasBalance = clean(balanceState.destinationGasBalance);
  const sourceBalanceLoading = Boolean(balanceState.usdcLoading);
  const sourceGasLoading = Boolean(balanceState.gasLoading);
  const destinationGasLoading = Boolean(balanceState.destinationGasLoading);
  const sourceBalanceError = Boolean(balanceState.usdcError);
  const sourceGasError = Boolean(balanceState.gasError);
  const destinationGasError = Boolean(balanceState.destinationGasError);
  const sourceUsesUsdcForGas = Boolean(route.source.usdcIsNative);

  const resetForDirection = useCallback((nextRouteId) => {
    const nextRoute = getUsdcBridgeRoute(nextRouteId);
    setRouteId(nextRoute.id);
    setStage('amount');
    setAmount('');
    setSession(null);
    setEstimate(null);
    setPreflight(null);
    setEstimating(false);
    setError('');
    setSteps(initialStepState(buildBridgeSteps(nextRoute)));
    setStepLinks({});
    setResult(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForDirection(initialDirection);
    // The complete modal state intentionally resets every time it opens so a
    // previous CCTP result cannot be confused with a new user-requested route.
  }, [open, initialDirection, resetForDirection]);

  const amountValidation = useMemo(() => {
    const normalized = clean(amount);
    if (!normalized) return '';
    if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) return 'Enter a valid USDC amount with up to 6 decimals.';
    if (!hasPositiveDecimal(normalized)) return 'Enter an amount greater than 0 USDC.';
    if (sourceBalanceError) return `Unable to read the ${route.source.networkName} USDC balance. Refresh wallet balances and try again.`;
    if (!hasPositiveDecimal(sourceUsdcBalance)) return `This wallet does not have ${route.source.networkName} USDC available to bridge.`;
    try {
      const requested = parseUnits(normalized, 6);
      const available = parseUnits(sourceUsdcBalance, 6);
      if (requested > available) {
        return `You only have ${displayAmount(sourceUsdcBalance, 6)} USDC on ${route.source.networkName}.`;
      }
      if (sourceUsesUsdcForGas && requested >= available) {
        return `Leave some USDC on ${route.source.networkName} to pay source-chain gas.`;
      }
    } catch {
      return 'Unable to validate this USDC amount.';
    }
    return '';
  }, [amount, route.source.networkName, sourceBalanceError, sourceUsdcBalance, sourceUsesUsdcForGas]);

  const hasSourceGas = hasPositiveDecimal(sourceGasBalance);
  const hasDestinationGas = hasPositiveDecimal(destinationGasBalance);
  const knownNoGas = !sourceGasLoading && clean(sourceGasBalance) === '0';
  const knownNoDestinationGas = !destinationGasLoading && clean(destinationGasBalance) === '0';
  const sourceGasUnavailable = sourceGasError || (!sourceGasLoading && !hasSourceGas);
  const destinationGasUnavailable = destinationGasError || (!destinationGasLoading && !hasDestinationGas);
  const canReview = !sourceBalanceLoading
    && !sourceGasLoading
    && !destinationGasLoading
    && !sourceBalanceError
    && !sourceGasError
    && !destinationGasError
    && hasSourceGas
    && hasDestinationGas
    && !amountValidation
    && hasPositiveDecimal(amount);

  const handleAmountChange = (event) => {
    const next = event.target.value.replace(/,/g, '').trim();
    if (next === '' || /^\d*(?:\.\d{0,6})?$/.test(next)) setAmount(next);
  };

  const handleDirectionChange = (nextRouteId) => {
    if (bridging || estimating || nextRouteId === routeId) return;
    resetForDirection(nextRouteId);
  };

  const handleReview = async () => {
    if (!canReview || estimating) return;
    setEstimating(true);
    setError('');
    try {
      const provider = await getProvider?.();
      const nextSession = await createUsdcBridgeSession({ provider, walletAddress, amount, routeId });
      setSession(nextSession);
      setEstimate(nextSession.estimate);
      setPreflight(nextSession.preflight);
      setStage('review');
    } catch (estimateError) {
      setError(clean(estimateError?.shortMessage || estimateError?.message || estimateError) || 'Unable to estimate this bridge right now.');
    } finally {
      setEstimating(false);
    }
  };

  const handleBridgeEvent = (payload) => {
    const name = normalizeBridgeStepName(payload);
    const index = bridgeSteps.findIndex((step) => step.id === name);
    if (index < 0) return;
    const explorerUrl = bridgeExplorerUrl(payload);

    setSteps((current) => {
      const next = { ...current };
      bridgeSteps.forEach((step, stepIndex) => {
        if (stepIndex <= index) next[step.id] = 'complete';
      });
      const nextStep = bridgeSteps[index + 1];
      if (nextStep) next[nextStep.id] = 'active';
      return next;
    });
    if (explorerUrl) setStepLinks((current) => ({ ...current, [name]: explorerUrl }));
  };

  const handleExecute = async () => {
    if (!session || bridging || !preflight?.ok || !hasSourceGas || !hasDestinationGas) return;
    setBridging(true);
    setError('');
    let bridgeStarted = false;

    try {
      // Re-estimate and re-read source/destination balances immediately before
      // bridge(). These checks are read-only and do not request a Privy signature.
      const refreshedSession = await revalidateUsdcBridgeSession(session);
      setSession(refreshedSession);
      setEstimate(refreshedSession.estimate);
      setPreflight(refreshedSession.preflight);
      setStage('processing');
      setSteps({ ...initialStepState(bridgeSteps), [bridgeSteps[0].id]: 'active' });

      bridgeStarted = true;
      const bridgeResult = await executeUsdcBridgeSession({
        session: refreshedSession,
        onEvent: handleBridgeEvent,
      });

      if (bridgeResult?.state === 'error') {
        const failed = (bridgeResult.steps || []).find((step) => step?.error);
        throw new Error(clean(failed?.error?.message || failed?.error || 'The bridge did not complete.'));
      }

      const links = {};
      (Array.isArray(bridgeResult?.steps) ? bridgeResult.steps : []).forEach((step) => {
        const name = clean(step?.name || step?.method).toLowerCase();
        const url = bridgeExplorerUrl(step);
        if (name && url) links[name] = url;
      });
      setStepLinks((current) => ({ ...current, ...links }));
      setSteps(Object.fromEntries(bridgeSteps.map((step) => [step.id, 'complete'])));
      setResult(bridgeResult);
      setStage('success');
      await onBridgeCompleted?.({ result: bridgeResult, routeId, route });
    } catch (bridgeError) {
      const message = clean(bridgeError?.shortMessage || bridgeError?.message || bridgeError);
      setError(message || (bridgeStarted
        ? 'The bridge could not be completed. No new bridge should be submitted until you review the current state.'
        : 'Bridge conditions changed before signing. Review the current estimate and try again.'));
      setStage(bridgeStarted ? 'error' : 'review');
    } finally {
      setBridging(false);
    }
  };

  const safeClose = () => {
    if (!bridging) onClose?.();
  };

  const footer = stage === 'amount' ? (
    <>
      <Button variant="secondary" onClick={safeClose}>Cancel</Button>
      <Button loading={estimating} onClick={handleReview} disabled={!canReview}>Review bridge</Button>
    </>
  ) : stage === 'review' ? (
    <>
      <Button variant="secondary" onClick={() => { setStage('amount'); setError(''); }}>Back</Button>
      <Button loading={bridging} onClick={handleExecute} disabled={!preflight?.ok || !hasSourceGas || !hasDestinationGas}>{route.label}</Button>
    </>
  ) : stage === 'success' ? (
    <>
      <Button variant="secondary" onClick={safeClose}>Close</Button>
      <Button onClick={() => { onViewDestinationBalance?.(route.destination.chainId); safeClose(); }}>
        View {route.destination.networkName} balance
      </Button>
    </>
  ) : stage === 'error' ? (
    <>
      <Button variant="secondary" onClick={safeClose}>Close</Button>
      <Button onClick={() => { setStage('amount'); setSession(null); setEstimate(null); setPreflight(null); setError(''); }}>Review again</Button>
    </>
  ) : null;

  const gasBalanceLabel = sourceGasLoading
    ? 'Loading…'
    : `${displayAmount(sourceGasBalance || '0', sourceUsesUsdcForGas ? 6 : 8)} ${route.source.nativeSymbol}`;
  const gasHelp = sourceGasUnavailable && !knownNoGas
    ? `Source gas balance is unavailable. Refresh wallet balances before reviewing the bridge.`
    : sourceUsesUsdcForGas
      ? knownNoGas
        ? `Add USDC on ${route.source.networkName} before bridging. ${web3Config.ui.requiredChainShortName} uses ${web3Config.requiredChain.nativeCurrency.symbol} for source-chain gas.`
        : `${route.source.networkName} uses USDC for gas. Leave some USDC unbridged so the source transaction can complete.`
      : knownNoGas
        ? `Add ${route.source.nativeSymbol} before bridging. The source-chain approval and burn need ${route.source.nativeSymbol} for gas.`
        : `${route.source.networkName} uses ${route.source.nativeSymbol} for the source-chain approval and burn transactions.`;

  const destinationGasBalanceLabel = destinationGasLoading
    ? 'Loading…'
    : `${displayAmount(destinationGasBalance || '0', route.destination.nativeSymbol === 'USDC' ? 6 : 8)} ${route.destination.nativeSymbol}`;
  const destinationGasHelp = destinationGasUnavailable && !knownNoDestinationGas
    ? `Destination gas balance is unavailable. Refresh wallet balances before reviewing the bridge.`
    : knownNoDestinationGas
      ? `Add ${route.destination.nativeSymbol} on ${route.destination.networkName} before bridging. Your Privy wallet must submit the destination mint transaction.`
      : `${route.destination.networkName} needs ${route.destination.nativeSymbol} for the destination mint. Circle's live gas estimate is used when available; otherwise a conservative RPC safety reserve is checked before signing.`;

  return (
    <Modal
      open={open}
      onClose={safeClose}
      title="Bridge USDC"
      className="wallet-bridge-modal sm:max-w-2xl"
      bodyClassName="wallet-bridge-modal__body"
      footer={footer}
      trapFocus
    >
      <DirectionSelector
        routeId={routeId}
        disabled={bridging || estimating || !['amount', 'review'].includes(stage)}
        onChange={handleDirectionChange}
      />
      <BridgeRoute route={route} />

      {stage === 'amount' ? (
        <div className="wallet-bridge-section-stack">
          <section className="wallet-bridge-panel">
            <div className="wallet-bridge-panel__heading">
              <div><small>Amount to bridge</small><strong>{route.source.networkName} USDC</strong></div>
              <TokenIcon symbol="USDC" name="USD Coin" size="md" />
            </div>
            <label className="wallet-bridge-amount-field">
              <span className="sr-only">USDC amount to bridge</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                aria-invalid={Boolean(amountValidation)}
              />
              <span>USDC</span>
            </label>
            <div className="wallet-bridge-balance-line">
              <span>Available on {route.source.networkName}</span>
              {sourceUsesUsdcForGas ? (
                <strong>{sourceBalanceLoading ? 'Loading…' : `${displayAmount(sourceUsdcBalance || '0', 6)} USDC`}</strong>
              ) : (
                <button
                  type="button"
                  onClick={() => setAmount(clean(sourceUsdcBalance))}
                  disabled={!hasPositiveDecimal(sourceUsdcBalance) || sourceBalanceLoading}
                >
                  {sourceBalanceLoading ? 'Loading…' : `${displayAmount(sourceUsdcBalance || '0', 6)} USDC · Max`}
                </button>
              )}
            </div>
            {amountValidation ? <p className="wallet-bridge-field-error"><AlertCircle size={14} /> {amountValidation}</p> : null}
          </section>

          <div className={`wallet-bridge-gas-note${(knownNoGas || sourceGasUnavailable) ? ' is-warning' : ''}`}>
            <Fuel size={17} />
            <span>
              <strong>{route.source.networkName} gas balance: {gasBalanceLabel}</strong>
              <small>{gasHelp}</small>
            </span>
          </div>

          <div className={`wallet-bridge-gas-note${(knownNoDestinationGas || destinationGasUnavailable) ? ' is-warning' : ''}`}>
            <Fuel size={17} />
            <span>
              <strong>{route.destination.networkName} gas balance: {destinationGasBalanceLabel}</strong>
              <small>{destinationGasHelp}</small>
            </span>
          </div>

          <div className="wallet-bridge-trust-note">
            <ShieldCheck size={17} />
            <span>No bridge transaction is submitted until source USDC, source gas, destination gas, route support, and current fee/gas validation all pass. Circle gas estimates are preferred; RPC safety reserves are used when a Circle gas row is unavailable.</span>
          </div>
        </div>
      ) : null}

      {stage === 'review' ? (
        <div className="wallet-bridge-section-stack">
          <section className="wallet-bridge-panel">
            <div className="wallet-bridge-review-amount">
              <span><small>You are bridging</small><strong>{displayAmount(amount, 6)} USDC</strong></span>
              <TokenIcon symbol="USDC" name="USD Coin" size="lg" />
            </div>
            <div className="wallet-bridge-fees">
              <div className="wallet-bridge-fee-row"><span>Source wallet</span><strong>{shortenWalletAddress(walletAddress, 7, 6)}</strong></div>
              <div className="wallet-bridge-fee-row"><span>Route</span><strong>{route.source.networkName} → {route.destination.networkName}</strong></div>
              <FeeRows estimate={estimate} />
              <div className="wallet-bridge-fee-row wallet-bridge-fee-row--strong"><span>Bridge amount</span><strong>{displayAmount(amount, 6)} USDC</strong></div>
            </div>
          </section>
          {preflight?.ok ? (
            <section className="wallet-bridge-panel">
              <div className="wallet-bridge-panel__heading">
                <div><small>Preflight validation</small><strong>All required balances verified</strong></div>
                <CheckCircle2 size={20} aria-hidden="true" />
              </div>
              <div className="wallet-bridge-fees">
                <div className="wallet-bridge-fee-row">
                  <span>{route.source.networkName} USDC</span>
                  <strong>{displayAmount(preflight.sourceToken.balance, 6)} available · {displayAmount(preflight.sourceToken.required, 6)} required</strong>
                </div>
                <div className="wallet-bridge-fee-row">
                  <span>{route.source.networkName} gas</span>
                  <strong>{displayAmount(preflight.sourceGas.balance, 8)} {preflight.sourceGas.symbol} available · ~{displayAmount(preflight.sourceGas.required, 8)} required · {preflight.sourceGas.methodLabel || 'gas estimate'}</strong>
                </div>
                <div className="wallet-bridge-fee-row">
                  <span>{route.destination.networkName} gas</span>
                  <strong>{displayAmount(preflight.destinationGas.balance, 8)} {preflight.destinationGas.symbol} available · ~{displayAmount(preflight.destinationGas.required, 8)} required · {preflight.destinationGas.methodLabel || 'gas estimate'}</strong>
                </div>
              </div>
            </section>
          ) : null}
          <div className="wallet-bridge-info-note">
            <ShieldCheck size={17} />
            <span>
              This bridge uses Circle's standard wallet-submitted destination mint. Both source and destination gas are required. We use Circle's gas estimate when it contains a usable value; otherwise we calculate a conservative reserve from the chain's current RPC gas price. A 25% safety buffer is applied, and every check is repeated immediately before Privy receives the first transaction request.
            </span>
          </div>
          {sourceUsesUsdcForGas ? (
            <div className="wallet-bridge-gas-note">
              <Fuel size={17} />
              <span><strong>{web3Config.ui.requiredChainShortName} source gas uses {web3Config.requiredChain.nativeCurrency.symbol}</strong><small>Make sure the source wallet keeps enough {web3Config.requiredChain.nativeCurrency.symbol} beyond the bridge amount for the {web3Config.ui.requiredChainShortName} transaction fee.</small></span>
            </div>
          ) : knownNoGas ? (
            <div className="wallet-bridge-gas-note is-warning">
              <AlertCircle size={17} />
              <span><strong>{route.source.nativeSymbol} required</strong><small>This wallet currently shows 0 {route.source.nativeSymbol} on {route.source.networkName}, so the bridge cannot be submitted.</small></span>
            </div>
          ) : null}
        </div>
      ) : null}

      {stage === 'processing' ? (
        <div className="wallet-bridge-section-stack">
          <div className="wallet-bridge-processing-head">
            <span className="wallet-bridge-processing-spinner"><LoaderCircle size={24} /></span>
            <div><strong>{route.label}: {displayAmount(amount, 6)} USDC</strong><p>Keep this window open and complete each Privy confirmation when prompted.</p></div>
          </div>
          <div className="wallet-bridge-progress">
            {bridgeSteps.map((step) => {
              const status = steps[step.id] || 'waiting';
              return (
                <div className={`wallet-bridge-progress__step is-${status}`} key={step.id}>
                  <span className="wallet-bridge-progress__icon">
                    {status === 'complete' ? <Check size={15} /> : status === 'active' ? <LoaderCircle size={15} /> : <span />}
                  </span>
                  <div><strong>{step.label}</strong><small>{status === 'complete' ? 'Completed' : status === 'active' ? 'In progress' : step.detail}</small></div>
                  {stepLinks[step.id] ? <a href={stepLinks[step.id]} target="_blank" rel="noreferrer" aria-label={`View ${step.label} transaction`}><ExternalLink size={15} /></a> : null}
                </div>
              );
            })}
          </div>
          <div className="wallet-bridge-info-note"><ShieldCheck size={17} /><span>Do not start another bridge while this transfer is processing. Circle App Kit tracks the same CCTP operation through approval, burn, attestation, and the wallet-submitted destination mint.</span></div>
        </div>
      ) : null}

      {stage === 'success' ? (
        <div className="wallet-bridge-result is-success">
          <span className="wallet-bridge-result__icon"><CheckCircle2 size={28} /></span>
          <h3>USDC bridged to {route.destination.networkName}</h3>
          <p>{displayAmount(result?.amount || amount, 6)} USDC completed the Circle App Kit bridge flow for this Privy wallet.</p>
          <div className="wallet-bridge-result__summary">
            <span><small>From</small><strong>{route.source.networkName}</strong></span>
            <ArrowRight size={18} />
            <span><small>To</small><strong>{route.destination.networkName}</strong></span>
          </div>
          {Object.values(stepLinks).filter(Boolean).length ? (
            <div className="wallet-bridge-result__links">
              {Object.entries(stepLinks).map(([name, url]) => <a href={url} target="_blank" rel="noreferrer" key={name}>View {name} <ExternalLink size={14} /></a>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {stage === 'error' ? (
        <div className="wallet-bridge-result is-error">
          <span className="wallet-bridge-result__icon"><AlertCircle size={28} /></span>
          <h3>Bridge needs attention</h3>
          <p>{error || 'The bridge did not complete. Review the transfer before trying again.'}</p>
          <div className="wallet-bridge-info-note"><ShieldCheck size={17} /><span>The integration uses App Kit’s returned bridge state for retry/recovery. Do not create a second manual CCTP transfer for the same pending operation.</span></div>
        </div>
      ) : null}

      {error && stage !== 'error' ? <div className="wallet-bridge-inline-error"><AlertCircle size={16} /> <span>{error}</span></div> : null}
    </Modal>
  );
}

export default UsdcBridgeModal;
