import { Building2, Briefcase, Coins, History, LayoutDashboard, Network, Store, UsersRound, WalletCards } from 'lucide-react';
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
        label: 'Network Access',
        shortLabel: 'Networks',
        to: ROUTES.chainAccess,
        icon: Network,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Token Management',
        shortLabel: 'Token Management',
        to: ROUTES.createToken,
        icon: Coins,
        permission: PERMISSIONS.dashboardView,
        dynamicToken: true,
        roles: [ROLES.issuer],
      },
      {
        label: 'Investor Management',
        shortLabel: 'Investors',
        to: ROUTES.issuerInvestorManagement,
        icon: UsersRound,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.issuer],
      },
      {
        label: 'Activity History',
        shortLabel: 'Activity',
        to: ROUTES.transactions,
        icon: History,
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
        label: 'My Investment',
        shortLabel: 'My Investment',
        to: ROUTES.investorMyInvestment,
        icon: Briefcase,
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
      {
        label: 'Wallet Management',
        shortLabel: 'Wallet',
        to: ROUTES.walletManagement,
        icon: WalletCards,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.issuer, ROLES.investor],
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
  [ROUTES.chainAccess]: { title: 'Network Access', description: 'Unlock and review the blockchain networks available to your account' },
  [ROUTES.createToken]: {
    title: 'Tokens',
    description: 'Guided investment asset setup and launch',
  },
  tokenDetails: {
    title: 'Token Management',
    description: 'Price, investor access, limits, and technical details',
  },
  [ROUTES.issuerInvestorManagement]: {
    title: 'Investor Management',
    description: 'Manage investors, investment requests, and redemption requests',
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
    title: 'Activity History',
    description: 'Track confirmed investment and asset activity and export records',
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
  [ROUTES.investorMyInvestment]: { title: 'My Investment', description: 'Manage your applications, portfolio, and invitations' },
  [ROUTES.applications]: { title: 'My Applications', description: 'Track your investment applications' },
  [ROUTES.portfolio]: { title: 'Portfolio', description: 'See what you hold, its estimated value and your investment history' },
  [ROUTES.assetManagement]: { title: 'Manage Investments', description: 'Invest, send, or redeem assets you are approved to hold' },
  [ROUTES.walletManagement]: { title: 'Wallet Management', description: 'View wallet and token balances across supported networks' },
  [ROUTES.profile]: { title: 'Investor Profile', description: 'Your identity, investment information, documents, and registered wallet' },
});
