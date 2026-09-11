import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Coins, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Card } from '@/components/ui/Card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { getErrorMessage } from '@/utils/error';
import { cn } from '@/utils/cn';

const PurchaseTokenPage = lazy(() => import('./PurchaseTokenPage'));
const SendTokenPage = lazy(() => import('./SendTokenPage'));
const RedeemTokenPage = lazy(() => import('./RedeemTokenPage'));

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
  useDocumentTitle('Manage Tokens');
  const [searchParams] = useSearchParams();
  const requestedInterestUid = String(searchParams.get('interestUid') || '').trim();
  const requestedTokenUid = String(searchParams.get('tokenUid') || '').trim();
  const [applications, setApplications] = useState([]);
  const [selectedInterestUid, setSelectedInterestUid] = useState('');
  const [activeTab, setActiveTab] = useState('invest');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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
          setLoadError(getErrorMessage(error, 'Unable to load your registered assets.'));
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
      label: [application.symbol, application.name].filter(Boolean).join(' · ') || 'Registered token',
      description: [application.issuer, 'Registered'].filter(Boolean).join(' · '),
    })),
    [registeredApplications],
  );

  const requestedTokenInterestUid = requestedTokenUid
    ? interestUidOf(registeredApplications.find((application) => tokenUidOf(application) === requestedTokenUid))
    : '';

  const resolvedInterestUid = tokenOptions.some((option) => option.value === selectedInterestUid)
    ? selectedInterestUid
    : tokenOptions.some((option) => option.value === requestedInterestUid)
      ? requestedInterestUid
      : tokenOptions.some((option) => option.value === requestedTokenInterestUid)
        ? requestedTokenInterestUid
        : tokenOptions[0]?.value || '';

  const selectedApplication = registeredApplications.find(
    (application) => interestUidOf(application) === resolvedInterestUid,
  ) || null;

  const renderOperation = () => {
    if (!resolvedInterestUid) return null;

    const sharedProps = {
      interestUid: resolvedInterestUid,
      embedded: true,
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
          <span className="eyebrow">Registered asset workspace</span>
          <h1>Manage Tokens</h1>
          <p>Select a token you are approved to hold, then buy more, send tokens, or request a redemption.</p>
        </div>
        <span className="asset-management-header__status">
          <ShieldCheck size={17} /> Registered assets only
        </span>
      </header>

      <Card className="asset-management-controls">
        <div className="asset-management-token-selector">
          <div className="asset-management-token-selector__label">
            <span>Selected token</span>
            <small>{loading ? 'Loading registered assets…' : `${tokenOptions.length} registered token${tokenOptions.length === 1 ? '' : 's'}`}</small>
          </div>
          <MarketplaceDropdown
            value={resolvedInterestUid}
            options={tokenOptions}
            onChange={setSelectedInterestUid}
            icon={ArrowDownUp}
            ariaLabel="Select a registered token"
            placeholder={loading ? 'Loading tokens…' : 'Select a registered token'}
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
                onClick={() => setActiveTab(tab.id)}
                disabled={!resolvedInterestUid}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <OperationLoadingState />
      ) : loadError ? (
        <Card className="asset-management-state-card" role="alert">
          <ShieldCheck size={29} />
          <h2>Registered assets are unavailable</h2>
          <p>{loadError}</p>
        </Card>
      ) : !resolvedInterestUid ? (
        <Card className="asset-management-state-card">
          <ShieldCheck size={29} />
          <h2>No registered assets yet</h2>
          <p>Tokens will appear here after the issuer approves your verified profile for an offering.</p>
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
