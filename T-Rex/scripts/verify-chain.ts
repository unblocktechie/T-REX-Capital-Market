import 'dotenv/config';
import hre from 'hardhat';
import * as fs from 'fs';
import { ethers } from 'ethers';
import { loadNetworkConfig } from './lib/network-config';

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
 * On networks with a custom (non-Etherscan) explorer — e.g. arc testnet's
 * Blockscout instance — this fails on IdFactory, ModularCompliance (impl),
 * Token (impl), TREXImplementationAuthority and TREXFactory: their minimal
 * solc input is too large for that explorer's request size limit (413s)
 * and/or hits source-path mismatches against Hardhat's verify plugin. Those
 * five have their own standalone fallback verifiers for that case — see
 * verify-idfactory.ts, verify-large-contracts.ts, and verify-trexfactory.ts
 * (all wired together, network-aware, by verify-all.ts). On networks with a
 * native Etherscan explorer (sepolia, arbitrum, ...) the other four verify
 * fine right here, but IdFactory still fails on its bytecode check and
 * needs verify-idfactory.ts — verify-all.ts runs it on every network.
 */

interface VerifyTarget {
  name: string;
  address: string | undefined;
  constructorArguments: any[];
  contract?: string;
}

// hardhat-verify polls the explorer's "check verification status" endpoint
// every 3s with NO timeout (see getVerificationStatus in
// @nomicfoundation/hardhat-verify/src/internal/etherscan.ts) — if the
// explorer's backend queue is slow (seen on Arbiscan/Arbitrum Sepolia:
// source stays "not verified" for 20+ minutes after a successful submit),
// this hangs the whole batch forever. Bounding the wait means a slow queue
// just gets reported as "submitted, still pending" and the script moves on
// to the next contract instead of blocking indefinitely — the submission
// itself already succeeded, so it'll still verify once the explorer
// eventually processes it, you just don't get told synchronously.
const VERIFY_TIMEOUT_MS = 3 * 60 * 1000;

async function verifyOne(target: VerifyTarget): Promise<'verified' | 'already-verified' | 'failed' | 'skipped' | 'submitted-pending'> {
  if (!target.address) {
    console.log(`\n--- Skipping ${target.name} (no address in deployment file) ---`);
    return 'skipped';
  }
  console.log(`\n--- Verifying ${target.name} (${target.address}) ---`);
  try {
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(new Error('TIMEOUT'));
      }, VERIFY_TIMEOUT_MS);
    });
    await Promise.race([
      hre.run('verify:verify', {
        address: target.address,
        constructorArguments: target.constructorArguments,
        contract: target.contract,
      }),
      timeout,
    ]);
    console.log('  -> verified');
    return 'verified';
  } catch (error: any) {
    if (error?.message === 'TIMEOUT') {
      console.log(`  -> submitted, but the explorer hasn't confirmed it after ${VERIFY_TIMEOUT_MS / 1000}s — moving on (it's likely just slow, re-run verify:all later to confirm/retry).`);
      return 'submitted-pending';
    }
    if (/already verified/i.test(error.message)) {
      console.log('  -> already verified, skipping');
      return 'already-verified';
    }
    console.error(`  -> FAILED: ${error.message}`);
    return 'failed';
  }
}

async function main() {
  // Not parseNetworkArg(): `hardhat run` strips --network from process.argv
  // before running this script, so that would silently fall back to sepolia.
  const networkName = hre.network.name;
  const networkConfig = loadNetworkConfig(networkName);

  if (!fs.existsSync(networkConfig.deploymentsPath)) {
    throw new Error(`${networkConfig.deploymentsPath} not found — deploy this network first (npm run deploy:chain -- --network ${networkName}).`);
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
      name: 'IdFactoryAccessManager',
      address: platform.idFactoryAccessManager,
      constructorArguments: [platform.identityFactory, platform.idFactoryAccessManagerAdmin],
      contract: 'contracts/platform/IdFactoryAccessManager.sol:IdFactoryAccessManager',
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

  const results: Record<string, string[]> = { verified: [], 'already-verified': [], failed: [], skipped: [], 'submitted-pending': [] };
  for (const target of targets) {
    const outcome = await verifyOne(target);
    results[outcome].push(target.name);
    // Etherscan free tier allows ~3 calls/sec; back off between contracts.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('\n=== Summary ===');
  console.log('Verified:         ', results.verified.length ? results.verified.join(', ') : '(none)');
  console.log('Already verified: ', results['already-verified'].length ? results['already-verified'].join(', ') : '(none)');
  console.log('Skipped (no addr):', results.skipped.length ? results.skipped.join(', ') : '(none)');
  console.log('Submitted, pending:', results['submitted-pending'].length ? results['submitted-pending'].join(', ') : '(none)');
  console.log('Failed:           ', results.failed.length ? results.failed.join(', ') : '(none)');

  if (results.failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Abandoned "submitted-pending" polling loops (see VERIFY_TIMEOUT_MS
    // above) keep their own setTimeout chain alive in the background, which
    // would otherwise keep this process running indefinitely even though
    // we're done with everything we're going to report. Force the exit.
    process.exit(process.exitCode ?? 0);
  });
