import { Building2, Briefcase, Coins, FileText, History, LayoutDashboard, Mail, RefreshCcw, Store, Users, UsersRound, WalletCards } from 'lucide-react';
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
        label: 'Transaction History',
        shortLabel: 'Transactions',
        to: ROUTES.transactions,
        icon: History,
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
        label: 'Manage Investments',
        shortLabel: 'Manage Investments',
        to: ROUTES.assetManagement,
        icon: Briefcase,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
    ],
  },
]);

export const routeMeta = Object.freeze({
  [ROUTES.dashboard]: { title: 'Dashboard', description: 'Your issuer activity and next actions' },
  [ROUTES.organization]: {
    title: 'Organization',
    description: 'Verified company details and approved management access',
  },
  [ROUTES.createToken]: {
    title: 'Tokens',
    description: 'Guided investment asset setup and launch',
  },
  tokenDetails: {
    title: 'Investment Asset',
    description: 'Price, investor access, limits, and technical details',
  },
  [ROUTES.investors]: {
    title: 'Investment Requests',
    description: 'Review investor applications and required actions',
  },
  [ROUTES.issuerInvestorDirectory]: {
    title: 'Investors',
    description: 'Review approved investors and send investment invitations',
  },
  [ROUTES.transactions]: {
    title: 'Transaction History',
    description: 'Track confirmed token movements and export transaction records',
  },
  [ROUTES.invitations]: {
    title: 'Invitations',
    description: 'Review token invitations received from issuers',
  },
  [ROUTES.issuerRedemptions]: {
    title: 'Redemption Requests',
    description: 'Review requests to redeem tokens and complete approved payments',
  },
  [ROUTES.marketplace]: { title: 'Marketplace', description: 'Explore available investment opportunities' },
  marketplaceToken: { title: 'Investment Details', description: 'Review the investment, eligibility requirements, and next action' },
  [ROUTES.applications]: { title: 'My Applications', description: 'Track your investment applications' },
  [ROUTES.portfolio]: { title: 'Portfolio', description: 'See what you hold, its estimated value and your investment history' },
  [ROUTES.assetManagement]: { title: 'Manage Investments', description: 'Invest more, send, or redeem assets you are approved to hold' },
  [ROUTES.profile]: { title: 'Investor Profile', description: 'Your identity, investment information, documents, and registered wallet' },
});
