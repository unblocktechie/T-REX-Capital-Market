import {
  Building2,
  ClipboardCheck,
  Network,
  KeyRound,
  UsersRound,
  Coins,
  FileClock,
  BellRing,
} from 'lucide-react';
import { ROUTES } from '@/config/routes';

export const adminNavigation = [
  { label: 'Review Queue', to: ROUTES.adminReviewQueue, icon: ClipboardCheck, badge: 'review' },
  { label: 'Organizations', to: ROUTES.adminOrganizations, icon: Building2 },
  { label: 'Investors', to: ROUTES.adminInvestors, icon: UsersRound },
  { label: 'Tokens', to: ROUTES.adminTokens, icon: Coins },
  { label: 'Investor Applications', to: ROUTES.adminInvestorApplications, icon: FileClock },
  { label: 'Network Config', to: ROUTES.adminNetworks, icon: Network },
  { label: 'Issuer API Settings', to: ROUTES.adminIssuerApiKeySettings, icon: KeyRound },
  { label: 'Team Notifications', to: ROUTES.adminTeamNotifications, icon: BellRing },
];

export const adminRouteMeta = {
  [ROUTES.adminInvestors]: { title: 'Investor Accounts', description: 'Monitor investor profiles, identity status and investment history.' },
  [ROUTES.adminTokens]: { title: 'Platform Tokens', description: 'Review tokens across networks, organizations and statuses.' },
  [ROUTES.adminInvestorApplications]: { title: 'Investor Applications', description: 'Track investor-to-issuer application stages.' },
  [ROUTES.adminTeamNotifications]: { title: 'Team Notifications', description: 'Manage email verification notification recipients.' },
  [ROUTES.adminDashboard]: {
    title: 'Compliance Overview',
    description: 'Monitor organization reviews, risk, and token eligibility.',
  },
  [ROUTES.adminReviewQueue]: {
    title: 'Application Review Queue',
    description: 'Review and verify submitted organizations before allowing token issuance.',
  },
  [ROUTES.adminNetworks]: {
    title: 'Network Configuration',
    description: 'Manage blockchain networks, contracts, indexers, and payment tokens.',
  },
  [ROUTES.adminOrganizations]: {
    title: 'Organizations',
    description: 'Browse every issuer organization and its compliance status.',
  },
  [ROUTES.adminIssuerApiKeySettings]: {
    title: 'Issuer API Key Settings',
    description: 'Configure issuer key capacity, signature lifetime, and automated API request limits.',
  },
  [ROUTES.adminProfile]: {
    title: 'Admin Profile',
    description: 'View your administrator identity and security role.',
  },
};
