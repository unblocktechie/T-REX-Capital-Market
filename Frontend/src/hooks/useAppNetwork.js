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
import { organizationChainQueryKey, useOrganization } from '@/hooks/useOrganization';
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

export function useAppNetwork({ pathname = '', allowInvestorOnboardingNetworkSelection = true } = {}) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const isIssuer = user?.role === ROLES.issuer;
  const isInvestor = user?.role === ROLES.investor;
  // Draft onboarding is chain-agnostic until submission. Unlike an existing
  // token/investor identity, a draft may choose any supported public network
  // without making an unlock request or discarding its saved form sections.
  const isOnboardingDraftRoute =
    (isIssuer && [
      ROUTES.organizationCompany,
      ROUTES.organizationJurisdiction,
      ROUTES.organizationUbo,
      ROUTES.organizationDocuments,
      ROUTES.organizationReview,
    ].includes(pathname)) ||
    (isInvestor && allowInvestorOnboardingNetworkSelection && pathname === ROUTES.investors);
  const publicChains = usePublicChains();
  const myChains = useMyChains({
    enabled: Boolean(isAuthenticated && (isIssuer || isInvestor)),
    retry: false,
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
  // Refuse additional unlock requests when the issuer's token state cannot be
  // verified. This guard also applies to the header's network-access dropdown.
  const isNetworkUnlockBlocked = Boolean(
    isNetworkLocked || isNetworkLockLoading ||
    (isIssuer && hasIssuerChainSelection && issuerToken.isError),
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

  // A submitted investor has already picked an onboarding chain. Keep that
  // backend-recorded chain distinct from a merely selected network: if the
  // chain-access cache has not caught up yet, the header must not offer a
  // redundant Unlock action for the investor's own onboarding network.
  const investorOnboardingChainUid = isInvestor &&
    ['SUBMITTED', 'APPROVED'].includes(String(investorProfile.state?.backendStatus || '').toUpperCase())
    ? String(
        investorProfile.state?.chainUid ||
        investorProfile.state?.wallet?.chainUid ||
        investorProfile.state?.investorProfile?.chainUid ||
        '',
      ).trim()
    : '';

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
    if (isOnboardingDraftRoute) return publicRows;

    const source = unlockedChains.length ? unlockedChains : [];
    const next = [...source];
    if (accountChain && !next.some((chain) => chain.chainId === accountChain.chainId)) next.unshift(accountChain);
    return next;
  }, [accountChain, isNetworkLocked, isOnboardingDraftRoute, lockedChain, publicRows, unlockedChains]);

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
    || (isOnboardingDraftRoute ? persistedValid : contextualChainId)
    || (isOnboardingDraftRoute ? contextualChainId : persistedValid)
    || accountChainId
    || fallbackUnlocked?.chainId
    || connectedSupportedChainId
    || (isOnboardingDraftRoute ? fallbackPublic?.chainId : null)
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
      isOnboardingDraftRoute ||
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
    isOnboardingDraftRoute,
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

    // Initial onboarding selection is only a local choice. Like the final
    // review selector, it must not depend on an identity/network unlock or a
    // chain runtime that may not exist until the application is approved.
    if (!isOnboardingDraftRoute) {
      await queryClient.fetchQuery(chainConfigQueryOptions(nextChain.chainUid));
    }

    const previousChainUid = activeChain?.chainUid || persistedChainUid || '';
    const chainChanged = Boolean(previousChainUid && previousChainUid !== nextChain.chainUid);
    if (chainChanged) await cancelChainScopedQueries(queryClient);

    if (chainChanged && isIssuer && isOnboardingDraftRoute) {
      // Organization draft fields are account-level, not tied to the network
      // chosen for the first ONCHAINID. Keep the saved sections visible while
      // the organization query switches to its new chain-specific cache key.
      const previousOrganization = queryClient.getQueryData(organizationChainQueryKey(previousChainUid));
      if (previousOrganization && !queryClient.getQueryData(organizationChainQueryKey(nextChain.chainUid))) {
        queryClient.setQueryData(organizationChainQueryKey(nextChain.chainUid), previousOrganization);
      }
    }

    setActiveChainId(user, nextChain.chainId, nextChain.chainUid);

    return true;
  };

  const hasEstablishedNetwork = Boolean(
    lockedChain || accountChain || unlockedChains.length || persistedValid || connectedSupportedChainId ||
    (isOnboardingDraftRoute && activeChain),
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
    investorOnboardingChainUid,
    isOnboardingDraftRoute,
    chooseChain,
    hasEstablishedNetwork,
    isNetworkLocked,
    isNetworkLockLoading,
    isNetworkUnlockBlocked,
    isNetworkAccessLoading: myChains.isPending,
    isNetworkAccessError: myChains.isError,
    refetchMyChains: myChains.refetch,
    lockedChainId,
    isLoading:
      publicChains.isPending ||
      myChains.isPending ||
      isNetworkLockLoading ||
      Boolean(activeChainUid && activeChainConfig.isPending),
  };
}
