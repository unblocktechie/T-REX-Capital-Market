import { env } from './env';

export const featureFlags = Object.freeze({
  darkMode: env.features.darkMode,
  analytics: env.features.analytics,
  mockApi: env.features.mockApi,
  userManagement: true,
  auditTrail: false,
});
