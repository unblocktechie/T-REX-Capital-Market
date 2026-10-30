// Keep tab IDs stable for direct links and legacy investor routes.
export const MY_INVESTMENT_TABS = Object.freeze([
  { id: 'my-application', label: 'My Application' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'invitation', label: 'Invitation' },
]);

export const resolveMyInvestmentTab = (value) =>
  MY_INVESTMENT_TABS.some(({ id }) => id === value) ? value : 'my-application';
