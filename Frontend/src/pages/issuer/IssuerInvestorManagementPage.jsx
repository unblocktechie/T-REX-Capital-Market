import { useEffect, useState } from 'react';
import { ArrowLeftRight, FileClock, UsersRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import IssuerInvestorDirectoryPage from './IssuerInvestorDirectoryPage';
import IssuerInvestorsPage from './IssuerInvestorsPage';
import IssuerRedemptionsPage from './IssuerRedemptionsPage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSidebarActionIndicators } from '@/hooks/useSidebarActionIndicators';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import {
  INVESTOR_MANAGEMENT_TABS,
  resolveInvestorManagementTab,
} from '@/utils/issuerInvestorManagementTabs';

const TAB_ICONS = {
  investors: UsersRound,
  'investment-requests': FileClock,
  'redemption-requests': ArrowLeftRight,
};

export default function IssuerInvestorManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveInvestorManagementTab(searchParams.get('tab'));
  // Share the sidebar's cached, network-scoped actionable counts so tabs show
  // exactly where the issuer has work to review. Investor-directory totals are
  // not notifications, so only the two request tabs receive action badges.
  const { data: actionCounts } = useSidebarActionIndicators(ROLES.issuer);
  const tabAttentionCounts = {
    'investment-requests': Math.max(0, Number(actionCounts?.[ROUTES.investors]) || 0),
    'redemption-requests': Math.max(0, Number(actionCounts?.[ROUTES.issuerRedemptions]) || 0),
  };
  // Mount each existing screen once, then hide rather than unmount it. This keeps
  // its own search, filters, page number, in-flight loading and pending actions.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  useDocumentTitle('Investor Management');

  useEffect(() => {
    setVisitedTabs((previous) => {
      if (previous.has(activeTab)) return previous;
      const next = new Set(previous);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const selectTab = (id) => {
    if (id === activeTab) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { preventScrollReset: true });
  };

  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % INVESTOR_MANAGEMENT_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + INVESTOR_MANAGEMENT_TABS.length) % INVESTOR_MANAGEMENT_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = INVESTOR_MANAGEMENT_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = INVESTOR_MANAGEMENT_TABS[nextIndex];
    selectTab(nextTab.id);
    event.currentTarget.parentElement?.querySelector(`#issuer-investor-tab-${nextTab.id}`)?.focus();
  };

  return (
    <section className="page-stack issuer-investor-management" aria-label="Investor Management">
      <h1 className="issuer-investor-management__heading">Investor Management</h1>
      <div className="issuer-investor-management__tabs" role="tablist" aria-label="Investor management sections">
        {INVESTOR_MANAGEMENT_TABS.map((tab, index) => {
          const TabIcon = TAB_ICONS[tab.id];
          return (
            <button
              type="button"
              role="tab"
              key={tab.id}
              id={`issuer-investor-tab-${tab.id}`}
              className={`issuer-investor-management__tab${activeTab === tab.id ? ' is-active' : ''}${tabAttentionCounts[tab.id] > 0 ? ' has-attention' : ''}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`issuer-investor-panel-${tab.id}`}
              aria-label={tabAttentionCounts[tab.id] > 0
                ? `${tab.label}, ${tabAttentionCounts[tab.id]} ${tabAttentionCounts[tab.id] === 1 ? 'item needs' : 'items need'} your attention`
                : tab.label}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <TabIcon className="issuer-investor-management__tab-icon" aria-hidden="true" />
              <span>{tab.label}</span>
              {tabAttentionCounts[tab.id] > 0 ? (
                <span className="issuer-investor-management__attention-count" aria-hidden="true">
                  {tabAttentionCounts[tab.id] > 99 ? '99+' : tabAttentionCounts[tab.id]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {INVESTOR_MANAGEMENT_TABS.map((tab) => (
        <div
          key={tab.id}
          id={`issuer-investor-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`issuer-investor-tab-${tab.id}`}
          className="issuer-investor-management__panel"
          hidden={activeTab !== tab.id}
          tabIndex={0}
        >
          {(visitedTabs.has(tab.id) || tab.id === activeTab) ? (
            tab.id === 'investors' ? <IssuerInvestorDirectoryPage embedded />
              : tab.id === 'investment-requests' ? <IssuerInvestorsPage embedded />
                : <IssuerRedemptionsPage embedded />
          ) : null}
        </div>
      ))}
    </section>
  );
}
