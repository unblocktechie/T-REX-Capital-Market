import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
} from 'lucide-react';
import { ROUTES } from '@/config/routes';

export const adminNavigation = [
  { label: 'Dashboard', to: ROUTES.adminDashboard, icon: LayoutDashboard },
  { label: 'Review Queue', to: ROUTES.adminReviewQueue, icon: ClipboardCheck, badge: 'review' },
  { label: 'Organizations', to: ROUTES.adminOrganizations, icon: Building2 },
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
  [ROUTES.adminProfile]: {
    title: 'Admin Profile',
    description: 'Manage your administrator identity and security role.',
  },
};
