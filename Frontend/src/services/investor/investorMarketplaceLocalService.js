const STORAGE_KEY = 'trex_investor_marketplace_state_v1';
const VERIFICATION_KEY = 'trex_investor_marketplace_verification_v1';

export const MARKETPLACE_STATUS = Object.freeze({
  NOT_APPLIED: 'not_applied',
  ACTION_REQUIRED: 'action_required',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  VERIFIED_HOLDER: 'verified_holder',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const MARKETPLACE_STATUS_META = Object.freeze({
  [MARKETPLACE_STATUS.NOT_APPLIED]: {
    label: 'Not Applied',
    shortLabel: 'Not Applied',
    tone: 'neutral',
    description: 'You have not applied for this offering yet.',
  },
  [MARKETPLACE_STATUS.ACTION_REQUIRED]: {
    label: 'Action Required',
    shortLabel: 'Action Required',
    tone: 'warning',
    description: 'Additional compliance claims are required before issuer review.',
  },
  [MARKETPLACE_STATUS.PENDING_REVIEW]: {
    label: 'Pending Review',
    shortLabel: 'Pending Review',
    tone: 'pending',
    description: 'Your documents are being reviewed by the issuer.',
  },
  [MARKETPLACE_STATUS.APPROVED]: {
    label: 'Approved',
    shortLabel: 'Approved',
    tone: 'success',
    description: 'You are eligible to invest in this offering.',
  },
  [MARKETPLACE_STATUS.VERIFIED_HOLDER]: {
    label: 'Verified Holder',
    shortLabel: 'Verified Holder',
    tone: 'success',
    description: 'Your identity is whitelisted for this asset.',
  },
  [MARKETPLACE_STATUS.REJECTED]: {
    label: 'Rejected',
    shortLabel: 'Rejected',
    tone: 'danger',
    description: 'The issuer rejected this investment interest.',
  },
  [MARKETPLACE_STATUS.CANCELLED]: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    tone: 'neutral',
    description: 'This investment interest is no longer active.',
  },
});

const seedTokens = [
  {
    id: 'luxembourg-office-fund-i',
    name: 'Luxembourg Office Fund I',
    symbol: 'LOFI',
    standard: 'ERC-3643',
    assetClass: 'Real Estate',
    country: 'Luxembourg',
    region: 'Europe',
    nav: 1.12,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 2000,
    currentInvestors: 142,
    maxBalance: 50000,
    expectedApy: '7.2% – 8.5%',
    liquidity: 'Secondary Marketplace',
    issuer: 'Lux Prime Assets S.A.',
    registryAddress: '0x3a2F...f89e',
    onchainId: 'did:ethr:0x71C...4e21',
    registryUrl: '#',
    shortDescription: 'Fractionalized prime office exposure across established Luxembourg commercial districts.',
    description: [
      'Luxembourg Office Fund I provides fractionalized exposure to a diversified portfolio of institutional-grade commercial property. The token is issued under the ERC-3643 standard so transfer eligibility, identity claims, and investor limits can be enforced directly through the permissioned token infrastructure.',
      'The strategy focuses on Class-A office assets in established Luxembourg business districts and targets stable income with institutional-grade reporting and controlled secondary transferability.',
    ],
    permittedCountries: ['France', 'Germany', 'United Kingdom', 'Switzerland', 'Luxembourg'],
    restrictedCountries: ['Sanctioned and issuer-restricted jurisdictions'],
    transferRestriction: 'Secondary transfers are restricted to whitelisted participants within the same identity ecosystem.',
    documents: [
      { id: 'lofi-offering', name: 'Offering Memo', type: 'PDF', size: '2.4 MB', category: 'offering' },
      { id: 'lofi-audit', name: 'Smart Contract Audit', type: 'PDF', size: '1.1 MB', category: 'audit' },
      { id: 'lofi-performance', name: 'Q3 Performance', type: 'PDF', size: '4.4 MB', category: 'performance' },
      { id: 'lofi-tax', name: 'Tax Information', type: 'PDF', size: '0.8 MB', category: 'tax' },
    ],
    seedStatus: MARKETPLACE_STATUS.PENDING_REVIEW,
    reviewEstimate: 'Estimated review: 2–6 business days',
  },
  {
    id: 'solar-grid-series-a',
    name: 'Solar Grid Series A',
    symbol: 'SOLA',
    standard: 'ERC-3643',
    assetClass: 'Infrastructure',
    country: 'Spain',
    region: 'Europe',
    nav: 1.12,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 2000,
    currentInvestors: 318,
    maxBalance: 50000,
    expectedApy: '6.8% – 8.1%',
    liquidity: 'Quarterly Window',
    issuer: 'Iberia Renewable Assets S.L.',
    registryAddress: '0x91D4...7b20',
    onchainId: 'did:ethr:0xA81...c503',
    registryUrl: '#',
    shortDescription: 'Tokenized participation in a diversified utility-scale solar generation portfolio in Spain.',
    description: [
      'Solar Grid Series A represents a regulated participation interest in operating solar infrastructure with contracted energy offtake. ERC-3643 identity and transfer rules restrict ownership to eligible investors.',
      'The portfolio is designed for investors seeking infrastructure-linked income with transparent asset reporting and controlled transferability.',
    ],
    permittedCountries: ['Spain', 'France', 'Germany', 'Netherlands', 'Luxembourg'],
    restrictedCountries: ['Sanctioned and issuer-restricted jurisdictions'],
    transferRestriction: 'Transfers require active KYC and accredited-investor claims at the time of settlement.',
    documents: [
      { id: 'sola-offering', name: 'Offering Memorandum', type: 'PDF', size: '3.1 MB', category: 'offering' },
      { id: 'sola-audit', name: 'Security Audit', type: 'PDF', size: '1.5 MB', category: 'audit' },
      { id: 'sola-report', name: 'Asset Report', type: 'PDF', size: '2.8 MB', category: 'performance' },
    ],
    seedStatus: MARKETPLACE_STATUS.ACTION_REQUIRED,
  },
  {
    id: 'global-equities-pe-ii',
    name: 'Global Equities PE II',
    symbol: 'GEPE',
    standard: 'ERC-3643',
    assetClass: 'Private Equity',
    country: 'Global',
    region: 'Global',
    nav: 1.12,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 2000,
    currentInvestors: 684,
    maxBalance: 75000,
    expectedApy: '9.0% – 12.0%',
    liquidity: 'Semi-Annual Window',
    issuer: 'Global Alternative Partners II',
    registryAddress: '0x7B42...d112',
    onchainId: 'did:ethr:0x12E...cb84',
    registryUrl: '#',
    shortDescription: 'Diversified private equity access through a compliant security token structure.',
    description: [
      'Global Equities PE II provides eligible investors with tokenized exposure to a diversified private-equity allocation. Identity eligibility and transfer constraints are enforced through the ERC-3643 compliance stack.',
      'The fund combines growth and buyout strategies with periodic investor reporting and controlled liquidity windows.',
    ],
    permittedCountries: ['France', 'Germany', 'United Kingdom', 'Switzerland', 'Singapore'],
    restrictedCountries: ['United States unless separately qualified', 'Sanctioned jurisdictions'],
    transferRestriction: 'Only wallets carrying the required active identity claims may receive the token.',
    documents: [
      { id: 'gepe-offering', name: 'Private Placement Memo', type: 'PDF', size: '4.2 MB', category: 'offering' },
      { id: 'gepe-audit', name: 'Smart Contract Audit', type: 'PDF', size: '1.0 MB', category: 'audit' },
      { id: 'gepe-factsheet', name: 'Fund Factsheet', type: 'PDF', size: '1.7 MB', category: 'performance' },
    ],
    seedStatus: MARKETPLACE_STATUS.APPROVED,
    availableAmount: 2400,
  },
  {
    id: 'nordic-wind-farm',
    name: 'Nordic Wind Farm',
    symbol: 'NWND',
    standard: 'ERC-3643',
    assetClass: 'Infrastructure',
    country: 'Norway',
    region: 'Europe',
    nav: 1.05,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 1750,
    currentInvestors: 208,
    maxBalance: 100000,
    expectedApy: '6.4% – 7.8%',
    liquidity: 'Secondary Marketplace',
    issuer: 'Nordic Renewables ASA',
    registryAddress: '0xD491...2f78',
    onchainId: 'did:ethr:0x9A0...315e',
    registryUrl: '#',
    shortDescription: 'Renewable infrastructure exposure backed by operating Nordic wind generation assets.',
    description: [
      'Nordic Wind Farm offers eligible investors fractional exposure to operating wind generation assets in Norway. Compliance controls are encoded through the ERC-3643 identity and transfer framework.',
      'The offering targets long-duration renewable infrastructure income while retaining permissioned secondary-market transfer controls.',
    ],
    permittedCountries: ['Norway', 'Sweden', 'Denmark', 'Finland', 'Germany', 'France'],
    restrictedCountries: ['Sanctioned and issuer-restricted jurisdictions'],
    transferRestriction: 'Secondary transfers require an eligible identity record and issuer-approved claims.',
    documents: [
      { id: 'nwnd-offering', name: 'Offering Memo', type: 'PDF', size: '2.9 MB', category: 'offering' },
      { id: 'nwnd-report', name: 'Production Report', type: 'PDF', size: '3.8 MB', category: 'performance' },
      { id: 'nwnd-tax', name: 'Tax Overview', type: 'PDF', size: '0.7 MB', category: 'tax' },
    ],
    seedStatus: MARKETPLACE_STATUS.NOT_APPLIED,
    requiresAccreditation: true,
  },
  {
    id: 'prime-manhattan-commercial',
    name: 'Prime Manhattan Commercial',
    symbol: 'PMCT',
    standard: 'ERC-3643',
    assetClass: 'Real Estate',
    country: 'United States',
    region: 'North America',
    nav: 1.18,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 2500,
    currentInvestors: 521,
    maxBalance: 75000,
    expectedApy: '7.8% – 9.1%',
    liquidity: 'Secondary Marketplace',
    issuer: 'Manhattan Core Property LP',
    registryAddress: '0x54A1...Ef22',
    onchainId: 'did:ethr:0x52A...761f',
    registryUrl: '#',
    shortDescription: 'Institutional Manhattan commercial real estate represented through a permissioned security token.',
    description: [
      'Prime Manhattan Commercial represents a fractionalized interest in an institutional commercial real-estate vehicle. The token uses ERC-3643 so eligible-holder checks are performed before permissioned transfers.',
      'The asset strategy emphasizes stabilized commercial locations, income durability and transparent investor reporting.',
    ],
    permittedCountries: ['United States', 'United Kingdom', 'Switzerland', 'Singapore'],
    restrictedCountries: ['Investors must satisfy the issuer-specific private placement rules'],
    transferRestriction: 'Tokens may only move between wallets verified for this offering and jurisdiction.',
    documents: [
      { id: 'pmct-offering', name: 'Offering Memo', type: 'PDF', size: '3.7 MB', category: 'offering' },
      { id: 'pmct-audit', name: 'Smart Contract Audit', type: 'PDF', size: '1.2 MB', category: 'audit' },
      { id: 'pmct-q3', name: 'Q3 Performance', type: 'PDF', size: '3.5 MB', category: 'performance' },
      { id: 'pmct-tax', name: 'Tax Information', type: 'PDF', size: '0.9 MB', category: 'tax' },
    ],
    seedStatus: MARKETPLACE_STATUS.VERIFIED_HOLDER,
    holdingBalance: 4000,
    holdingValue: 4000,
  },
  {
    id: 'asia-logistics-credit',
    name: 'Asia Logistics Credit',
    symbol: 'ALCR',
    standard: 'ERC-3643',
    assetClass: 'Private Credit',
    country: 'Singapore',
    region: 'Asia Pacific',
    nav: 1.08,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 1200,
    currentInvestors: 226,
    maxBalance: 60000,
    expectedApy: '8.1% – 9.4%',
    liquidity: 'Quarterly Window',
    issuer: 'Asia Structured Credit Pte. Ltd.',
    registryAddress: '0x4AA8...021B',
    onchainId: 'did:ethr:0x08F...782d',
    registryUrl: '#',
    shortDescription: 'Asset-backed private credit focused on regional logistics and warehousing operators.',
    description: [
      'Asia Logistics Credit provides permissioned tokenized exposure to an asset-backed private-credit portfolio. Investor eligibility is controlled through ERC-3643 identity claims.',
      'The portfolio focuses on logistics operators with contracted cash flows and structured collateral packages.',
    ],
    permittedCountries: ['Singapore', 'Japan', 'Hong Kong', 'Switzerland', 'United Kingdom'],
    restrictedCountries: ['Sanctioned and issuer-restricted jurisdictions'],
    transferRestriction: 'Receiver wallets must hold all current compliance claims before transfer execution.',
    documents: [
      { id: 'alcr-offering', name: 'Offering Circular', type: 'PDF', size: '2.6 MB', category: 'offering' },
      { id: 'alcr-credit', name: 'Credit Report', type: 'PDF', size: '2.1 MB', category: 'performance' },
    ],
    seedStatus: MARKETPLACE_STATUS.NOT_APPLIED,
  },
  {
    id: 'alpine-hospitality-income',
    name: 'Alpine Hospitality Income',
    symbol: 'AHIN',
    standard: 'ERC-3643',
    assetClass: 'Real Estate',
    country: 'Switzerland',
    region: 'Europe',
    nav: 1.09,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 1600,
    currentInvestors: 411,
    maxBalance: 65000,
    expectedApy: '7.0% – 8.4%',
    liquidity: 'Secondary Marketplace',
    issuer: 'Alpine Hospitality Partners AG',
    registryAddress: '0x0FC2...99D1',
    onchainId: 'did:ethr:0x61C...401a',
    registryUrl: '#',
    shortDescription: 'Income-oriented hospitality assets located across established Alpine destinations.',
    description: [
      'Alpine Hospitality Income gives eligible investors fractional access to an income-producing hospitality portfolio through an ERC-3643 compliant token.',
      'The structure combines property-level reporting with controlled investor eligibility and transfer restrictions.',
    ],
    permittedCountries: ['Switzerland', 'France', 'Germany', 'Austria', 'United Kingdom'],
    restrictedCountries: ['Sanctioned and issuer-restricted jurisdictions'],
    transferRestriction: 'Only verified wallets within approved jurisdictions can participate in secondary transfers.',
    documents: [
      { id: 'ahin-offering', name: 'Offering Memo', type: 'PDF', size: '3.0 MB', category: 'offering' },
      { id: 'ahin-report', name: 'Portfolio Report', type: 'PDF', size: '2.6 MB', category: 'performance' },
    ],
    seedStatus: MARKETPLACE_STATUS.APPROVED,
    availableAmount: 1800,
  },
  {
    id: 'digital-infrastructure-note',
    name: 'Digital Infrastructure Note',
    symbol: 'DINF',
    standard: 'ERC-3643',
    assetClass: 'Infrastructure',
    country: 'Germany',
    region: 'Europe',
    nav: 1.03,
    initialPrice: 1,
    currency: 'USDT',
    maxInvestors: 2200,
    currentInvestors: 137,
    maxBalance: 40000,
    expectedApy: '6.2% – 7.1%',
    liquidity: 'Semi-Annual Window',
    issuer: 'European Digital Infrastructure GmbH',
    registryAddress: '0xBB72...c81A',
    onchainId: 'did:ethr:0x76D...0f19',
    registryUrl: '#',
    shortDescription: 'Tokenized access to operating edge-compute and data infrastructure assets.',
    description: [
      'Digital Infrastructure Note represents a permissioned interest in operating European edge and data infrastructure. ERC-3643 controls investor identity and transfer eligibility.',
      'The strategy emphasizes contracted infrastructure cash flow, transparent reporting, and controlled secondary-market participation.',
    ],
    permittedCountries: ['Germany', 'France', 'Netherlands', 'Switzerland', 'Luxembourg'],
    restrictedCountries: ['Sanctioned and issuer-restricted jurisdictions'],
    transferRestriction: 'Active KYC and investor qualification claims are required for every receiver.',
    documents: [
      { id: 'dinf-offering', name: 'Offering Note', type: 'PDF', size: '2.2 MB', category: 'offering' },
      { id: 'dinf-audit', name: 'Smart Contract Audit', type: 'PDF', size: '1.3 MB', category: 'audit' },
    ],
    seedStatus: MARKETPLACE_STATUS.NOT_APPLIED,
  },
];

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readState() {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY), {});
}

function writeState(nextState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new CustomEvent('trex:marketplace-state-changed'));
}

function getTokenState(token) {
  const state = readState()[token.id] || {};
  return {
    status: state.status || token.seedStatus,
    holdingBalance: Number(state.holdingBalance ?? token.holdingBalance ?? 0),
    holdingValue: Number(state.holdingValue ?? token.holdingValue ?? 0),
    availableAmount: Number(state.availableAmount ?? token.availableAmount ?? 2400),
    submittedAt: state.submittedAt || null,
    updatedAt: state.updatedAt || null,
    applicationNote: state.applicationNote || '',
  };
}

function hydrateToken(token) {
  const local = getTokenState(token);
  return {
    ...token,
    ...local,
    statusMeta: MARKETPLACE_STATUS_META[local.status],
  };
}

function updateTokenState(tokenId, patch) {
  const token = seedTokens.find((item) => item.id === tokenId);
  if (!token) throw new Error('Offering not found.');
  const state = readState();
  const now = new Date().toISOString();
  state[tokenId] = {
    ...getTokenState(token),
    ...patch,
    updatedAt: now,
  };
  writeState(state);
  return hydrateToken(token);
}

export function getMarketplaceTokens() {
  return seedTokens.map(hydrateToken);
}

export function getMarketplaceToken(tokenId) {
  const token = seedTokens.find((item) => item.id === tokenId);
  return token ? hydrateToken(token) : null;
}

export function getMarketplaceApplications() {
  return getMarketplaceTokens()
    .filter((token) => token.status !== MARKETPLACE_STATUS.NOT_APPLIED)
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
}

export function submitMarketplaceInterest(tokenId) {
  return updateTokenState(tokenId, {
    status: MARKETPLACE_STATUS.PENDING_REVIEW,
    submittedAt: new Date().toISOString(),
  });
}

export function submitMarketplaceClaims(tokenId) {
  return updateTokenState(tokenId, {
    status: MARKETPLACE_STATUS.PENDING_REVIEW,
    submittedAt: new Date().toISOString(),
    applicationNote: 'Required KYC and accredited-investor claims submitted for issuer review.',
  });
}

export function investInMarketplaceToken(tokenId, amount) {
  const token = getMarketplaceToken(tokenId);
  const numericAmount = Number(amount);
  if (!token) throw new Error('Offering not found.');
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Enter a valid investment amount.');
  }
  if (numericAmount > token.availableAmount) {
    throw new Error(`Amount cannot exceed ${token.availableAmount.toLocaleString()} ${token.currency}.`);
  }
  const balance = token.holdingBalance + numericAmount / token.initialPrice;
  return updateTokenState(tokenId, {
    status: MARKETPLACE_STATUS.VERIFIED_HOLDER,
    holdingBalance: balance,
    holdingValue: token.holdingValue + numericAmount,
    availableAmount: Math.max(0, token.availableAmount - numericAmount),
  });
}

export function getLocalInvestorVerification() {
  if (typeof window === 'undefined') return { kyc: true, accreditedInvestor: false };
  return safeParse(window.localStorage.getItem(VERIFICATION_KEY), {
    kyc: true,
    accreditedInvestor: false,
  });
}

export function setLocalInvestorVerification(nextVerification) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VERIFICATION_KEY, JSON.stringify(nextVerification));
}

export function resetMarketplaceLocalData() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('trex:marketplace-state-changed'));
}
