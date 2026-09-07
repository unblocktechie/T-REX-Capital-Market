import {
  BookOpenText,
  Building2,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { ROUTES } from '@/config/routes';

export const adminNavigation = [
  { label: 'Dashboard', to: ROUTES.adminDashboard, icon: LayoutDashboard },
  { label: 'Review Queue', to: ROUTES.adminReviewQueue, icon: ClipboardCheck, badge: 'review' },
  { label: 'Organizations', to: ROUTES.adminOrganizations, icon: Building2 },
  { label: 'Users', to: ROUTES.adminUsers, icon: Users },
  { label: 'Audit Logs', to: ROUTES.adminAuditLogs, icon: FileClock },
  { label: 'Settings', to: ROUTES.adminSettings, icon: Settings },
];

export const adminSecondaryNavigation = [
  { label: 'Documentation', to: ROUTES.adminDocumentation, icon: BookOpenText },
  { label: 'Security Logs', to: ROUTES.adminSecurityLogs, icon: ShieldCheck },
];

export const adminRouteMeta = {
  [ROUTES.adminDashboard]: {
    title: 'Compliance Overview',
    description: 'Monitor organization reviews, risk, and token eligibility.',
  },
  [ROUTES.adminReviewQueue]: {
    title: 'Application Review Queue',
    description: 'Review and verify submitted organizations before allowing token issuance.',
  },
  [ROUTES.adminOrganizations]: {
    title: 'Organizations',
    description: 'Browse every issuer organization and its compliance status.',
  },
  [ROUTES.adminUsers]: {
    title: 'Admin Users',
    description: 'Manage reviewers, responsibilities, and operational access.',
  },
  [ROUTES.adminAuditLogs]: {
    title: 'Audit Logs',
    description: 'Review immutable administrative and compliance activity.',
  },
  [ROUTES.adminProfile]: {
    title: 'Admin Profile',
    description: 'Manage your administrator identity and security role.',
  },
  [ROUTES.adminSettings]: {
    title: 'Admin Settings',
    description: 'Configure review policies, notifications, and governance.',
  },
  [ROUTES.adminDocumentation]: {
    title: 'Documentation',
    description: 'Compliance operations and ERC-3643 review guidance.',
  },
  [ROUTES.adminSecurityLogs]: {
    title: 'Security Logs',
    description: 'Monitor authentication and privileged access activity.',
  },
};
