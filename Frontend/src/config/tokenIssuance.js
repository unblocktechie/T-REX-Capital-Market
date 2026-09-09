import { BadgeCheck, FileCheck2, Fingerprint, Gavel, Settings2 } from 'lucide-react';

export const TOKEN_ISSUANCE_STEPS = Object.freeze([
  {
    key: 'token-information',
    number: 1,
    shortLabel: 'Basics',
    label: 'Token Information',
    description: 'Define the token name, symbol, decimals, price, treasury wallet and description.',
    icon: FileCheck2,
  },
  {
    key: 'identity-claims',
    number: 2,
    shortLabel: 'Claims',
    label: 'Identity & Claims',
    description: 'Configure KYC, accreditation and the organization trusted claim issuer.',
    icon: Fingerprint,
  },
  {
    key: 'compliance',
    number: 3,
    shortLabel: 'Compliance',
    label: 'Compliance Rules',
    description: 'Define investor limits, balance limits and geographic restrictions.',
    icon: Gavel,
  },
  {
    key: 'agents',
    number: 4,
    shortLabel: 'Agents',
    label: 'Governance Agents',
    description: 'Assign the Token Agent and Identity Manager wallets.',
    icon: Settings2,
  },
  {
    key: 'review',
    number: 5,
    shortLabel: 'Review',
    label: 'Review & Deploy',
    description: 'Validate all configurations before deployment.',
    icon: BadgeCheck,
  },
]);

// Kept for payload compatibility with existing integrations. The simplified wizard does not
// expose an asset-class input.
export const ASSET_CLASSES = Object.freeze([
  'Equity',
  'Debt',
  'Fund share',
  'Real estate',
  'Revenue share',
  'Commodity-backed',
  'Other security',
]);

// Kept for compatibility with existing data and services. The simplified flow uses USDT only.
export const SUPPORTED_CURRENCIES = Object.freeze([
  'USDT',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'SGD',
  'AED',
  'INR',
]);

export const DEFAULT_CLAIM_TOPICS = Object.freeze([
  {
    id: 'kyc',
    name: 'KYC – Know Your Customer',
    shortName: 'KYC',
    description: 'The investor identity and credential address must be verified.',
    enabled: true,
    required: true,
    mandatory: false,
  },
  {
    id: 'accredited',
    name: 'Accredited Investor',
    shortName: 'Accredited Investor',
    description: 'The investor meets the applicable net-worth or income requirements.',
    enabled: false,
    required: false,
    mandatory: false,
  },
]);

// Preserve the complete agent payload shape used by existing deployment integrations.
export const AGENT_ROLES = Object.freeze([
  {
    key: 'tokenAgent',
    name: 'Token Agent',
    description: 'Operates supply and emergency controls for the token contract.',
    required: true,
    permissions: ['Mint', 'Burn', 'Pause', 'Unpause', 'Freeze', 'Unfreeze'],
  },
  {
    key: 'identityRegistryAgent',
    name: 'Identity Registry Agent',
    description: 'Maintains investor identities, countries and verification state.',
    required: true,
    permissions: ['Add identity', 'Remove identity', 'Update country', 'Manage verification'],
  },
  {
    key: 'complianceAgent',
    name: 'Compliance Agent',
    description: 'Manages supported compliance modules and rule configuration.',
    required: true,
    permissions: ['Update rules', 'Bind modules', 'Configure limits', 'Review restrictions'],
  },
  {
    key: 'claimIssuerAgent',
    name: 'Claim Issuer Agent',
    description: 'Issues and revokes identity claims used by the token.',
    required: true,
    permissions: ['Issue claims', 'Revoke claims', 'Update claim keys'],
  },
  {
    key: 'recoveryAgent',
    name: 'Recovery Agent',
    description: 'Supports approved wallet recovery and forced-transfer operations.',
    required: false,
    permissions: ['Recover wallet', 'Forced transfer', 'Freeze lost wallet'],
  },
]);

// Only these two roles are editable in the requested token-creation flow. Their underlying keys
// remain unchanged so the current deployment payload and smart-contract integration stay intact.
export const TOKEN_CREATION_AGENT_ROLES = Object.freeze([
  {
    ...AGENT_ROLES.find((role) => role.key === 'tokenAgent'),
    name: 'Token Agent',
    description: 'Manages token issuance, supply controls and approved emergency actions.',
  },
  {
    ...AGENT_ROLES.find((role) => role.key === 'identityRegistryAgent'),
    name: 'Identity Manager',
    description: 'Maintains investor identities and verification eligibility.',
  },
]);

export const COUNTRY_OPTIONS = Object.freeze([
  'Australia',
  'Austria',
  'Belgium',
  'Brazil',
  'Canada',
  'China',
  'France',
  'Germany',
  'Hong Kong',
  'India',
  'Ireland',
  'Italy',
  'Japan',
  'Luxembourg',
  'Netherlands',
  'New Zealand',
  'Portugal',
  'Singapore',
  'South Africa',
  'South Korea',
  'Spain',
  'Sweden',
  'Switzerland',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
]);

export const DEPLOYMENT_STAGES = Object.freeze([
  'Checking authorized wallet and Sepolia network',
  'Preparing ONCHAINID, claims and compliance',
  'Building the T-REX Gateway deployment payload',
  'Confirming token creation and transfer activation',
  'Submitting the confirmed transaction hash',
]);

