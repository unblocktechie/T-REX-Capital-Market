import { useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
  Info,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useAuthStore } from '@/store/auth.store';
import { useNetworkStore } from '@/store/network.store';
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
import { getIssuerApprovalProgress } from '@/utils/issuerApprovalProgress';
import { getErrorMessage, sanitizeUserFacingMessage } from '@/utils/error';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';

const getFriendlyClaimCopy = (topic, index = 0) => {
  const technicalLabel = getClaimTopicLabel(topic, index);
  const normalized = String(technicalLabel || '').trim().toLowerCase();

  if (normalized.includes('kyc') || normalized.includes('know your customer') || normalized.includes('identity')) {
    return {
      label: 'Identity check',
      description: 'Confirms the investor’s identity and address meet the requirements for this investment.',
      technicalLabel,
    };
  }

  if (normalized.includes('accredited')) {
    return {
      label: 'Investment eligibility',
      description: 'Confirms the investor meets the financial or eligibility requirements configured for this investment.',
      technicalLabel,
    };
  }

  return {
    label: technicalLabel || `Investor check ${index + 1}`,
    description: topic?.description || 'Confirms the investor meets one of the checks required for this investment.',
    technicalLabel,
  };
};

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
      .map((topic, index) => ({ value: String(topic.claimTopicCode).trim().toUpperCase(), label: getFriendlyClaimCopy(topic, index).label })),
    [topics],
  );
  const availableClaims = claimOptions.filter((option) => !selectedClaims.includes(option.value));
  const hasRejectionNote = rejectReason.trim().length > 0;
  const valid = hasRejectionNote && (
    reasonType === 'DOC_REJECTED'
      ? selectedClaims.length > 0
      : reasonType === 'OTHER'
  );

  const addClaim = (value) => {
    if (!value || selectedClaims.includes(value)) return;
    setSelectedClaims((current) => [...current, value]);
    setError('');
  };

  const removeClaim = (value) => {
    setSelectedClaims((current) => current.filter((item) => item !== value));
  };

  const submit = async () => {
    if (!reasonType) {
      setError('Choose whether to request changes or decline the request.');
      return;
    }
    if (reasonType === 'DOC_REJECTED' && !selectedClaims.length) {
      setError('Select at least one check that needs updated documents.');
      return;
    }
    if (!hasRejectionNote) {
      setError('Enter a rejection note before submitting this decision.');
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
      title={<span className="issuer-decision-title issuer-decision-title--danger"><XCircle size={19} /> Request changes or decline</span>}
      className="issuer-decision-modal sm:max-w-md"
      bodyClassName="issuer-decision-modal__body"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={loading} disabled={!valid}>{reasonType === 'DOC_REJECTED' ? 'Send Change Request' : 'Decline Request'}</Button>
        </>
      )}
    >
      <div className="issuer-decision-stack">
        <p className="issuer-decision-copy">Choose what needs to happen next. The investor will see the reason and any message you add.</p>

        <div className="issuer-decision-field">
          <span>What needs to happen?</span>
          <MarketplaceDropdown
            value={reasonType}
            options={[
              { value: 'DOC_REJECTED', label: 'Request updated documents', description: 'Ask the investor to replace or provide documents, then submit again.' },
              { value: 'OTHER', label: 'Decline this request', description: 'End this investment request and tell the investor why.' },
            ]}
            onChange={setReasonType}
            ariaLabel="Choose what needs to happen"
            placeholder="Choose an action…"
            className="issuer-decision-dropdown"
            disabled={loading}
          />
        </div>

        {reasonType === 'DOC_REJECTED' ? (
          <div className="issuer-decision-field">
            <span>Which checks need updated documents?</span>
            <MarketplaceDropdown
              value=""
              options={availableClaims.map((option) => ({ ...option, description: 'Ask the investor to replace or provide a document for this check.' }))}
              onChange={addClaim}
              ariaLabel="Select check that needs updated documents"
              placeholder={availableClaims.length ? 'Select a check…' : 'All checks selected'}
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
          <span>Rejection note <b aria-hidden="true">*</b></span>
          <textarea
            rows={4}
            value={rejectReason}
            onChange={(event) => { setRejectReason(event.target.value); setError(''); }}
            placeholder={reasonType === 'OTHER' ? 'Explain why this request is being declined…' : 'Explain what the investor needs to update…'}
            disabled={loading}
            required
            aria-required="true"
          />
          <small>This note is required and will be shown to the investor.</small>
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
      title: 'Approved organization account not connected',
      description: 'Switch to the organization account approved during setup, then try again.',
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
      title: 'Investor checks could not be approved',
      description: sanitizeUserFacingMessage(error.message) || 'One or more investor checks could not be confirmed. Please try again.',
    };
  }
  if (error?.kind === 'network') {
    return {
      title: 'Approval could not be completed',
      description: sanitizeUserFacingMessage(error.message) || 'Your wallet confirmations were collected, but the approval could not be completed. Please try again.',
    };
  }
  if (error?.kind === 'configuration') {
    return {
      title: 'Investor checks are not ready',
      description: sanitizeUserFacingMessage(error.message),
    };
  }
  return {
    title: 'Approval could not be completed',
    description: sanitizeUserFacingMessage(error?.message) || 'Your wallet could not complete the approval. Check the connection and try again.',
  };
};

/** Reuse the signature progress UI for registration instead of starting a new flow. */
function IssuerApprovalProgress({ claims, collectedClaims, activeClaimIndex, status, registrationConfirmed, registrationPending }) {
  const progress = getIssuerApprovalProgress({
    claimCount: claims.length,
    collectedCount: collectedClaims.length,
    activeClaimIndex,
    status,
    registrationConfirmed,
    registrationPending,
  });
  const registration = progress.registration;
  return (
    <>
      <div
        className="issuer-claim-progress-bar"
        role="progressbar"
        aria-label="Claim signatures and investor registration"
        aria-valuemin={0}
        aria-valuemax={progress.totalCount}
        aria-valuenow={progress.completedCount}
      >
        <span style={{ width: `${Math.max(8, progress.percentage)}%` }} />
      </div>
      <div className="issuer-claim-progress-list" aria-label="Issuer approval progress">
        {claims.map((claim, index) => {
          const step = progress.signatures[index];
          return (
            <div key={`${claim.claimTopic ?? 'invalid'}-${claim.index}`} className={step.complete ? 'is-signed' : step.active ? 'is-active' : ''}>
              {step.complete ? <CheckCircle2 size={16} /> : step.active ? <LoaderCircle className="issuer-claim-spin" size={16} /> : <Circle size={16} />}
              <span>{claim.label}</span>
              <small>{step.complete ? 'Confirmed' : step.active ? 'Confirm now' : 'Next'}</small>
            </div>
          );
        })}
        <div className={`issuer-claim-progress-registration is-${registration.state}`}>
          {registration.state === 'complete'
            ? <CheckCircle2 size={16} />
            : registration.state === 'active' || registration.state === 'pending'
              ? <LoaderCircle className="issuer-claim-spin" size={16} />
              : registration.state === 'failed'
                ? <AlertTriangle size={16} />
                : <Circle size={16} />}
          <span>Registration</span>
          <small>{registration.label}</small>
        </div>
      </div>
    </>
  );
}

export function VerifyIdentityClaimsModal({
  open,
  onClose,
  subscriptionId,
  investorIdentityAddress,
  requiredClaimTopics = [],
  investorName = 'this investor',
  assetName = 'this investment',
  chainId,
  onVerified,
  onRegister,
  registrationConfirmed = false,
  registrationPending = false,
}) {
  const { organization, isLoading: organizationLoading } = useOrganization({ enabled: open });
  const wallet = useWalletConnection(chainId);
  const [status, setStatus] = useState(ISSUER_CLAIM_SIGNING_STATUS.PENDING);
  const [collectedClaims, setCollectedClaims] = useState([]);
  const [activeClaimIndex, setActiveClaimIndex] = useState(-1);
  const [signingError, setSigningError] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [registrationIssue, setRegistrationIssue] = useState('');

  const registeredWallet = organization?.walletAddress || '';
  const connectedWallet = wallet.address || '';

  const claims = useMemo(
    () => requiredClaimTopics.map((topic, index) => {
      const friendly = getFriendlyClaimCopy(topic, index);
      return {
        ...((topic && typeof topic === 'object') ? topic : {}),
        claimTopic: getClaimTopicValue(topic),
        label: friendly.label,
        description: friendly.description,
        technicalLabel: friendly.technicalLabel,
        index,
      };
    }),
    [requiredClaimTopics],
  );

  const invalidTopic = claims.find((topic) => topic.claimTopic === null);
  const walletMatches = addressesMatch(connectedWallet, registeredWallet);
  const isBusy = status === ISSUER_CLAIM_SIGNING_STATUS.SIGNING || status === ISSUER_CLAIM_SIGNING_STATUS.VERIFYING || status === 'REGISTERING';
  const configurationError = !subscriptionId
    ? 'The investment request information is missing.'
    : !investorIdentityAddress || !isAddress(investorIdentityAddress)
      ? 'The investor’s verification information is not ready yet.'
      : !claims.length
        ? 'This investment does not have any investor checks configured.'
        : invalidTopic
          ? `${invalidTopic.label} is missing required setup information. Refresh and try again.`
          : !registeredWallet || !isAddress(registeredWallet)
            ? 'Your approved organization account is not available. Refresh your organization details and try again.'
            : '';

  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    setStatus(ISSUER_CLAIM_SIGNING_STATUS.PENDING);
    setCollectedClaims([]);
    setActiveClaimIndex(-1);
    setSigningError(null);
    setRegistrationIssue('');

    if (!subscriptionId) return () => { active = false; };

    setVerificationLoading(true);
    issuerInvestorSubscriptionsService.getClaimVerification(subscriptionId)
      .then((result) => {
        if (!active) return;
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

  const handleRegistration = async () => {
    if (isBusy || registrationConfirmed) return;
    setRegistrationIssue('');
    setStatus('REGISTERING');
    try {
      // This reuses the existing idempotent prepare -> MetaMask transaction ->
      // hash recovery -> backend receipt verification path on the issuer page.
      const outcome = await onRegister?.();
      if (outcome === 'CONFIRMED') setStatus('REGISTERED');
      else if (outcome === 'PENDING') setStatus('REGISTRY_PENDING');
      else {
        setStatus('REGISTRY_FAILED');
        setRegistrationIssue(outcome === 'CANCELLED'
          ? 'You cancelled the registry transaction. Your claim signatures are saved; only registration needs to be retried.'
          : 'Registration was not confirmed. Your claim signatures are saved; retry registration without signing again.');
      }
    } catch (error) {
      setStatus('REGISTRY_FAILED');
      setRegistrationIssue(getErrorMessage(error, 'Registration could not be completed. Retry without signing claims again.'));
    }
  };

  const assertSelectedApplicationChain = () => {
    const selectedChainId = useNetworkStore.getState().getActiveChainId(useAuthStore.getState().user);
    if (Number(chainId) && selectedChainId !== Number(chainId)) {
      throw new Error('The selected network changed. Refresh the application and try again on its original network.');
    }
  };

  const handleVerifyClick = async () => {
    if (isBusy) return;
    if (status === ISSUER_CLAIM_SIGNING_STATUS.SIGNED || status === 'REGISTRY_FAILED' || status === 'REGISTRY_PENDING') {
      await handleRegistration();
      return;
    }

    setCollectedClaims([]);
    setSigningError(null);
    setActiveClaimIndex(-1);

    if (configurationError) {
      failSigning({ kind: 'configuration', message: configurationError });
      return;
    }

    if (!wallet.isConnected || !wallet.connector) {
      failSigning({
        kind: 'wallet',
        message: 'Connect your approved organization account before approving these investor checks.',
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

      assertSelectedApplicationChain();
      const nextClaims = [];

      for (let index = 0; index < claims.length; index += 1) {
        assertSelectedApplicationChain();
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

      assertSelectedApplicationChain();
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

      const backendStatus = String(result?.status || '').trim().toUpperCase();
      if (backendStatus === 'SIGNED') {
        setStatus(ISSUER_CLAIM_SIGNING_STATUS.SIGNED);
        await onVerified?.(result);
        // Immediately request the real issuer-wallet registry transaction after
        // backend SIGNED status. Do not wait for the investor to submit claims.
        await handleRegistration();
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
        ? 'The connected account does not match your approved organization account. Switch accounts and try again.'
        : [...new Set(verificationErrors)].join(' ');

      failSigning({
        kind: backendStatus === 'NETWORK_ERROR' ? 'network' : 'verification',
        message: verificationMessage || (
          backendStatus === 'PENDING'
            ? 'Not every required investor check could be confirmed. Please try again.'
            : 'One or more investor checks could not be confirmed. Please try again.'
        ),
      });
    } catch (error) {
      if (isWalletSignatureRejected(error)) {
        failSigning({ kind: 'rejected', message: error?.message });
        return;
      }

      failSigning(
        signingStage === 'backend'
          ? { kind: 'network', message: getErrorMessage(error, 'Unable to submit the investor check approvals. Please try again.') }
          : { kind: 'wallet', message: error?.shortMessage || error?.message },
      );
    }
  };

  const currentClaim = activeClaimIndex >= 0 ? claims[activeClaimIndex] : null;
  const errorCopy = signingErrorCopy(signingError);
  // A chain confirmation can arrive from page polling before the local call resolves.
  // Only show it as complete after signatures are verified (never from a hash alone).
  const verifiedSignatures = [ISSUER_CLAIM_SIGNING_STATUS.SIGNED, 'REGISTERING', 'REGISTRY_PENDING', 'REGISTRY_FAILED', 'REGISTERED'].includes(status);
  const registered = verifiedSignatures && (status === 'REGISTERED' || registrationConfirmed);
  const footer = registered || status === 'REGISTRY_PENDING'
    ? <Button onClick={close}>Close</Button>
    : verifiedSignatures
      ? (
        <>
          <Button variant="secondary" onClick={close} disabled={isBusy}>Close</Button>
          <Button onClick={() => void handleRegistration()} disabled={isBusy || registrationPending || registrationConfirmed}>
            {isBusy ? <LoaderCircle className="issuer-claim-spin" size={15} /> : <ShieldCheck size={15} />}
            {isBusy ? 'Opening registry transaction…' : 'Register Investor'}
          </Button>
        </>
      )
      : status === ISSUER_CLAIM_SIGNING_STATUS.FAILED
        ? <><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={handleVerifyClick}>Try Again</Button></>
        : (
          <>
            <Button variant="secondary" onClick={close} disabled={isBusy}>Cancel</Button>
            <Button
              onClick={handleVerifyClick}
              disabled={isBusy || verificationLoading || organizationLoading || Boolean(configurationError) || !wallet.isConnected || !walletMatches}
            >
              {isBusy ? <LoaderCircle className="issuer-claim-spin" size={15} /> : <ShieldCheck size={15} />}
              {verificationLoading ? 'Checking status…' : isBusy ? 'Waiting for wallet…' : `Approve ${claims.length || ''} Check${claims.length === 1 ? '' : 's'} & Register`}
            </Button>
          </>
        );

  return (
    <Modal
      open={open}
      onClose={close}
      title="Step 2 · Verify claims & register investor"
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
                <strong>Confirm the checks required for this investor</strong>
                <p>You are approving {investorName}&apos;s required checks for {assetName || 'this investment'}. Review the items below before continuing.</p>
              </div>
            </div>

            <div className="issuer-claim-explainer" role="note">
              <Info size={18} aria-hidden="true" />
              <div>
                <strong>{claims.length} approval signature{claims.length === 1 ? '' : 's'} + 1 registration transaction</strong>
                <p>You will confirm {claims.length === 2 ? 'two approval signatures' : `${claims.length} approval signatures`} in MetaMask, then complete one Identity Registry registration transaction. The signatures do not move funds. Your issuer wallet only pays the gas fee for the registration transaction, and the investor submits their own claim afterward.</p>
              </div>
            </div>

            <div className={`issuer-claim-wallet-card ${walletMatches ? 'is-match' : 'is-mismatch'}`}>
              <span className="issuer-claim-wallet-card__icon"><Wallet size={18} /></span>
              <div className="issuer-claim-wallet-card__content">
                <span>Approved organization account</span>
                <strong title={registeredWallet || undefined}>{registeredWallet ? shortenWalletAddress(registeredWallet, 8, 6) : organizationLoading ? 'Loading…' : 'Not available'}</strong>
                <small>Currently connected: {connectedWallet ? shortenWalletAddress(connectedWallet, 8, 6) : 'No account connected'}</small>
              </div>
              <span className={`issuer-claim-wallet-card__status ${walletMatches ? 'is-match' : 'is-mismatch'}`}>
                {walletMatches ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {walletMatches ? 'Ready' : 'Switch account'}
              </span>
            </div>

            {!organizationLoading && registeredWallet && connectedWallet && !walletMatches ? (
              <div className="issuer-claim-alert issuer-claim-alert--danger" role="alert">
                <AlertTriangle size={17} />
                <div>
                  <strong>Switch to your approved organization account</strong>
                  <span>The connected account does not match the one approved for your organization. We will not open a confirmation request until they match.</span>
                </div>
              </div>
            ) : null}

            {!wallet.isConnected ? (
              <div className="issuer-claim-alert" role="status">
                <Wallet size={17} />
                <div>
                  <strong>Connect your approved organization account</strong>
                  <span>Use the wallet control to connect the account approved for your organization, then return here to continue.</span>
                </div>
              </div>
            ) : null}

            {configurationError && !organizationLoading ? (
              <div className="issuer-claim-alert issuer-claim-alert--danger" role="alert">
                <AlertTriangle size={17} />
                <div><strong>Approval is not ready</strong><span>{configurationError}</span></div>
              </div>
            ) : null}

            <div className="issuer-claim-list-section">
              <div className="issuer-claim-list-section__heading">
                <span>Checks to approve ({claims.length})</span>
                <small>Then one registry transaction</small>
              </div>
              <div className="issuer-claim-list">
                {claims.map((claim) => (
                  <div key={`${claim.claimTopic ?? 'invalid'}-${claim.index}`} className="issuer-claim-list__item">
                    <span className="issuer-claim-list__check"><Check size={13} /></span>
                    <div>
                      <strong>{claim.label}</strong>
                      <small>{claim.description}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.SIGNING ? (
          <div className="issuer-claim-signing-state" aria-live="polite">
            <span className="issuer-claim-signing-state__spinner"><LoaderCircle size={30} /></span>
            <strong>Confirm this check in your wallet</strong>
            <p>
              {currentClaim?.label || 'The current check'} is ready to confirm.
              {claims.length > 1 ? ` Check ${activeClaimIndex + 1} of ${claims.length}.` : ''}
            </p>
            <IssuerApprovalProgress
              claims={claims}
              collectedClaims={collectedClaims}
              activeClaimIndex={activeClaimIndex}
              status={status}
              registrationConfirmed={registrationConfirmed}
              registrationPending={registrationPending}
            />
            <span className="issuer-claim-signing-state__note">Keep this window open until all checks are confirmed. No funds are transferred by these confirmations.</span>
          </div>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.VERIFYING ? (
          <div className="issuer-claim-signing-state" aria-live="polite">
            <span className="issuer-claim-signing-state__spinner"><LoaderCircle size={30} /></span>
            <strong>Finishing approval…</strong>
            <p>Your wallet signatures are complete. We are verifying the approvals before registration.</p>
            <IssuerApprovalProgress
              claims={claims}
              collectedClaims={collectedClaims}
              activeClaimIndex={activeClaimIndex}
              status={status}
              registrationConfirmed={registrationConfirmed}
              registrationPending={registrationPending}
            />
            <span className="issuer-claim-signing-state__note">Keep this window open until the request updates.</span>
          </div>
        ) : null}

        {status === ISSUER_CLAIM_SIGNING_STATUS.FAILED ? (
          <div className="issuer-claim-result-state issuer-claim-result-state--failed" role="alert">
            <span className="issuer-claim-result-state__icon"><XCircle size={24} /></span>
            <strong>{errorCopy.title}</strong>
            <p>{errorCopy.description}</p>
            {signingError?.kind === 'wallet-mismatch' ? (
              <div className="issuer-claim-address-comparison">
                <div><span>Approved organization account</span><code>{shortenWalletAddress(signingError.registeredWallet, 10, 8)}</code></div>
                <div><span>Connected account</span><code>{shortenWalletAddress(signingError.connectedWallet, 10, 8)}</code></div>
              </div>
            ) : null}
          </div>
        ) : null}

        {verifiedSignatures ? (
          <div className="issuer-claim-result-state issuer-claim-result-state--success" aria-live="polite">
            <span className="issuer-claim-result-state__icon"><CheckCircle2 size={26} /></span>
            <strong>{registered ? 'Issuer steps complete — awaiting investor claims' : 'Claim signatures verified'}</strong>
            <p>{registered
              ? 'The investor’s profile has been successfully verified.'
              : status === 'REGISTERING' ? 'Opening the issuer-wallet registration transaction. Confirm it in MetaMask and pay the network gas.'
                : status === 'REGISTRY_PENDING' || registrationPending ? 'Registration was submitted and is awaiting blockchain verification. Do not send a duplicate transaction.'
                  : registrationIssue || 'Claim signatures are saved. Complete the one Identity Registry registration transaction to finish your issuer step.'}</p>
            <span className="issuer-claim-status-pill">{registered ? 'Issuer step: Completed' : 'Issuer step: Pending registration'}</span>
            <IssuerApprovalProgress
              claims={claims}
              collectedClaims={collectedClaims}
              activeClaimIndex={activeClaimIndex}
              status={status}
              registrationConfirmed={registrationConfirmed}
              registrationPending={registrationPending}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
