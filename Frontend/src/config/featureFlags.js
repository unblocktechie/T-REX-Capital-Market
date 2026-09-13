import { env } from './env';

export const featureFlags = Object.freeze({
  darkMode: env.features.darkMode,
  analytics: env.features.analytics,
  mockApi: env.features.mockApi,
  userManagement: true,
  auditTrail: false,
  // TEMPORARY: hide Contact Us action buttons without removing their handlers/dialogs.
  // Set this to true when "Get Help" and "Invite to Invest" should be visible again.
  contactSupportActions: false,
});
