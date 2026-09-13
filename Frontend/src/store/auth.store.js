import { create } from 'zustand';
import { tokenService } from '@/services/token.service';

const initialSession = tokenService.getSession();

export const useAuthStore = create((set, get) => ({
  user: initialSession?.user || null,
  status: initialSession?.accessToken && initialSession?.user ? 'authenticated' : 'anonymous',
  isAuthenticated: Boolean(initialSession?.accessToken && initialSession?.user),

  setSession: ({ user, accessToken, tokenType = 'Bearer', expiresIn = null, remember = false }) => {
    tokenService.setSession({ user, accessToken, tokenType, expiresIn, remember });
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
