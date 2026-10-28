import 'dotenv/config';
import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { loadNetworkConfig } from './lib/network-config';

/**
 * Standalone verifier for contracts whose minimal solc input is too big for
 * arc-scan's request size limit — scripts/verify-chain.ts submits these
 * uncompressed and arc-scan's nginx front end rejects anything over ~164KB
 * total body size with a bare "413 Request Entity Too Large" HTML page,
 * which Hardhat's verify plugin then reports as the misleading "Unexpected
 * token '<' ... is not valid JSON" network error (confirmed by measuring
 * the exact threshold directly against the endpoint).
 *
 * Gzipping the request body does NOT work around this — arc-scan's backend
 * doesn't decompress incoming request bodies despite accepting
 * Content-Encoding: gzip, so it just fails to parse the compressed bytes as
 * form data (confirmed empirically).
 *
 * Fix: strip comments from the submitted source before verifying. Comments
 * don't affect compiled bytecode (solc discards them at the lexing stage),
 * so this has zero effect on the bytecode match — it only makes the source
 * shown on the explorer less annotated. This script reuses Hardhat's
 * internal "get minimal input" subtask (same dependency-graph minimization
 * Hardhat itself uses for `hardhat verify`), tries submitting it as-is
 * first, and only strips comments if that's rejected as too large.
 *
 * Must run through Hardhat, same as verify-chain.ts:
 *   npx hardhat run scripts/verify-large-contracts.ts --config hardhat.verify.config.ts --network <name>
 */

interface VerifyTarget {
  name: string;
  address: string | undefined;
  constructorArguments: any[];
  contract: string;
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

/** Strips comments from Solidity source (safe: solc discards them before codegen, so this never changes bytecode). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\n\s*\n+/g, '\n');
}

async function postVerify(
  explorer: { apiUrl: string; apiKey: string; chainId?: number },
  target: VerifyTarget,
  compilerInput: any,
  compilerVersion: string,
  constructorArguments: string,
) {
  const [sourceName, contractName] = target.contract.split(':');
  const params = new URLSearchParams({
    apikey: explorer.apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: target.address!,
    sourceCode: JSON.stringify(compilerInput),
    codeformat: 'solidity-standard-json-input',
    contractname: `${sourceName}:${contractName}`,
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

  const statusUrl = new URL(explorer.apiUrl);
  if (explorer.chainId !== undefined) {
    statusUrl.searchParams.set('chainid', String(explorer.chainId));
  }
  statusUrl.searchParams.set('apikey', explorer.apiKey);
  statusUrl.searchParams.set('module', 'contract');
  statusUrl.searchParams.set('action', 'checkverifystatus');
  statusUrl.searchParams.set('guid', submitJson.result);

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

async function main() {
  // `hardhat run` strips --network from argv, so parseNetworkArg() would fall back to sepolia.
  const networkName = hre.network.name;
  const networkConfig = loadNetworkConfig(networkName);
  const explorer = loadExplorerConfig(networkName);

  const deployment = JSON.parse(fs.readFileSync(networkConfig.deploymentsPath, 'utf8'));
  const { platform, implementations } = deployment;

  const targets: VerifyTarget[] = [
    {
      name: 'ModularCompliance (impl)',
      address: implementations?.modularCompliance,
      constructorArguments: [],
      contract: '@erc3643org/erc-3643/contracts/compliance/modular/ModularCompliance.sol:ModularCompliance',
    },
    {
      name: 'Token (impl)',
      address: implementations?.token,
      constructorArguments: [],
      contract: '@erc3643org/erc-3643/contracts/token/Token.sol:Token',
    },
    {
      name: 'TREXImplementationAuthority',
      address: platform.trexImplementationAuthority,
      constructorArguments: [true, ethers.ZeroAddress, ethers.ZeroAddress],
      contract: '@erc3643org/erc-3643/contracts/proxy/authority/TREXImplementationAuthority.sol:TREXImplementationAuthority',
    },
  ];

  const compilerVersion = 'v0.8.17+commit.8df45f5f';

  for (const target of targets) {
    if (!target.address) {
      console.log(`\n--- Skipping ${target.name} (no address in deployment file) ---`);
      continue;
    }
    console.log(`\n--- Verifying ${target.name} (${target.address}) ---`);
    const [sourceName, contractName] = target.contract.split(':');
    const minimalInput: any = await hre.run('verify:etherscan-get-minimal-input', { sourceName });

    const artifactPath = path.join(__dirname, '..', 'verify', 'artifacts', ...sourceName.split('/'), `${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const constructorAbi = artifact.abi.find((f: any) => f.type === 'constructor');
    const constructorArguments = ethers.AbiCoder.defaultAbiCoder()
      .encode(constructorAbi ? constructorAbi.inputs.map((i: any) => i.type) : [], target.constructorArguments)
      .slice(2);

    try {
      console.log('  attempt 1: full source');
      let result = await postVerify(explorer, target, minimalInput, compilerVersion, constructorArguments);
      if (result.tooLarge) {
        console.log('  -> 413 Request Entity Too Large, retrying with comments stripped');
        const strippedInput = JSON.parse(JSON.stringify(minimalInput));
        for (const key of Object.keys(strippedInput.sources)) {
          strippedInput.sources[key].content = stripComments(strippedInput.sources[key].content);
        }
        console.log('  attempt 2: comments stripped');
        result = await postVerify(explorer, target, strippedInput, compilerVersion, constructorArguments);
        if (result.tooLarge) {
          throw new Error('Still too large even with comments stripped.');
        }
      }
    } catch (error: any) {
      console.error(`  -> FAILED: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
