import { appConfig } from '@/config/app.config';

export const formatCurrency = (value, currency = appConfig.defaultCurrency) =>
  new Intl.NumberFormat(appConfig.defaultLocale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const formatNumber = (value) =>
  new Intl.NumberFormat(appConfig.defaultLocale, { maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
