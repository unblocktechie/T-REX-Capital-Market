import { env } from './env';
import { centralizedConfig } from './app.config';

export const featureFlags = Object.freeze({
  darkMode: env.features.darkMode,
  analytics: env.features.analytics,
  mockApi: env.features.mockApi,
  userManagement: centralizedConfig.features.enableUserManagement,
  auditTrail: centralizedConfig.features.enableAuditTrail,
  contactSupportActions: centralizedConfig.features.enableContactSupportActions,
  mainnetLaunchBanner: centralizedConfig.features.enableMainnetLaunchBanner,
});
