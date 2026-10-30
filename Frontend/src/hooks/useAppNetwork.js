import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnection } from 'wagmi';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useAuth } from '@/hooks/useAuth';
import {
  chainConfigQueryOptions,
  useChainConfig,
  useMyChains,
  usePublicChains,
} from '@/hooks/useChains';
import { useInvestorProfileData } from '@/hooks/useInvestorProfileData';
import {
  getTokenRecordChainId,
  getTokenRecordChainUid,
  useMyToken,
} from '@/hooks/useMyToken';
import { useOrganization } from '@/hooks/useOrganization';
import { useNetworkStore, networkUserKey } from '@/store/network.store';
import { useUiStore } from '@/store/ui.store';
import { isTokenCreationLocked } from '@/utils/tokenCreationLock';

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const firstMatch = (chains, predicate) => chains.find(predicate) || null;

const CHAIN_SCOPED_QUERY_ROOTS = new Set([
  'dashboard',
  'investor',
  'investments',
  'marketplace',
  'portfolio',
  'transactions',
  'payment-tokens',
  'token-image',
  'sidebar-action-indicators',
  'organization',
  'tokens',
  'token-issuance',
]);

const isChainScopedQuery = (query) => {
  const key = Array.isArray(query?.queryKey) ? query.queryKey : [];
  return CHAIN_SCOPED_QUERY_ROOTS.has(String(key[0] || ''));
};

const cancelChainScopedQueries = (queryClient) =>
  queryClient.cancelQueries({ predicate: isChainScopedQuery });

export function useAppNetwork({ pathname = '' } = {}) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const isIssuer = user?.role === ROLES.issuer;
  const isInvestor = user?.role === ROLES.investor;
  const publicChains = usePublicChains();
  const myChains = useMyChains({
    enabled: Boolean(isAuthenticated && (isIssuer || isInvestor)),
    retry: false,
    // Keep an unlock initiated from the header (or another page) current until
    // the backend reports a final identity status.
    refetchInterval: (query) =>
      (query.state.data || []).some((chain) => chain.identityStatus === 'CREATING')
        ? 4_000
        : false,
  });
  const userKey = networkUserKey(user);
  const persistedChainId = useNetworkStore((state) => state.activeChainByUser[userKey] || null);
  const persistedChainUid = useNetworkStore((state) => state.activeChainUidByUser[userKey] || '');
  const hasIssuerChainSelection = Boolean(persistedChainUid || numberOrNull(persistedChainId));
  const issuerToken = useMyToken({
    enabled: Boolean(isAuthenticated && isIssuer && hasIssuerChainSelection),
  });
  const organizationQuery = useOrganization({
    enabled: Boolean(isIssuer && hasIssuerChainSelection),
  });
  const { organization } = organizationQuery;
  const persistedLockedChainId = useNetworkStore(
    (state) => state.lockedChainByUser[userKey] || null,
  );
  const setActiveChainId = useNetworkStore((state) => state.setActiveChainId);
  const lockChainId = useNetworkStore((state) => state.lockChainId);
  const investorProfile = useInvestorProfileData({
    enabled: Boolean(
      isInvestor &&
      pathname !== ROUTES.investors &&
      (persistedChainUid || persistedChainId),
    ),
  });
  const connection = useConnection();
  const walletRequiredChainId = useUiStore((state) => state.walletRequiredChainId);

  const publicRows = publicChains.data || [];
  const mineRows = myChains.data || [];

  const tokenLockedChainId = useMemo(() => {
    if (!isIssuer || !isTokenCreationLocked(issuerToken.token)) return null;

    const direct = getTokenRecordChainId(issuerToken.token);
    if (direct) return direct;

    const chainUid = getTokenRecordChainUid(issuerToken.token);
    if (!chainUid) return null;

    return (
      firstMatch(publicRows, (chain) => chain.chainUid === chainUid)?.chainId ||
      firstMatch(mineRows, (chain) => chain.chainUid === chainUid)?.chainId ||
      web3Config.getChainRecordByUid(chainUid)?.chainId ||
      null
    );
  }, [isIssuer, issuerToken.token, mineRows, publicRows]);

  // Once token creation enters its locked lifecycle, the selected deployment
  // network is authoritative for the issuer. This prevents switching to or
  // unlocking another chain while creation is pending, recovering, failed, or
  // already completed. Persist the lock locally for refresh/login behavior.
  const lockedChainId = isIssuer
    ? tokenLockedChainId || numberOrNull(persistedLockedChainId)
    : null;
  const isNetworkLocked = Boolean(lockedChainId);
  const isNetworkLockLoading = Boolean(
    isIssuer &&
    isAuthenticated &&
    hasIssuerChainSelection &&
    !lockedChainId &&
    issuerToken.isPending,
  );
  // Match the safety guard used on Network Access. The menu may remain open
  // while switching is locked, but must never bypass the issuer token guard.
  const isNetworkUnlockBlocked = Boolean(
    isIssuer && (
      isNetworkLocked ||
      isNetworkLockLoading ||
      (hasIssuerChainSelection && issuerToken.isError)
    ),
  );

  const accountChainId = useMemo(() => {
    if (isIssuer) {
      const direct = numberOrNull(organization?.walletChainId || organization?.chainId);
      if (direct) return direct;
      const chainUid = organization?.chainUid || organization?.walletChainUid;
      if (chainUid) return firstMatch(publicRows, (chain) => chain.chainUid === chainUid)?.chainId || null;
    }

    if (isInvestor) {
      const state = investorProfile.state;
      const direct = numberOrNull(state?.wallet?.chainId || state?.chainId || state?.investorProfile?.chainId);
      if (direct) return direct;
      const chainUid = state?.wallet?.chainUid || state?.chainUid || state?.investorProfile?.chainUid;
      if (chainUid) return firstMatch(publicRows, (chain) => chain.chainUid === chainUid)?.chainId || null;
    }

    return null;
  }, [isIssuer, isInvestor, organization, investorProfile.state, publicRows]);

  const unlockedChains = useMemo(
    () => mineRows.filter((chain) => chain.isUnlocked || chain.identityStatus === 'CREATED'),
    [mineRows],
  );

  const accountChain = useMemo(
    () => firstMatch(publicRows, (chain) => chain.chainId === accountChainId)
      || firstMatch(mineRows, (chain) => chain.chainId === accountChainId),
    [accountChainId, mineRows, publicRows],
  );

  const lockedChain = useMemo(() => {
    if (!lockedChainId) return null;
    return firstMatch(publicRows, (chain) => chain.chainId === lockedChainId)
      || firstMatch(mineRows, (chain) => chain.chainId === lockedChainId)
      || web3Config.getChainRecordById(lockedChainId)
      || null;
  }, [lockedChainId, mineRows, publicRows]);

  const selectableChains = useMemo(() => {
    if (isNetworkLocked) return lockedChain ? [lockedChain] : [];

    const source = unlockedChains.length ? unlockedChains : [];
    const next = [...source];
    if (accountChain && !next.some((chain) => chain.chainId === accountChain.chainId)) next.unshift(accountChain);
    return next;
  }, [accountChain, isNetworkLocked, lockedChain, unlockedChains]);

  const contextualChainId = numberOrNull(walletRequiredChainId);
  const persistedValid = numberOrNull(persistedChainId)
    && (selectableChains.some((chain) => chain.chainId === Number(persistedChainId)) || !selectableChains.length)
    ? Number(persistedChainId)
    : null;
  const connectedSupportedChainId = numberOrNull(connection.chainId)
    && publicRows.some((chain) => chain.chainId === Number(connection.chainId))
    ? Number(connection.chainId)
    : null;
  const fallbackUnlocked = unlockedChains.find((chain) => chain.isDefault) || unlockedChains[0] || null;
  const fallbackPublic = publicRows.find((chain) => chain.isDefault) || publicRows[0] || null;

  // During the token-deployment route, the asset's immutable deployment chain is
  // the authoritative UI/wallet context. A stale issuer network lock can otherwise
  // make the navbar appear to jump to another network between transaction 1 and the
  // mandatory follow-up transactions, which is especially confusing while the
  // wallet is still completing the original asset setup.
  const deploymentContextChainId =
    pathname === ROUTES.tokenDeploying ? contextualChainId : null;
  const activeChainId = deploymentContextChainId
    || lockedChainId
    || contextualChainId
    || persistedValid
    || accountChainId
    || fallbackUnlocked?.chainId
    || connectedSupportedChainId
    || null;

  const activeChain = firstMatch(publicRows, (chain) => chain.chainId === activeChainId)
    || firstMatch(mineRows, (chain) => chain.chainId === activeChainId)
    || lockedChain
    || accountChain
    || null;
  const activeChainUid = activeChain?.chainUid || persistedChainUid || '';
  const activeChainConfig = useChainConfig(activeChainUid, {
    enabled: Boolean(activeChainUid),
    retry: 1,
  });

  const accountContextLoading = isIssuer
    ? organizationQuery.isLoading
    : isInvestor
      ? investorProfile.isPending
      : false;
  const accessContextLoading = Boolean(myChains.isPending);

  useEffect(() => {
    if (!user || !isIssuer || !tokenLockedChainId) return;
    if (
      numberOrNull(persistedLockedChainId) !== tokenLockedChainId ||
      numberOrNull(persistedChainId) !== tokenLockedChainId
    ) {
      const chainUid =
        firstMatch(publicRows, (chain) => chain.chainId === tokenLockedChainId)?.chainUid ||
        firstMatch(mineRows, (chain) => chain.chainId === tokenLockedChainId)?.chainUid ||
        web3Config.getChainRecordById(tokenLockedChainId)?.chainUid ||
        '';
      lockChainId(user, tokenLockedChainId, chainUid);
    }
  }, [
    tokenLockedChainId,
    isIssuer,
    lockChainId,
    mineRows,
    persistedChainId,
    persistedLockedChainId,
    publicRows,
    user,
  ]);

  useEffect(() => {
    if (
      !user ||
      isNetworkLocked ||
      isNetworkLockLoading ||
      contextualChainId ||
      numberOrNull(persistedChainId)
    ) return;

    // Prefer the network recorded by onboarding/account data. Do not persist an
    // arbitrary connected wallet chain while account/network-access queries are
    // still loading; that race was what allowed Sepolia to become sticky after
    // an ARC onboarding submission.
    const resolvedAccountChoice =
      accountChainId ||
      fallbackUnlocked?.chainId ||
      (!accessContextLoading && isIssuer ? fallbackPublic?.chainId : null) ||
      null;
    if (resolvedAccountChoice) {
      const row = firstMatch(publicRows, (chain) => chain.chainId === resolvedAccountChoice)
        || firstMatch(mineRows, (chain) => chain.chainId === resolvedAccountChoice);
      setActiveChainId(user, resolvedAccountChoice, row?.chainUid || '');
      return;
    }

    if (!accountContextLoading && !accessContextLoading && connectedSupportedChainId) {
      const row = firstMatch(publicRows, (chain) => chain.chainId === connectedSupportedChainId);
      setActiveChainId(user, connectedSupportedChainId, row?.chainUid || '');
    }
  }, [
    accessContextLoading,
    accountChainId,
    accountContextLoading,
    connectedSupportedChainId,
    contextualChainId,
    fallbackPublic?.chainId,
    fallbackUnlocked?.chainId,
    isIssuer,
    isNetworkLockLoading,
    isNetworkLocked,
    mineRows,
    persistedChainId,
    publicRows,
    setActiveChainId,
    user,
  ]);

  useEffect(() => {
    if (
      !user ||
      isNetworkLocked ||
      isNetworkLockLoading ||
      contextualChainId ||
      !persistedChainId ||
      !selectableChains.length
    ) return;
    if (!selectableChains.some((chain) => chain.chainId === Number(persistedChainId))) {
      const replacement = accountChainId || fallbackUnlocked?.chainId || selectableChains[0]?.chainId;
      const row = selectableChains.find((chain) => chain.chainId === replacement)
        || firstMatch(publicRows, (chain) => chain.chainId === replacement);
      if (replacement) setActiveChainId(user, replacement, row?.chainUid || '');
    }
  }, [
    accountChainId,
    contextualChainId,
    fallbackUnlocked?.chainId,
    isNetworkLockLoading,
    isNetworkLocked,
    persistedChainId,
    publicRows,
    selectableChains,
    setActiveChainId,
    user,
  ]);

  useEffect(() => {
    if (!user || !activeChain?.chainId || !activeChain?.chainUid) return;
    if (Number(persistedChainId) === activeChain.chainId && persistedChainUid === activeChain.chainUid) return;
    setActiveChainId(user, activeChain.chainId, activeChain.chainUid);
  }, [activeChain, persistedChainId, persistedChainUid, setActiveChainId, user]);

  useEffect(() => {
    if (
      !user ||
      (!isIssuer && !isInvestor) ||
      isNetworkLocked ||
      isNetworkLockLoading ||
      !connectedSupportedChainId ||
      !mineRows.length
    ) return undefined;

    const walletChain = mineRows.find(
      (chain) =>
        chain.chainId === connectedSupportedChainId &&
        (chain.isUnlocked || chain.identityStatus === 'CREATED'),
    );
    if (!walletChain?.chainUid || walletChain.chainUid === activeChainUid) return undefined;

    let cancelled = false;
    queryClient.fetchQuery(chainConfigQueryOptions(walletChain.chainUid))
      .then(async () => {
        if (cancelled) return;
        await cancelChainScopedQueries(queryClient);
        if (cancelled) return;
        setActiveChainId(user, walletChain.chainId, walletChain.chainUid);
      })
      .catch(() => {
        // The selected chain remains unchanged when its browser-safe runtime
        // configuration cannot be loaded.
      });

    return () => { cancelled = true; };
  }, [
    activeChainUid,
    connectedSupportedChainId,
    isInvestor,
    isIssuer,
    isNetworkLockLoading,
    isNetworkLocked,
    mineRows,
    queryClient,
    setActiveChainId,
    user,
  ]);

  const chooseChain = async (chainId) => {
    if (!user || isNetworkLocked || isNetworkLockLoading) return false;
    const nextChain = firstMatch(selectableChains, (chain) => chain.chainId === Number(chainId))
      || firstMatch(publicRows, (chain) => chain.chainId === Number(chainId));
    if (!nextChain?.chainUid) return false;

    await queryClient.fetchQuery(chainConfigQueryOptions(nextChain.chainUid));

    const previousChainUid = activeChain?.chainUid || persistedChainUid || '';
    const chainChanged = Boolean(previousChainUid && previousChainUid !== nextChain.chainUid);
    if (chainChanged) await cancelChainScopedQueries(queryClient);

    setActiveChainId(user, nextChain.chainId, nextChain.chainUid);

    return true;
  };

  const hasEstablishedNetwork = Boolean(
    lockedChain || accountChain || unlockedChains.length || persistedValid || connectedSupportedChainId,
  );

  return {
    activeChain,
    activeChainConfig,
    activeChainId: activeChain?.chainId || activeChainId,
    activeChainUid,
    accountChain,
    accountChainId,
    selectableChains,
    publicChains: publicRows,
    myChains: mineRows,
    refetchMyChains: myChains.refetch,
    isNetworkAccessLoading: myChains.isPending,
    isNetworkAccessError: myChains.isError,
    isNetworkUnlockBlocked,
    chooseChain,
    hasEstablishedNetwork,
    isNetworkLocked,
    isNetworkLockLoading,
    lockedChainId,
    isLoading:
      publicChains.isPending ||
      myChains.isPending ||
      isNetworkLockLoading ||
      Boolean(activeChainUid && activeChainConfig.isPending),
  };
}
