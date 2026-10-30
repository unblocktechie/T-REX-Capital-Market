import { env } from '@/config/env';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const getApiOrigin = () => {
  try {
    return new URL(env.apiBaseUrl).origin;
  } catch {
    return '';
  }
};

/**
 * Resolve image/file URLs returned by the backend against the backend host.
 *
 * The chain catalogue returns paths such as:
 *   /api/v1/chains/:chainUid/image
 *
 * Rendering those paths directly from the SPA would incorrectly request them
 * from the frontend origin (for example localhost:5173). Keeping resolution in
 * one helper makes backend artwork the primary source in every environment.
 */
export const resolveApiAssetUrl = (value) => {
  const url = clean(value);
  if (!url) return '';
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;

  try {
    if (url.startsWith('//')) {
      const protocol = new URL(env.apiBaseUrl).protocol;
      return `${protocol}${url}`;
    }

    if (url.startsWith('/')) {
      const origin = getApiOrigin();
      return origin ? new URL(url, `${origin}/`).toString() : url;
    }

    return new URL(url, `${env.apiBaseUrl}/${env.apiVersion}/`).toString();
  } catch {
    return url;
  }
};

export default resolveApiAssetUrl;
