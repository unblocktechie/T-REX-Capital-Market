import 'dotenv/config';
import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { loadNetworkConfig } from './lib/network-config';

/**
 * Verifies every contract of a chain deployed with deploy-new-chain.ts.
 *
 * Because those contracts were deployed from the same build this recompiles
 * (hardhat.verify.config.ts), every one is a plain hardhat-verify match —
 * no per-contract workarounds. Works on:
 *   - Etherscan-family explorers (Arbiscan, Etherscan, ...): only chainId in
 *     networks.json + ETHERSCAN_API_KEY.
 *   - Blockscout-style explorers: explorerApiUrl / explorerBrowserUrl in
 *     networks.json. Some of these (e.g. arc-scan) reject large submissions
 *     (HTTP 413); for those only, this retries the same contract with
 *     comments stripped from the source (comments are discarded by solc, so
 *     the logic and ABI are identical; the explorer may label it a partial
 *     match).
 *
 * Usage: npm run verify:new-chain -- --network <name>
 * Re-run any time — already-verified contracts are skipped.
 */

const VERIFY_TIMEOUT_MS = 3 * 60 * 1000;
const ERC3643 = '@erc3643org/erc-3643/contracts/';
const ONCHAINID = '@onchain-id/solidity/contracts/';

type Outcome = 'verified' | 'already-verified' | 'submitted-pending' | 'failed' | 'skipped';

interface VerifyTarget {
  name: string;
  address: string | undefined;
  constructorArguments: any[];
  contract: string;
}

interface Explorer {
  apiUrl: string;
  apiKey: string;
  chainId?: number;
}

function loadCustomExplorer(networkName: string): Explorer | undefined {
  const networksJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'networks.json'), 'utf8'));
  const entry = networksJson[networkName];
  if (!entry?.explorerApiUrl) return undefined;
  const apiKey = (entry.explorerApiKeyEnv ? process.env[entry.explorerApiKeyEnv] : undefined) || process.env.ETHERSCAN_API_KEY || '';
  return { apiUrl: entry.explorerApiUrl, apiKey, chainId: entry.chainId };
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\n\s*\n+/g, '\n');
}

async function verifyWithPlugin(target: VerifyTarget): Promise<Outcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('TIMEOUT')), VERIFY_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      hre.run('verify:verify', { address: target.address, constructorArguments: target.constructorArguments, contract: target.contract }),
      timeout,
    ]);
    return 'verified';
  } finally {
    clearTimeout(timer);
  }
}

/** Direct Etherscan-compatible submission with comments stripped, for explorers that reject large request bodies. */
async function verifyStripped(explorer: Explorer, target: VerifyTarget): Promise<Outcome> {
  const [sourceName, contractName] = target.contract.split(':');
  const minimalInput: any = await hre.run('verify:etherscan-get-minimal-input', { sourceName });
  for (const key of Object.keys(minimalInput.sources)) {
    minimalInput.sources[key].content = stripComments(minimalInput.sources[key].content);
  }
  const buildInfo = await hre.artifacts.getBuildInfo(target.contract);
  if (!buildInfo) throw new Error(`No build info for ${target.contract}`);
  const artifact = await hre.artifacts.readArtifact(target.contract);
  const constructorAbi = artifact.abi.find((f: any) => f.type === 'constructor');
  const constructorArguments = ethers.AbiCoder.defaultAbiCoder()
    .encode(constructorAbi ? constructorAbi.inputs.map((i: any) => i.type) : [], target.constructorArguments)
    .slice(2);

  const url = new URL(explorer.apiUrl);
  if (explorer.chainId !== undefined) url.searchParams.set('chainid', String(explorer.chainId));
  const body = new URLSearchParams({
    apikey: explorer.apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: target.address!,
    sourceCode: JSON.stringify(minimalInput),
    codeformat: 'solidity-standard-json-input',
    contractname: `${sourceName}:${contractName}`,
    compilerversion: `v${buildInfo.solcLongVersion}`,
    constructorArguements: constructorArguments,
  }).toString();
  console.log(`  retrying with comments stripped (${body.length} bytes)`);

  const submitResponse = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (submitResponse.status === 413) throw new Error('Still too large for this explorer even with comments stripped.');
  const submitJson: any = await submitResponse.json();
  if (/already verified/i.test(submitJson.result ?? '')) return 'already-verified';
  if (submitJson.status !== '1') throw new Error(`Submission rejected: ${submitJson.result}`);

  const statusUrl = new URL(explorer.apiUrl);
  if (explorer.chainId !== undefined) statusUrl.searchParams.set('chainid', String(explorer.chainId));
  statusUrl.searchParams.set('apikey', explorer.apiKey);
  statusUrl.searchParams.set('module', 'contract');
  statusUrl.searchParams.set('action', 'checkverifystatus');
  statusUrl.searchParams.set('guid', submitJson.result);
  for (let attempt = 0; attempt < 36; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusJson: any = await (await fetch(statusUrl)).json();
    if (/already verified/i.test(statusJson.result ?? '')) return 'already-verified';
    if (statusJson.status === '1') return 'verified';
    if (!/pending/i.test(statusJson.result ?? '')) throw new Error(`Verification failed: ${statusJson.result}`);
  }
  return 'submitted-pending';
}

function looksLikeSizeRejection(message: string): boolean {
  return /413|Request Entity Too Large|Unexpected token|not valid JSON|ECONNRESET|socket hang up|other side closed/i.test(message);
}

async function verifyOne(target: VerifyTarget, customExplorer: Explorer | undefined): Promise<Outcome> {
  if (!target.address) {
    console.log(`\n--- Skipping ${target.name} (no address in deployment file) ---`);
    return 'skipped';
  }
  console.log(`\n--- Verifying ${target.name} (${target.address}) ---`);
  try {
    return await verifyWithPlugin(target);
  } catch (error: any) {
    const message: string = error?.message ?? String(error);
    if (message === 'TIMEOUT') {
      console.log(`  -> submitted, explorer hasn't confirmed after ${VERIFY_TIMEOUT_MS / 1000}s — re-run later to confirm`);
      return 'submitted-pending';
    }
    if (/already (been )?verified/i.test(message)) return 'already-verified';
    if (customExplorer && looksLikeSizeRejection(message)) {
      try {
        return await verifyStripped(customExplorer, target);
      } catch (fallbackError: any) {
        console.error(`  -> FAILED: ${fallbackError.message}`);
        return 'failed';
      }
    }
    console.error(`  -> FAILED: ${message}`);
    return 'failed';
  }
}

async function main() {
  // `hardhat run` strips --network from argv, so read it from Hardhat itself.
  const networkName = hre.network.name;
  const networkConfig = loadNetworkConfig(networkName);
  if (!fs.existsSync(networkConfig.deploymentsPath)) {
    throw new Error(`${networkConfig.deploymentsPath} not found — deploy first: npm run deploy:new-chain -- --network ${networkName}`);
  }
  const deployment = JSON.parse(fs.readFileSync(networkConfig.deploymentsPath, 'utf8'));
  if (deployment.platformBuild !== 'source') {
    throw new Error(
      `"${networkName}" was deployed with the old deploy:chain flow (npm package bytecode) — verify it with: npm run verify:all -- --network ${networkName}`,
    );
  }
  const { platform, implementations, deployer } = deployment;
  const customExplorer = loadCustomExplorer(networkName);

  const targets: VerifyTarget[] = [
    {
      name: 'TREXPlatformController',
      address: platform.platformController,
      constructorArguments: [platform.platformControllerOwner, platform.paymentTokens],
      contract: 'contracts/platform/TREXPlatformController.sol:TREXPlatformController',
    },
    {
      name: 'IdFactoryAccessManager',
      address: platform.idFactoryAccessManager,
      constructorArguments: [platform.identityFactory, platform.idFactoryAccessManagerAdmin],
      contract: 'contracts/platform/IdFactoryAccessManager.sol:IdFactoryAccessManager',
    },
    { name: 'CountryRestrictModule', address: platform.complianceModules?.countryRestrict, constructorArguments: [], contract: 'contracts/modules/CountryRestrictModule.sol:CountryRestrictModule' },
    { name: 'MaxBalanceModule', address: platform.complianceModules?.maxBalance, constructorArguments: [], contract: 'contracts/modules/MaxBalanceModule.sol:MaxBalanceModule' },
    { name: 'MaxInvestorsModule', address: platform.complianceModules?.maxInvestors, constructorArguments: [], contract: 'contracts/modules/MaxInvestorsModule.sol:MaxInvestorsModule' },
    { name: 'ClaimTopicsRegistry (impl)', address: implementations?.claimTopicsRegistry, constructorArguments: [], contract: `${ERC3643}registry/implementation/ClaimTopicsRegistry.sol:ClaimTopicsRegistry` },
    { name: 'TrustedIssuersRegistry (impl)', address: implementations?.trustedIssuersRegistry, constructorArguments: [], contract: `${ERC3643}registry/implementation/TrustedIssuersRegistry.sol:TrustedIssuersRegistry` },
    { name: 'IdentityRegistryStorage (impl)', address: implementations?.identityRegistryStorage, constructorArguments: [], contract: `${ERC3643}registry/implementation/IdentityRegistryStorage.sol:IdentityRegistryStorage` },
    { name: 'IdentityRegistry (impl)', address: implementations?.identityRegistry, constructorArguments: [], contract: `${ERC3643}registry/implementation/IdentityRegistry.sol:IdentityRegistry` },
    { name: 'ModularCompliance (impl)', address: implementations?.modularCompliance, constructorArguments: [], contract: `${ERC3643}compliance/modular/ModularCompliance.sol:ModularCompliance` },
    { name: 'Token (impl)', address: implementations?.token, constructorArguments: [], contract: `${ERC3643}token/Token.sol:Token` },
    { name: 'Identity (impl)', address: implementations?.identity, constructorArguments: [deployer, true], contract: `${ONCHAINID}Identity.sol:Identity` },
    {
      name: 'ImplementationAuthority (ONCHAINID)',
      address: platform.identityImplementationAuthority,
      constructorArguments: [implementations?.identity],
      contract: `${ONCHAINID}proxy/ImplementationAuthority.sol:ImplementationAuthority`,
    },
    { name: 'Factory (ONCHAINID / IdFactory)', address: platform.identityFactory, constructorArguments: [platform.identityImplementationAuthority], contract: `${ONCHAINID}factory/IdFactory.sol:IdFactory` },
    {
      name: 'TREXImplementationAuthority',
      address: platform.trexImplementationAuthority,
      constructorArguments: [true, ethers.ZeroAddress, ethers.ZeroAddress],
      contract: `${ERC3643}proxy/authority/TREXImplementationAuthority.sol:TREXImplementationAuthority`,
    },
    { name: 'TREXFactory', address: platform.trexFactory, constructorArguments: [platform.trexImplementationAuthority, platform.identityFactory], contract: `${ERC3643}factory/TREXFactory.sol:TREXFactory` },
    { name: 'TREXGateway', address: platform.trexGateway, constructorArguments: [platform.trexFactory, false], contract: `${ERC3643}factory/TREXGateway.sol:TREXGateway` },
  ];

  console.log(`=== Verifying ${targets.length} contracts on "${networkName}" ===`);
  const results: Record<Outcome, string[]> = { verified: [], 'already-verified': [], 'submitted-pending': [], failed: [], skipped: [] };
  for (const target of targets) {
    const outcome = await verifyOne(target, customExplorer);
    if (outcome !== 'failed' && outcome !== 'skipped') console.log(`  -> ${outcome}`);
    results[outcome].push(target.name);
    // Etherscan's free tier allows ~3 calls/sec.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('\n=== Summary ===');
  for (const [outcome, names] of Object.entries(results)) {
    console.log(`${outcome.padEnd(18)} ${names.length ? names.join(', ') : '(none)'}`);
  }
  if (results.failed.length > 0 || results['submitted-pending'].length > 0) {
    console.log('\nRe-run this command to retry failures and confirm pending ones (verified contracts are skipped).');
  }
  if (results.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  // hardhat-verify's status polling has no timeout of its own and can keep the process alive after a TIMEOUT.
  .finally(() => process.exit(process.exitCode ?? 0));
