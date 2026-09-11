import { useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import {
  ISSUER_CLAIM_SIGNING_STATUS,
  addressesMatch,
  buildClaimDigest,
  createApprovedClaimData,
  getClaimTopicLabel,
  getClaimTopicValue,
  isWalletSignatureRejected,
} from '@/utils/issuerClaims';
import { shortenWalletAddress } from '@/utils/wallet';
import { getErrorMessage, sanitizeUserFacingMessage } from '@/utils/error';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';

const claimLabel = (topic) => topic?.label || String(topic?.claimTopicCode || 'Verification Requirement').replaceAll('_', ' ');

export function RejectInterestModal({ open, onClose, topics = [], onConfirm, loading = false }) {
  const [reasonType, setReasonType] = useState('');
  const [selectedClaims, setSelectedClaims] = useState([]);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setReasonType('');
      setSelectedClaims([]);
      setRejectReason('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    setSelectedClaims([]);
    setError('');
    if (reasonType !== 'OTHER') setRejectReason('');
  }, [reasonType]);

  const claimOptions = useMemo(
    () => topics
      .filter((topic) => String(topic?.claimTopicCode || '').trim())
      .map((topic) => ({ value: String(topic.claimTopicCode).trim().toUpperCase(), label: claimLabel(topic) })),
    [topics],
  );
  const availableClaims = claimOptions.filter((option) => !selectedClaims.includes(option.value));
  const valid = reasonType === 'DOC_REJECTED'
    ? selectedClaims.length > 0
    : reasonType === 'OTHER' && rejectReason.trim().length > 0;

  const addClaim = (value) => {
    if (!value || selectedClaims.includes(value)) return;
    setSelectedClaims((current) => [...current, value]);
    setError('');
  };

  const removeClaim = (value) => {
    setSelectedClaims((current) => current.filter((item) => item !== value));
  };

  const submit = async () => {
    if (!valid) {
      setError(reasonType === 'DOC_REJECTED'
        ? 'Select at least one verification requirement.'
        : reasonType === 'OTHER'
          ? 'Provide the reason for rejection.'
          : 'Select a rejection reason.');
      return;
    }
    setError('');
    await onConfirm?.({
      rejectReasonType: reasonType,
      rejectReason: rejectReason.trim(),
      rejectedClaims: reasonType === 'DOC_REJECTED' ? selectedClaims : [],
    });
  };

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={<span className="issuer-decision-title issuer-decision-title--danger"><XCircle size={19} /> Reject Investment Request</span>}
      className="issuer-decision-modal sm:max-w-md"
      bodyClassName="issuer-decision-modal__body"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={loading} disabled={!valid}>Confirm Rejection</Button>
        </>
      )}
    >
      <div className="issuer-decision-stack">
        <p className="issuer-decision-copy">Specify the reason for rejection. This information will be shared with the investor.</p>

        <div className="issuer-decision-field">
          <span>Rejection Reason</span>
          <MarketplaceDropdown
            value={reasonType}
            options={[
              { value: 'DOC_REJECTED', label: 'Document Requested', description: 'Ask the investor to replace one or more verification documents.' },
              { value: 'OTHER', label: 'Other', description: 'Reject for a reason that is not related to a document.' },
            ]}
            onChange={setReasonType}
            ariaLabel="Select rejection reason"
            placeholder="Select a reason…"
            className="issuer-decision-dropdown"
            disabled={loading}
          />
        </div>

        {reasonType === 'DOC_REJECTED' ? (
          <div className="issuer-decision-field">
            <span>Requested Documents</span>
            <MarketplaceDropdown
              value=""
              options={availableClaims.map((option) => ({ ...option, description: 'Request a replacement document for this verification requirement.' }))}
              onChange={addClaim}
              ariaLabel="Select requested verification requirement"
              placeholder={availableClaims.length ? 'Select documents…' : 'All requirements selected'}
              className="issuer-decision-dropdown"
              disabled={loading || !availableClaims.length}
            />
            {selectedClaims.length ? (
              <div className="issuer-decision-chips" aria-label="Requested verification requirements">
                {selectedClaims.map((claim) => {
                  const option = claimOptions.find((item) => item.value === claim);
                  return (
                    <span key={claim}>{option?.label || claim}<button type="button" aria-label={`Remove ${option?.label || claim}`} onClick={() => removeClaim(claim)} disabled={loading}><X size={12} /></button></span>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="issuer-decision-field">
          <span>Additional Notes</span>
          <textarea
            rows={4}
            value={rejectReason}
            onChange={(event) => { setRejectReason(event.target.value); setError(''); }}
            placeholder={reasonType === 'OTHER' ? 'Please provide the reason for rejection…' : 'Please upload the requested documents…'}
            disabled={loading}
          />
        </label>

        {error ? <p className="issuer-decision-error" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}

export function ApproveInterestModal({ open, onClose, onConfirm, loading = false }) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) setNote('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={<span className="issuer-decision-title issuer-decision-title--success"><ShieldCheck size={19} /> Approve Investment Request</span>}
      className="issuer-decision-modal sm:max-w-md"
      bodyClassName="issuer-decision-modal__body"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={() => onConfirm?.(note.trim())} loading={loading}><Check size={15} /> Confirm Verification</Button>
        </>
      )}
    >
      <div className="issuer-decision-stack">
        <p className="issuer-decision-copy">Confirm that the requested verification documents have been reviewed and this investment request can be approved.</p>
        <label className="issuer-decision-field">
          <span>Review Note <small>(Optional)</small></span>
          <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an optional note for this decision…" disabled={loading} />
        </label>
      </div>
    </Modal>
  );
}


const signingErrorCopy = (error) => {
  if (error?.kind === 'wallet-mismatch') {
    return {
      title: 'Organization wallet does not match',
      description: 'Connect the same Organization Wallet used during onboarding before signing the investor verification.',
    };
  }
  if (error?.kind === 'rejected') {
    return {
      title: 'Wallet confirmation cancelled',
      description: 'The wallet confirmation was cancelled. No approval was submitted.',
    };
  }
  if (error?.kind === 'verification') {
    return {
      title: 'Verification approval failed',
      description: sanitizeUserFacingMessage(error.message) || 'One or more verification approvals could not be confirmed. Please try again.',
    };
  }
  if (error?.kind === 'network') {
    return {
      title: 'Verification could not be completed',
      description: sanitizeUserFacingMessage(error.message) || 'Your wallet approvals were collected, but verification could not be completed. Please try again.',
    };
  }
  if (error?.kind === 'configuration') {
    return {
      title: 'Verification approval is not ready',
      description: sanitizeUserFacingMessage(error.message),
    };
  }
  return {
    title: 'Verification approval failed',
    description: sanitizeUserFacingMessage(error?.message) || 'The wallet could not complete the approval request. Check the connection and try again.',
  };
};

export function VerifyIdentityClaimsModal({
  open,
  onClose,
  subscriptionId,
  investorIdentityAddress,
  requiredClaimTopics = [],
  onVerified,
}) {
  const { organization, isLoading: organizationLoading } = useOrganization({ enabled: open });
  const wallet = useWalletConnection();
  const [status, setStatus] = useState(ISSUER_CLAIM_SIGNING_STATUS.PENDING);
  const [collectedClaims, setCollectedClaims] = useState([]);
  const [activeClaimIndex, setActiveClaimIndex] = useState(-1);
  const [signingError, setSigningError] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);

  const registeredWallet = organization?.walletAddress || '';
  const connectedWallet = wallet.address || '';

  const claims = useMemo(
    () => requiredClaimTopics.map((topic, index) => ({
      ...((topic && typeof topic === 'object') ? topic : {}),
      claimTopic: getClaimTopicValue(topic),
      label: getClaimTopicLabel(topic, index),
      index,
    })),
    [requiredClaimTopics],
  );

  const invalidTopic = claims.find((topic) => topic.claimTopic === null);
  const walletMatches = addressesMatch(connectedWallet, registeredWallet);
  const isBusy = status === ISSUER_CLAIM_SIGNING_STATUS.SIGNING || status === ISSUER_CLAIM_SIGNING_STATUS.VERIFYING;
  const configurationError = !subscriptionId
    ? 'The investment request information is missing.'
    : !investorIdentityAddress || !isAddress(investorIdentityAddress)
      ? 'The investor’s verification profile is not ready yet.'
      : !claims.length
        ? 'This token does not have any verification requirements configured.'
        : invalidTopic
          ? `${invalidTopic.label} is missing its technical verification identifier. Refresh and try again.`
          : !registeredWallet || !isAddress(registeredWallet)
            ? 'A valid registered Organization Wallet is required.'
            : '';

  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    setStatus(ISSUER_CLAIM_SIGNING_STATUS.PENDING);
    setCollectedClaims([]);
    setActiveClaimIndex(-1);
    setSigningError(null);
    setVerificationResult(null);

    if (!subscriptionId) return () => { active = false; };

    setVerificationLoading(true);
    issuerInvestorSubscriptionsService.getClaimVerification(subscriptionId)
      .then((result) => {
        if (!active) return;
        setVerificationResult(result || null);
        if (String(result?.status || '').trim().toUpperCase() === 'SIGNED') {
          setStatus(ISSUER_CLAIM_SIGNING_STATUS.SIGNED);
        }
      })
      .catch(() => {
        // A preflight status lookup should not block a new signing attempt.
        // The POST verification request remains the source of truth after signing.
      })
      .finally(() => {
        if (active) setVerificationLoading(false);
      });

    return () => { active = false; };
  }, [open, subscriptionId]);

  const close = () => {
    if (isBusy) return;
    onClose?.();
  };

  const failSigning = (error) => {
    setStatus(ISSUER_CLAIM_SIGNING_STATUS.FAILED);
    setActiveClaimIndex(-1);
    setSigningError(error);
  };

  const handleVerifyClick = async () => {
    if (isBusy) return;

    setCollectedClaims([]);
    setSigningError(null);
    setVerificationResult(null);
    setActiveClaimIndex(-1);

    if (configurationError) {
      failSigning({ kind: 'configuration', message: configurationError });
      return;
    }

    if (!wallet.isConnected || !wallet.connector) {
      failSigning({
        kind: 'wallet',
        message: 'Connect your approved Organization Wallet before signing the investor verification.',
      });
      return;
    }

    setStatus(ISSUER_CLAIM_SIGNING_STATUS.SIGNING);
    let signingStage = 'wallet';

    try {
      const provider = await wallet.connector.getProvider?.();
      if (!provider?.request) {
        throw new Error('The connected wallet provider is unavailable. Reconnect the wallet and try again.');
      }

      const accounts = await provider.request({ method: 'eth_accounts' });
      const currentWallet = Array.isArray(accounts) && accounts[0] ? accounts[0] : connectedWallet;

      if (!currentWallet || !isAddress(currentWallet)) {
        throw new Error('No active wallet account was returned by the connected wallet.');
      }

      if (!addressesMatch(currentWallet, registeredWallet)) {
        failSigning({
          kind: 'wallet-mismatch',
          connectedWallet: currentWallet,
          registeredWallet,
        });
        return;
      }

      const nextClaims = [];

      for (let index = 0; index < claims.length; index += 1) {
        const claim = claims[index];
        setActiveClaimIndex(index);

        const data = createApprovedClaimData();
        const digest = buildClaimDigest(
          investorIdentityAddress,
          claim.claimTopic,
          data,
        );

        // `personal_sign` signs the digest bytes using the same EIP-191 message
        // semantics as ethers Signer.signMessage(getBytes(digest)).
        const signature = await provider.request({
          method: 'personal_sign',
          params: [digest, currentWallet],
        });

        if (typeof signature !== 'string' || !signature.startsWith('0x')) {
          throw new Error(`The wallet did not return a valid signature for ${claim.label}.`);
        }

        const signedClaim = {
          claimTopic: claim.claimTopic,
          data,
          signature,
        };
        nextClaims.push(signedClaim);
        setCollectedClaims([...nextClaims]);
      }

      setActiveClaimIndex(-1);
      signingStage = 'backend';
      setStatus(ISSUER_CLAIM_SIGNING_STATUS.VERIFYING);

      // The claim-signature endpoint is the single source of truth for issuer
      // verification. It verifies every required signature and advances the
      // subscription to `verifiedByIssuer` only when the overall result is SIGNED.
      const result = await issuerInvestorSubscriptionsService.submitClaimSignatures(
        subscriptionId,
        nextClaims,
      );
      setVerificationResult(result || null);

      const backendStatus = String(result?.status || '').trim().toUpperCase();
      if (backendStatus === 'SIGNED') {
        setStatus(ISSUER_CLAIM_SIGNING_STATUS.SIGNED);
        await onVerified?.(result);
        return;
      }

      const failedClaims = Array.isArray(result?.claims)
        ? result.claims.filter((claim) => String(claim?.status || '').toUpperCase() !== 'SIGNED')
        : [];
      const verificationErrors = failedClaims
        .map((claim) => claim?.verificationError)
        .filter(Boolean);
      const hasIssuerWalletMismatch = verificationErrors.some((message) =>
        String(message).toLowerCase().includes('does not match the registered issuer wallet')
      );
      const verificationMessage = hasIssuerWalletMismatch
        ? 'The signer wallet does not match the registered wallet. Please switch to your registered wallet and try again.'
        : [...new Set(verificationErrors)].join(' ');

      failSigning({
        kind: backendStatus === 'NETWORK_ERROR' ? 'network' : 'verification',
        message: verificationMessage || (
          backendStatus === 'PENDING'
            ? 'Not every required verification approval could be confirmed. Please try again.'
            : 'One or more verification approvals could not be confirmed. Please try again.'
        ),
      });
    } catch (error) {
      if (isWalletSignatureRejected(error)) {
        failSigning({ kind: 'rejected', message: error?.message });
        return;
      }

      failSigning(
        signingStage === 'backend'
          ? { kind: 'network', message: getErrorMessage(error, 'Unable to submit the verification approvals. Please try again.') }
          : { kind: 'wallet', message: error?.shortMessage || error?.message },
      );
    }
  };

  const currentClaim = activeClaimIndex >= 0 ? claims[activeClaimIndex] : null;
  const errorCopy = signingErrorCopy(signingError);

  const footer = status === ISSUER_CLAIM_SIGNING_STATUS.SIGNED
    ? <Button onClick={close}>Close</Button>
    : status === ISSUER_CLAIM_SIGNING_STATUS.FAILED
      ? (
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={handleVerifyClick}>Retry Verify &amp; Sign</Button>
        </>
      )
      : (
        <>
          <Button variant="secondary" onClick={close} disabled={isBusy}>Cancel</Button>
          <Button
            onClick={handleVerifyClick}
            disabled={isBusy || verificationLoading || organizationLoading || Boolean(configurationError) || !wallet.isConnected || !walletMatches}
          >
            {isBusy ? <LoaderCircle className="issuer-claim-spin" size={15} /> : <ShieldCheck size={15} />}
            {verificationLoading ? 'Checking status…' : status === ISSUER_CLAIM_SIGNING_STATUS.VERIFYING ? 'Verifying…' : isBusy ? 'Waiting for wallet…' : `Approve ${claims.length || ''} Verification${claims.length === 1 ? '' : 's'}`}
          </Button>
        </>
      );

  return (
    <Modal
      open={open}
      onClose={close}
      title="Approve Investor Verification"
      className="issuer-claim-signature-modal sm:max-w-lg"
      bodyClassName="issuer-claim-signature-modal__body"
      trapFocus
      footer={footer}
    >
      <div className="issuer-claim-signature-stack">
        {status === ISSUER_CLAIM_SIGNING_STATUS.PENDING ? (
          <>
            <div className="issuer-claim-signature-intro">
              <span className="issuer-claim-signature-intro__icon"><ShieldCheck size={20} /></span>
              <div>
                <strong>Review and sign each verification requirement</strong>
                <p>This token requires {claims.length} verification approval{claims.length === 1 ? '' : 's'}. Your Organization Wallet will ask you to confirm each requirement separately.</p>
              </div>
            </div>

            <div className={`issuer-claim-wallet-card ${walletMatches ? 'is-match' : 'is-mismatch'}`}>
              <span className="issuer-claim-wallet-card__icon"><Wallet size={18} /></span>
              <div className="issuer-claim-wallet-card__content">
                <span>Organization Wallet</span>
                <strong title={registeredWallet || undefined}>{registeredWallet ? shortenWalletAddress(registeredWallet, 8, 6) : organizationLoading ? 'Loading…' : 'Not registered'}</strong>
                <small>Connected: {connectedWallet ? shortenWalletAddress(connectedWallet, 8, 6) : 'No wallet connected'}</small>
              </div>
              <span className={`issuer-claim-wallet-card__status ${walletMatches ? 'is-match' : 'is-mismatch'}`}>
                {walletMatches ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {walletMatches ? 'Matched' : 'Check wallet'}
              </span>
            </div>

            {!organizationLoading && registeredWallet && connectedWallet && !walletMatches ? (
              <div className="issuer-claim-alert issuer-claim-alert--danger" role="alert">
                <AlertTriangle size={17} />
                <div>
                  <strong>Wrong wallet connected</strong>
                  <span>Switch to the registered Organization Wallet before signing. No signature request will be sent while these addresses do not match.</span>
                </div>
              </div>
            ) : null}

            {!wallet.isConnected ? (
              <div className="issuer-claim-alert" role="status">
                <Wallet size={17} />
                <div>
                  <strong>Wallet connection required</strong>
                  <span>Connect your Organization Wallet using the wallet control, then return here to sign the verification requirements.</span>
                </div>
              </div>
            ) : null}

            {configurationError && !organizationLoading ? (
              <div className="issuer-claim-alert issuer-claim-alert--danger" role="alert">
                <AlertTriangle size={17} />
                <div><strong>Signing data unavailable</strong><span>{configurationError}</span></div>
              </div>
            ) : null}

            <div className="issuer-claim-list-section">
              <div className="issuer-claim-list-section__heading">
                <span>Verification to Approve ({claims.length})</span>
                <small>One wallet confirmation per requirement</small>
              </div>
              <div className="issuer-claim-list">
                {claims.map((claim) => (
                  <div key={`${claim.claimTopic ?? 'invalid'}-${claim.index}`} className="issuer-claim-list__item">
                    <span className="issuer-claim-list__check"><Check size={13} /></span>
                    <div>
                      <strong>{claim.label}</strong>
                      <small>{claim.description || 'Verification credential for this investor. Technical standard: ERC-3643 claim.'}</small>
                    </div>
                    <code>Technical requirement ID: {claim.claimTopic ?? '—'}</code>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.SIGNING ? (
          <div className="issuer-claim-signing-state" aria-live="polite">
            <span className="issuer-claim-signing-state__spinner"><LoaderCircle size={30} /></span>
            <strong>Waiting for wallet confirmation</strong>
            <p>
              Confirm {currentClaim?.label || 'the current verification'} in your wallet.
              {claims.length > 1 ? ` Approval ${activeClaimIndex + 1} of ${claims.length}.` : ''}
            </p>
            <div className="issuer-claim-progress-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(8, (collectedClaims.length / claims.length) * 100)}%` }} />
            </div>
            <div className="issuer-claim-progress-list">
              {claims.map((claim, index) => {
                const signed = index < collectedClaims.length;
                const active = index === activeClaimIndex;
                return (
                  <div key={`${claim.claimTopic ?? 'invalid'}-${claim.index}`} className={signed ? 'is-signed' : active ? 'is-active' : ''}>
                    {signed ? <CheckCircle2 size={16} /> : active ? <LoaderCircle className="issuer-claim-spin" size={16} /> : <Circle size={16} />}
                    <span>{claim.label}</span>
                    <small>{signed ? 'Approved' : active ? 'Waiting for wallet' : 'Pending'}</small>
                  </div>
                );
              })}
            </div>
            <span className="issuer-claim-signing-state__note">Keep this window open until all verification approvals are complete.</span>
          </div>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.VERIFYING ? (
          <div className="issuer-claim-signing-state" aria-live="polite">
            <span className="issuer-claim-signing-state__spinner"><LoaderCircle size={30} /></span>
            <strong>Confirming approvals…</strong>
            <p>All wallet confirmations were collected. Please wait while each verification approval is confirmed.</p>
            <span className="issuer-claim-signing-state__note">Keep this window open until verification is complete.</span>
          </div>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.FAILED ? (
          <div className="issuer-claim-result-state issuer-claim-result-state--failed" role="alert">
            <span className="issuer-claim-result-state__icon"><XCircle size={24} /></span>
            <strong>{errorCopy.title}</strong>
            <p>{errorCopy.description}</p>
            {signingError?.kind === 'wallet-mismatch' ? (
              <div className="issuer-claim-address-comparison">
                <div><span>Registered Organization Wallet</span><code>{shortenWalletAddress(signingError.registeredWallet, 10, 8)}</code></div>
                <div><span>Currently Connected Wallet</span><code>{shortenWalletAddress(signingError.connectedWallet, 10, 8)}</code></div>
              </div>
            ) : null}
          </div>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.SIGNED ? (
          <div className="issuer-claim-result-state issuer-claim-result-state--success" aria-live="polite">
            <span className="issuer-claim-result-state__icon"><CheckCircle2 size={26} /></span>
            <strong>Investor verification approved</strong>
            <p>Every required verification item was signed with your Organization Wallet and confirmed successfully.</p>
            <span className="issuer-claim-status-pill">Status: Completed</span>
            <div className="issuer-claim-success-list">
              {claims.map((claim) => (
                <div key={`${claim.claimTopic ?? 'invalid'}-${claim.index}`}>
                  <span><UserRound size={15} /></span>
                  <div><strong>{claim.label}</strong><small>Technical requirement ID {claim.claimTopic}</small></div>
                  <span className="issuer-claim-success-list__verified"><CheckCircle2 size={14} /> Approved</span>
                </div>
              ))}
            </div>
            {verificationResult?.verificationId ? (
              <span className="issuer-claim-result-state__note">Verification ID: {verificationResult.verificationId}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
