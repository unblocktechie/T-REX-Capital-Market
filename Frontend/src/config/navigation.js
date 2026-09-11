import { Building2, Briefcase, Coins, FileText, LayoutDashboard, Mail, RefreshCcw, Store, Users, UsersRound, WalletCards } from 'lucide-react';
import { PERMISSIONS, ROLES } from './permissions';
import { ROUTES } from './routes';

export const navigationGroups = Object.freeze([
  {
    label: 'Workspace',
    items: [
      {
        label: 'Dashboard',
        shortLabel: 'Overview',
        to: ROUTES.dashboard,
        icon: LayoutDashboard,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Organization',
        shortLabel: 'Organization',
        to: ROUTES.organization,
        icon: Building2,
        permission: PERMISSIONS.dashboardView,
        dynamicOrganization: true,
        roles: [ROLES.issuer],
      },
      {
        label: 'Tokens',
        shortLabel: 'Tokens',
        to: ROUTES.createToken,
        icon: Coins,
        permission: PERMISSIONS.dashboardView,
        dynamicToken: true,
        roles: [ROLES.issuer],
      },
      {
        label: 'Investment Requests',
        shortLabel: 'Requests',
        to: ROUTES.investors,
        icon: UsersRound,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.issuer],
      },
      {
        label: 'Investors',
        shortLabel: 'Investors',
        to: ROUTES.issuerInvestorDirectory,
        icon: Users,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.issuer],
      },
      {
        label: 'Redemption Requests',
        shortLabel: 'Redemptions',
        to: ROUTES.issuerRedemptions,
        icon: RefreshCcw,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.issuer],
      },
      {
        label: 'Marketplace',
        shortLabel: 'Marketplace',
        to: ROUTES.marketplace,
        icon: Store,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
      {
        label: 'My Applications',
        shortLabel: 'Applications',
        to: ROUTES.applications,
        icon: FileText,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
      {
        label: 'Invitations',
        shortLabel: 'Invitations',
        to: ROUTES.invitations,
        icon: Mail,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
      {
        label: 'Portfolio',
        shortLabel: 'Portfolio',
        to: ROUTES.portfolio,
        icon: WalletCards,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
      {
        label: 'Manage Tokens',
        shortLabel: 'Manage Tokens',
        to: ROUTES.assetManagement,
        icon: Briefcase,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
    ],
  },
]);

export const routeMeta = Object.freeze({
  [ROUTES.dashboard]: { title: 'Overview', description: 'Issuer capital market dashboard' },
  [ROUTES.organization]: {
    title: 'Organization',
    description: 'Institutional KYB onboarding and verification',
  },
  [ROUTES.createToken]: {
    title: 'Tokens',
    description: 'Guided security-token setup and launch',
  },
  tokenDetails: {
    title: 'Token',
    description: 'Token settings, price and blockchain details',
  },
  [ROUTES.investors]: {
    title: 'Investment Requests',
    description: 'Review investor requests to invest in your token',
  },
  [ROUTES.issuerInvestorDirectory]: {
    title: 'Investors',
    description: 'Discover completed investor profiles and manage token invitations',
  },
  [ROUTES.invitations]: {
    title: 'Invitations',
    description: 'Review token invitations received from issuers',
  },
  [ROUTES.issuerRedemptions]: {
    title: 'Redemption Requests',
    description: 'Review requests to redeem tokens and complete approved payments',
  },
  [ROUTES.marketplace]: { title: 'Marketplace', description: 'Discover security-token investment opportunities' },
  marketplaceToken: { title: 'Marketplace Asset', description: 'Review a compliant tokenized investment offering' },
  [ROUTES.applications]: { title: 'My Applications', description: 'Track your investment applications' },
  [ROUTES.portfolio]: { title: 'Portfolio', description: 'See what you hold, its estimated value and your investment history' },
  [ROUTES.assetManagement]: { title: 'Manage Tokens', description: 'Buy, send and redeem tokens you are approved to hold' },
  [ROUTES.profile]: { title: 'Profile', description: 'Personal account settings' },
});
