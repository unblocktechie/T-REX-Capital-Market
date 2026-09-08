import { Building2, Coins, LayoutDashboard, UsersRound } from 'lucide-react';
import { PERMISSIONS } from './permissions';
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
      },
      {
        label: 'Tokens',
        shortLabel: 'Tokens',
        to: ROUTES.createToken,
        icon: Coins,
        permission: PERMISSIONS.dashboardView,
        dynamicToken: true,
      },
      {
        label: 'Investors',
        shortLabel: 'Investors',
        to: ROUTES.investors,
        icon: UsersRound,
        permission: PERMISSIONS.dashboardView,
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
    title: 'Investors',
    description: 'Investor onboarding and qualification',
  },
  [ROUTES.profile]: { title: 'Profile', description: 'Personal account settings' },
});
