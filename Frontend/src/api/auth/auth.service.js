import { authApi } from './auth.api';
import { normalizeAuthSession } from './auth.mapper';
import { useAuthStore } from '@/store/auth.store';
import { queryClient } from '@/lib/queryClient';

export const authService = {
  async login({ remember = false, ...credentials }) {
    const response = await authApi.login(credentials);
    const session = normalizeAuthSession(response);
    useAuthStore.getState().setSession({ ...session, remember });
    return session;
  },

  async logout() {
    useAuthStore.getState().clearSession();
    queryClient.clear();
  },
};
