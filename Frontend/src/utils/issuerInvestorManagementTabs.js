// URL tab IDs are stable so bookmarks and legacy redirects keep working.
export const INVESTOR_MANAGEMENT_TABS = Object.freeze([
  { id: 'investors', label: 'Investors' },
  { id: 'investment-requests', label: 'Investment Requests' },
  { id: 'redemption-requests', label: 'Redemption Requests' },
]);

export const resolveInvestorManagementTab = (value) =>
  INVESTOR_MANAGEMENT_TABS.some((tab) => tab.id === value) ? value : 'investors';
