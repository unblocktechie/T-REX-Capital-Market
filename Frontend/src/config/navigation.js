import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { PERMISSIONS } from './permissions';
import { ROUTES } from './routes';

export const navigationGroups = Object.freeze([
  {
    label: 'Launchpad',
    items: [
      {
        label: 'Overview',
        shortLabel: 'Home',
        to: ROUTES.dashboard,
        icon: LayoutDashboard,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Create Organization',
        shortLabel: 'Organization',
        to: ROUTES.organization,
        icon: Building2,
        permission: PERMISSIONS.dashboardView,
        dynamicOrganization: true,
      },
      {
        label: 'Token projects',
        shortLabel: 'Projects',
        to: ROUTES.projects,
        icon: BriefcaseBusiness,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Create token',
        shortLabel: 'Create',
        to: ROUTES.createToken,
        icon: Rocket,
        permission: PERMISSIONS.dashboardView,
        badge: 'Guided',
      },
    ],
  },
  {
    label: 'Compliance',
    items: [
      {
        label: 'Identity registry',
        shortLabel: 'Identity',
        to: ROUTES.identity,
        icon: UserRoundCheck,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Compliance rules',
        shortLabel: 'Rules',
        to: ROUTES.compliance,
        icon: ShieldCheck,
        permission: PERMISSIONS.dashboardView,
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
  {
    label: 'Operations',
    items: [
      {
        label: 'Transactions',
        shortLabel: 'Transfers',
        to: ROUTES.transactions,
        icon: ArrowLeftRight,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Corporate actions',
        shortLabel: 'Actions',
        to: ROUTES.corporateActions,
        icon: ScrollText,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Documents',
        shortLabel: 'Docs',
        to: ROUTES.documents,
        icon: FileText,
        permission: PERMISSIONS.dashboardView,
      },
      {
        label: 'Reports',
        shortLabel: 'Reports',
        to: ROUTES.reports,
        icon: BarChart3,
        permission: PERMISSIONS.dashboardView,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Team & access',
        shortLabel: 'Team',
        to: ROUTES.users,
        icon: Users,
        permission: PERMISSIONS.usersView,
      },
      {
        label: 'Settings',
        shortLabel: 'Settings',
        to: ROUTES.settings,
        icon: Settings,
        permission: PERMISSIONS.settingsView,
      },
    ],
  },
]);

export const routeMeta = Object.freeze({
  [ROUTES.dashboard]: { title: 'Overview', description: 'Issuer launchpad dashboard' },
  [ROUTES.projects]: { title: 'Token projects', description: 'Manage security token offerings' },
  [ROUTES.organization]: { title: 'Organization', description: 'Institutional KYB onboarding and verification' },
  [ROUTES.createToken]: { title: 'Create token', description: 'Guided ERC-3643 deployment' },
  [ROUTES.identity]: { title: 'Identity registry', description: 'Claims and trusted identities' },
  [ROUTES.compliance]: {
    title: 'Compliance rules',
    description: 'Transfer and eligibility controls',
  },
  [ROUTES.investors]: { title: 'Investors', description: 'Onboarding and qualification' },
  [ROUTES.transactions]: { title: 'Transactions', description: 'Compliant token activity' },
  [ROUTES.corporateActions]: {
    title: 'Corporate actions',
    description: 'Distributions and lifecycle events',
  },
  [ROUTES.documents]: { title: 'Documents', description: 'Offering and compliance records' },
  [ROUTES.reports]: { title: 'Reports', description: 'Audit-ready operational insights' },
  [ROUTES.users]: { title: 'Team & access', description: 'Roles and permissions' },
  [ROUTES.profile]: { title: 'Profile', description: 'Personal account settings' },
  [ROUTES.settings]: { title: 'Settings', description: 'Launchpad configuration' },
});
