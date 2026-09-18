import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared network-config resolution for the deploy scripts. Adding a new
 * chain means: add one entry to networks.json, set its RPC URL env var in
 * .env, then run `npm run deploy:chain -- --network <name>`.
 */

const networksPath = path.join(__dirname, '..', '..', 'networks.json');

interface NetworkEntry {
  chainId?: number;
  rpcUrlEnv: string;
  deployerPrivateKeyEnv: string;
  paymentTokenAddresses?: string[];
  platformOwnerAddress?: string;
}

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  deployerPrivateKey: string;
  paymentTokenAddresses: string[];
  platformOwnerAddress: string;
  deploymentsPath: string;
}

/** Reads `--network <name>` from argv (or NETWORK env var), defaults to 'arcTestnet'. */
export function parseNetworkArg(): string {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--network');
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    return args[flagIndex + 1];
  }
  return process.env.NETWORK || 'arcTestnet';
}

export function loadNetworkConfig(name: string): NetworkConfig {
  if (!fs.existsSync(networksPath)) {
    throw new Error(`networks.json not found at ${networksPath}`);
  }
  const networks: Record<string, NetworkEntry> = JSON.parse(fs.readFileSync(networksPath, 'utf8'));
  const entry = networks[name];
  if (!entry) {
    throw new Error(`Unknown network "${name}" — add it to networks.json first (see the "sepolia" entry for the shape).`);
  }

  const rpcUrl = process.env[entry.rpcUrlEnv];
  if (!rpcUrl) {
    throw new Error(`Missing ${entry.rpcUrlEnv} in .env (required for network "${name}")`);
  }

  const deployerPrivateKey = process.env[entry.deployerPrivateKeyEnv];
  if (!deployerPrivateKey) {
    throw new Error(`Missing ${entry.deployerPrivateKeyEnv} in .env (required for network "${name}")`);
  }

  return {
    name,
    rpcUrl,
    deployerPrivateKey,
    paymentTokenAddresses: entry.paymentTokenAddresses || [],
    platformOwnerAddress: entry.platformOwnerAddress || '',
    deploymentsPath: path.join(__dirname, '..', '..', 'deployments', `${name}.json`),
  };
}
