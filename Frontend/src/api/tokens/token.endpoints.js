export const TOKEN_ENDPOINTS = Object.freeze({
  options: '/token-options',
  me: '/tokens/me',
  information: '/tokens/me/information',
  image: '/tokens/me/image',
  claims: '/tokens/me/claims',
  compliance: '/tokens/me/compliance',
  governance: '/tokens/me/governance',
  submit: '/tokens/me/submit',

  details: (tokenAddress) => `/tokens/${tokenAddress}`,
});
