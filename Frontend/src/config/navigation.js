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
        label: 'Manage Request',
        shortLabel: 'Manage Request',
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
        label: 'Redemptions',
        shortLabel: 'Redemptions',
        to: ROUTES.issuerRedemptions,
        icon: RefreshCcw,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.issuer],
      },
      {
        label: 'Market Place',
        shortLabel: 'Market Place',
        to: ROUTES.marketplace,
        icon: Store,
        permission: PERMISSIONS.dashboardView,
        roles: [ROLES.investor],
      },
      {
        label: 'My Application',
        shortLabel: 'Application',
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
        label: 'Asset Management',
        shortLabel: 'Assets',
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
    description: 'ERC-3643 token configuration and deployment',
  },
  tokenDetails: {
    title: 'Token',
    description: 'ERC-3643 token configuration and deployment details',
  },
  [ROUTES.investors]: {
    title: 'Manage Request',
    description: 'Review investor subscription requests',
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
    title: 'Redemptions',
    description: 'Review investor redemption requests and complete required payments',
  },
  [ROUTES.marketplace]: { title: 'Marketplace', description: 'Discover tokenized investment opportunities' },
  marketplaceToken: { title: 'Marketplace Asset', description: 'Review a compliant tokenized investment offering' },
  [ROUTES.applications]: { title: 'My Applications', description: 'Track your investment applications' },
  [ROUTES.portfolio]: { title: 'Portfolio', description: 'View current compliant security token holdings' },
  [ROUTES.assetManagement]: { title: 'Asset Management', description: 'Invest, send, and redeem registered ERC-3643 assets' },
  [ROUTES.profile]: { title: 'Profile', description: 'Personal account settings' },
});
