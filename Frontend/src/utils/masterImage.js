import { env } from '@/config/env';

export const resolveMasterImageUrl = (record) => {
  const raw = record?.imageUrl
    || record?.paymentTokenImageUrl
    || record?.paymentTokenLogoUrl
    || record?.tokenImageUrl
    || record?.imageURL
    || record?.logoUrl
    || record?.iconUrl
    || record?.imagePath
    || record?.image?.url
    || (typeof record?.image === 'string' ? record.image : '');

  if (!raw) return '';
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw;

  try {
    return new URL(raw, env.apiBaseUrl).href;
  } catch {
    return raw;
  }
};
