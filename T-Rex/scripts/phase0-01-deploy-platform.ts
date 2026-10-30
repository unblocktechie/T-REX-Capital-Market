import 'dotenv/config';
import { ethers } from 'ethers';
import OnchainID from '@onchain-id/solidity';
import TREX from '@erc3643org/erc-3643';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';
import { NonceManager } from './lib/nonce-manager';

/**
 * Phase 0 / Step 1 — deploy the PLATFORM contracts.
 *
 * These are the "fixed forever" addresses every future request goes to:
 *   - 6 T-REX implementation contracts (the shared logic every issuer's proxies point to)
 *   - the ONCHAINID identity implementation + its own ImplementationAuthority + Factory
 *   - TREXImplementationAuthority (the "reference" IA that ties the 6 implementations together)
 *   - TREXFactory (does the actual per-issuer proxy deployment)
 *   - TREXGateway (the access-controlled front door apps call instead of the Factory directly)
 *
 * This is NOT run per-issuer. Run it exactly once per environment (once for Sepolia,
 * later once for mainnet). Step 2 (deploying one issuer's own token suite) is a
 * separate script that reuses the addresses this script writes out.
 *
 * Resumable: deployments/<network>.json is written after every single step
 * (not just at the end), and on start this script loads whatever's already
 * there and skips any step whose address is already recorded and still has
 * code on-chain. That way a crash/RPC hiccup partway through (nonce
 * mismatches, timeouts, etc.) never needs a manual "figure out where it got
 * to" — just re-run the same command and it picks up where it left off.
 */

async function deployContract(name: string, abi: any, bytecode: string, signer: ethers.Wallet, nonces: NonceManager, args: any[] = []) {
  console.log(`\nDeploying ${name}...`);
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...args, { nonce: await nonces.take() });
  const receipt = await contract.deploymentTransaction()?.wait();
  const address = await contract.getAddress();
  console.log(`  -> ${name} deployed at ${address} (tx ${receipt?.hash}, block ${receipt?.blockNumber})`);
  return contract;
}

async function main() {
  const networkConfig = loadNetworkConfig(parseNetworkArg());

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const deployer = new ethers.Wallet(networkConfig.deployerPrivateKey, provider);

  console.log('--- Where are we running? ---');
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId.toString());
  console.log('Deployer:', deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log('Balance: ', ethers.formatEther(balance), 'ETH');
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 ETH on this network. Fund it from a Sepolia faucet first.`);
  }

  const outPath = networkConfig.deploymentsPath;
  const deployment: any = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
    : {
        network: networkConfig.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        platform: {},
        implementations: {},
      };
  deployment.platform ||= {};
  deployment.implementations ||= {};

  const nonces = new NonceManager(provider, deployer.address);

  function save() {
    deployment.deployedAt = new Date().toISOString();
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  }

  /**
   * Reuses a previously-deployed contract recorded in deployments/<network>.json
   * if it's still there on-chain, otherwise deploys it fresh and persists the
   * address immediately (before moving on to the next contract).
   */
  async function deployOrReuse(store: Record<string, string>, key: string, name: string, abi: any, bytecode: string, args: any[] = []) {
    const existing = store[key];
    if (existing) {
      const code = await provider.getCode(existing);
      if (code !== '0x') {
        console.log(`\nSkipping ${name} — already deployed at ${existing}`);
        return new ethers.Contract(existing, abi, deployer);
      }
      console.log(`\n${name} recorded at ${existing} but has no code on-chain, redeploying...`);
    }
    const contract = await deployContract(name, abi, bytecode, deployer, nonces, args);
    store[key] = await contract.getAddress();
    save();
    return contract;
  }

  /**
   * Same idea, but for a one-off state-changing tx (not a deploy) keyed by a
   * flag in the deployment file. The flag alone isn't enough: a crash between
   * the tx confirming and the flag being saved would make a resume resend it,
   * which reverts (e.g. "caller is not the owner" after transferOwnership)
   * and blocks every later re-run. So `checkDone` asks the chain first.
   */
  async function runOnce(
    flagKey: string,
    description: string,
    checkDone: () => Promise<boolean>,
    send: (nonce: number) => Promise<ethers.ContractTransactionResponse>,
  ) {
    if (deployment[flagKey]) {
      console.log(`\nSkipping "${description}" — already done`);
      return;
    }
    if (await checkDone()) {
      console.log(`\nSkipping "${description}" — already true on-chain (from an interrupted earlier run)`);
      deployment[flagKey] = true;
      save();
      return;
    }
    console.log(`\n${description}...`);
    const tx = await send(await nonces.take());
    await tx.wait();
    console.log('  -> done (tx', tx.hash, ')');
    deployment[flagKey] = true;
    save();
  }

  // --- 1. Deploy the 6 T-REX implementation contracts ---
  console.log('\n=== Step 1: T-REX implementation contracts ===');
  const impl = deployment.implementations;
  const ctrImpl = await deployOrReuse(impl, 'claimTopicsRegistry', 'ClaimTopicsRegistry (impl)', TREX.contracts.ClaimTopicsRegistry.abi, TREX.contracts.ClaimTopicsRegistry.bytecode);
  const tirImpl = await deployOrReuse(impl, 'trustedIssuersRegistry', 'TrustedIssuersRegistry (impl)', TREX.contracts.TrustedIssuersRegistry.abi, TREX.contracts.TrustedIssuersRegistry.bytecode);
  const irsImpl = await deployOrReuse(impl, 'identityRegistryStorage', 'IdentityRegistryStorage (impl)', TREX.contracts.IdentityRegistryStorage.abi, TREX.contracts.IdentityRegistryStorage.bytecode);
  const irImpl = await deployOrReuse(impl, 'identityRegistry', 'IdentityRegistry (impl)', TREX.contracts.IdentityRegistry.abi, TREX.contracts.IdentityRegistry.bytecode);
  const mcImpl = await deployOrReuse(impl, 'modularCompliance', 'ModularCompliance (impl)', TREX.contracts.ModularCompliance.abi, TREX.contracts.ModularCompliance.bytecode);
  const tokenImpl = await deployOrReuse(impl, 'token', 'Token (impl)', TREX.contracts.Token.abi, TREX.contracts.Token.bytecode);

  // --- 2. Deploy ONCHAINID's identity implementation + its ImplementationAuthority + Factory ---
  console.log('\n=== Step 2: ONCHAINID identity infrastructure ===');
  const identityImpl = await deployOrReuse(impl, 'identity', 'Identity (impl)', OnchainID.contracts.Identity.abi, OnchainID.contracts.Identity.bytecode, [
    deployer.address,
    true, // isLibrary
  ]);
  const identityImplAuthority = await deployOrReuse(
    deployment.platform,
    'identityImplementationAuthority',
    'ImplementationAuthority (ONCHAINID)',
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    [await identityImpl.getAddress()],
  );
  const identityFactory = await deployOrReuse(
    deployment.platform,
    'identityFactory',
    'Factory (ONCHAINID / IdFactory)',
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    [await identityImplAuthority.getAddress()],
  );

  // --- 3. Deploy the reference TREXImplementationAuthority and register the 6 implementations as a version ---
  console.log('\n=== Step 3: TREXImplementationAuthority ===');
  const trexIA = await deployOrReuse(
    deployment.platform,
    'trexImplementationAuthority',
    'TREXImplementationAuthority',
    TREX.contracts.TREXImplementationAuthority.abi,
    TREX.contracts.TREXImplementationAuthority.bytecode,
    [true, ethers.ZeroAddress, ethers.ZeroAddress],
  );

  const versionStruct = { major: 4, minor: 1, patch: 3 };
  const contractsStruct = {
    tokenImplementation: await tokenImpl.getAddress(),
    ctrImplementation: await ctrImpl.getAddress(),
    irImplementation: await irImpl.getAddress(),
    irsImplementation: await irsImpl.getAddress(),
    tirImplementation: await tirImpl.getAddress(),
    mcImplementation: await mcImpl.getAddress(),
  };
  await runOnce(
    'versionRegistered',
    'Registering implementation version 4.1.3 on the TREXImplementationAuthority',
    async () => {
      const current = await (trexIA as any).getCurrentVersion();
      return (
        Number(current.major) === versionStruct.major &&
        Number(current.minor) === versionStruct.minor &&
        Number(current.patch) === versionStruct.patch
      );
    },
    (nonce) => (trexIA as any).addAndUseTREXVersion(versionStruct, contractsStruct, { nonce }),
  );

  // --- 4. Deploy TREXFactory, wire it to the identity factory ---
  console.log('\n=== Step 4: TREXFactory ===');
  const trexFactory = await deployOrReuse(deployment.platform, 'trexFactory', 'TREXFactory', TREX.contracts.TREXFactory.abi, TREX.contracts.TREXFactory.bytecode, [
    await trexIA.getAddress(),
    await identityFactory.getAddress(),
  ]);
  await runOnce(
    'trexFactoryAllowedOnIdentityFactory',
    'Allowing TREXFactory to deploy identities through the ONCHAINID factory',
    async () => (identityFactory as any).isTokenFactory(await trexFactory.getAddress()),
    async (nonce) => (identityFactory as any).addTokenFactory(await trexFactory.getAddress(), { nonce }),
  );

  // --- 5. Deploy TREXGateway (the front door apps will call) and give it ownership of the Factory ---
  console.log('\n=== Step 5: TREXGateway ===');
  const trexGateway = await deployOrReuse(deployment.platform, 'trexGateway', 'TREXGateway', TREX.contracts.TREXGateway.abi, TREX.contracts.TREXGateway.bytecode, [
    await trexFactory.getAddress(),
    false, // public deployments disabled — only approved deployers (our backend) can call deployTREXSuite
  ]);
  await runOnce(
    'trexFactoryOwnershipTransferred',
    'Transferring TREXFactory ownership to TREXGateway (required — deployTREXSuite is onlyOwner)',
    async () => (await (trexFactory as any).owner()).toLowerCase() === (await trexGateway.getAddress()).toLowerCase(),
    async (nonce) => (trexFactory as any).transferOwnership(await trexGateway.getAddress(), { nonce }),
  );
  await runOnce(
    'deployerApprovedOnGateway',
    'Approving the deployer wallet itself as an approved deployer on the Gateway (so Step 2 can call it)',
    async () => (trexGateway as any).isDeployer(deployer.address),
    (nonce) => (trexGateway as any).addDeployer(deployer.address, { nonce }),
  );

  save();

  console.log('\n=== Done ===');
  console.log('Platform addresses saved to', outPath);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
