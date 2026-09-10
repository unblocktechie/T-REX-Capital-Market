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
  const applicationStatus = normalize(
    application?.interest?.status
    || application?.status
    || history?.summary?.status
    || history?.status,
  );

  if (['registered', 'readytoinvest', 'verifiedholder'].includes(applicationStatus)) return true;

  return Array.isArray(history?.timeline)
    && history.timeline.some(isRegistryRegistrationConfirmedEvent);
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
