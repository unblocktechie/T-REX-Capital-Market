import 'dotenv/config';
import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { loadNetworkConfig } from './lib/network-config';

/**
 * Standalone verifier for TREXFactory — scripts/verify-chain.ts can't verify
 * it because recompiling @erc3643org/erc-3643 through this project's Hardhat
 * config resolves its imports as `@erc3643org/erc-3643/contracts/...`, while
 * the npm package itself was originally compiled with plain `contracts/...`
 * paths. TREXFactory embeds six proxies' creation code as literal constants
 * (type(TokenProxy).creationCode etc.), and each proxy's own compiled
 * metadata (an IPFS hash of its source) depends on that source path string —
 * so the recompiled bytecode differs from on-chain by a couple hundred bytes
 * spread across those embedded regions, despite identical logic, and
 * Hardhat's local bytecode check rejects it before ever submitting to the
 * explorer.
 *
 * Unlike @onchain-id/solidity, the @erc3643org/erc-3643 npm package doesn't
 * ship its own build-info file, so this script rebuilds the compiler input
 * itself: it reuses Hardhat's minimal-input subtask (same dependency-graph
 * minimization `hardhat verify` uses) and rewrites every source key from
 * `@erc3643org/erc-3643/contracts/...` to plain `contracts/...`, which
 * reproduces the on-chain bytecode byte-for-byte (confirmed by local
 * recompilation before wiring up this script).
 *
 * Its minimal input also exceeds arc-scan's ~164KB request size limit, same
 * as ModularCompliance/Token/TREXImplementationAuthority (see
 * verify-large-contracts.ts) — so this falls back to a comment-stripped
 * source (safe: solc discards comments before codegen) if the full source
 * is rejected as too large.
 *
 * Usage:
 *   npx hardhat run scripts/verify-trexfactory.ts --config hardhat.verify.config.ts --network <name>
 */

const PACKAGE_PREFIX = '@erc3643org/erc-3643/';

/** Strips comments from Solidity source (safe: solc discards them before codegen, so this never changes bytecode). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\n\s*\n+/g, '\n');
}

interface NetworkJsonEntry {
  chainId?: number;
  explorerApiUrl?: string;
  explorerApiKeyEnv?: string;
}

function loadExplorerConfig(networkName: string) {
  const networksJsonPath = path.join(__dirname, '..', 'networks.json');
  const networksJson: Record<string, NetworkJsonEntry> = JSON.parse(fs.readFileSync(networksJsonPath, 'utf8'));
  const entry = networksJson[networkName];
  if (!entry?.explorerApiUrl) {
    throw new Error(`No explorerApiUrl set for network "${networkName}" in networks.json.`);
  }
  const apiKey = (entry.explorerApiKeyEnv ? process.env[entry.explorerApiKeyEnv] : undefined) || process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error(`Missing explorer API key for network "${networkName}" (set ${entry.explorerApiKeyEnv || 'ETHERSCAN_API_KEY'} in .env).`);
  }
  return { apiUrl: entry.explorerApiUrl, apiKey, chainId: entry.chainId };
}

async function main() {
  // `hardhat run` strips --network from argv, so parseNetworkArg() would fall back to sepolia.
  const networkName = hre.network.name;
  const networkConfig = loadNetworkConfig(networkName);
  const explorer = loadExplorerConfig(networkName);

  if (!fs.existsSync(networkConfig.deploymentsPath)) {
    throw new Error(`${networkConfig.deploymentsPath} not found — deploy this network first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(networkConfig.deploymentsPath, 'utf8'));
  const { platform } = deployment;
  const trexFactoryAddress: string | undefined = platform?.trexFactory;
  if (!trexFactoryAddress || !platform?.trexImplementationAuthority || !platform?.identityFactory) {
    throw new Error(`Missing platform.trexFactory / trexImplementationAuthority / identityFactory in ${networkConfig.deploymentsPath}.`);
  }

  const sourceName = `${PACKAGE_PREFIX}contracts/factory/TREXFactory.sol`;
  const minimalInput: any = await hre.run('verify:etherscan-get-minimal-input', { sourceName });

  const rewrittenSources: any = {};
  for (const [key, value] of Object.entries(minimalInput.sources)) {
    const newKey = key.startsWith(PACKAGE_PREFIX) ? key.slice(PACKAGE_PREFIX.length) : key;
    rewrittenSources[newKey] = value;
  }
  const compilerInput = { ...minimalInput, sources: rewrittenSources };

  const contractName = 'contracts/factory/TREXFactory.sol:TREXFactory';
  const compilerVersion = 'v0.8.17+commit.8df45f5f';
  const constructorArguments = ethers.AbiCoder.defaultAbiCoder()
    .encode(['address', 'address'], [platform.trexImplementationAuthority, platform.identityFactory])
    .slice(2);

  console.log(`--- Verifying TREXFactory (${trexFactoryAddress}) on "${networkName}" via ${explorer.apiUrl} ---`);
  console.log(`Compiler:   ${compilerVersion}`);
  console.log(`Contract:   ${contractName}`);
  console.log(`Constructor args (implementationAuthority, idFactory): ${platform.trexImplementationAuthority}, ${platform.identityFactory}`);

  console.log('\nattempt 1: full source');
  let result = await postVerify(explorer, trexFactoryAddress, compilerInput, contractName, compilerVersion, constructorArguments);
  if (result.tooLarge) {
    console.log('  -> too large, retrying with comments stripped');
    const stripped = JSON.parse(JSON.stringify(compilerInput));
    for (const key of Object.keys(stripped.sources)) {
      stripped.sources[key].content = stripComments(stripped.sources[key].content);
    }
    console.log('\nattempt 2: comments stripped');
    result = await postVerify(explorer, trexFactoryAddress, stripped, contractName, compilerVersion, constructorArguments);
    if (result.tooLarge) {
      throw new Error('Still too large even with comments stripped.');
    }
  }
}

async function postVerify(
  explorer: { apiUrl: string; apiKey: string; chainId?: number },
  contractAddress: string,
  compilerInput: any,
  contractName: string,
  compilerVersion: string,
  constructorArguments: string,
) {
  const params = new URLSearchParams({
    apikey: explorer.apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: contractAddress,
    sourceCode: JSON.stringify(compilerInput),
    codeformat: 'solidity-standard-json-input',
    contractname: contractName,
    compilerversion: compilerVersion,
    constructorArguements: constructorArguments,
  });
  const body = params.toString();
  console.log(`  body size: ${body.length} bytes`);

  const url = new URL(explorer.apiUrl);
  if (explorer.chainId !== undefined) {
    url.searchParams.set('chainid', String(explorer.chainId));
  }

  let submitResponse: Response;
  try {
    submitResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    // The proxy resets the connection outright for some oversized bodies instead of returning a clean 413.
    return { tooLarge: true as const };
  }
  if (submitResponse.status === 413) {
    return { tooLarge: true as const };
  }
  const submitJson: any = await submitResponse.json();
  console.log('  submit response:', submitJson);

  if (submitJson.status !== '1') {
    if (/already verified/i.test(submitJson.result ?? '')) {
      console.log('  -> already verified');
      return { tooLarge: false as const };
    }
    throw new Error(`Verification submission failed: ${submitJson.result}`);
  }

  const guid = submitJson.result;
  console.log(`  submitted, guid: ${guid} — polling for status...`);

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
      console.log('  -> already verified');
      return { tooLarge: false as const };
    }
    if (statusJson.status === '1') {
      console.log('  -> verified');
      return { tooLarge: false as const };
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
