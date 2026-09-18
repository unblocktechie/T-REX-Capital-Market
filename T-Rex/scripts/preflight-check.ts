import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { parseNetworkArg } from './lib/network-config';

/**
 * Read-only sanity check for `npm run deploy:chain -- --network <name>` —
 * verifies RPC connectivity, deployer funding, payment-token/config validity,
 * and that local contracts are compiled, so a real deploy run doesn't fail
 * halfway through and leave a partially-written deployments/<network>.json.
 *
 * Never sends a transaction or writes any file. Safe to run as many times as
 * you like.
 *
 * Usage: npm run preflight -- --network arc
 */

const networksJsonPath = path.join(__dirname, '..', 'networks.json');

type Status = 'ok' | 'warn' | 'fail';
const results: { label: string; status: Status; detail: string }[] = [];
const ok = (label: string, detail: string) => results.push({ label, status: 'ok', detail });
const warn = (label: string, detail: string) => results.push({ label, status: 'warn', detail });
const fail = (label: string, detail: string) => results.push({ label, status: 'fail', detail });

function artifactExists(...segments: string[]) {
  return fs.existsSync(path.join(__dirname, '..', 'artifacts', 'contracts', ...segments));
}

async function main() {
  const networkName = parseNetworkArg();
  console.log(`=== Preflight check for network "${networkName}" ===`);

  if (!fs.existsSync(networksJsonPath)) {
    fail('networks.json', 'File not found');
    return finish();
  }
  const networksJson = JSON.parse(fs.readFileSync(networksJsonPath, 'utf8'));
  const entry = networksJson[networkName];
  if (!entry) {
    fail('networks.json entry', `No "${networkName}" entry defined — add one first (see the "arc" entry for the shape).`);
    return finish();
  }
  ok('networks.json entry', `Found (expected chainId ${entry.chainId ?? 'unset'})`);

  const rpcUrl = process.env[entry.rpcUrlEnv];
  let provider: ethers.JsonRpcProvider | undefined;
  if (!rpcUrl) {
    fail('RPC URL', `Missing ${entry.rpcUrlEnv} in .env`);
  } else {
    ok('RPC URL env var', `${entry.rpcUrlEnv} is set`);
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      const liveChainId = Number(network.chainId);
      if (entry.chainId && liveChainId !== entry.chainId) {
        fail('RPC chain ID', `networks.json expects ${entry.chainId}, RPC returned ${liveChainId}`);
      } else {
        ok('RPC reachable', `chainId ${liveChainId} confirmed`);
      }
    } catch (error: any) {
      fail('RPC reachable', `Could not connect to ${entry.rpcUrlEnv} (${rpcUrl}): ${error.message}`);
      provider = undefined;
    }
  }

  const privateKey = process.env[entry.deployerPrivateKeyEnv];
  let deployerAddress: string | undefined;
  if (!privateKey) {
    fail('Deployer key', `Missing ${entry.deployerPrivateKeyEnv} in .env`);
  } else {
    try {
      const wallet = new ethers.Wallet(privateKey);
      deployerAddress = wallet.address;
      ok('Deployer key', `Derives address ${wallet.address}`);
      const expected = process.env.DEPLOYER_ADDRESS;
      if (expected && expected.toLowerCase() !== wallet.address.toLowerCase()) {
        warn('DEPLOYER_ADDRESS match', `.env DEPLOYER_ADDRESS (${expected}) differs from key-derived address (${wallet.address})`);
      }
    } catch (error: any) {
      fail('Deployer key', `Invalid private key: ${error.message}`);
    }
  }

  if (provider && deployerAddress) {
    try {
      const balance = await provider.getBalance(deployerAddress);
      if (balance === 0n) {
        fail('Deployer balance', `${deployerAddress} has 0 native balance on "${networkName}" — fund it before deploying.`);
      } else {
        ok('Deployer balance', `${ethers.formatEther(balance)} native token`);
      }
    } catch (error: any) {
      warn('Deployer balance', `Could not fetch balance: ${error.message}`);
    }
  } else {
    warn('Deployer balance', 'Skipped — RPC or private key unavailable');
  }

  const envPaymentTokens = (process.env.PAYMENT_TOKEN_ADDRESSES || '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  const paymentTokens: string[] = entry.paymentTokenAddresses?.length ? entry.paymentTokenAddresses : envPaymentTokens;
  if (paymentTokens.length === 0) {
    fail('Payment token addresses', 'None set in networks.json (paymentTokenAddresses) or .env (PAYMENT_TOKEN_ADDRESSES)');
  } else {
    for (const address of paymentTokens) {
      if (!ethers.isAddress(address)) {
        fail('Payment token address', `"${address}" is not a valid address`);
        continue;
      }
      if (!provider) {
        warn('Payment token contract', `${address} — skipped bytecode check, RPC unavailable`);
        continue;
      }
      try {
        const code = await provider.getCode(address);
        if (code === '0x') {
          fail('Payment token contract', `${address} has no bytecode on "${networkName}"`);
        } else {
          ok('Payment token contract', `${address} has bytecode`);
        }
      } catch (error: any) {
        warn('Payment token contract', `Could not check code at ${address}: ${error.message}`);
      }
    }
  }

  const platformOwner = entry.platformOwnerAddress || process.env.PLATFORM_OWNER_ADDRESS;
  if (platformOwner && !ethers.isAddress(platformOwner)) {
    fail('Platform owner address', `"${platformOwner}" is not a valid address`);
  } else if (platformOwner) {
    ok('Platform owner address', platformOwner);
  } else {
    warn('Platform owner address', 'Not set — TREXPlatformController will default to the deployer wallet address');
  }

  const deploymentsPath = path.join(__dirname, '..', 'deployments', `${networkName}.json`);
  if (fs.existsSync(deploymentsPath)) {
    warn('Existing deployment file', `${deploymentsPath} already exists — deploy:chain will refuse to run without --force`);
  } else {
    ok('Existing deployment file', 'None found — clean slate for a fresh deploy');
  }

  const moduleNames = ['CountryRestrictModule', 'MaxBalanceModule', 'MaxInvestorsModule'];
  const missingModules = moduleNames.filter((name) => !artifactExists('modules', `${name}.sol`, `${name}.json`));
  if (missingModules.length > 0) {
    fail('Compliance module artifacts', `Missing: ${missingModules.join(', ')} — run "npm run compile" first`);
  } else {
    ok('Compliance module artifacts', 'All compiled');
  }

  if (!artifactExists('platform', 'TREXPlatformController.sol', 'TREXPlatformController.json')) {
    fail('TREXPlatformController artifact', 'Missing — run "npm run compile" first');
  } else {
    ok('TREXPlatformController artifact', 'Compiled');
  }

  finish();
}

function finish() {
  console.log('');
  for (const result of results) {
    const icon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️ ' : '❌';
    console.log(`${icon} ${result.label}: ${result.detail}`);
  }
  const failures = results.filter((result) => result.status === 'fail').length;
  const warnings = results.filter((result) => result.status === 'warn').length;
  console.log(`\n${failures} failing, ${warnings} warning(s), ${results.length - failures - warnings} passing.`);
  if (failures > 0) {
    console.log('Fix the failures above before running npm run deploy:chain.');
    process.exitCode = 1;
  } else {
    console.log('Looks safe to run npm run deploy:chain.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
