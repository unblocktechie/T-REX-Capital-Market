export const TOKEN_ENDPOINTS = Object.freeze({
  options: '/token-options',
  me: '/tokens/me',
  information: '/tokens/me/information',
  image: '/tokens/me/image',
  price: '/tokens/me/price',
  pricePrepare: '/tokens/me/price/prepare',
  priceUpdateStatus: (uid) => `/tokens/me/price-updates/${encodeURIComponent(uid)}`,
  priceCancel: (uid) => `/tokens/me/price/${encodeURIComponent(uid)}/cancel`,
  priceHistory: '/tokens/me/price-history',
  claims: '/tokens/me/claims',
  compliance: '/tokens/me/compliance',
  governance: '/tokens/me/governance',
  submit: '/tokens/me/submit',
  deploymentAttempts: '/tokens/me/deployment-attempts',
  activeDeploymentAttempt: '/tokens/me/deployment-attempts/active',
  deploymentAttemptSubmitted: (deploymentAttemptUid) =>
    `/tokens/me/deployment-attempts/${deploymentAttemptUid}/submitted`,
  deploymentAttemptFail: (deploymentAttemptUid) =>
    `/tokens/me/deployment-attempts/${deploymentAttemptUid}/fail`,

  details: (tokenAddress) => `/tokens/${tokenAddress}`,
});
