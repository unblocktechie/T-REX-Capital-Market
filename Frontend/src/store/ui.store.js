import { create } from 'zustand';

export const useUiStore = create((set) => ({
  pendingRequests: 0,
  sidebarOpen: false,
  sidebarCollapsed: false,
  beginRequest: () => set((state) => ({ pendingRequests: state.pendingRequests + 1 })),
  endRequest: () => set((state) => ({ pendingRequests: Math.max(0, state.pendingRequests - 1) })),
  resetRequests: () => set({ pendingRequests: 0 }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
