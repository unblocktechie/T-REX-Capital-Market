import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const normalizeUserKey = (user) =>
  String(user?.userUid || user?.uid || user?.id || user?.email || 'current-user')
    .trim()
    .toLowerCase();

const normalizeChainId = (value) => {
  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
};

const normalizeChainUid = (value) => String(value || '').trim();

export const networkUserKey = normalizeUserKey;

export const useNetworkStore = create(
  persist(
    (set, get) => ({
      activeChainByUser: {},
      activeChainUidByUser: {},
      lockedChainByUser: {},
      lockedChainUidByUser: {},
      getActiveChainId: (user) => {
        const key = normalizeUserKey(user);
        return normalizeChainId(get().activeChainByUser[key]);
      },
      getActiveChainUid: (user) => {
        const key = normalizeUserKey(user);
        return normalizeChainUid(get().activeChainUidByUser[key]);
      },
      setActiveChainId: (user, chainId, chainUid = '') => {
        const key = normalizeUserKey(user);
        const normalized = normalizeChainId(chainId);
        const normalizedUid = normalizeChainUid(chainUid);
        const locked = normalizeChainId(get().lockedChainByUser[key]);

        if (locked && normalized !== locked) return false;

        const currentId = normalizeChainId(get().activeChainByUser[key]);
        const currentUid = normalizeChainUid(get().activeChainUidByUser[key]);
        const nextUid = normalized ? normalizedUid : '';

        // A repeated selection of the same backend chain is a no-op. Avoiding an
        // unnecessary Zustand update prevents every mounted chain-aware query from
        // re-rendering/refetching during wallet/network synchronization.
        if (currentId === normalized && currentUid === nextUid) return true;

        set((state) => {
          const ids = { ...state.activeChainByUser };
          const uids = { ...state.activeChainUidByUser };
          const previousId = normalizeChainId(ids[key]);
          if (normalized) ids[key] = normalized;
          else delete ids[key];

          if (normalized && normalizedUid) uids[key] = normalizedUid;
          else if (!normalized || (previousId && previousId !== normalized)) delete uids[key];

          return { activeChainByUser: ids, activeChainUidByUser: uids };
        });
        return true;
      },
      clearActiveChainId: (user) => {
        const key = normalizeUserKey(user);
        if (normalizeChainId(get().lockedChainByUser[key])) return false;
        set((state) => {
          const ids = { ...state.activeChainByUser };
          const uids = { ...state.activeChainUidByUser };
          delete ids[key];
          delete uids[key];
          return { activeChainByUser: ids, activeChainUidByUser: uids };
        });
        return true;
      },
      getLockedChainId: (user) => {
        const key = normalizeUserKey(user);
        return normalizeChainId(get().lockedChainByUser[key]);
      },
      lockChainId: (user, chainId, chainUid = '') => {
        const key = normalizeUserKey(user);
        const normalized = normalizeChainId(chainId);
        const normalizedUid = normalizeChainUid(chainUid);
        if (!normalized) return;
        if (
          normalizeChainId(get().lockedChainByUser[key]) === normalized &&
          normalizeChainId(get().activeChainByUser[key]) === normalized &&
          (!normalizedUid || normalizeChainUid(get().lockedChainUidByUser[key]) === normalizedUid)
        ) return;
        set((state) => ({
          activeChainByUser: {
            ...state.activeChainByUser,
            [key]: normalized,
          },
          activeChainUidByUser: normalizedUid
            ? { ...state.activeChainUidByUser, [key]: normalizedUid }
            : state.activeChainUidByUser,
          lockedChainByUser: {
            ...state.lockedChainByUser,
            [key]: normalized,
          },
          lockedChainUidByUser: normalizedUid
            ? { ...state.lockedChainUidByUser, [key]: normalizedUid }
            : state.lockedChainUidByUser,
        }));
      },
    }),
    {
      name: 'trex.active-network.v2',
      partialize: (state) => ({
        activeChainByUser: state.activeChainByUser,
        activeChainUidByUser: state.activeChainUidByUser,
        lockedChainByUser: state.lockedChainByUser,
        lockedChainUidByUser: state.lockedChainUidByUser,
      }),
    },
  ),
);
