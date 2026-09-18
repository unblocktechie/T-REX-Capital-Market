import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';
import { HardhatUserConfig, NetworksUserConfig } from 'hardhat/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Separate Hardhat project used only by scripts/verify-chain.ts.
 *
 * Compiles verify/contracts/*.sol — compile-only shims that import the
 * @erc3643org/erc-3643 and @onchain-id/solidity contracts deployed directly
 * from their npm packages in scripts/phase0-01-deploy-platform.ts — into
 * verify/artifacts/, so verify-chain.ts has local sources to submit to a
 * block explorer for each of them.
 *
 * Kept entirely separate from hardhat.config.ts (different `paths`, own
 * artifacts/cache/typechain dirs) so running it never touches this
 * project's own committed artifacts/ or cache/ — it's a read-only sibling
 * build for verification purposes only.
 *
 * Usage: npx hardhat compile --config hardhat.verify.config.ts
 *        npx hardhat run scripts/verify-chain.ts --config hardhat.verify.config.ts --network <name>
 */

interface NetworkJsonEntry {
  chainId?: number;
  rpcUrlEnv: string;
  deployerPrivateKeyEnv: string;
  // Optional — only needed for networks whose explorer isn't natively known
  // to @nomicfoundation/hardhat-verify (e.g. a Blockscout-style explorer
  // that speaks the Etherscan API dialect at its own URL). Leave unset for
  // networks that already work out of the box with just an API key.
  explorerApiUrl?: string;
  explorerBrowserUrl?: string;
  explorerApiKeyEnv?: string;
}

const networksJsonPath = path.join(__dirname, 'networks.json');
const networksJson: Record<string, NetworkJsonEntry> = fs.existsSync(networksJsonPath) ? JSON.parse(fs.readFileSync(networksJsonPath, 'utf8')) : {};

const networks: NetworksUserConfig = {};
const etherscanApiKey: Record<string, string> = {};
const customChains: { network: string; chainId: number; urls: { apiURL: string; browserURL: string } }[] = [];

for (const [name, entry] of Object.entries(networksJson)) {
  const rpcUrl = process.env[entry.rpcUrlEnv];
  const deployerPrivateKey = process.env[entry.deployerPrivateKeyEnv];
  networks[name] = {
    url: rpcUrl || '',
    chainId: entry.chainId,
    accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
  };

  const explorerApiKey = entry.explorerApiKeyEnv ? process.env[entry.explorerApiKeyEnv] : undefined;
  etherscanApiKey[name] = explorerApiKey || process.env.ETHERSCAN_API_KEY || '';

  if (entry.explorerApiUrl && entry.explorerBrowserUrl && entry.chainId) {
    customChains.push({
      network: name,
      chainId: entry.chainId,
      urls: { apiURL: entry.explorerApiUrl, browserURL: entry.explorerBrowserUrl },
    });
  }
}

// Verification-only alternate target for Arc mainnet, hitting Etherscan's
// unified V2 API (https://arc.etherscan.io) instead of arc-scan.org.
// Deliberately NOT added to networks.json — that file is also read by
// scripts/lib/network-config.ts for `deploy:chain`, and a second entry
// pointing at the same ARC_RPC_URL/chain could get mistaken for a distinct
// network and trigger a duplicate deployment. Use with:
//   npx hardhat verify --config hardhat.verify.config.ts --network arcEtherscan <address> [args...]
networks.arcEtherscan = {
  url: process.env.ARC_RPC_URL || '',
  chainId: 5042,
  accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
};
etherscanApiKey.arcEtherscan = process.env.ETHERSCAN_API_KEY || '';
customChains.push({
  network: 'arcEtherscan',
  chainId: 5042,
  urls: { apiURL: 'https://api.etherscan.io/v2/api?chainid=5042', browserURL: 'https://arc.etherscan.io' },
});

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
    overrides: {
      // @onchain-id/solidity was published with the optimizer disabled (see
      // its shipped artifacts/build-info) — verifying Identity /
      // ImplementationAuthority / IdFactory only matches with the same
      // settings.
      '@onchain-id/solidity/contracts/Identity.sol': {
        version: '0.8.17',
        settings: { optimizer: { enabled: false, runs: 200 } },
      },
      '@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol': {
        version: '0.8.17',
        settings: { optimizer: { enabled: false, runs: 200 } },
      },
      '@onchain-id/solidity/contracts/factory/IdFactory.sol': {
        version: '0.8.17',
        settings: { optimizer: { enabled: false, runs: 200 } },
      },
    },
  },
  paths: {
    sources: './verify/contracts',
    artifacts: './verify/artifacts',
    cache: './verify/cache',
  },
  typechain: {
    outDir: './verify/typechain-types',
  },
  networks,
  etherscan: {
    apiKey: etherscanApiKey,
    customChains,
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
