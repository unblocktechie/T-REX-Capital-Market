import { createLocalId } from '@/utils/createLocalId';
import { consumeMockFailure } from './investorMockService';

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export const createMockInvestorProfile = async ({ walletAddress }) => {
  await wait(Math.round(1000 + Math.random() * 500));
  if (consumeMockFailure('profile')) {
    throw new Error('Investor profile creation failed. Your onboarding data is still available.');
  }
  const suffix = createLocalId('investor-profile')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)
    .toUpperCase();
  return {
    profileId: `INV-${suffix}`,
    onchainId: `ONCHAINID-${walletAddress.slice(2, 8).toUpperCase()}-${suffix.slice(0, 4)}`,
    status: 'created',
    createdAt: new Date().toISOString(),
  };
};
