import { useCallback, useEffect, useMemo, useState } from 'react';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { useAuthStore } from '@/store/auth.store';
import { networkUserKey, useNetworkStore } from '@/store/network.store';
import { isApplicationPurchaseReady } from '@/utils/investmentPurchase';

// Keep the expensive, read-only action context warm while an investor moves
// between Invest / Send / Redeem. The cache is intentionally short lived: it
// removes duplicate tab-navigation reads without turning this into long-lived
// application state.
const ACTION_CONTEXT_TTL_MS = 30_000;
const actionContextCache = new Map();
const actionContextRequests = new Map();

const cacheKeyOf = (interestUid) => String(interestUid || '').trim();

const cachedContext = (key) => actionContextCache.get(key) || null;
const freshCachedContext = (key) => {
  const cached = cachedContext(key);
  if (!cached) return null;
  return Date.now() - cached.cachedAt <= ACTION_CONTEXT_TTL_MS ? cached : null;
};

const saveCachedContext = (key, value) => {
  const snapshot = { ...value, cachedAt: Date.now() };
  actionContextCache.set(key, snapshot);
  return snapshot;
};

export function useRegisteredInvestmentAction(interestUid, { initialApplication = null } = {}) {
  const user = useAuthStore((state) => state.user);
  const userKey = networkUserKey(user);
  const activeNetworkKey = useNetworkStore((state) => {
    const chainUid = String(state.activeChainUidByUser?.[userKey] || '').trim();
    const chainId = String(state.activeChainByUser?.[userKey] || '').trim();
    return chainUid || chainId || 'unselected';
  });
  const uid = cacheKeyOf(interestUid);
  // Action context contains investor-specific data, so cache it only inside the
  // current authenticated user + selected-network scope.
  const key = uid ? `${userKey}:${activeNetworkKey}:${uid}` : '';
  const initialCached = cachedContext(key);
  const [application, setApplication] = useState(
    () => initialApplication || initialCached?.application || null,
  );
  const [offering, setOffering] = useState(() => initialCached?.offering || null);
  const [history, setHistory] = useState(() => initialCached?.history || null);
  const [loading, setLoading] = useState(
    () => Boolean(key) && !initialCached && !initialApplication,
  );
  const [error, setError] = useState(null);

  const applySnapshot = useCallback((snapshot) => {
    setApplication(snapshot?.application || null);
    setOffering(snapshot?.offering || null);
    setHistory(snapshot?.history || null);
    setError(null);
    setLoading(false);
  }, []);

  const load = useCallback(async ({ force = false } = {}) => {
    if (!uid) {
      setApplication(null);
      setOffering(null);
      setHistory(null);
      setError(null);
      setLoading(false);
      return null;
    }

    const fresh = !force ? freshCachedContext(key) : null;
    if (fresh) {
      const snapshot = initialApplication
        ? { ...fresh, application: initialApplication }
        : fresh;
      applySnapshot(snapshot);
      return snapshot;
    }

    // A stale snapshot is still useful for rendering while it is refreshed in
    // the background. This prevents a full operation skeleton when switching
    // back to a recently visited tab.
    const stale = cachedContext(key);
    if (stale) {
      applySnapshot(stale);
    } else {
      // Never carry a previous user/network operation snapshot into a new
      // scope while the next context is loading.
      setApplication(initialApplication || null);
      setOffering(null);
      setHistory(null);
      // Asset Management already supplied enough registered-application data to
      // render the operation immediately. Enrich it in the background instead
      // of blocking the page behind another skeleton. Direct/deep links without
      // that seed still wait for their authoritative application request.
      setLoading(!initialApplication);
      setError(null);
    }

    let request = !force ? actionContextRequests.get(key) : null;
    if (!request) {
      request = (async () => {
        const seededApplication = initialApplication || stale?.application || null;
        let detail;
        let nextOffering = null;

        if (seededApplication?.id) {
          // Asset Management only exposes already-registered applications. Its
          // list response therefore already contains the authoritative readiness
          // state used by these actions, so a second interest-history request is
          // unnecessary. Enrich the token once and reuse the result across tabs.
          detail = { application: seededApplication, history: null };
          nextOffering = await investorMarketplaceService
            .getOffering(seededApplication.id, {
              interest: seededApplication.interest,
              includeEligibility: false,
            })
            .catch(() => null);
        } else {
          detail = await investorMarketplaceService.getApplicationDetail(uid);
          const nextApplication = detail?.application || null;
          if (nextApplication?.id) {
            nextOffering = await investorMarketplaceService
              .getOffering(nextApplication.id, { interest: nextApplication.interest })
              .catch(() => null);
          }
        }

        return saveCachedContext(key, {
          application: detail?.application || seededApplication || null,
          offering: nextOffering,
          history: detail?.history || null,
        });
      })();
      actionContextRequests.set(key, request);
    }

    try {
      const snapshot = await request;
      applySnapshot(snapshot);
      return snapshot;
    } catch (nextError) {
      // If a previously loaded snapshot exists, keep the operation usable and
      // let its own action-level requests surface any authoritative failures.
      // Only block the page when no usable action context has ever loaded.
      if (!cachedContext(key)) {
        setApplication(null);
        setOffering(null);
        setHistory(null);
        setError(nextError);
        setLoading(false);
      }
      return null;
    } finally {
      if (actionContextRequests.get(key) === request) {
        actionContextRequests.delete(key);
      }
    }
  }, [applySnapshot, initialApplication, key, uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const token = useMemo(() => {
    if (!application) return null;
    if (!offering) return application;
    return {
      ...application,
      ...offering,
      interestUid: application.interestUid || interestUid,
      interest: application.interest || offering.interest,
      submittedAt: application.submittedAt,
      updatedAt: application.updatedAt,
      decisionAt: application.decisionAt,
    };
  }, [application, interestUid, offering]);

  const ready = useMemo(
    () => isApplicationPurchaseReady(history, application),
    [application, history],
  );

  return { application, token, history, loading, error, ready, reload: load };
}
