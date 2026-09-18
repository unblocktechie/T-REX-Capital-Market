import 'dotenv/config';
import hre from 'hardhat';
import * as fs from 'fs';
import { ethers } from 'ethers';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * Verifies every contract recorded in deployments/<network>.json on that
 * network's block explorer, so anyone can read the source and use the
 * Read/Write Contract tabs directly from the explorer instead of going
 * through a script.
 *
 * Must run through Hardhat (it calls the verify:verify task under the
 * hood) using the dedicated hardhat.verify.config.ts — NOT hardhat.config.ts
 * — since that's the project that compiles the third-party T-REX /
 * ONCHAINID contracts we deploy straight from their npm packages (see
 * verify/contracts/*.sol):
 *
 *   npx hardhat run scripts/verify-chain.ts --config hardhat.verify.config.ts --network <name>
 *
 * (there's also `npm run verify:chain -- --network <name>`, see package.json)
 *
 * Requires:
 *   - deployments/<network>.json to exist (deploy the chain first)
 *   - an explorer API key for the network (ETHERSCAN_API_KEY, or a
 *     network-specific one — see networks.json / hardhat.verify.config.ts)
 *   - for a network whose explorer isn't natively known to
 *     @nomicfoundation/hardhat-verify, add explorerApiUrl / explorerBrowserUrl
 *     to that network's entry in networks.json first
 *
 * The T-REX / ONCHAINID implementation contracts are compiled here from the
 * exact same npm package sources used at deploy time, with matching
 * compiler settings — the resulting bytecode is functionally identical to
 * what's on-chain (only the embedded metadata hash differs, since it was
 * built in a different environment), which explorers accept as a verified
 * "similar match": source, ABI, and the Read/Write Contract tabs all work.
 *
 * Known gap: if this network's TREXFactory was redeployed via
 * phase0-01b-redeploy-factory.ts (the customized vendor/erc3643 build,
 * see sync-erc3643-artifacts.ts), verifying it here will fail — only its
 * ABI/bytecode are vendored in this repo, not its source.
 */

interface VerifyTarget {
  name: string;
  address: string | undefined;
  constructorArguments: any[];
  contract?: string;
}

async function verifyOne(target: VerifyTarget): Promise<'verified' | 'already-verified' | 'failed' | 'skipped'> {
  if (!target.address) {
    console.log(`\n--- Skipping ${target.name} (no address in deployment file) ---`);
    return 'skipped';
  }
  console.log(`\n--- Verifying ${target.name} (${target.address}) ---`);
  try {
    await hre.run('verify:verify', {
      address: target.address,
      constructorArguments: target.constructorArguments,
      contract: target.contract,
    });
    console.log('  -> verified');
    return 'verified';
  } catch (error: any) {
    if (/already verified/i.test(error.message)) {
      console.log('  -> already verified, skipping');
      return 'already-verified';
    }
    console.error(`  -> FAILED: ${error.message}`);
    return 'failed';
  }
}

async function main() {
  const networkName = parseNetworkArg();
  // Alternate verify-only targets (e.g. "arcEtherscan", see
  // hardhat.verify.config.ts) aren't in networks.json — they share deployment
  // state with their base network ("arc") rather than being deployed separately.
  const deploymentsNetworkName = networkName.replace(/Etherscan$/, '');
  const networkConfig = loadNetworkConfig(deploymentsNetworkName);

  if (!fs.existsSync(networkConfig.deploymentsPath)) {
    throw new Error(`${networkConfig.deploymentsPath} not found — deploy this network first (npm run deploy:chain -- --network ${deploymentsNetworkName}).`);
  }
  const deployment = JSON.parse(fs.readFileSync(networkConfig.deploymentsPath, 'utf8'));
  const { platform, implementations, deployer } = deployment;

  const targets: VerifyTarget[] = [
    // --- Our own contracts (source lives in this repo's contracts/) ---
    {
      name: 'TREXPlatformController',
      address: platform.platformController,
      constructorArguments: [platform.platformControllerOwner, platform.paymentTokens],
      contract: 'contracts/platform/TREXPlatformController.sol:TREXPlatformController',
    },
    {
      name: 'CountryRestrictModule',
      address: platform.complianceModules?.countryRestrict,
      constructorArguments: [],
      contract: 'contracts/modules/CountryRestrictModule.sol:CountryRestrictModule',
    },
    {
      name: 'MaxBalanceModule',
      address: platform.complianceModules?.maxBalance,
      constructorArguments: [],
      contract: 'contracts/modules/MaxBalanceModule.sol:MaxBalanceModule',
    },
    {
      name: 'MaxInvestorsModule',
      address: platform.complianceModules?.maxInvestors,
      constructorArguments: [],
      contract: 'contracts/modules/MaxInvestorsModule.sol:MaxInvestorsModule',
    },

    // --- T-REX implementation contracts (no-arg upgradeable implementations) ---
    {
      name: 'ClaimTopicsRegistry (impl)',
      address: implementations?.claimTopicsRegistry,
      constructorArguments: [],
      contract: '@erc3643org/erc-3643/contracts/registry/implementation/ClaimTopicsRegistry.sol:ClaimTopicsRegistry',
    },
    {
      name: 'TrustedIssuersRegistry (impl)',
      address: implementations?.trustedIssuersRegistry,
      constructorArguments: [],
      contract: '@erc3643org/erc-3643/contracts/registry/implementation/TrustedIssuersRegistry.sol:TrustedIssuersRegistry',
    },
    {
      name: 'IdentityRegistryStorage (impl)',
      address: implementations?.identityRegistryStorage,
      constructorArguments: [],
      contract: '@erc3643org/erc-3643/contracts/registry/implementation/IdentityRegistryStorage.sol:IdentityRegistryStorage',
    },
    {
      name: 'IdentityRegistry (impl)',
      address: implementations?.identityRegistry,
      constructorArguments: [],
      contract: '@erc3643org/erc-3643/contracts/registry/implementation/IdentityRegistry.sol:IdentityRegistry',
    },
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

    // --- ONCHAINID identity infrastructure ---
    {
      name: 'Identity (impl)',
      address: implementations?.identity,
      constructorArguments: [deployer, true],
      contract: '@onchain-id/solidity/contracts/Identity.sol:Identity',
    },
    {
      name: 'ImplementationAuthority (ONCHAINID)',
      address: platform.identityImplementationAuthority,
      constructorArguments: [implementations?.identity],
      contract: '@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol:ImplementationAuthority',
    },
    {
      name: 'Factory (ONCHAINID / IdFactory)',
      address: platform.identityFactory,
      constructorArguments: [platform.identityImplementationAuthority],
      contract: '@onchain-id/solidity/contracts/factory/IdFactory.sol:IdFactory',
    },

    // --- TREXImplementationAuthority / Factory / Gateway ---
    {
      name: 'TREXImplementationAuthority',
      address: platform.trexImplementationAuthority,
      constructorArguments: [true, ethers.ZeroAddress, ethers.ZeroAddress],
      contract: '@erc3643org/erc-3643/contracts/proxy/authority/TREXImplementationAuthority.sol:TREXImplementationAuthority',
    },
    {
      name: 'TREXFactory',
      address: platform.trexFactory,
      constructorArguments: [platform.trexImplementationAuthority, platform.identityFactory],
      contract: '@erc3643org/erc-3643/contracts/factory/TREXFactory.sol:TREXFactory',
    },
    {
      name: 'TREXGateway',
      address: platform.trexGateway,
      constructorArguments: [platform.trexFactory, false],
      contract: '@erc3643org/erc-3643/contracts/factory/TREXGateway.sol:TREXGateway',
    },
  ];

  console.log(`=== Verifying contracts for "${networkName}" on its block explorer ===`);

  const results: Record<string, string[]> = { verified: [], 'already-verified': [], failed: [], skipped: [] };
  for (const target of targets) {
    const outcome = await verifyOne(target);
    results[outcome].push(target.name);
  }

  console.log('\n=== Summary ===');
  console.log('Verified:         ', results.verified.length ? results.verified.join(', ') : '(none)');
  console.log('Already verified: ', results['already-verified'].length ? results['already-verified'].join(', ') : '(none)');
  console.log('Skipped (no addr):', results.skipped.length ? results.skipped.join(', ') : '(none)');
  console.log('Failed:           ', results.failed.length ? results.failed.join(', ') : '(none)');

  if (results.failed.length > 0) {
    console.log('\nIf TREXFactory failed and this network ran phase0-01b-redeploy-factory.ts, that');
    console.log('custom build\'s source isn\'t vendored in this repo (only its ABI/bytecode) — it');
    console.log('cannot be verified from here.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
