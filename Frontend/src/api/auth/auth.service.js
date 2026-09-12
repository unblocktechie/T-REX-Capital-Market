import { authApi } from './auth.api';
import { normalizeAuthSession } from './auth.mapper';
import { useAuthStore } from '@/store/auth.store';
import { queryClient } from '@/lib/queryClient';

const persistSession = (payload, remember = false) => {
  const session = normalizeAuthSession(payload);
  useAuthStore.getState().setSession({ ...session, remember });
  return session;
};

export const authService = {
  async prepareLogin({ remember = false, ...credentials }) {
    const response = await authApi.login(credentials);
    if (response?.accessToken) return persistSession(response, remember);
    return { ...response, remember };
  },

  async completeLogin({ remember = false, ...credentials }) {
    const response = await authApi.login(credentials);
    return persistSession(response, remember);
  },

  async completePrivySignup({ email, identityToken, remember = false }) {
    const response = await authApi.completePrivySignup({ email, identityToken });
    return persistSession(response, remember);
  },

  async logout() {
    useAuthStore.getState().clearSession();
    queryClient.clear();
  },
};
