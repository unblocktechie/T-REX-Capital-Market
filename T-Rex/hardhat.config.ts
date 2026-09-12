import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';
import { HardhatUserConfig } from 'hardhat/config';

// Compiles contracts/**/*.sol (our own custom modules) — the T-REX and
// ONCHAINID contracts we deploy elsewhere already come pre-compiled from
// their npm packages and are not recompiled here.
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache',
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || '',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    arcTestnet: {
      url: process.env.ARC_TESTNET_RPC_URL || '',
      chainId: 5042002,
      // Native gas token on Arc is USDC, not ETH — deployer/issuer wallets
      // need to be funded with testnet USDC, not ETH, before running here.
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || '',
      // Blockscout-style explorers generally accept any non-empty string here.
      arcTestnet: process.env.ARCSCAN_API_KEY || 'no-api-key-needed',
    },
    customChains: [
      {
        network: 'arcTestnet',
        chainId: 5042002,
        urls: {
          // TODO: confirm arcscan's exact Blockscout API path before relying
          // on `hardhat verify --network arcTestnet` — unverified as of writing.
          apiURL: 'https://testnet.arcscan.app/api',
          browserURL: 'https://testnet.arcscan.app',
        },
      },
    ],
  },
};

export default config;
