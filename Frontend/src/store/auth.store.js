import { create } from 'zustand';
import { tokenService } from '@/services/token.service';

export const useAuthStore = create((set, get) => ({
  user: null,
  status: 'checking',
  isAuthenticated: false,

  setSession: ({ user, accessToken, remember = false }) => {
    tokenService.setSession({ user, accessToken, remember });
    set({ user, isAuthenticated: true, status: 'authenticated' });
  },

  restoreSession: (session) => {
    if (!session?.accessToken || !session?.user) {
      set({ user: null, isAuthenticated: false, status: 'anonymous' });
      return;
    }
    set({ user: session.user, isAuthenticated: true, status: 'authenticated' });
  },

  setUser: (user) => {
    const currentSession = tokenService.getSession();
    if (currentSession?.accessToken) {
      tokenService.setSession({
        ...currentSession,
        user,
        remember: currentSession.remember,
      });
    }
    set({ user });
  },

  clearSession: () => {
    tokenService.clear();
    set({ user: null, isAuthenticated: false, status: 'anonymous' });
  },

  hasRole: (roles = []) => roles.includes(get().user?.role),

  hasPermission: (permissions = []) =>
    permissions.every((permission) => get().user?.permissions?.includes(permission)),
}));
