// Preserve the difference between an absent legacy field and an explicit false.
// The backend is the authority for permission to submit claims or invest.
const booleanField = (source, key) => typeof source?.[key] === 'boolean' ? source[key] : null;

export const readApplicationProgress = (...sources) => {
  const progress = {};
  for (const key of [
    'issuerVerificationConfirmed',
    'registryRegistrationConfirmed',
    'claimsConfirmed',
    'canSubmitClaims',
    'canInvest',
  ]) {
    progress[key] = null;
    for (const source of sources) {
      const candidate = booleanField(source, key);
      if (candidate !== null) {
        progress[key] = candidate;
        break;
      }
    }
  }
  progress.journeyStage = sources.map((source) => String(source?.journeyStage || '').trim().toUpperCase())
    .find(Boolean) || '';
  return progress;
};

export const isClaimSubmissionUnlocked = (progress) =>
  progress?.canSubmitClaims === true
  && progress?.issuerVerificationConfirmed === true
  && progress?.registryRegistrationConfirmed === true
  && progress?.claimsConfirmed !== true;

export const isApplicationCompleted = (progress, status = '') => {
  if (progress?.canInvest === false || (progress?.journeyStage && progress.journeyStage !== 'COMPLETED')) return false;
  if (progress?.canInvest === true && progress?.journeyStage === 'COMPLETED') return true;
  // Compatibility with old records that already reached the registered status.
  return ['registered', 'readytoinvest', 'verifiedholder'].includes(String(status || '').toLowerCase());
};
