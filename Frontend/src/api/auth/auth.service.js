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
  async login({ remember = false, ...credentials }) {
    const response = await authApi.login(credentials);
    return persistSession(response, remember);
  },

  async verifyEmail({ token }) {
    const response = await authApi.verifyEmail({ token });
    return persistSession(response, false);
  },

  async logout() {
    useAuthStore.getState().clearSession();
    queryClient.clear();
  },
};
