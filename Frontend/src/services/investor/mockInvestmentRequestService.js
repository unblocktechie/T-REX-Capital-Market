import { consumeMockFailure } from './investorMockService';

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export const submitMockInvestmentRequest = async ({ investorProfileId, walletAddress }) => {
  await wait(Math.round(1000 + Math.random() * 500));
  if (consumeMockFailure('request')) {
    throw new Error('The investor profile completion record could not be saved. Retry without recreating the profile.');
  }
  return {
    requestId: '#REQ-882-X29',
    assetName: 'Global Real Estate Bond 2024',
    requestedAmount: '50,000.00 USDC',
    submissionDate: new Date().toISOString(),
    investorProfileId,
    connectedWallet: walletAddress,
    status: 'Profile Created',
  };
};
