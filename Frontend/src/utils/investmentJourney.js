const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const buildStages = (viewerRole, currentIndex, { terminal = false, attention = false, complete = false } = {}) => {
  const labels = viewerRole === 'issuer'
    ? ['Application', 'Your review', 'Investor checks', 'Final approval', 'Ready to invest']
    : ['Application', 'Issuer review', 'Your checks', 'Final approval', 'Ready to invest'];

  return labels.map((label, index) => {
    let state = 'upcoming';
    let statusLabel = index === currentIndex ? 'Current step' : 'Upcoming';

    if (complete && index <= currentIndex) {
      state = 'complete';
      statusLabel = 'Completed';
    } else if (index < currentIndex) {
      state = 'complete';
      statusLabel = 'Completed';
    } else if (index === currentIndex) {
      state = attention ? 'attention' : 'current';
      statusLabel = attention ? 'Needs attention' : 'Current step';
    } else if (terminal) {
      state = 'blocked';
      statusLabel = 'Not reached';
    }

    return { id: `investment-stage-${index + 1}`, label, state, statusLabel };
  });
};

const result = ({
  viewerRole,
  currentIndex,
  statusLabel,
  tone,
  title,
  message,
  next,
  owner,
  actionKey = '',
  terminal = false,
  attention = false,
  complete = false,
}) => ({
  viewerRole,
  currentIndex,
  statusLabel,
  tone,
  title,
  message,
  next,
  owner,
  actionKey,
  terminal,
  complete,
  progress: complete ? 100 : Math.max(10, Math.round(((currentIndex + 0.35) / 5) * 100)),
  stages: buildStages(viewerRole, currentIndex, { terminal, attention, complete }),
});

export const getInvestmentJourney = ({
  status,
  viewerRole = 'investor',
  purchaseReady = false,
  canResubmit = false,
  rejectReasonType = '',
  registryStatus = '',
  hasRegistryTransaction = false,
  registryNeedsAttention = false,
} = {}) => {
  const role = viewerRole === 'issuer' ? 'issuer' : 'investor';
  const value = normalize(status);
  const registry = String(registryStatus || '').trim().toUpperCase();
  const registryConfirmed = registry === 'CONFIRMED';
  const registryPending = Boolean(hasRegistryTransaction) && !registryConfirmed && !registryNeedsAttention;
  const canFixDocuments = Boolean(canResubmit) && String(rejectReasonType || '').trim().toUpperCase() === 'DOC_REJECTED';

  if (purchaseReady || registryConfirmed || ['registered', 'readytoinvest', 'verifiedholder'].includes(value)) {
    return result({
      viewerRole: role,
      currentIndex: 4,
      statusLabel: role === 'investor' ? 'Ready to invest' : 'Completed',
      tone: 'success',
      title: role === 'investor' ? 'You’re ready to invest' : 'Investor access is enabled',
      message: role === 'investor'
        ? 'All required checks and approvals are complete. You can now invest in this asset.'
        : 'All required checks and approvals are complete. This investor can now invest in this asset.',
      next: role === 'investor'
        ? 'Choose Invest when you’re ready.'
        : 'You can invite the investor to continue with their investment.',
      owner: role === 'investor' ? 'You' : 'No action needed',
      actionKey: role === 'investor' ? 'invest' : 'invite',
      complete: true,
    });
  }

  if (value === 'cancelled') {
    return result({
      viewerRole: role,
      currentIndex: 0,
      statusLabel: 'Cancelled',
      tone: 'neutral',
      title: 'This application is closed',
      message: 'This investment application is no longer active.',
      next: 'No further action will be taken unless a new application is submitted.',
      owner: 'No action needed',
      terminal: true,
    });
  }

  if (value === 'rejected') {
    if (canFixDocuments) {
      return result({
        viewerRole: role,
        currentIndex: 1,
        statusLabel: role === 'investor' ? 'Action needed from you' : 'Waiting for investor',
        tone: 'danger',
        title: role === 'investor' ? 'Update your application' : 'Investor needs to update their application',
        message: role === 'investor'
          ? 'The issuer needs updated information or documents before they can continue reviewing your application.'
          : 'You asked the investor for updated information or documents. Nothing else is needed from you right now.',
        next: role === 'investor'
          ? 'Submit the requested updates. The application will then return to the issuer for review.'
          : 'Once the investor resubmits, the application will return to your review queue.',
        owner: role === 'investor' ? 'You' : 'Investor',
        actionKey: role === 'investor' ? 'reupload' : '',
        attention: role === 'investor',
      });
    }

    return result({
      viewerRole: role,
      currentIndex: 1,
      statusLabel: 'Needs attention',
      tone: 'danger',
      title: role === 'investor' ? 'Application not approved' : 'Request not approved',
      message: role === 'investor'
        ? 'The issuer did not approve this application. Review the reason below for more information.'
        : 'This request was not approved. The decision and reason are recorded below.',
      next: role === 'investor'
        ? 'If you have questions, contact the issuer or support before submitting a new application.'
        : 'No further action is required unless the investor submits a new application.',
      owner: 'No action required',
      terminal: true,
      attention: true,
    });
  }

  if (role === 'issuer') {
    if (['claimsubmitted'].includes(value)) {
      if (registryNeedsAttention) {
        return result({
          viewerRole: role,
          currentIndex: 3,
          statusLabel: 'Needs attention',
          tone: 'danger',
          title: 'Final approval needs attention',
          message: 'The investor finished the required checks, but the final approval could not be completed.',
          next: 'Review the message below and retry or check the existing approval before creating another transaction.',
          owner: 'You',
          actionKey: 'registry',
          attention: true,
        });
      }

      if (registryPending) {
        return result({
          viewerRole: role,
          currentIndex: 3,
          statusLabel: 'In progress',
          tone: 'pending',
          title: 'Final approval is processing',
          message: 'Your approval was submitted successfully. Nothing else is needed from you while it is being confirmed.',
          next: 'Once confirmed, the investor will be ready to invest.',
          owner: 'Platform',
          actionKey: 'registry-status',
        });
      }

      return result({
        viewerRole: role,
        currentIndex: 3,
        statusLabel: 'Action needed from you',
        tone: 'warning',
        title: 'Complete final approval',
        message: 'The investor has completed the required checks. Approve them for this asset to finish the process.',
        next: 'Once approved, the investor will be able to invest.',
        owner: 'You',
        actionKey: 'registry',
      });
    }

    if (['verifiedbyissuer', 'verified'].includes(value)) {
      return result({
        viewerRole: role,
        currentIndex: 2,
        statusLabel: 'Waiting for investor',
        tone: 'pending',
        title: 'Nothing needed from you right now',
        message: 'Your review is complete. The investor now needs to finish the required checks.',
        next: 'When the investor finishes the required checks, this request will return to you for final approval.',
        owner: 'Investor',
      });
    }

    if (['approved'].includes(value)) {
      return result({
        viewerRole: role,
        currentIndex: 3,
        statusLabel: 'In progress',
        tone: 'pending',
        title: 'Investment access is being prepared',
        message: 'The application is approved. The final access step is being completed.',
        next: 'The investor will be ready to invest when final access is confirmed.',
        owner: 'Platform',
      });
    }

    if (['pending'].includes(value)) {
      return result({
        viewerRole: role,
        currentIndex: 0,
        statusLabel: 'Waiting for investor',
        tone: 'pending',
        title: 'Investor is completing the application',
        message: 'The investor still needs to provide required information or documents.',
        next: 'Once submitted, the request will move to your review queue.',
        owner: 'Investor',
      });
    }

    return result({
      viewerRole: role,
      currentIndex: 1,
      statusLabel: 'Action needed from you',
      tone: 'warning',
      title: 'Review this application',
      message: 'Check the investor information and submitted documents, then approve the review or ask for changes.',
      next: 'If you approve it, the investor will complete the required checks.',
      owner: 'You',
      actionKey: 'review',
    });
  }

  if (['claimsubmitted'].includes(value)) {
    return result({
      viewerRole: role,
      currentIndex: 3,
      statusLabel: 'Waiting for issuer',
      tone: 'pending',
      title: 'Nothing needed from you right now',
      message: 'Your required checks have been submitted. The issuer is completing the final approval.',
      next: 'Once final approval is complete, your investment access will be enabled.',
      owner: 'Issuer',
    });
  }

  if (['verifiedbyissuer', 'verified'].includes(value)) {
    return result({
      viewerRole: role,
      currentIndex: 2,
      statusLabel: 'Action needed from you',
      tone: 'warning',
      title: 'Complete your required checks',
      message: 'The issuer approved your application. Complete the required checks to continue.',
      next: 'Once submitted, the issuer will complete the final approval and enable investment access.',
      owner: 'You',
      actionKey: 'verification',
    });
  }

  if (['approved'].includes(value)) {
    return result({
      viewerRole: role,
      currentIndex: 3,
      statusLabel: 'In progress',
      tone: 'pending',
      title: 'Investment access is being prepared',
      message: 'Your application is approved. The final access step is being completed.',
      next: 'You will be able to invest when this step is complete.',
      owner: 'Platform',
    });
  }

  if (['pending'].includes(value)) {
    return result({
      viewerRole: role,
      currentIndex: 0,
      statusLabel: 'Action needed from you',
      tone: 'warning',
      title: 'Finish your application',
      message: 'Some required information or documents still need to be completed.',
      next: 'Once everything is submitted, the issuer will review your application.',
      owner: 'You',
    });
  }

  return result({
    viewerRole: role,
    currentIndex: 1,
    statusLabel: 'Waiting for issuer',
    tone: 'pending',
    title: 'Nothing needed from you right now',
    message: 'Your application has been submitted. The issuer is reviewing your information and documents.',
    next: 'If approved, you will be asked to complete the required checks.',
    owner: 'Issuer',
  });
};

export const investmentJourneyStatusText = (options) => {
  const journey = getInvestmentJourney(options);
  return {
    label: journey.statusLabel,
    tone: journey.tone,
    next: journey.title,
    owner: journey.owner,
  };
};
