export const CHAIN_ENDPOINTS = Object.freeze({
  public: '/chains',
  config: (chainUid) => `/chains/${encodeURIComponent(chainUid)}/config`,
  mine: '/chains/me',
  unlock: (chainUid) => `/chains/${encodeURIComponent(chainUid)}/unlock`,
});
