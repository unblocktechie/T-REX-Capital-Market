import { env } from './env';

export const appConfig = Object.freeze({
  name: env.appName,
  version: env.appVersion,
  deploymentEnvironment: env.deploymentEnvironment,
  defaultLocale: 'en-IN',
  defaultCurrency: 'USD',
  defaultPageSize: 10,
  supportEmail: env.supportEmail,
  companyName: env.companyName,
  companyWebsiteUrl: env.companyWebsiteUrl,
  companyWebsiteLabel: env.companyWebsiteLabel,
  contactUsUrl: env.contactUsUrl,
  documentsUrl: env.documentsUrl,
});
