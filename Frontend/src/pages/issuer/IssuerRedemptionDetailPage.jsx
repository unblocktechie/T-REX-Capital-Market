import { useCallback, useEffect, useRef, useState } from 'react';
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
  approvePlatformRedemptionFunding,
  getPlatformRedemptionFunding,
  isPlatformWalletRejection,
} from '@/services/blockchain/trexPlatformController.service';
import { formatDate } from '@/utils/date';
import { getApiFieldErrors, getErrorMessage } from '@/utils/error';
import { transactionExplorerName, transactionExplorerUrl } from '@/utils/blockExplorer';
import {
  cleanRedemptionText,
  issuerBurnHash,
  issuerPaymentHash,
  issuerRedemptionAmountLabel,
  redemptionRejectionReason,
  issuerRedemptionInvestorLabel,
  issuerRedemptionStatus,
  issuerRedemptionStatusMeta,
  issuerRedemptionTokenLabel,
} from '@/utils/issuerRedemption';

const TERMINAL = new Set(['COMPLETED', 'ISSUER_REJECTED', 'CANCELLED', 'EXPIRED', 'MANUAL_REVIEW']);
const POLL_MS = 7000;
const REDEMPTION_FUNDING_STATUSES = new Set([
  'ISSUER_APPROVED',
  'TOKENS_LOCKED',
  'READY_TO_REDEEM',
  'APPROVED',
  'AWAITING_INVESTOR_REDEMPTION',
]);

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
  const [funding, setFunding] = useState(null);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [fundingError, setFundingError] = useState('');
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
  const terminal = TERMINAL.has(status);
  const awaitingDecision = status === 'PENDING_ISSUER_APPROVAL';
  const fundingPhase = REDEMPTION_FUNDING_STATUSES.has(status);
  const fundingCheckPending = fundingPhase && !funding && !fundingError;
  const issuerAllowanceReady = Boolean(funding?.issuerAllowanceSufficient);
  const issuerBalanceReady = Boolean(funding?.issuerBalanceSufficient);
  const paymentReady = fundingPhase && issuerAllowanceReady && issuerBalanceReady;
  const approvalNeeded = fundingPhase
    && Boolean(funding)
    && !fundingLoading
    && !fundingError
    && !issuerAllowanceReady;

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

  useEffect(() => {
    if (!fundingPhase || terminal || !redemption) {
      setFunding(null);
      setFundingError('');
      setFundingLoading(false);
      return undefined;
    }

    const chainId = Number(redemption?.chainId);
    const tokenAddress = cleanRedemptionText(redemption?.tokenAddress || redemption?.token?.tokenAddress || redemption?.token?.address);
    const tokenAmountRaw = cleanRedemptionText(redemption?.tokenAmountRaw);
    const tokenAmount = cleanRedemptionText(redemption?.tokenAmount || redemption?.amount);
    if (!Number.isSafeInteger(chainId) || !tokenAddress || (!tokenAmountRaw && !tokenAmount)) return undefined;

    let active = true;
    setFundingLoading(true);
    setFundingError('');
    getPlatformRedemptionFunding({ chainId, tokenAddress, tokenAmountRaw, tokenAmount })
      .then((next) => { if (active) setFunding(next); })
      .catch((fundingLoadError) => {
        if (!active) return;
        setFunding(null);
        setFundingError(getErrorMessage(fundingLoadError, 'Unable to verify redemption funding right now.'));
      })
      .finally(() => { if (active) setFundingLoading(false); });

    return () => { active = false; };
  }, [fundingPhase, redemption, status, terminal]);

  const statusMeta = issuerRedemptionStatusMeta(status);
  const chainId = Number(redemption?.chainId);
  const expectedIssuerWallet = cleanRedemptionText(funding?.issuer || redemption?.issuerPaymentWalletAddress || redemption?.issuerWalletAddress);
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

  const handleFundingApproval = async () => {
    if (!redemptionUid || !fundingPhase || fundingLoading) return;
    setAction('funding');
    try {
      if (!wallet.isConnected || !wallet.connector || !wallet.address) {
        throw new Error('Connect the organization wallet in the header before continuing.');
      }
      if (fundingError) throw new Error(fundingError);

      const chainId = Number(redemption?.chainId);
      if (!Number.isSafeInteger(chainId)) throw new Error('The redemption network is unavailable. Refresh and try again.');
      if (!correctIssuerWallet) {
        throw new Error('Switch to the organization wallet that owns this token before continuing.');
      }
      if (!correctChain) {
        if (canSwitchChain) await wallet.switchChain(chainId);
        else throw new Error('The required redemption network is not configured in this application.');
      }

      const result = await approvePlatformRedemptionFunding({
        connector: wallet.connector,
        connectedAddress: wallet.address,
        chainId,
        tokenAddress: cleanRedemptionText(redemption?.tokenAddress || redemption?.token?.tokenAddress || redemption?.token?.address),
        tokenAmountRaw: cleanRedemptionText(redemption?.tokenAmountRaw),
        tokenAmount: cleanRedemptionText(redemption?.tokenAmount || redemption?.amount),
        onStep: ({ stage }) => {
          if (stage === 'approval-signature') {
            toast.info('Approve USDT spending', { description: 'This is a separate one-time approval. It does not redeem tokens or send a redemption payment.' });
          }
        },
      });
      setFunding(result.funding);
      if (result.alreadyApproved) {
        toast.success('Payment setup is ready', { description: 'The investor can sign Redeem when the organization wallet has enough USDT.' });
      } else {
        toast.success('Payment setup complete', { description: 'No further setup is needed for future redemptions while this permission remains available.' });
      }
      await loadDetail({ quiet: true });
    } catch (fundingApprovalError) {
      if (isPlatformWalletRejection(fundingApprovalError)) {
        toast.info('USDT approval cancelled', { description: 'No changes were made. You can complete the one-time approval later.' });
      } else {
        toast.error(getErrorMessage(fundingApprovalError, 'Unable to approve USDT spending.'));
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
  const paymentAmount = detailValue(funding?.paymentAmountFormatted || redemption?.usdtAmount || redemption?.usdtAmountFormatted || redemption?.payment?.amount);
  const paymentHash = issuerPaymentHash(redemption);
  const burnHash = issuerBurnHash(redemption);
  const explorerName = transactionExplorerName(redemption?.chainId);
  const paymentHashUrl = transactionExplorerUrl(paymentHash, redemption?.chainId);
  const burnHashUrl = transactionExplorerUrl(burnHash, redemption?.chainId);
  const requestApprovedComplete = !['PENDING_INVESTOR_AUTHORIZATION', 'PENDING_ISSUER_APPROVAL'].includes(status)
    && status !== 'ISSUER_REJECTED';
  const redemptionSubmitted = Boolean(paymentHash) || ['PAYMENT_SUBMITTED', 'PAYMENT_CONFIRMED', 'BURN_SUBMITTED', 'COMPLETED'].includes(status);
  const redemptionComplete = Boolean(burnHash) || status === 'COMPLETED';
  const requestReviewStatus = status === 'ISSUER_REJECTED'
    ? 'Rejected'
    : requestApprovedComplete
      ? 'Completed'
      : awaitingDecision
        ? 'Action needed'
        : 'Waiting';
  const investorRedeemStatus = redemptionComplete
    ? 'Completed'
    : redemptionSubmitted
      ? 'In progress'
      : paymentReady
        ? 'Waiting for investor'
        : requestApprovedComplete
          ? 'Preparing'
          : 'Waiting';
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
      return `${baseMessage} The investor redemption transaction is being finalized.`;
    }

    if (redemptionSubmitted) {
      return `${baseMessage} The investor has submitted the Redeem transaction and it is being confirmed.`;
    }

    if (paymentReady) {
      return 'Nothing else is required from you. The investor must now sign the Redeem transaction.';
    }

    if (issuerAllowanceReady && !issuerBalanceReady) {
      return 'The organization wallet needs enough USDT before the investor can redeem.';
    }

    return baseMessage;
  })();

  return (
    <div className="page-stack issuer-redemption-detail-page">
      <header className="issuer-redemption-detail-header">
        <div>
          <span className="issuer-redemptions-eyebrow">Redemption review</span>
          <h1>{issuerRedemptionTokenLabel(redemption)}</h1>
          <p>Review the request. Once it is ready, the investor—not the issuer—signs the final Redeem transaction.</p>
        </div>
        <AppStatusBadge status={status} label={statusMeta.label} tone={statusMeta.tone} />
      </header>

      {error ? <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={18} /><span>{error}</span></div> : null}
      {status === 'MANUAL_REVIEW' ? <div className="issuer-redemption-inline-alert is-danger"><AlertTriangle size={18} /><span>This redemption requires manual review. Do not start another settlement transaction. Contact your support team.</span></div> : null}

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
              <StatusStep icon={ShieldCheck} label="Review request" value={requestReviewStatus} active={awaitingDecision} complete={requestApprovedComplete} />
              {approvalNeeded ? (
                <StatusStep icon={CreditCard} label="One-time payment setup" value="Action needed" active complete={false} />
              ) : null}
              <StatusStep
                icon={WalletCards}
                label="Investor redeems"
                value={investorRedeemStatus}
                active={requestApprovedComplete && !redemptionSubmitted && !approvalNeeded}
                complete={redemptionComplete}
              />
              <StatusStep icon={CheckCircle2} label="Redemption completed" value={redemptionComplete ? 'Completed' : 'Waiting'} active={redemptionSubmitted && !redemptionComplete} complete={redemptionComplete} />
            </div>
            {(paymentHash || burnHash) ? (
              <div className="issuer-redemption-proof-list">
                {paymentHash ? <div><span>Redemption Transaction ID</span><CompactAddress value={paymentHash} label="Redemption Transaction ID" leading={8} trailing={8} href={paymentHashUrl} linkLabel={`View Redemption Transaction on ${explorerName}`} /></div> : null}
                {burnHash && burnHash !== paymentHash ? <div><span>Completion Transaction ID</span><CompactAddress value={burnHash} label="Completion Transaction ID" leading={8} trailing={8} href={burnHashUrl} linkLabel={`View Completion Transaction on ${explorerName}`} /></div> : null}
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="issuer-redemption-detail-side">
          <Card className="issuer-redemption-card issuer-redemption-action-card">
            <div className="issuer-redemption-card__heading"><div><span>Required action</span><h2>{awaitingDecision ? 'Review request' : fundingPhase ? fundingCheckPending || fundingLoading ? 'Preparing redemption' : fundingError ? 'Unable to check readiness' : approvalNeeded ? 'One-time payment setup' : !issuerBalanceReady ? 'Add USDT for this redemption' : 'Waiting for investor' : status === 'ISSUER_REJECTED' ? 'Redemption outcome' : 'Redemption progress'}</h2></div><WalletCards size={21} /></div>

            {awaitingDecision ? (
              <>
                <p>Review the investor’s request, then approve or reject it. If approved, the investor completes the final redemption from their wallet.</p>
                <div className="issuer-redemption-action-stack">
                  <Button loading={action === 'approve'} disabled={Boolean(action)} onClick={() => openDecisionModal('approve')} icon={CheckCircle2}>Approve redemption</Button>
                  <Button variant="danger" loading={action === 'reject'} disabled={Boolean(action)} onClick={() => openDecisionModal('reject')} icon={XCircle}>Reject redemption</Button>
                </div>
              </>
            ) : fundingPhase ? (
              <>
                {fundingCheckPending || fundingLoading ? (
                  <div className="issuer-redemption-live"><RefreshCw size={16} className="issuer-redemption-spin" /><span>Checking that this redemption is ready…</span></div>
                ) : null}

                {fundingError ? (
                  <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={17} /><span>{fundingError}</span></div>
                ) : null}

                {approvalNeeded ? (
                  <>
                    <p>This organization needs a one-time payment setup before redemptions can be processed. Complete it once from the approved organization wallet.</p>
                    <div className="issuer-redemption-payment-summary">
                      <div><span>Current redemption</span><strong>{paymentAmount !== '—' ? `${paymentAmount} USDT` : 'Unavailable'}</strong></div>
                      <div><span>Required network</span><strong>{Number.isSafeInteger(chainId) ? wallet.supportedChains.find((chain) => chain.id === chainId)?.name || `Chain ${chainId}` : '—'}</strong></div>
                      <div><span>Organization wallet</span>{expectedIssuerWallet ? <CompactAddress value={expectedIssuerWallet} label="Organization wallet" /> : <strong>—</strong>}</div>
                    </div>
                    {!wallet.isConnected ? <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={17} /><span>Connect the organization wallet to complete the one-time setup.</span></div> : !correctIssuerWallet ? <div className="issuer-redemption-inline-alert is-danger"><AlertTriangle size={17} /><span>Switch to the approved organization wallet before continuing.</span></div> : !correctChain ? <div className="issuer-redemption-inline-alert is-warning"><AlertTriangle size={17} /><span>Your wallet is on the wrong network. We will ask you to switch before continuing.</span></div> : <div className="issuer-redemption-inline-alert is-success"><CheckCircle2 size={17} /><span>Organization wallet and network are ready.</span></div>}
                    <Button
                      loading={action === 'funding'}
                      disabled={Boolean(action) || Boolean(fundingError) || !wallet.isConnected || !correctIssuerWallet}
                      onClick={handleFundingApproval}
                      icon={CreditCard}
                    >
                      Approve USDT
                    </Button>
                    <small className="issuer-redemption-action-note">This is required only for the first redemption setup. It does not complete the investor’s redemption.</small>
                  </>
                ) : null}

                {!approvalNeeded && issuerAllowanceReady && funding?.issuerBalanceSufficient === false ? (
                  <>
                    <div className="issuer-redemption-payment-summary">
                      <div><span>USDT needed</span><strong>{paymentAmount !== '—' ? `${paymentAmount} USDT` : 'Unavailable'}</strong></div>
                      <div><span>Organization wallet</span>{expectedIssuerWallet ? <CompactAddress value={expectedIssuerWallet} label="Organization wallet" /> : <strong>—</strong>}</div>
                    </div>
                    <div className="issuer-redemption-inline-alert is-danger"><AlertTriangle size={17} /><span>Add enough USDT to the organization wallet for this redemption, then refresh. The investor will be able to redeem once funds are available.</span></div>
                  </>
                ) : null}

                {paymentReady ? (
                  <div className="issuer-redemption-inline-alert is-success"><CheckCircle2 size={17} /><span>No action is needed from you. The investor can now choose Redeem and sign the redemption transaction.</span></div>
                ) : null}
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
              <p>{decision === 'approve' ? 'This accepts the investor’s request. Once the redemption is ready, the investor signs the final Redeem transaction.' : 'Reject only if this investor redemption should not proceed. No settlement will be processed.'}</p>
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
