import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * Standalone verifier for the ONCHAINID Factory (IdFactory) contract —
 * scripts/verify-chain.ts can't verify it because recompiling
 * @onchain-id/solidity through this project's Hardhat config resolves its
 * imports as `@onchain-id/solidity/contracts/...`, while the npm package
 * itself was published compiling with plain `contracts/...` paths. IdFactory
 * embeds `type(IdentityProxy).creationCode` as a literal constant, and
 * IdentityProxy's own compiled metadata (an IPFS hash of its source) depends
 * on that source path string — so the recompiled bytecode differs from
 * on-chain by ~32 bytes despite identical logic, and Hardhat's local
 * bytecode check rejects it before ever submitting to the explorer.
 *
 * Fix: submit the npm package's own build-info (its exact original
 * standard-JSON-input, with the original source paths) straight to the
 * explorer's Etherscan-compatible API, bypassing Hardhat's recompilation
 * entirely. Compiling that exact input reproduces the on-chain bytecode
 * byte-for-byte.
 *
 * Usage:
 *   npx ts-node scripts/verify-idfactory.ts --network <name>
 *   npx ts-node scripts/verify-idfactory.ts --network <name> --address <idFactoryAddress>
 *
 * --address verifies an arbitrary IdFactory instead of the one recorded in
 * deployments/<network>.json — its constructor arg (implementationAuthority)
 * is read straight off-chain via the contract's own getter.
 *
 * Works on both explorer types: a network's own explorerApiUrl from
 * networks.json if set (Blockscout-style, e.g. arc), otherwise Etherscan's
 * V2 API (Arbiscan, Etherscan, ...).
 */

interface NetworkJsonEntry {
  chainId?: number;
  explorerApiUrl?: string;
  explorerApiKeyEnv?: string;
}

function parseAddressArg(): string | undefined {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--address');
  return flagIndex !== -1 ? args[flagIndex + 1] : undefined;
}

// Networks without their own explorerApiUrl (arbitrum, sepolia, ...) are on
// an Etherscan-family explorer, reached through Etherscan's unified V2 API
// with the chain selected by the chainid parameter.
const ETHERSCAN_V2_API_URL = 'https://api.etherscan.io/v2/api';

function loadExplorerConfig(networkName: string) {
  const networksJsonPath = path.join(__dirname, '..', 'networks.json');
  const networksJson: Record<string, NetworkJsonEntry> = JSON.parse(fs.readFileSync(networksJsonPath, 'utf8'));
  const entry = networksJson[networkName];
  if (!entry) {
    throw new Error(`Unknown network "${networkName}" in networks.json.`);
  }
  if (!entry.explorerApiUrl && entry.chainId === undefined) {
    throw new Error(`networks.json entry "${networkName}" needs a chainId to verify through Etherscan's V2 API.`);
  }
  const apiKey = (entry.explorerApiKeyEnv ? process.env[entry.explorerApiKeyEnv] : undefined) || process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error(`Missing explorer API key for network "${networkName}" (set ${entry.explorerApiKeyEnv || 'ETHERSCAN_API_KEY'} in .env).`);
  }
  return { apiUrl: entry.explorerApiUrl || ETHERSCAN_V2_API_URL, apiKey, chainId: entry.chainId };
}

/** Loads the exact build-info (standard-JSON-input/output) the npm package itself was compiled with. */
function loadPackageBuildInfo(): any {
  const dbgPath = path.join(
    __dirname,
    '..',
    'node_modules',
    '@onchain-id',
    'solidity',
    'artifacts',
    'contracts',
    'factory',
    'IdFactory.sol',
    'IdFactory.dbg.json',
  );
  const dbg = JSON.parse(fs.readFileSync(dbgPath, 'utf8'));
  const buildInfoPath = path.join(path.dirname(dbgPath), dbg.buildInfo);
  return JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
}

async function main() {
  const networkName = parseNetworkArg();
  const networkConfig = loadNetworkConfig(networkName);
  const explorer = loadExplorerConfig(networkName);

  const addressOverride = parseAddressArg();
  let idFactoryAddress: string | undefined;
  let implementationAuthority: string | undefined;

  if (addressOverride) {
    idFactoryAddress = addressOverride;
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    const idFactory = new ethers.Contract(
      idFactoryAddress,
      ['function implementationAuthority() external view returns (address)'],
      provider,
    );
    implementationAuthority = await idFactory.implementationAuthority();
  } else {
    if (!fs.existsSync(networkConfig.deploymentsPath)) {
      throw new Error(`${networkConfig.deploymentsPath} not found — deploy this network first.`);
    }
    const deployment = JSON.parse(fs.readFileSync(networkConfig.deploymentsPath, 'utf8'));
    idFactoryAddress = deployment.platform?.identityFactory;
    implementationAuthority = deployment.platform?.identityImplementationAuthority;
    if (!idFactoryAddress || !implementationAuthority) {
      throw new Error(`Missing platform.identityFactory / platform.identityImplementationAuthority in ${networkConfig.deploymentsPath}.`);
    }
  }

  const buildInfo = loadPackageBuildInfo();
  const compilerVersion = `v${buildInfo.solcLongVersion}`;
  const contractName = 'contracts/factory/IdFactory.sol:IdFactory';
  const constructorArguments = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [implementationAuthority]).slice(2);

  console.log(`--- Verifying IdFactory (${idFactoryAddress}) on "${networkName}" via ${explorer.apiUrl} ---`);
  console.log(`Compiler:   ${compilerVersion}`);
  console.log(`Contract:   ${contractName}`);
  console.log(`Constructor arg (implementationAuthority): ${implementationAuthority}`);

  const params = new URLSearchParams({
    apikey: explorer.apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: idFactoryAddress,
    sourceCode: JSON.stringify(buildInfo.input),
    codeformat: 'solidity-standard-json-input',
    contractname: contractName,
    compilerversion: compilerVersion,
    constructorArguements: constructorArguments,
  });
  const url = new URL(explorer.apiUrl);
  if (explorer.chainId !== undefined) {
    url.searchParams.set('chainid', String(explorer.chainId));
  }

  const submitResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const submitJson: any = await submitResponse.json();
  console.log('\nSubmit response:', submitJson);

  if (submitJson.status !== '1') {
    if (/already verified/i.test(submitJson.result ?? '')) {
      console.log('\n  -> already verified');
      return;
    }
    throw new Error(`Verification submission failed: ${submitJson.result}`);
  }

  const guid = submitJson.result;
  console.log(`\nSubmitted, guid: ${guid} — polling for status...`);

  const statusUrl = new URL(explorer.apiUrl);
  if (explorer.chainId !== undefined) {
    statusUrl.searchParams.set('chainid', String(explorer.chainId));
  }
  statusUrl.searchParams.set('apikey', explorer.apiKey);
  statusUrl.searchParams.set('module', 'contract');
  statusUrl.searchParams.set('action', 'checkverifystatus');
  statusUrl.searchParams.set('guid', guid);

  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusResponse = await fetch(statusUrl);
    const statusJson: any = await statusResponse.json();
    console.log(`  [${attempt + 1}] ${statusJson.result}`);
    if (/already verified/i.test(statusJson.result ?? '')) {
      console.log('\n  -> already verified');
      return;
    }
    if (statusJson.status === '1') {
      console.log('\n  -> verified');
      return;
    }
    if (statusJson.result !== 'Pending in queue') {
      throw new Error(`Verification failed: ${statusJson.result}`);
    }
  }
  throw new Error('Timed out waiting for verification status.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
