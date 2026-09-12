import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';

const normalizeRole = (roleName) => String(roleName || '').trim().toLowerCase();

/**
 * Returns the first authenticated workspace route for a role.
 * Route guards remain responsible for directing new issuers/investors through onboarding.
 */
export const resolveAuthenticatedLandingRoute = (roleName) => {
  const role = normalizeRole(roleName);

  if (role.includes(ROLES.admin)) return ROUTES.adminReviewQueue;
  if (role.includes(ROLES.investor)) return ROUTES.marketplace;
  if (role.includes(ROLES.issuer)) return ROUTES.dashboard;

  return ROUTES.dashboard;
};
