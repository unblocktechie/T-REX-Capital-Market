import { sepolia } from 'viem/chains';

export const supportedChains = [sepolia];
export const requiredChain = sepolia;

export const web3Config = Object.freeze({
  requiredChain,
  supportedChains,
});
