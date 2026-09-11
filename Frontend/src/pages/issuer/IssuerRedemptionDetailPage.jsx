import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAddress, isAddress } from 'viem';
import { toast } from 'sonner';
import { investmentApi } from '@/api/investments';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { CompactAddress } from '@/components/common/CompactAddress';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import {
  isIssuerRedemptionWalletRejection,
  submitIssuerRedemptionPayment,
} from '@/services/issuer/issuerTokenRedemptionPayment.service';
import {
  clearIssuerRedemptionPaymentRecovery,
  loadIssuerRedemptionPaymentRecovery,
  saveIssuerRedemptionPaymentRecovery,
} from '@/services/issuer/issuerTokenRedemptionRecoveryStore';
import { formatDate } from '@/utils/date';
import { getApiFieldErrors, getErrorMessage } from '@/utils/error';
import { transactionExplorerName, transactionExplorerUrl } from '@/utils/blockExplorer';
import {
  cleanRedemptionText,
  issuerBurnHash,
  issuerLockHash,
  issuerPaymentHash,
  issuerPaymentStatus,
  issuerRedemptionAmountLabel,
  redemptionRejectionReason,
  issuerRedemptionInvestorLabel,
  issuerRedemptionStatus,
  issuerRedemptionStatusMeta,
  issuerRedemptionTokenLabel,
} from '@/utils/issuerRedemption';

const TERMINAL = new Set(['COMPLETED', 'ISSUER_REJECTED', 'CANCELLED', 'EXPIRED', 'MANUAL_REVIEW']);
const POLL_MS = 7000;

const addressesEqual = (left, right) => {
  if (!isAddress(left || '') || !isAddress(right || '')) return false;
  return getAddress(left) === getAddress(right);
};

const detailValue = (value) => cleanRedemptionText(value) || '—';

function StatusStep({ icon: Icon, label, value, active = false, complete = false }) {
  return (
    <div className={`issuer-redemption-step${active ? ' is-active' : ''}${complete ? ' is-complete' : ''}`}>
      <span className="issuer-redemption-step__icon"><Icon size={17} /></span>
      <span><small>{label}</small><strong>{value}</strong></span>
    </div>
  );
}

export default function IssuerRedemptionDetailPage() {
  const { redemptionUid } = useParams();
  const navigate = useNavigate();
  const wallet = useWalletConnection();
  const [redemption, setRedemption] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [decision, setDecision] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useDocumentTitle('Redemption Details');

  const loadDetail = useCallback(async ({ quiet = false } = {}) => {
    if (!redemptionUid) return;
    if (!quiet) setLoading(true);
    try {
      const data = await investmentApi.getIssuerRedemption(redemptionUid);
      if (!mounted.current) return;
      setRedemption(data || null);
      setError('');
      if (issuerPaymentHash(data) || ['PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(issuerRedemptionStatus(data))) {
        clearIssuerRedemptionPaymentRecovery(redemptionUid);
      }
    } catch (loadError) {
      if (!mounted.current) return;
      setError(getErrorMessage(loadError, 'Unable to load this redemption.'));
    } finally {
      if (mounted.current && !quiet) setLoading(false);
    }
  }, [redemptionUid]);

  useEffect(() => {
    mounted.current = true;
    loadDetail();
    return () => { mounted.current = false; };
  }, [loadDetail]);

  const status = issuerRedemptionStatus(redemption);
  const paymentStatus = issuerPaymentStatus(redemption);
  const terminal = TERMINAL.has(status);
  const awaitingDecision = status === 'PENDING_ISSUER_APPROVAL';
  const paymentReady = status === 'TOKENS_LOCKED' && paymentStatus === 'AWAITING_ISSUER';
  const recovery = useMemo(() => loadIssuerRedemptionPaymentRecovery(redemptionUid), [redemptionUid, redemption]);
  const savedPaymentHash = recovery?.txHash || '';

  useEffect(() => {
    if (!redemptionUid || loading || terminal || document.visibilityState !== 'visible') return undefined;
    let timer;
    let stopped = false;
    let delay = POLL_MS;

    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') {
        timer = window.setTimeout(poll, POLL_MS);
        return;
      }
      try {
        const data = await investmentApi.getIssuerRedemption(redemptionUid);
        if (stopped || !mounted.current) return;
        setRedemption(data || null);
        setError('');
        delay = POLL_MS;
        if (issuerPaymentHash(data) || ['PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(issuerRedemptionStatus(data))) {
          clearIssuerRedemptionPaymentRecovery(redemptionUid);
        }
        if (!TERMINAL.has(issuerRedemptionStatus(data))) timer = window.setTimeout(poll, delay);
      } catch {
        delay = Math.min(delay * 2, 60_000);
        if (!stopped) timer = window.setTimeout(poll, delay);
      }
    };

    timer = window.setTimeout(poll, delay);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [loading, redemptionUid, terminal]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !terminal) loadDetail({ quiet: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [loadDetail, terminal]);

  const statusMeta = issuerRedemptionStatusMeta(status);
  const chainId = Number(redemption?.chainId);
  const expectedIssuerWallet = cleanRedemptionText(redemption?.issuerPaymentWalletAddress);
  const correctIssuerWallet = Boolean(wallet.address && expectedIssuerWallet && addressesEqual(wallet.address, expectedIssuerWallet));
  const correctChain = Number.isSafeInteger(chainId) && wallet.chainId === chainId;
  const canSwitchChain = Number.isSafeInteger(chainId) && wallet.supportedChains.some((chain) => chain.id === chainId);

  const closeDecisionModal = () => {
    if (action) return;
    setDecision('');
    setRejectReason('');
    setRejectReasonError('');
  };

  const openDecisionModal = (nextDecision) => {
    setDecision(nextDecision);
    setRejectReason('');
    setRejectReasonError('');
  };

  const handleDecision = async () => {
    if (!decision || !redemptionUid) return;

    const normalizedRejectReason = rejectReason.trim();
    if (decision === 'reject' && !normalizedRejectReason) {
      setRejectReasonError('Please enter a reason for rejecting this redemption.');
      return;
    }

    setRejectReasonError('');
    setAction(decision);
    try {
      const data = decision === 'approve'
        ? await investmentApi.approveIssuerRedemption(redemptionUid)
        : await investmentApi.rejectIssuerRedemption(redemptionUid, normalizedRejectReason);
      setRedemption(data || redemption);
      setDecision('');
      setRejectReason('');
      setRejectReasonError('');
      toast.success(decision === 'approve' ? 'Redemption approved.' : 'Redemption rejected.');
      await loadDetail({ quiet: true });
    } catch (decisionError) {
      const message = getErrorMessage(decisionError, `Unable to ${decision} this redemption.`);
      if (decision === 'reject') {
        const reasonFieldError = getApiFieldErrors(decisionError).find(({ field }) => field === 'reason');
        if (reasonFieldError?.message) setRejectReasonError(reasonFieldError.message);
      }
      toast.error(message);
    } finally {
      setAction('');
    }
  };

  const confirmKnownPaymentHash = async (txHash) => {
    const data = await investmentApi.confirmIssuerRedemptionPayment(redemptionUid, txHash);
    setRedemption(data || redemption);
    if (issuerPaymentHash(data) || ['PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(issuerRedemptionStatus(data))) {
      clearIssuerRedemptionPaymentRecovery(redemptionUid);
    }
    return data;
  };

  const handlePayment = async () => {
    if (!redemptionUid || !paymentReady) return;
    setAction('payment');
    try {
      if (savedPaymentHash) {
        await confirmKnownPaymentHash(savedPaymentHash);
        toast.success('Existing payment is being confirmed.');
        return;
      }

      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect the payment wallet in the header before continuing.');
      }
      if (!correctIssuerWallet) {
        throw new Error('The connected account does not match the payment wallet assigned to this redemption.');
      }
      if (!correctChain) {
        if (canSwitchChain) await wallet.switchChain(chainId);
        else throw new Error('The required redemption network is not configured in this application.');
      }

      const txHash = await submitIssuerRedemptionPayment({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        redemption,
      });
      saveIssuerRedemptionPaymentRecovery(redemptionUid, txHash);
      await confirmKnownPaymentHash(txHash);
      toast.success('USDT payment sent successfully.');
    } catch (paymentError) {
      if (isIssuerRedemptionWalletRejection(paymentError)) {
        toast.error('Payment was cancelled in your wallet. No payment was sent.');
      } else {
        toast.error(getErrorMessage(paymentError, 'Unable to complete the payment.'));
      }
    } finally {
      setAction('');
    }
  };

  if (loading && !redemption) {
    return (
      <div className="page-stack issuer-redemption-detail-page">
        <Card className="issuer-redemption-loading"><RefreshCw className="issuer-redemption-spin" size={22} /><span>Loading redemption details…</span></Card>
      </div>
    );
  }

  if (error && !redemption) {
    return (
      <div className="page-stack issuer-redemption-detail-page">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.issuerRedemptions)}>Back to redemptions</Button>
        <Card className="issuer-redemption-error-card"><AlertTriangle size={22} /><div><strong>Redemption unavailable</strong><p>{error}</p></div><Button variant="secondary" onClick={() => loadDetail()}>Try again</Button></Card>
      </div>
    );
  }

  const created = cleanRedemptionText(redemption?.createdAt || redemption?.requestedAt || redemption?.submittedAt);
  const paymentAmount = detailValue(redemption?.usdtAmount || redemption?.usdtAmountFormatted || redemption?.payment?.amount);
  const lockHash = issuerLockHash(redemption);
  const paymentHash = issuerPaymentHash(redemption);
  const burnHash = issuerBurnHash(redemption);
  const explorerName = transactionExplorerName(redemption?.chainId);
  const paymentHashUrl = transactionExplorerUrl(paymentHash, redemption?.chainId);
  const burnHashUrl = transactionExplorerUrl(burnHash, redemption?.chainId);
  const savedPaymentHashUrl = transactionExplorerUrl(savedPaymentHash, redemption?.chainId);
  const securedComplete = Boolean(lockHash) || ['TOKENS_LOCKED', 'PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(status);
  const paymentComplete = Boolean(paymentHash) || ['PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(status);
  const redemptionComplete = Boolean(burnHash) || status === 'COMPLETED';
  const tokensSecuredStatus = securedComplete ? 'Completed' : awaitingDecision ? 'Waiting for approval' : 'In progress';
  const paymentSentStatus = paymentComplete ? 'Completed' : paymentReady ? 'Ready to send' : 'Waiting';
  const tokensRedeemedStatus = redemptionComplete ? 'Completed' : status === 'BURN_SUBMITTED' ? 'In progress' : 'Waiting';
  const rejectionReason = redemptionRejectionReason(redemption);
  const issuerProgressMessage = (() => {
    const baseMessage = 'No action is required right now. This page updates automatically as the redemption progresses.';

    if (status === 'ISSUER_REJECTED') {
      return 'This redemption request was not approved. No payment is required.';
    }

    if (status === 'CANCELLED') {
      return 'No action is required. This redemption request has already been canceled by the investor.';
    }

    if (status === 'COMPLETED') {
      return `Redemption completed. Transaction IDs are shown in the status section and can be opened in ${explorerName}.`;
    }

    if (redemptionComplete) {
      return `${baseMessage} Please wait while we Finalizing Redemption.`;
    }

    if (paymentComplete) {
      return `${baseMessage} Please wait while we confirm the payment.`;
    }

    if (securedComplete) {
      return `${baseMessage} Please wait while we confirm the redemption. Payment will be available once this is complete.`;
    }

    return baseMessage;
  })();

  return (
    <div className="page-stack issuer-redemption-detail-page">
      <header className="issuer-redemption-detail-header">
        <div>
          <span className="issuer-redemptions-eyebrow">Redemption review</span>
          <h1>{issuerRedemptionTokenLabel(redemption)}</h1>
          <p>Review the investor’s redemption request, confirm the settlement details, and complete the required payment to the investor.</p>
        </div>
        <AppStatusBadge status={status} label={statusMeta.label} tone={statusMeta.tone} />
      </header>

      {error ? <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={18} /><span>{error}</span></div> : null}
      {status === 'MANUAL_REVIEW' ? <div className="issuer-redemption-inline-alert is-danger"><AlertTriangle size={18} /><span>This redemption requires manual review. Do not submit another payment. Contact your support team.</span></div> : null}

      <div className="issuer-redemption-detail-grid">
        <div className="issuer-redemption-detail-main">
          <Card className="issuer-redemption-card">
            <div className="issuer-redemption-card__heading"><div><span>Request details</span><h2>Investor redemption</h2></div><ShieldCheck size={21} /></div>
            <div className="issuer-redemption-detail-list">
              <div><span>Redemption ID</span><strong>{detailValue(redemptionUid)}</strong></div>
              <div><span>Investor name</span><strong>{issuerRedemptionInvestorLabel(redemption)}</strong></div>
              <div><span>Redeem amount</span><strong>{issuerRedemptionAmountLabel(redemption)}</strong></div>
              <div><span>Requested</span><strong>{created ? formatDate(created, 'MMM DD, YYYY · hh:mm A') : '—'}</strong></div>
              <div><span>Investor wallet</span>{redemption?.investorWalletAddress ? <CompactAddress value={redemption.investorWalletAddress} label="Investor wallet" /> : <strong>—</strong>}</div>
            </div>
          </Card>

          <Card className="issuer-redemption-card">
            <div className="issuer-redemption-card__heading"><div><span>Redemption status</span><h2>Redemption progress</h2></div><Clock3 size={21} /></div>
            <div className="issuer-redemption-status-steps">
              <StatusStep icon={ShieldCheck} label="Tokens Secured" value={tokensSecuredStatus} complete={Boolean(lockHash) || ['TOKENS_LOCKED', 'PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(status)} />
              <StatusStep icon={CreditCard} label="Payment Sent" value={paymentSentStatus} active={paymentReady} complete={Boolean(paymentHash) || ['PAYMENT_SUBMITTED', 'BURN_SUBMITTED', 'COMPLETED'].includes(status)} />
              <StatusStep icon={CheckCircle2} label="Tokens Redeemed" value={tokensRedeemedStatus} active={status === 'BURN_SUBMITTED'} complete={Boolean(burnHash) || status === 'COMPLETED'} />
            </div>
            {(paymentHash || burnHash) ? (
              <div className="issuer-redemption-proof-list">
                {paymentHash ? <div><span>Payment Sent Hash</span><CompactAddress value={paymentHash} label="Payment Sent Hash" leading={8} trailing={8} href={paymentHashUrl} linkLabel={`View Payment Sent Hash on ${explorerName}`} /></div> : null}
                {burnHash ? <div><span>Tokens Redeemed Hash</span><CompactAddress value={burnHash} label="Tokens Redeemed Hash" leading={8} trailing={8} href={burnHashUrl} linkLabel={`View Tokens Redeemed Hash on ${explorerName}`} /></div> : null}
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="issuer-redemption-detail-side">
          <Card className="issuer-redemption-card issuer-redemption-action-card">
            <div className="issuer-redemption-card__heading"><div><span>Required action</span><h2>{awaitingDecision ? 'Review request' : paymentReady ? 'Send payment' : status === 'ISSUER_REJECTED' ? 'Redemption outcome' : 'Redemption progress'}</h2></div><WalletCards size={21} /></div>

            {awaitingDecision ? (
              <>
                <p>Review the investor’s request and settlement details, then approve or reject the redemption.</p>
                <div className="issuer-redemption-action-stack">
                  <Button loading={action === 'approve'} disabled={Boolean(action)} onClick={() => openDecisionModal('approve')} icon={CheckCircle2}>Approve redemption</Button>
                  <Button variant="danger" loading={action === 'reject'} disabled={Boolean(action)} onClick={() => openDecisionModal('reject')} icon={XCircle}>Reject redemption</Button>
                </div>
              </>
            ) : paymentReady ? (
              <>
                <div className="issuer-redemption-payment-summary">
                  <div><span>USDT amount</span><strong>{paymentAmount !== '—' ? `${paymentAmount} USDT` : 'Payment amount unavailable'}</strong></div>
                  <div><span>Required network</span><strong>{Number.isSafeInteger(chainId) ? wallet.supportedChains.find((chain) => chain.id === chainId)?.name || `Chain ${chainId}` : '—'}</strong></div>
                  <div><span>Payment wallet</span>{expectedIssuerWallet ? <CompactAddress value={expectedIssuerWallet} label="Payment wallet" /> : <strong>—</strong>}</div>
                </div>

                {!wallet.isConnected ? <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={17} /><span>Connect the payment wallet from the header.</span></div> : !correctIssuerWallet ? <div className="issuer-redemption-inline-alert is-danger"><AlertTriangle size={17} /><span>The connected account does not match the payment wallet assigned to this redemption.</span></div> : !correctChain ? <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={17} /><span>Your wallet is on the wrong network. The payment action will request the required network before submission.</span></div> : <div className="issuer-redemption-inline-alert is-success"><CheckCircle2 size={17} /><span>Wallet and network are ready for this payment.</span></div>}

                {savedPaymentHash ? (
                  <div className="issuer-redemption-recovery-note">
                    <strong>Existing payment found</strong>
                    <p>A previous payment hash was saved. Continue with that payment instead of sending USDT again.</p>
                    <CompactAddress value={savedPaymentHash} label="Saved payment hash" leading={8} trailing={8} href={savedPaymentHashUrl} linkLabel={`View saved payment hash on ${explorerName}`} />
                  </div>
                ) : null}

                <Button
                  loading={action === 'payment'}
                  disabled={Boolean(action) || (!savedPaymentHash && (!wallet.isConnected || !correctIssuerWallet))}
                  onClick={handlePayment}
                  icon={CreditCard}
                >
                  {savedPaymentHash ? 'Continue payment' : 'Send USDT payment'}
                </Button>
                <small className="issuer-redemption-action-note">Payment details come from the approved redemption request and cannot be changed here.</small>
              </>
            ) : status === 'ISSUER_REJECTED' ? (
              <>
                <p>{issuerProgressMessage}</p>
                {rejectionReason ? (
                  <div className="issuer-redemption-rejection-summary" role="note" aria-label="Reason for rejection">
                    <span className="issuer-redemption-rejection-summary__icon" aria-hidden="true"><XCircle size={18} /></span>
                    <div>
                      <small>Reason for rejection</small>
                      <p>{rejectionReason}</p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p>{issuerProgressMessage}</p>
                {!terminal ? <div className="issuer-redemption-live"><RefreshCw size={16} className="issuer-redemption-spin" /><span>Refreshing status automatically</span></div> : null}
              </>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        open={Boolean(decision)}
        onClose={closeDecisionModal}
        title={decision === 'approve' ? 'Approve redemption?' : 'Reject redemption?'}
        trapFocus
        footer={(
          <>
            <Button variant="secondary" onClick={closeDecisionModal} disabled={Boolean(action)}>Cancel</Button>
            <Button
              variant={decision === 'reject' ? 'danger' : 'primary'}
              loading={action === decision}
              disabled={Boolean(action) || (decision === 'reject' && !rejectReason.trim())}
              onClick={handleDecision}
            >
              {decision === 'approve' ? 'Approve redemption' : 'Reject redemption'}
            </Button>
          </>
        )}
      >
        <div className="issuer-redemption-decision-content">
          <div className="issuer-redemption-confirmation">
            {decision === 'approve' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
            <div>
              <strong>{decision === 'approve' ? 'Approve this redemption request' : 'End this redemption request'}</strong>
              <p>{decision === 'approve' ? 'Approval moves the request to the next step. You will be prompted for payment only when it is ready.' : 'Reject only if this investor redemption should not proceed. No payment will be sent.'}</p>
            </div>
          </div>

          {decision === 'reject' ? (
            <label className="issuer-redemption-rejection-field" htmlFor="issuer-redemption-rejection-reason">
              <span className="issuer-redemption-rejection-field__label">
                Rejection reason <strong aria-hidden="true">*</strong>
              </span>
              <textarea
                id="issuer-redemption-rejection-reason"
                rows={4}
                value={rejectReason}
                onChange={(event) => {
                  setRejectReason(event.target.value);
                  if (rejectReasonError) setRejectReasonError('');
                }}
                onBlur={() => {
                  if (!rejectReason.trim()) setRejectReasonError('Please enter a reason for rejecting this redemption.');
                }}
                placeholder="Explain why this redemption request cannot proceed…"
                disabled={Boolean(action)}
                aria-invalid={Boolean(rejectReasonError)}
                aria-describedby={rejectReasonError ? 'issuer-redemption-rejection-reason-error' : 'issuer-redemption-rejection-reason-hint'}
                required
              />
              {rejectReasonError ? (
                <small id="issuer-redemption-rejection-reason-error" className="issuer-redemption-rejection-field__error" role="alert">{rejectReasonError}</small>
              ) : (
                <small id="issuer-redemption-rejection-reason-hint" className="issuer-redemption-rejection-field__hint">This reason is required and will be submitted with the rejection.</small>
              )}
            </label>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
