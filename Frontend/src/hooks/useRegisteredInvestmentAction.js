import { useCallback, useEffect, useMemo, useState } from 'react';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { isApplicationPurchaseReady } from '@/utils/investmentPurchase';

export function useRegisteredInvestmentAction(interestUid) {
  const [application, setApplication] = useState(null);
  const [offering, setOffering] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!interestUid) {
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const detail = await investorMarketplaceService.getApplicationDetail(interestUid);
      const nextApplication = detail.application || null;
      setApplication(nextApplication);
      setHistory(detail.history || null);

      if (nextApplication?.id) {
        try {
          const nextOffering = await investorMarketplaceService.getOffering(nextApplication.id);
          setOffering(nextOffering || null);
        } catch {
          setOffering(null);
        }
      } else {
        setOffering(null);
      }

      return detail;
    } catch (nextError) {
      setApplication(null);
      setOffering(null);
      setHistory(null);
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [interestUid]);

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
