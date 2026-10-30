import 'dotenv/config';
import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { loadNetworkConfig } from './lib/network-config';

/**
 * Writes one "Standard JSON input" file per contract in
 * deployments/<network>.json, for manual upload on a block explorer's
 * "Verify & publish" page — for when scripted verification can't get
 * through (e.g. the explorer's API is behind a bot check).
 *
 * Each file is recompiled locally and compared with the bytecode actually
 * on-chain; README.txt marks any that don't match, so you never upload a
 * file that will fail.
 *
 * Handles both deploy flows:
 *   - deploy:chain (npm package bytecode): T-REX / ONCHAINID files use the
 *     packages' original source paths, which is what their bytecode was
 *     built from.
 *   - deploy:new-chain (platformBuild "source"): files come straight from
 *     this project's verify build, which is what was deployed.
 *
 * Usage: npm run verify:files -- --network <name>
 * Output: verification-files/<network>/  (README.txt has per-contract steps)
 */

const ERC3643_PREFIX = '@erc3643org/erc-3643/';
const ONCHAINID_PREFIX = '@onchain-id/solidity/';

type Kind = 'erc3643' | 'onchainid' | 'own';

interface Target {
  name: string;
  address: string | undefined;
  kind: Kind;
  source: string; // path inside the package (or project) without the package prefix
  contract: string;
  args: any[];
}

async function compile(input: any): Promise<{ output: any; longVersion: string }> {
  const build: any = await hre.run('compile:solidity:solc:get-build', { quiet: true, solcVersion: '0.8.17' });
  const output = build.isSolcJs
    ? await hre.run('compile:solidity:solcjs:run', { input, solcJsPath: build.compilerPath })
    : await hre.run('compile:solidity:solc:run', { input, solcPath: build.compilerPath });
  const errors = (output.errors || []).filter((e: any) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e: any) => e.formattedMessage).join('\n'));
  return { output, longVersion: build.longVersion };
}

/** Zeroes immutable values (set at deploy time, not part of the source) so code can be compared. */
function maskImmutables(code: string, refs: any): string {
  let hex = code.replace(/^0x/, '').toLowerCase();
  for (const ref of Object.values(refs || {}).flat() as { start: number; length: number }[]) {
    hex = hex.slice(0, ref.start * 2) + '0'.repeat(ref.length * 2) + hex.slice((ref.start + ref.length) * 2);
  }
  return hex;
}

function loadOnchainIdPackageBuildInfo(): any {
  const dbgPath = path.join(__dirname, '..', 'node_modules', '@onchain-id', 'solidity', 'artifacts', 'contracts', 'factory', 'IdFactory.sol', 'IdFactory.dbg.json');
  const dbg = JSON.parse(fs.readFileSync(dbgPath, 'utf8'));
  return JSON.parse(fs.readFileSync(path.join(path.dirname(dbgPath), dbg.buildInfo), 'utf8'));
}

async function main() {
  // `hardhat run` strips --network from argv, so read it from Hardhat itself.
  const networkName = hre.network.name;
  const networkConfig = loadNetworkConfig(networkName);
  if (!fs.existsSync(networkConfig.deploymentsPath)) {
    throw new Error(`${networkConfig.deploymentsPath} not found — nothing deployed on "${networkName}" yet.`);
  }
  const deployment = JSON.parse(fs.readFileSync(networkConfig.deploymentsPath, 'utf8'));
  const fromSource = deployment.platformBuild === 'source';
  const { platform: p, implementations: impl, deployer } = deployment;

  const networksJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'networks.json'), 'utf8'));
  const explorerBrowserUrl: string | undefined = networksJson[networkName]?.explorerBrowserUrl?.replace(/\/$/, '');

  const targets: Target[] = [
    { name: 'TREXPlatformController', address: p.platformController, kind: 'own', source: 'contracts/platform/TREXPlatformController.sol', contract: 'TREXPlatformController', args: [p.platformControllerOwner, p.paymentTokens] },
    { name: 'IdFactoryAccessManager', address: p.idFactoryAccessManager, kind: 'own', source: 'contracts/platform/IdFactoryAccessManager.sol', contract: 'IdFactoryAccessManager', args: [p.identityFactory, p.idFactoryAccessManagerAdmin] },
    { name: 'CountryRestrictModule', address: p.complianceModules?.countryRestrict, kind: 'own', source: 'contracts/modules/CountryRestrictModule.sol', contract: 'CountryRestrictModule', args: [] },
    { name: 'MaxBalanceModule', address: p.complianceModules?.maxBalance, kind: 'own', source: 'contracts/modules/MaxBalanceModule.sol', contract: 'MaxBalanceModule', args: [] },
    { name: 'MaxInvestorsModule', address: p.complianceModules?.maxInvestors, kind: 'own', source: 'contracts/modules/MaxInvestorsModule.sol', contract: 'MaxInvestorsModule', args: [] },
    { name: 'ClaimTopicsRegistry', address: impl?.claimTopicsRegistry, kind: 'erc3643', source: 'contracts/registry/implementation/ClaimTopicsRegistry.sol', contract: 'ClaimTopicsRegistry', args: [] },
    { name: 'TrustedIssuersRegistry', address: impl?.trustedIssuersRegistry, kind: 'erc3643', source: 'contracts/registry/implementation/TrustedIssuersRegistry.sol', contract: 'TrustedIssuersRegistry', args: [] },
    { name: 'IdentityRegistryStorage', address: impl?.identityRegistryStorage, kind: 'erc3643', source: 'contracts/registry/implementation/IdentityRegistryStorage.sol', contract: 'IdentityRegistryStorage', args: [] },
    { name: 'IdentityRegistry', address: impl?.identityRegistry, kind: 'erc3643', source: 'contracts/registry/implementation/IdentityRegistry.sol', contract: 'IdentityRegistry', args: [] },
    { name: 'ModularCompliance', address: impl?.modularCompliance, kind: 'erc3643', source: 'contracts/compliance/modular/ModularCompliance.sol', contract: 'ModularCompliance', args: [] },
    { name: 'Token', address: impl?.token, kind: 'erc3643', source: 'contracts/token/Token.sol', contract: 'Token', args: [] },
    { name: 'Identity', address: impl?.identity, kind: 'onchainid', source: 'contracts/Identity.sol', contract: 'Identity', args: [deployer, true] },
    { name: 'ImplementationAuthority', address: p.identityImplementationAuthority, kind: 'onchainid', source: 'contracts/proxy/ImplementationAuthority.sol', contract: 'ImplementationAuthority', args: [impl?.identity] },
    { name: 'IdFactory', address: p.identityFactory, kind: 'onchainid', source: 'contracts/factory/IdFactory.sol', contract: 'IdFactory', args: [p.identityImplementationAuthority] },
    { name: 'TREXImplementationAuthority', address: p.trexImplementationAuthority, kind: 'erc3643', source: 'contracts/proxy/authority/TREXImplementationAuthority.sol', contract: 'TREXImplementationAuthority', args: [true, ethers.ZeroAddress, ethers.ZeroAddress] },
    { name: 'TREXFactory', address: p.trexFactory, kind: 'erc3643', source: 'contracts/factory/TREXFactory.sol', contract: 'TREXFactory', args: [p.trexImplementationAuthority, p.identityFactory] },
    { name: 'TREXGateway', address: p.trexGateway, kind: 'erc3643', source: 'contracts/factory/TREXGateway.sol', contract: 'TREXGateway', args: [p.trexFactory, false] },
  ];

  // staticNetwork stops ethers retrying an unreachable RPC forever; fail fast instead.
  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl, undefined, { staticNetwork: true });
  try {
    await Promise.race([
      provider.getBlockNumber(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('no response within 20s')), 20_000)),
    ]);
  } catch (error: any) {
    throw new Error(`Can't reach the RPC for "${networkName}" (${error.shortMessage || error.message}) — check its RPC URL in .env.`);
  }
  const outDir = path.join(__dirname, '..', 'verification-files', networkName);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const onchainIdBuildInfo = fromSource ? undefined : loadOnchainIdPackageBuildInfo();

  console.log(`=== Generating verification files for "${networkName}" (${fromSource ? 'deploy:new-chain' : 'deploy:chain'} build) ===\n`);

  const readme: string[] = [];
  let mismatches = 0;
  let index = 0;
  for (const t of targets) {
    index++;
    if (!t.address) {
      console.log(`SKIPPED      ${t.name} (no address in deployment file)`);
      continue;
    }

    // Source name as the deployed bytecode was compiled with it.
    const prefix = t.kind === 'erc3643' ? ERC3643_PREFIX : t.kind === 'onchainid' ? ONCHAINID_PREFIX : '';
    let input: any;
    let sourceName: string;
    if (t.kind === 'onchainid' && !fromSource) {
      input = onchainIdBuildInfo.input;
      sourceName = t.source;
    } else {
      input = await hre.run('verify:etherscan-get-minimal-input', { sourceName: prefix + t.source });
      sourceName = prefix + t.source;
      if (t.kind === 'erc3643' && !fromSource) {
        // The npm package's bytecode was built with plain contracts/... paths.
        const sources: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input.sources)) {
          sources[key.startsWith(ERC3643_PREFIX) ? key.slice(ERC3643_PREFIX.length) : key] = value;
        }
        input = { ...input, sources };
        sourceName = t.source;
      }
    }
    input = {
      ...input,
      settings: {
        ...input.settings,
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'metadata'], '': ['ast'] } },
      },
    };

    const { output, longVersion } = await compile(input);
    const compiled = output.contracts[sourceName]?.[t.contract];
    if (!compiled) throw new Error(`${sourceName}:${t.contract} not found in compiler output`);
    const refs = compiled.evm.deployedBytecode.immutableReferences;
    const onchain = await provider.getCode(t.address);
    const match = onchain !== '0x' && maskImmutables(onchain, refs) === maskImmutables(compiled.evm.deployedBytecode.object, refs);
    if (!match) mismatches++;

    const ctor = compiled.abi.find((f: any) => f.type === 'constructor');
    const constructorArgs = ethers.AbiCoder.defaultAbiCoder()
      .encode(ctor ? ctor.inputs.map((x: any) => x.type) : [], t.args)
      .slice(2);

    const fileName = `${String(index).padStart(2, '0')}-${t.name}.json`;
    fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(input));
    const sizeKb = Math.round(fs.statSync(path.join(outDir, fileName)).size / 1024);
    console.log(`${match ? 'EXACT MATCH ' : 'NO MATCH    '} ${t.name.padEnd(28)} ${t.address}  ${sizeKb} KB`);

    readme.push(
      [
        `${String(index).padStart(2, '0')}. ${t.name}${match ? '' : '   <-- WARNING: does NOT match the on-chain bytecode, do not upload'}`,
        `    Page:              ${explorerBrowserUrl ? `${explorerBrowserUrl}/address/${t.address}` : t.address}`,
        `    Address:           ${t.address}`,
        `    File to upload:    ${fileName}  (${sizeKb} KB)`,
        `    Contract name:     ${t.contract}   (full path: ${sourceName}:${t.contract})`,
        `    Compiler:          v${longVersion}`,
        `    Optimizer:         ${input.settings.optimizer?.enabled ? `enabled, ${input.settings.optimizer.runs} runs` : 'disabled'} (already inside the JSON file)`,
        `    Constructor args:  ${constructorArgs || '(none)'}`,
        '',
      ].join('\n'),
    );
  }

  fs.writeFileSync(
    path.join(outDir, 'README.txt'),
    [
      `Manual verification files for "${networkName}" (chain ${deployment.chainId})`,
      '',
      'For each contract without a verified badge: open its page, Contract tab -> Verify & publish,',
      'method "Solidity (Standard JSON input)", pick the compiler below, upload its file, and enter the',
      'contract name / constructor args below if asked.',
      '',
      ...readme,
    ].join('\n'),
  );

  console.log(`\nWritten to ${outDir} (see README.txt there for per-contract upload details)`);
  if (mismatches > 0) {
    console.log(`\nWARNING: ${mismatches} file(s) don't match the on-chain bytecode — don't upload those; see README.txt.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  // Pending RPC requests can keep the process alive after an error.
  .finally(() => process.exit(process.exitCode ?? 0));
