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
    shortLabel: 'Verification',
    label: 'Investor Verification',
    description: 'Choose the identity and eligibility checks investors must complete.',
    icon: Fingerprint,
  },
  {
    key: 'compliance',
    number: 3,
    shortLabel: 'Transfer Rules',
    label: 'Transfer Rules',
    description: 'Set holding limits and geographic restrictions for token transfers.',
    icon: Gavel,
  },
  {
    key: 'agents',
    number: 4,
    shortLabel: 'Permissions',
    label: 'Platform Permissions',
    description: 'Review the authorized wallets that manage token operations and investor eligibility.',
    icon: Settings2,
  },
  {
    key: 'review',
    number: 5,
    shortLabel: 'Review',
    label: 'Review & Launch',
    description: 'Review the setup before creating your token.',
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
    description: 'The investor must complete identity verification before receiving or holding this token.',
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
    name: 'Token Operations Wallet',
    description: 'Authorized wallet for issuing tokens and approved emergency controls. Technical ERC-3643 role: Token Agent.',
    required: true,
    permissions: ['Issue tokens', 'Remove tokens', 'Pause transfers', 'Resume transfers', 'Freeze wallet', 'Unfreeze wallet'],
  },
  {
    key: 'identityRegistryAgent',
    name: 'Investor Verification Manager',
    description: 'Maintains which verified investors are approved to hold the token. Technical ERC-3643 role: Identity Registry Agent.',
    required: true,
    permissions: ['Approve investor', 'Remove investor', 'Update country', 'Manage verification'],
  },
  {
    key: 'complianceAgent',
    name: 'Transfer Rules Manager',
    description: 'Manages transfer restrictions, holding limits and supported rule settings.',
    required: true,
    permissions: ['Update rules', 'Bind modules', 'Configure limits', 'Review restrictions'],
  },
  {
    key: 'claimIssuerAgent',
    name: 'Verification Credential Manager',
    description: 'Issues and revokes investor verification credentials used by the token.',
    required: true,
    permissions: ['Issue credentials', 'Revoke credentials', 'Update signing keys'],
  },
  {
    key: 'recoveryAgent',
    name: 'Wallet Recovery Manager',
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
    name: 'Token Operations Wallet',
    description: 'Manages token issuance, supply controls and approved emergency actions.',
  },
  {
    ...AGENT_ROLES.find((role) => role.key === 'identityRegistryAgent'),
    name: 'Investor Verification Manager',
    description: 'Authorizes verified investors to hold and receive this token. Technical role: Identity Manager.',
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
  'Checking your organization wallet and Sepolia network',
  'Preparing investor verification and transfer rules',
  'Preparing secure token creation',
  'Confirming token creation and transfer access',
  'Finalizing your token record',
]);

