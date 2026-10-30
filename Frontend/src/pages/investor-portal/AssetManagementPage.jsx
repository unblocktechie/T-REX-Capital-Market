import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Coins, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Card } from '@/components/ui/Card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { getErrorMessage } from '@/utils/error';
import { cn } from '@/utils/cn';

const loadPurchaseTokenPage = () => import('./PurchaseTokenPage');
const loadSendTokenPage = () => import('./SendTokenPage');
const loadRedeemTokenPage = () => import('./RedeemTokenPage');

const PurchaseTokenPage = lazy(loadPurchaseTokenPage);
const SendTokenPage = lazy(loadSendTokenPage);
const RedeemTokenPage = lazy(loadRedeemTokenPage);

const TABS = Object.freeze([
  { id: 'invest', label: 'Invest', icon: Coins },
  { id: 'send', label: 'Send', icon: Send },
  { id: 'redeem', label: 'Redeem', icon: RotateCcw },
]);

const normalizeStatus = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const interestUidOf = (application) => String(
  application?.interestUid
  || application?.interest?.interestUid
  || application?.id
  || '',
).trim();

const tokenUidOf = (application) => String(
  application?.tokenUid
  || application?.interest?.tokenUid
  || application?.id
  || '',
).trim();

const isRegisteredApplication = (application) => {
  const interestStatus = normalizeStatus(application?.interest?.status);
  if (interestStatus) return ['registered', 'readytoinvest', 'verifiedholder'].includes(interestStatus);

  // API-backed Registered interests are mapped to ready_to_invest. The
  // verified_holder value keeps the existing local/mock holder flow usable.
  return ['registered', 'readytoinvest', 'verifiedholder'].includes(
    normalizeStatus(application?.status),
  );
};

function OperationLoadingState() {
  return (
    <div className="page-stack investor-token-action-page asset-management-operation-loading" aria-label="Loading asset operation">
      <div className="investor-token-action-loading" />
      <div className="investor-token-action-loading investor-token-action-loading--tall" />
    </div>
  );
}

export default function AssetManagementPage() {
  useDocumentTitle('Manage Investments');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedInterestUid = String(searchParams.get('interestUid') || '').trim();
  const requestedTokenUid = String(searchParams.get('tokenUid') || '').trim();
  const [applications, setApplications] = useState([]);
  const activeTab = TABS.some((tab) => tab.id === searchParams.get('tab'))
    ? searchParams.get('tab') : 'invest';

  const changeTab = (tab) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('tab', tab);
      if (resolvedInterestUid) {
        next.set('interestUid', resolvedInterestUid);
        next.delete('tokenUid');
      }
      return next;
    });
  };

  const changeInvestment = (interestUid) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('interestUid', interestUid);
      next.delete('tokenUid');
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    // Warm the other operation chunks after the main page becomes interactive.
    // This removes the first-click code-split pause when moving between Invest,
    // Send and Redeem without increasing the critical startup work.
    const preload = () => {
      void Promise.allSettled([
        loadPurchaseTokenPage(),
        loadSendTokenPage(),
        loadRedeemTokenPage(),
      ]);
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(preload, { timeout: 1_200 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(preload, 350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    investorMarketplaceService
      .listApplications()
      .then((items) => {
        if (active) setApplications(Array.isArray(items) ? items : []);
      })
      .catch((error) => {
        if (active) {
          setApplications([]);
          setLoadError(getErrorMessage(error, 'Unable to load your approved investments.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const registeredApplications = useMemo(
    () => applications.filter(isRegisteredApplication).filter((application) => interestUidOf(application)),
    [applications],
  );

  const tokenOptions = useMemo(
    () => registeredApplications.map((application) => ({
      value: interestUidOf(application),
      label: [application.symbol, application.name].filter(Boolean).join(' · ') || 'Approved investment',
      description: [application.issuer, 'Approved'].filter(Boolean).join(' · '),
    })),
    [registeredApplications],
  );

  const requestedTokenInterestUid = requestedTokenUid
    ? interestUidOf(registeredApplications.find((application) => tokenUidOf(application) === requestedTokenUid))
    : '';

  // Never silently switch to another investment when a deep link requests a
  // specific one. Eligibility and access are still checked by the operation.
  const hasExplicitSelection = Boolean(requestedInterestUid || requestedTokenUid);
  const resolvedInterestUid = requestedInterestUid
    ? (tokenOptions.some((option) => option.value === requestedInterestUid) ? requestedInterestUid : '')
    : requestedTokenUid
      ? requestedTokenInterestUid
      : tokenOptions[0]?.value || '';
  const selectionUnavailable = hasExplicitSelection && !resolvedInterestUid;

  const selectedApplication = registeredApplications.find(
    (application) => interestUidOf(application) === resolvedInterestUid,
  ) || null;

  const renderOperation = () => {
    if (!resolvedInterestUid) return null;

    const sharedProps = {
      interestUid: resolvedInterestUid,
      embedded: true,
      initialApplication: selectedApplication,
    };

    if (activeTab === 'send') {
      return <SendTokenPage key={`${resolvedInterestUid}-send`} {...sharedProps} />;
    }
    if (activeTab === 'redeem') {
      return <RedeemTokenPage key={`${resolvedInterestUid}-redeem`} {...sharedProps} />;
    }
    return <PurchaseTokenPage key={`${resolvedInterestUid}-invest`} {...sharedProps} />;
  };

  return (
    <div className="page-stack investor-asset-management-page">
      <header className="asset-management-header">
        <div>
          <span className="eyebrow">Your approved investments</span>
          <h1>Manage Investments</h1>
          <p>Choose an investment, then invest, send units to another approved investor, or redeem your units.</p>
        </div>
        <span className="asset-management-header__status">
          <ShieldCheck size={17} /> Approved investments only
        </span>
      </header>

      <Card className="asset-management-controls">
        <div className="asset-management-token-selector">
          <div className="asset-management-token-selector__label">
            <span>Selected investment</span>
            <small>{loading ? 'Loading approved investments…' : `${tokenOptions.length} approved investment${tokenOptions.length === 1 ? '' : 's'}`}</small>
          </div>
          <MarketplaceDropdown
            value={resolvedInterestUid}
            options={tokenOptions}
            onChange={changeInvestment}
            icon={ArrowDownUp}
            ariaLabel="Select an approved investment"
            placeholder={loading ? 'Loading investments…' : 'Select an investment'}
            disabled={loading || !tokenOptions.length}
            className="asset-management-token-dropdown"
            menuClassName="asset-management-token-dropdown__menu"
            portal
          />
        </div>

        <div className="asset-management-tabs" role="tablist" aria-label="Asset operations">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn('asset-management-tab', selected && 'is-active')}
                onClick={() => changeTab(tab.id)}
                disabled={!resolvedInterestUid}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="asset-management-action-guide" role="status">
          <strong>{activeTab === 'invest' ? 'Invest' : activeTab === 'send' ? 'Send units' : 'Redeem units'}</strong>
          <span>
            {activeTab === 'invest'
              ? 'Choose how many units to buy. If payment-token approval is needed, you will complete it once before investing.'
              : activeTab === 'send'
                ? 'Enter the approved recipient wallet and amount. We check eligibility before your wallet asks you to confirm.'
                : 'Choose how many units to redeem. The issuer reviews your request and signs the final redemption from the organization wallet when it is ready.'}
          </span>
        </div>
      </Card>

      {loading ? (
        <OperationLoadingState />
      ) : loadError ? (
        <Card className="asset-management-state-card" role="alert">
          <ShieldCheck size={29} />
          <h2>Your approved investments are unavailable</h2>
          <p>{loadError}</p>
        </Card>
      ) : !resolvedInterestUid ? (
        <Card className="asset-management-state-card" role={selectionUnavailable ? 'alert' : undefined}>
          <ShieldCheck size={29} />
          <h2>{selectionUnavailable ? 'Selected investment is unavailable' : 'No approved investments yet'}</h2>
          <p>{selectionUnavailable
            ? 'This investment is not in your approved investments. Check your application status or choose another approved investment.'
            : 'An investment will appear here after the issuer approves your application and enables your access.'}</p>
        </Card>
      ) : (
        <section
          className="asset-management-operation"
          aria-label={`${activeTab} ${selectedApplication?.symbol || 'selected token'}`}
        >
          <Suspense fallback={<OperationLoadingState />}>
            {renderOperation()}
          </Suspense>
        </section>
      )}
    </div>
  );
}
