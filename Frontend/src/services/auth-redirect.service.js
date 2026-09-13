import { STORAGE_KEYS } from '@/constants/storage';

const canUseSessionStorage = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

let appNavigator = null;

export const authRedirectService = {
  setNavigator(navigate) {
    appNavigator = typeof navigate === 'function' ? navigate : null;
  },

  navigate(to, options = {}) {
    if (appNavigator) return appNavigator(to, options);
    if (typeof window === 'undefined') return undefined;

    if (options.replace !== false) window.location.replace(to);
    else window.location.assign(to);
    return undefined;
  },

  setAccountNotFoundContext(context = {}) {
    if (!canUseSessionStorage()) return;

    try {
      window.sessionStorage.setItem(
        STORAGE_KEYS.authNotFoundRedirect,
        JSON.stringify({
          source: context.source || 'auth',
          email: context.email || '',
        }),
      );
    } catch {
      // Storage can be unavailable in privacy-restricted browser modes.
    }
  },

  getAccountNotFoundContext() {
    if (!canUseSessionStorage()) return null;

    try {
      const storedValue = window.sessionStorage.getItem(STORAGE_KEYS.authNotFoundRedirect);
      return storedValue ? JSON.parse(storedValue) : null;
    } catch {
      return null;
    }
  },

  clearAccountNotFoundContext() {
    if (!canUseSessionStorage()) return;

    try {
      window.sessionStorage.removeItem(STORAGE_KEYS.authNotFoundRedirect);
    } catch {
      // Storage can be unavailable in privacy-restricted browser modes.
    }
  },
};
