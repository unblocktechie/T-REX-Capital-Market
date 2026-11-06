// Each monitoring route owns its filters. Keeping them keyed by page prevents
// navigation between Investors, Tokens and Applications from reusing a selection.
export const DEFAULT_MONITORING_FILTERS = Object.freeze({
  page: 1,
  search: '',
  status: 'all',
  chainUid: '',
});

export const createMonitoringFilterState = () => ({
  investors: { ...DEFAULT_MONITORING_FILTERS },
  tokens: { ...DEFAULT_MONITORING_FILTERS },
  applications: { ...DEFAULT_MONITORING_FILTERS },
});

export const updateMonitoringFilterState = (state, kind, changes) => ({
  ...state,
  [kind]: { ...DEFAULT_MONITORING_FILTERS, ...(state[kind] || {}), ...changes },
});

// React Router location.state carries only view configuration, never credentials.
// Return to the origin list without losing search, filter, sort, or page selection.
export const restoreMonitoringFilters = (kind, saved) => {
  const state = createMonitoringFilterState();
  if (!['investors', 'tokens', 'applications'].includes(kind) || !saved || typeof saved !== 'object') return state;
  const page = Number(saved.page);
  state[kind] = {
    ...DEFAULT_MONITORING_FILTERS,
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    search: typeof saved.search === 'string' ? saved.search.slice(0, 100) : '',
    status: typeof saved.status === 'string' ? saved.status : 'all',
    chainUid: typeof saved.chainUid === 'string' ? saved.chainUid : '',
    sortBy: typeof saved.sortBy === 'string' ? saved.sortBy : '',
    sortOrder: saved.sortOrder === 'desc' ? 'desc' : 'asc',
  };
  return state;
};
