/**
 * Presentation-only progress for the existing issuer signatures -> registration
 * workflow. Do not infer on-chain confirmation from a submitted transaction hash.
 */
const VERIFIED_SIGNATURE_STATES = new Set([
  'SIGNED', 'REGISTERING', 'REGISTRY_PENDING', 'REGISTRY_FAILED', 'REGISTERED',
]);

export const getIssuerApprovalProgress = ({
  claimCount = 0,
  collectedCount = 0,
  activeClaimIndex = -1,
  status = '',
  registrationConfirmed = false,
  registrationPending = false,
} = {}) => {
  const count = Math.max(0, Math.trunc(Number(claimCount) || 0));
  const signedCount = Math.min(count, Math.max(0, Math.trunc(Number(collectedCount) || 0)));
  const signaturesComplete = VERIFIED_SIGNATURE_STATES.has(status) || registrationConfirmed;
  const completeSignatures = signaturesComplete ? count : signedCount;
  const registrationComplete = status === 'REGISTERED' || registrationConfirmed;
  const registrationVerifying = !registrationComplete && (status === 'REGISTRY_PENDING' || registrationPending);
  const registrationActive = !registrationComplete && status === 'REGISTERING';
  const registrationFailed = !registrationComplete && status === 'REGISTRY_FAILED';

  let registrationState = 'upcoming';
  let registrationLabel = 'Next';
  if (registrationComplete) {
    registrationState = 'complete';
    registrationLabel = 'Completed';
  } else if (registrationVerifying) {
    registrationState = 'pending';
    registrationLabel = 'Confirming';
  } else if (registrationActive) {
    registrationState = 'active';
    registrationLabel = 'Confirm now';
  } else if (registrationFailed) {
    registrationState = 'failed';
    registrationLabel = 'Retry';
  } else if (signaturesComplete) {
    registrationLabel = 'Ready';
  }

  return {
    completedCount: completeSignatures + Number(registrationComplete),
    totalCount: count + 1,
    percentage: Math.round(((completeSignatures + Number(registrationComplete)) / (count + 1)) * 100),
    signatures: Array.from({ length: count }, (_, index) => ({
      complete: index < completeSignatures,
      active: status === 'SIGNING' && index === activeClaimIndex,
    })),
    registration: {
      state: registrationState,
      label: registrationLabel,
    },
  };
};
