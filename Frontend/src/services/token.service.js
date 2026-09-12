import { STORAGE_KEYS } from '@/constants';

const canUseWindow = () => typeof window !== 'undefined';

const getStorages = () => {
  if (!canUseWindow()) return [];
  return [window.localStorage, window.sessionStorage];
};

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return decodeURIComponent(
    window
      .atob(padded)
      .split('')
      .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
};

export const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;

  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return null;
  }
};

export const getJwtExpirationTime = (token) => {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : null;
};

export const isJwtExpired = (token, clockSkewSeconds = 30) => {
  const expiresAt = getJwtExpirationTime(token);
  if (!expiresAt) return false;
  return expiresAt <= Date.now() + clockSkewSeconds * 1000;
};

const safelyParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const removeLegacyAuth = () => {
  getStorages().forEach((storage) => {
    storage.removeItem(STORAGE_KEYS.legacyAuthState);
    storage.removeItem(STORAGE_KEYS.legacyAccessToken);
    storage.removeItem(STORAGE_KEYS.authState);
    storage.removeItem(STORAGE_KEYS.accessToken);
  });
};

export const tokenService = {
  getSession() {
    removeLegacyAuth();
    for (const storage of getStorages()) {
      const session = safelyParse(storage.getItem(STORAGE_KEYS.authSession));
      if (!session?.accessToken) continue;

      if (isJwtExpired(session.accessToken)) {
        storage.removeItem(STORAGE_KEYS.authSession);
        continue;
      }

      return session;
    }

    return null;
  },

  setSession({ accessToken, user, tokenType = 'Bearer', expiresIn = null, remember = false }) {
    if (!canUseWindow() || !accessToken) return;

    this.clear();
    const storage = remember ? window.localStorage : window.sessionStorage;
    storage.setItem(
      STORAGE_KEYS.authSession,
      JSON.stringify({ accessToken, tokenType, expiresIn, user, remember, savedAt: Date.now() }),
    );
  },

  getAccessToken() {
    return this.getSession()?.accessToken ?? null;
  },

  clear() {
    getStorages().forEach((storage) => storage.removeItem(STORAGE_KEYS.authSession));
    removeLegacyAuth();
  },
};
