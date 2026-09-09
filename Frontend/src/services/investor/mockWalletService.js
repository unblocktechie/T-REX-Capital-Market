import { consumeMockFailure } from './investorMockService';

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export const connectMockWallet = async () => {
  await wait(Math.round(700 + Math.random() * 500));
  if (consumeMockFailure('wallet')) {
    throw new Error('The mock wallet connection was declined. Please retry.');
  }
  return {
    isConnected: true,
    address: '0x1234567890ABCDEF1234567890ABCDEF12349859',
    displayAddress: '0x1234...9859',
    network: 'Sepolia',
    balance: '1.24 ETH',
  };
};

export const disconnectMockWallet = async () => {
  await wait(250);
  return { isConnected: false, address: '', network: '', balance: '' };
};
