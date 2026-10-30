import { isApplicationCompleted, readApplicationProgress } from './applicationProgress.js';
const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

export const isRegistryRegistrationConfirmedEvent = (event) => {
  const eventType = normalize(event?.eventType);
  const note = String(event?.note || '').trim().toLowerCase();

  return (
    (eventType.includes('registry') && eventType.includes('confirm'))
    || note.includes('identity registry registration confirmed')
    || note.includes('added to registry')
  );
};

export const isApplicationPurchaseReady = (history, application) => {
  const interest = application?.interest || {};
  const progress = readApplicationProgress(interest, application, history?.summary);
  const applicationStatus = normalize(interest.status || application?.status || history?.summary?.status || history?.status);
  if (isApplicationCompleted(progress, applicationStatus)) return true;
  if (progress.canInvest === false || progress.claimsConfirmed === false || progress.registryRegistrationConfirmed === false
    || progress.journeyStage === 'AWAITING_INVESTOR_CLAIMS') return false;
  // Older claims-first applications have both events even if the stored status
  // has not been refreshed. Registry membership ALONE must never enable investing.
  const events = history?.timeline || [];
  return progress.canInvest === null && events.some(isRegistryRegistrationConfirmedEvent)
    && events.some((event) => normalize(event?.eventType) === 'claimsubmitted');
};

export const getInvestmentActionContext = (application = {}) => {
  const interest = application?.interest || {};
  const raw = interest?.raw || {};
  const investor = raw?.investor || raw?.investorSummary || raw?.identity || {};
  const token = raw?.token || raw?.tokenSummary || raw?.tokenInvestment || application?.raw || {};
  const identity = investor?.identity || {};

  return {
    investorWalletAddress: firstValue(
      interest?.walletAddress,
      raw?.walletAddress,
      investor?.walletAddress,
    ) || '',
    onchainIdentityAddress: firstValue(
      raw?.investorIdentityAddress,
      raw?.onchainIdentityAddress,
      raw?.identityAddress,
      investor?.onchainIdentityAddress,
      investor?.identityAddress,
      identity?.address,
      identity?.identityAddress,
    ) || '',
    issuerTreasuryAddress: firstValue(
      application?.treasuryWalletAddress,
      application?.treasuryAddress,
      application?.issuerTreasuryAddress,
      token?.treasuryWalletAddress,
      token?.treasuryAddress,
      token?.issuerTreasuryAddress,
      raw?.treasuryWalletAddress,
      raw?.treasuryAddress,
      raw?.issuerTreasuryAddress,
    ) || '',
    tokenAddress: firstValue(
      application?.tokenAddress,
      application?.contractAddress,
      token?.tokenAddress,
      token?.contractAddress,
      token?.address,
    ) || '',
    chainId: firstValue(application?.chainId, token?.chainId, raw?.chainId) || '',
  };
};
