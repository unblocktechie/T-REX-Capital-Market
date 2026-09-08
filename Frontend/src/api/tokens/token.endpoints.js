export const TOKEN_ENDPOINTS = Object.freeze({
  deploy: '/tokens/deploy',
  details: (tokenAddress) => `/tokens/${tokenAddress}`,
});
