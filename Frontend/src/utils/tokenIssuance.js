import { isAddress } from 'viem';
import { TOKEN_CREATION_AGENT_ROLES } from '@/config/tokenIssuance';
import { getTokenLogoValidationError } from '@/utils/tokenLogo';

const positiveNumber = (value) => Number(value) > 0;
const optionalPositiveNumber = (value) => value === '' || Number(value) >= 0;

export const formatNumber = (value, options = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toLocaleString('en-US', {
    maximumFractionDigits: 8,
    ...options,
  });
};

export const formatMoney = (value, currency = 'USD') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${formatNumber(numeric)} ${currency}`;
  }
};

export const getImpliedValuation = (supply, price) => {
  const totalSupply = Number(supply);
  const initialPrice = Number(price);
  if (!Number.isFinite(totalSupply) || !Number.isFinite(initialPrice)) return null;
  return totalSupply * initialPrice;
};

export const validateTokenInformation = (data, supplyPricing = {}, options = {}) => {
  const errors = {};
  const tokenName = String(data.name || '').trim();
  const logoError = getTokenLogoValidationError(data.logo);

  if (logoError) errors.logo = logoError;

  if (!tokenName) {
    errors.name = 'Enter an asset name.';
  } else if (tokenName.length < 3 || tokenName.length > 50) {
    errors.name = 'Use 3–50 characters for the asset name.';
  } else if (/\s{2,}/.test(tokenName)) {
    errors.name = 'Token name cannot contain consecutive spaces.';
  } else if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]{1,48}[A-Za-z0-9]$/.test(tokenName)) {
    errors.name = "Use letters, numbers, spaces, hyphens, periods, or apostrophes, and begin and end with a letter or number.";
  }

  if (!data.symbol.trim()) errors.symbol = 'Enter a short symbol for the asset.';
  else if (!/^[A-Z0-9]{2,10}$/.test(data.symbol)) {
    errors.symbol = 'Use 2–10 uppercase letters or numbers.';
  }

  if (!['2', '6', '8', '18'].includes(String(data.decimals))) {
    errors.decimals = 'Select one of the supported decimal values: 2, 6, 8, or 18.';
  }

  if (!positiveNumber(supplyPricing.initialPrice)) {
    errors.initialPrice = 'Enter a starting price greater than zero.';
  }
  if (!data.treasuryWallet.trim()) errors.treasuryWallet = 'An approved organization account is required.';
  else if (!isAddress(data.treasuryWallet.trim())) {
    errors.treasuryWallet = 'The approved organization account address is not valid.';
  } else if (
    options.requiredTreasuryWallet &&
    data.treasuryWallet.trim().toLowerCase() !== options.requiredTreasuryWallet.trim().toLowerCase()
  ) {
    errors.treasuryWallet = 'Use the approved organization account registered during onboarding.';
  }
  if (!data.description.trim()) errors.description = 'Add a short investor-facing description.';
  return errors;
};

// Retained for compatibility with the previously separated Supply & Pricing page. The active
// simplified wizard validates only the initial price exposed on Token Information.
export const validateSupplyPricing = (data) => {
  const errors = {};
  if (!positiveNumber(data.totalSupply)) {
    errors.totalSupply = 'Total supply must be greater than zero.';
  }
  if (!positiveNumber(data.initialPrice)) {
    errors.initialPrice = 'Initial price must be greater than zero.';
  }
  if (!data.currency) errors.currency = 'Select a price currency.';
  if (!positiveNumber(data.minimumInvestment)) {
    errors.minimumInvestment = 'Minimum investment must be greater than zero.';
  }
  if (!positiveNumber(data.maximumInvestment)) {
    errors.maximumInvestment = 'Maximum investment must be greater than zero.';
  } else if (Number(data.maximumInvestment) < Number(data.minimumInvestment || 0)) {
    errors.maximumInvestment = 'Maximum investment must be at least the minimum investment.';
  }
  if (!positiveNumber(data.minimumTokenPurchase)) {
    errors.minimumTokenPurchase = 'Minimum token purchase must be greater than zero.';
  }
  if (!positiveNumber(data.maximumTokenPurchase)) {
    errors.maximumTokenPurchase = 'Maximum token purchase must be greater than zero.';
  } else if (Number(data.maximumTokenPurchase) < Number(data.minimumTokenPurchase || 0)) {
    errors.maximumTokenPurchase = 'Maximum token purchase must be at least the minimum purchase.';
  }
  if (!data.treasuryWallet.trim() || !isAddress(data.treasuryWallet.trim())) {
    errors.treasuryWallet = 'Enter a valid treasury wallet address.';
  }
  if (!data.allocation.trim()) {
    errors.allocation = 'Add a short distribution or allocation description.';
  }
  if (!optionalPositiveNumber(data.lockupDays)) {
    errors.lockupDays = 'Lock-up days cannot be negative.';
  }
  return errors;
};

export const validateIdentityClaims = (data) => {
  const errors = {};
  const enabledClaims = (data.claimTopics || []).filter((topic) => topic.enabled);
  const hasEnabledClaim = enabledClaims.length > 0;
  if (!hasEnabledClaim) {
    errors.claimTopics = 'Select at least one verification requirement before continuing.';
  } else if (enabledClaims.some((topic) => !topic.claimTopicUid)) {
    errors.claimTopics = 'The selected claim is not available for this token.';
  }
  if (data.trustedIssuer.mode !== 'organization') {
    errors.trustedIssuer = 'Confirm that your organization will review and approve investors.';
  } else if (!data.trustedIssuer.address.trim()) {
    errors.trustedIssuer = 'Connect or verify the approved organization account before continuing.';
  } else if (!isAddress(data.trustedIssuer.address.trim())) {
    errors.trustedIssuer = 'The approved organization account address is not valid.';
  }
  return errors;
};

export const validateCompliance = (data) => {
  const errors = {};
  const maximumInvestors = Number(data.maximumInvestors);
  if (!data.maximumInvestors) {
    errors.maximumInvestors = 'Enter the maximum number of investors.';
  } else if (!Number.isInteger(maximumInvestors) || maximumInvestors < 1) {
    errors.maximumInvestors = 'Use a whole number greater than zero, such as 500 or 2,000.';
  }

  const maximumBalance = Number(data.maximumBalance);
  if (!data.maximumBalance) {
    errors.maximumBalance = 'Enter the maximum amount one investor can hold.';
  } else if (!Number.isInteger(maximumBalance) || maximumBalance < 1) {
    errors.maximumBalance = 'Use a whole number greater than zero, such as 100 or 500.';
  }

  const invalidCountry = (data.countries || []).find(
    (country) => typeof country === 'string' || !country?.countryUid,
  );
  if (invalidCountry) {
    errors.countries = 'Reload the country list and select the blocked countries again.';
  }
  return errors;
};

export const validateAgents = (agents, expectedWallet = '') => {
  const errors = {};
  TOKEN_CREATION_AGENT_ROLES.forEach((role) => {
    const agent = agents[role.key];
    if (!agent?.address?.trim()) {
      errors[role.key] = `${role.name} wallet is required.`;
    } else if (!isAddress(agent.address.trim())) {
      errors[role.key] = 'Enter a valid wallet address.';
    } else if (
      expectedWallet &&
      agent.address.trim().toLowerCase() !== expectedWallet.trim().toLowerCase()
    ) {
      errors[role.key] = 'This role must use the approved organization wallet.';
    }
  });
  return errors;
};

export const validateStep = (stepKey, state) => {
  switch (stepKey) {
    case 'token-information':
      return validateTokenInformation(state.tokenInformation, state.supplyPricing);
    case 'supply-pricing':
      return validateSupplyPricing(state.supplyPricing);
    case 'identity-claims':
      return validateIdentityClaims(state.identityClaims);
    case 'compliance':
      return validateCompliance(state.compliance);
    case 'agents':
      return validateAgents(state.agents);
    default:
      return {};
  }
};

export const buildReviewChecklist = (state, wallet, expectedWallet = '') => {
  const tokenValid =
    Object.keys(
      validateTokenInformation(state.tokenInformation, state.supplyPricing, {
        requiredTreasuryWallet: expectedWallet,
      }),
    ).length === 0;
  const claimsValid = Object.keys(validateIdentityClaims(state.identityClaims)).length === 0;
  const complianceValid = Object.keys(validateCompliance(state.compliance)).length === 0;
  const agentsValid = Object.keys(validateAgents(state.agents, expectedWallet)).length === 0;
  const walletAuthorized = Boolean(
    wallet.isConnected &&
      expectedWallet &&
      wallet.address?.toLowerCase() === expectedWallet.toLowerCase(),
  );

  return [
    {
      id: 'token-metadata',
      label: 'Asset details complete',
      status: tokenValid ? 'valid' : 'error',
    },
    {
      id: 'identity-claims',
      label: 'Investor checks complete',
      status: claimsValid ? 'valid' : 'error',
    },
    {
      id: 'compliance-parameters',
      label: 'Investment rules complete',
      status: complianceValid ? 'valid' : 'error',
    },
    {
      id: 'agent-wallets',
      label: 'Management roles assigned',
      status: agentsValid ? 'valid' : 'error',
    },
    {
      id: 'wallet',
      label: 'Organization account connected',
      status: wallet.isConnected ? 'valid' : 'error',
    },
    {
      id: 'authorized-wallet',
      label: 'Correct organization account connected',
      status: !wallet.isConnected ? 'pending' : walletAuthorized ? 'valid' : 'error',
    },
    {
      id: 'network',
      label: 'Required network connected',
      status: !wallet.isConnected ? 'pending' : wallet.isCorrectNetwork ? 'valid' : 'error',
    },
    {
      id: 'contract-configuration',
      label: 'Technical setup ready',
      status:
        tokenValid && claimsValid && complianceValid && agentsValid && walletAuthorized
          ? 'valid'
          : 'pending',
    },
  ];
};

export const hasBlockingReviewErrors = (checks) =>
  checks.some((check) => check.status === 'error' || check.status === 'pending');

export const getTokenDeploymentPayload = (state, connectedWallet) => {
  // Keep the existing JSON deployment contract unchanged. The logo remains in the saved wizard
  // draft and review UI until the backend exposes a dedicated image or multipart upload field.
  const { logo: _logo, ...tokenInformation } = state.tokenInformation;

  return {
    tokenInformation,
    supplyPricing: state.supplyPricing,
    identityClaims: state.identityClaims,
    compliance: state.compliance,
    agents: Object.entries(state.agents).reduce((result, [key, agent]) => {
      result[key] = {
        ...agent,
        address: agent.address || (agent.autoAssigned ? connectedWallet : ''),
      };
      return result;
    }, {}),
    connectedWallet,
  };
};
