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

// hardhat-verify picks its Etherscan API version off the *type* of
// etherscan.apiKey: a plain string means "one Etherscan.io key, use the
// unified v2 API" (required now — Etherscan fully shut off v1), while an
// object means "different key per network" and still goes through each
// chain's own v1-style endpoint. Networks with their own explorerApiUrl in
// networks.json (e.g. arc testnet's Blockscout instance) are not on
// Etherscan at all, so they need that per-network/v1 form — but real
// Etherscan networks (sepolia, mainnet, ...) now only work in v2/string
// form. Since the mode is global per hardhat run, decide it from whichever
// network this invocation's --network flag targets.
//
// Hardhat loads this file twice per `hardhat run ... --network X`: once with
// "--network X" in process.argv, and again when it executes the script, by
// which point argv is just [node, scriptPath] but HARDHAT_NETWORK=X is set.
// Both must resolve to the same network or the apiKey mode silently flips.
const networkArgIndex = process.argv.indexOf('--network');
const targetNetwork =
  process.env.NETWORK ||
  (networkArgIndex !== -1 ? process.argv[networkArgIndex + 1] : undefined) ||
  process.env.HARDHAT_NETWORK;
const targetUsesCustomExplorer = targetNetwork ? Boolean(networksJson[targetNetwork]?.explorerApiUrl) : customChains.length > 0;
const etherscanApiKeyConfig: string | Record<string, string> = targetUsesCustomExplorer ? etherscanApiKey : process.env.ETHERSCAN_API_KEY || '';

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
    apiKey: etherscanApiKeyConfig,
    customChains,
  },
};

export default config;
