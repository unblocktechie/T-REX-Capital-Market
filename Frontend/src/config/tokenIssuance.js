import { BadgeCheck, FileCheck2, Fingerprint, Gavel, Settings2 } from 'lucide-react';

export const TOKEN_ISSUANCE_STEPS = Object.freeze([
  {
    key: 'token-information',
    number: 1,
    shortLabel: 'Asset Details',
    label: 'Asset Details',
    description: 'Add the basic information investors will see.',
    guidance: 'Enter the asset name, symbol, price, payment wallet, and description. We save this information before you move on.',
    impact: 'These details identify your asset and are used when the token is created on the blockchain.',
    icon: FileCheck2,
  },
  {
    key: 'identity-claims',
    number: 2,
    shortLabel: 'Who Can Invest',
    label: 'Who Can Invest',
    description: 'Choose the checks investors must pass before they can participate.',
    guidance: 'Choose the investor checks your offering requires. Each option explains what it does and what happens when you turn it on or off.',
    impact: 'Only investors who pass every check you require will be able to invest in or receive the asset.',
    icon: Fingerprint,
  },
  {
    key: 'compliance',
    number: 3,
    shortLabel: 'Rules',
    label: 'Investment Rules',
    description: 'Set investor limits and choose any countries you want to block.',
    guidance: 'Enter the maximum number of investors, the most one investor can hold, and any countries that should not be allowed.',
    impact: 'The platform checks these limits automatically before an investment or transfer can complete.',
    icon: Gavel,
  },
  {
    key: 'agents',
    number: 4,
    shortLabel: 'Who Manages',
    label: 'Who Manages This Asset',
    description: 'Review the approved organization account used to manage the asset.',
    guidance: 'Review the management roles assigned to your approved organization account. These roles are filled automatically and are read-only during setup.',
    impact: 'This account will be able to perform the management actions shown on the screen after the asset is created.',
    icon: Settings2,
  },
  {
    key: 'review',
    number: 5,
    shortLabel: 'Review',
    label: 'Review & Create',
    description: 'Check every choice before creating the asset.',
    guidance: 'Read the plain-language summary and fix anything that does not match your intended offering. Technical details remain available when you need them.',
    impact: 'When you create the asset, your approved organization account will confirm the required setup actions and the final settings will be recorded on the blockchain.',
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
    name: 'Require identity verification',
    shortName: 'Identity verification',
    description: 'The investor must confirm their identity before investing in or receiving this asset.',
    enabled: true,
    required: true,
    mandatory: false,
  },
  {
    id: 'accredited',
    name: 'Require accredited investor status',
    shortName: 'Accredited investor status',
    description: 'The investor must meet the required financial eligibility rules for this offering.',
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
    name: 'Asset Management',
    description: 'This role manages asset supply and important operating controls.',
  },
  {
    ...AGENT_ROLES.find((role) => role.key === 'identityRegistryAgent'),
    name: 'Investor Management',
    description: 'This role manages investor approvals and eligibility for this asset.',
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

