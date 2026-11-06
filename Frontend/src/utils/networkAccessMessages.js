/**
 * Customer-facing copy for account network identity setup failures.
 *
 * The server may return a detailed `identityErrorMessage` from a blockchain
 * provider (revert reasons, contract addresses, access-control role hashes,
 * RPC trace, etc.). It is diagnostic data, never customer-facing UI copy.
 * Keep it in the API response for troubleshooting; do not interpolate it into
 * banners, cards, dropdowns or toast descriptions.
 *
 * These messages are intentionally independent of role: issuers and investors
 * use the same network access flow and should receive the same safe guidance.
 */
export const NETWORK_SETUP_FAILED_MESSAGE =
  'Something went wrong while setting up this network. Please try again. If the issue continues, contact support.';

export const NETWORK_UNLOCK_FAILED_MESSAGE =
  'Something went wrong. Please try again in a moment. If the issue continues, contact support.';
