import { useEffect, useState } from 'react';
import { ClipboardList, Mail, WalletCards } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import MyApplicationsPage from './MyApplicationsPage';
import PortfolioPage from './PortfolioPage';
import InvitationsPage from './InvitationsPage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSidebarActionIndicators } from '@/hooks/useSidebarActionIndicators';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { MY_INVESTMENT_TABS, resolveMyInvestmentTab } from '@/utils/investorMyInvestmentTabs';

const TAB_ICONS = {
  'my-application': ClipboardList,
  portfolio: WalletCards,
  invitation: Mail,
};

export default function InvestorMyInvestmentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveMyInvestmentTab(searchParams.get('tab'));
  const { data: actionCounts } = useSidebarActionIndicators(ROLES.investor);
  const tabAttentionCounts = {
    'my-application': Math.max(0, Number(actionCounts?.[ROUTES.applications]) || 0),
    invitation: Math.max(0, Number(actionCounts?.[ROUTES.invitations]) || 0),
  };
  // Preserve each previously opened screen's own search, filters, page and requests.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  useDocumentTitle('My Investment');

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
    const params = new URLSearchParams(searchParams);
    params.set('tab', id);
    setSearchParams(params, { preventScrollReset: true });
  };

  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % MY_INVESTMENT_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + MY_INVESTMENT_TABS.length) % MY_INVESTMENT_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = MY_INVESTMENT_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = MY_INVESTMENT_TABS[nextIndex];
    selectTab(nextTab.id);
    event.currentTarget.parentElement?.querySelector(`#investor-my-investment-tab-${nextTab.id}`)?.focus();
  };

  return (
    <section className="page-stack issuer-investor-management investor-my-investment" aria-label="My Investment">
      <h1 className="issuer-investor-management__heading">My Investment</h1>
      <div className="issuer-investor-management__tabs" role="tablist" aria-label="My Investment sections">
        {MY_INVESTMENT_TABS.map((tab, index) => {
          const TabIcon = TAB_ICONS[tab.id];
          const count = tabAttentionCounts[tab.id] || 0;
          return (
            <button
              type="button"
              role="tab"
              key={tab.id}
              id={`investor-my-investment-tab-${tab.id}`}
              className={`issuer-investor-management__tab${activeTab === tab.id ? ' is-active' : ''}${count > 0 ? ' has-attention' : ''}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`investor-my-investment-panel-${tab.id}`}
              aria-label={count ? `${tab.label}, ${count} ${count === 1 ? 'item needs' : 'items need'} your attention` : tab.label}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <TabIcon className="issuer-investor-management__tab-icon" aria-hidden="true" />
              <span>{tab.label}</span>
              {count > 0 ? (
                <span className="issuer-investor-management__attention-count" aria-hidden="true">
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {MY_INVESTMENT_TABS.map((tab) => (
        <div
          key={tab.id}
          id={`investor-my-investment-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`investor-my-investment-tab-${tab.id}`}
          className="issuer-investor-management__panel"
          hidden={activeTab !== tab.id}
          tabIndex={0}
        >
          {(visitedTabs.has(tab.id) || tab.id === activeTab) ? (
            tab.id === 'my-application' ? <MyApplicationsPage embedded />
              : tab.id === 'portfolio' ? <PortfolioPage embedded />
                : <InvitationsPage embedded />
          ) : null}
        </div>
      ))}
    </section>
  );
}
