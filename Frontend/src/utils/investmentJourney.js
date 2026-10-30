import { isApplicationCompleted, isClaimSubmissionUnlocked } from './applicationProgress';

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
const STEP_COUNT = 4;

const buildStages = (viewerRole, currentIndex, { terminal = false, attention = false, complete = false } = {}) => {
  const labels = viewerRole === 'issuer'
    ? ['Application', 'Your review & registration', 'Investor claims', 'Ready to invest']
    : ['Application', 'Issuer review & registration', 'Submit claims', 'Ready to invest'];
  return labels.map((label, index) => {
    let state = 'upcoming';
    let statusLabel = index === currentIndex ? 'Current step' : 'Upcoming';
    if ((complete && index <= currentIndex) || index < currentIndex) {
      state = 'complete'; statusLabel = 'Completed';
    } else if (index === currentIndex) {
      state = attention ? 'attention' : 'current';
      statusLabel = attention ? 'Needs attention' : 'Current step';
    } else if (terminal) {
      state = 'blocked'; statusLabel = 'Not reached';
    }
    return { id: `investment-stage-${index + 1}`, label, state, statusLabel };
  });
};

const result = ({ viewerRole, currentIndex, statusLabel, tone, title, message, next, owner,
  actionKey = '', terminal = false, attention = false, complete = false }) => ({
  viewerRole, currentIndex, statusLabel, tone, title, message, next, owner, actionKey, terminal, complete,
  progress: complete ? 100 : Math.max(10, Math.round(((currentIndex + 0.35) / STEP_COUNT) * 100)),
  stages: buildStages(viewerRole, currentIndex, { terminal, attention, complete }),
});

export const getInvestmentJourney = ({
  status, viewerRole = 'investor', purchaseReady = false, canResubmit = false,
  rejectReasonType = '', registryStatus = '', hasRegistryTransaction = false,
  registryNeedsAttention = false, progress = null,
} = {}) => {
  const role = viewerRole === 'issuer' ? 'issuer' : 'investor';
  const value = normalize(status);
  const registryConfirmed = progress?.registryRegistrationConfirmed === true
    || (progress?.registryRegistrationConfirmed !== false && String(registryStatus).toUpperCase() === 'CONFIRMED');
  const registryPending = Boolean(hasRegistryTransaction) && !registryConfirmed && !registryNeedsAttention;
  const issuerVerified = progress?.issuerVerificationConfirmed === true
    || ['verifiedbyissuer', 'verified', 'claimsubmitted', 'registered'].includes(value);
  const claimsConfirmed = progress?.claimsConfirmed === true || value === 'claimsubmitted';
  const finished = isApplicationCompleted(progress, value)
    || (progress?.canInvest !== false && purchaseReady && progress?.journeyStage !== 'AWAITING_INVESTOR_CLAIMS');
  const canFixDocuments = Boolean(canResubmit) && String(rejectReasonType).toUpperCase() === 'DOC_REJECTED';

  if (finished) {
    return result({ viewerRole: role, currentIndex: 3, statusLabel: role === 'issuer' ? 'Completed' : 'Ready to invest',
      tone: 'success', title: role === 'issuer' ? 'Application completed' : 'You’re ready to invest',
      message: role === 'issuer' ? 'The investor completed all required claims and has been registered. No further issuer action is needed.' : 'Your application requirements are complete. You can now continue to Invest Now.',
      next: role === 'issuer' ? 'The investor can invest, subject to token eligibility.' : 'Choose Invest Now to continue, subject to contract eligibility.',
      owner: 'No action needed', actionKey: role === 'investor' ? 'invest' : '', complete: true });
  }

  if (value === 'cancelled') return result({ viewerRole: role, currentIndex: 0, statusLabel: 'Cancelled', tone: 'neutral',
    title: 'This application is closed', message: 'This investment application is no longer active.',
    next: 'A new application is required to continue.', owner: 'No action needed', terminal: true });

  if (value === 'rejected') return result({ viewerRole: role, currentIndex: 1, statusLabel: 'Rejected', tone: 'danger',
    title: canFixDocuments ? (role === 'investor' ? 'Update your application' : 'Investor needs to update the application') : 'Application not approved',
    message: canFixDocuments ? 'The issuer requested updated information or documents.' : 'The issuer did not approve this application.',
    next: canFixDocuments ? 'The investor can submit the requested updates for another review.' : 'Review the rejection details for more information.',
    owner: canFixDocuments ? (role === 'investor' ? 'You' : 'Investor') : 'No action required',
    actionKey: canFixDocuments && role === 'investor' ? 'reupload' : '', attention: canFixDocuments && role === 'investor', terminal: !canFixDocuments });

  if (issuerVerified && registryConfirmed && !claimsConfirmed) {
    return result({ viewerRole: role, currentIndex: 2,
      statusLabel: role === 'issuer' ? 'Awaiting investor claims' : 'Submit Claim',
      tone: role === 'issuer' ? 'pending' : 'warning',
      title: role === 'issuer' ? 'Issuer steps complete — awaiting investor claims' : 'Submit your required claims',
      message: role === 'issuer' ? 'Your claim verification and registry transaction are confirmed. The investor can now submit the required claims without another issuer approval.' : 'The issuer has verified your application and registered your identity. Complete the required claim transactions using your wallet.',
      next: role === 'issuer' ? 'Once all investor claims are confirmed, this application completes automatically.' : 'After the final claim is confirmed, Invest Now becomes available.',
      owner: role === 'issuer' ? 'Investor' : 'You',
      actionKey: role === 'investor' && isClaimSubmissionUnlocked(progress) ? 'verification' : '' });
  }

  if (issuerVerified && registryConfirmed && claimsConfirmed) {
    return result({ viewerRole: role, currentIndex: 2, statusLabel: 'Finalizing', tone: 'pending',
      title: 'Application finalizing automatically',
      message: 'Registry registration and investor claims are confirmed. The application is being updated automatically.',
      next: 'The application becomes Completed without additional issuer approval.', owner: 'Platform' });
  }

  if (value === 'claimsubmitted' && !registryConfirmed) {
    // Historical claims-first applications are allowed to finish their old registry step.
    return result({ viewerRole: role, currentIndex: 1,
      statusLabel: role === 'issuer' ? (registryPending ? 'Registration pending' : 'Registration required') : 'Pending issuer registration',
      tone: 'pending', title: registryNeedsAttention ? 'Registry transaction needs attention' : 'Waiting for issuer registration',
      message: 'The investor already submitted claims under the previous journey. The issuer must finish the existing registry registration.',
      next: 'After confirmed registration the application will be reconciled automatically.',
      owner: role === 'issuer' && !registryPending ? 'You' : 'Issuer',
      actionKey: role === 'issuer' && !registryPending ? 'registry' : '' });
  }

  if (issuerVerified && !registryConfirmed) {
    return result({ viewerRole: role, currentIndex: 1, statusLabel: role === 'issuer' ? 'Registration Pending' : 'Pending',
      tone: registryNeedsAttention ? 'warning' : 'pending',
      title: role === 'issuer' ? 'Complete investor registration' : 'Pending issuer verification',
      message: role === 'issuer'
        ? (registryPending ? 'Your registration transaction is being verified. Do not send another transaction.' : 'The required claims are signed. Finish registration in the Identity Registry as part of your review.')
        : 'The issuer is finishing your verification step. You can submit your claim once this step is fully confirmed.',
      next: registryPending
        ? (role === 'issuer' ? 'Wait for confirmed blockchain evidence.' : 'Once the issuer completes the verification, you need to submit your claim.')
        : (role === 'issuer' ? 'The issuer completes registration; then the investor can submit claims.' : 'Once the issuer completes the verification, you need to submit your claim.'),
      owner: role === 'issuer' && !registryPending ? 'You' : 'Issuer',
      actionKey: role === 'issuer' && !registryPending ? 'registry' : '', attention: role === 'issuer' && registryNeedsAttention });
  }

  if (value === 'pending') return result({ viewerRole: role, currentIndex: 0,
    statusLabel: 'Pending', tone: 'pending', title: role === 'issuer' ? 'Investor is completing the application' : 'Finish your application',
    message: 'The investor must provide all required information and documents.',
    next: 'After submission, the issuer reviews and registers the investor.', owner: 'Investor' });

  return result({ viewerRole: role, currentIndex: 1, statusLabel: 'Pending', tone: role === 'issuer' ? 'warning' : 'pending',
    title: role === 'issuer' ? 'Review, verify and register this investor' : 'Pending issuer verification',
    message: role === 'issuer' ? 'Review the documents, sign all required claims, and register the investor on-chain in this step.' : 'Your application is with the issuer for review. Once the issuer completes the verification step, you can move to claim submission.',
    next: role === 'issuer' ? 'After the registry confirms, the investor can submit claims independently.' : 'Once the issuer completes the verification, you need to submit your claim.',
    owner: 'Issuer', actionKey: role === 'issuer' ? 'review' : '' });
};

export const investmentJourneyStatusText = (options) => {
  const journey = getInvestmentJourney(options);
  return { label: journey.statusLabel, tone: journey.tone, next: journey.title, owner: journey.owner };
};
