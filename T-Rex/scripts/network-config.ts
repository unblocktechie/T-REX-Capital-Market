import 'dotenv/config';
import * as path from 'path';

/**
 * Every deploy/wire script targets exactly one network at a time, selected
 * via the NETWORK env var (defaults to "arcTestnet"). Each network keeps its
 * own deployments/<network>.json so switching NETWORK never overwrites (or
 * silently reads) another network's addresses — e.g. deployments/sepolia.json
 * and deployments/arcTestnet.json coexist.
 *
 * Arc Testnet's native gas token is USDC (not ETH) — see gasToken below, used
 * only to make balance-check logs/errors say the right thing.
 */

export type NetworkName = keyof typeof NETWORKS;

const NETWORKS = {
  sepolia: { rpcEnvVar: 'SEPOLIA_RPC_URL', chainId: 11155111, gasToken: 'ETH' },
  arcTestnet: { rpcEnvVar: 'ARC_TESTNET_RPC_URL', chainId: 5042002, gasToken: 'USDC' },
} as const;

export function getNetwork() {
  const name = (process.env.NETWORK || 'arcTestnet') as NetworkName;
  const entry = NETWORKS[name];
  if (!entry) {
    throw new Error(`Unknown NETWORK "${name}" — expected one of: ${Object.keys(NETWORKS).join(', ')}`);
  }
  const rpcUrl = process.env[entry.rpcEnvVar];
  if (!rpcUrl) {
    throw new Error(`Missing ${entry.rpcEnvVar} in .env for NETWORK=${name}`);
  }
  return { name, rpcUrl, chainId: entry.chainId, gasToken: entry.gasToken };
}

export function deploymentsPathFor(name: NetworkName) {
  return path.join(__dirname, '..', 'deployments', `${name}.json`);
}
