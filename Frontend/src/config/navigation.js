import { Building2, Coins, FileText, LayoutDashboard, Store, UsersRound } from 'lucide-react';
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
    ],
  },
]);

export const routeMeta = Object.freeze({
  [ROUTES.dashboard]: { title: 'Overview', description: 'Issuer launchpad dashboard' },
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
  [ROUTES.marketplace]: { title: 'Marketplace', description: 'Discover tokenized investment opportunities' },
  marketplaceToken: { title: 'Marketplace Asset', description: 'Review a compliant tokenized investment offering' },
  [ROUTES.applications]: { title: 'My Applications', description: 'Track your investment applications' },
  [ROUTES.profile]: { title: 'Profile', description: 'Personal account settings' },
});
