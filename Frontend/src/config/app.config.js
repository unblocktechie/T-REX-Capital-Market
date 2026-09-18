/**
 * CENTRAL APPLICATION CONFIGURATION
 * ---------------------------------
 * Browser-safe VITE_* environment variables override the validated legacy/default
 * values defined in config.factory.js. Missing variables therefore keep the existing
 * application behavior, while invalid supplied values still fail validation. Keep
 * private keys, passwords, signing keys, API secrets, and other server-side secrets
 * out of VITE_* values because Vite bundles them into the browser application.
 *
 * The exported object shapes are intentionally unchanged so existing imports do
 * not need to be modified.
 */
import { createCentralizedConfig } from './config.factory';

const runtimeEnv = import.meta.env || {};

export const centralizedConfig = createCentralizedConfig(runtimeEnv);

/**
 * Backward-compatible projection used throughout the existing UI.
 */
export const appConfig = Object.freeze({
  name: centralizedConfig.application.name,
  version: centralizedConfig.application.version,
  defaultLocale: centralizedConfig.application.defaultLocale,
  defaultCurrency: centralizedConfig.application.defaultCurrency,
  defaultPageSize: centralizedConfig.application.defaultPageSize,
  supportEmail: centralizedConfig.branding.supportEmail,
  companyName: centralizedConfig.branding.companyName,
  shortProductName: centralizedConfig.branding.shortProductName,
  brandSubtitle: centralizedConfig.branding.brandSubtitle,
  complianceEmail: centralizedConfig.branding.complianceEmail,
  companyWebsiteUrl: centralizedConfig.branding.companyWebsiteUrl,
  companyWebsiteLabel: centralizedConfig.branding.companyWebsiteLabel,
  mainnetLaunchBanner: centralizedConfig.branding.mainnetLaunchBanner,
});
