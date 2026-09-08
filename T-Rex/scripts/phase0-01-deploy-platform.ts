import 'dotenv/config';
import { ethers } from 'ethers';
import OnchainID from '@onchain-id/solidity';
import TREX from '@erc3643org/erc-3643';
import * as fs from 'fs';
import * as path from 'path';
import { platform } from 'os';

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
 */

async function deployContract(name: string, abi: any, bytecode: string, signer: ethers.Wallet, args: any[] = []) {
  console.log(`\nDeploying ${name}...`);
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy(...args);
  const receipt = await contract.deploymentTransaction()?.wait();
  const address = await contract.getAddress();
  console.log(`  -> ${name} deployed at ${address} (tx ${receipt?.hash}, block ${receipt?.blockNumber})`);
  return contract;
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    throw new Error('Missing SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY in .env');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log('--- Where are we running? ---');
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId.toString());
  console.log('Deployer:', deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log('Balance: ', ethers.formatEther(balance), 'ETH');
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 ETH on this network. Fund it from a Sepolia faucet first.`);
  }

  // --- 1. Deploy the 6 T-REX implementation contracts ---
  console.log('\n=== Step 1: T-REX implementation contracts ===');
  const ctrImpl = await deployContract('ClaimTopicsRegistry (impl)', TREX.contracts.ClaimTopicsRegistry.abi, TREX.contracts.ClaimTopicsRegistry.bytecode, deployer);
  const tirImpl = await deployContract('TrustedIssuersRegistry (impl)', TREX.contracts.TrustedIssuersRegistry.abi, TREX.contracts.TrustedIssuersRegistry.bytecode, deployer);
  const irsImpl = await deployContract('IdentityRegistryStorage (impl)', TREX.contracts.IdentityRegistryStorage.abi, TREX.contracts.IdentityRegistryStorage.bytecode, deployer);
  const irImpl = await deployContract('IdentityRegistry (impl)', TREX.contracts.IdentityRegistry.abi, TREX.contracts.IdentityRegistry.bytecode, deployer);
  const mcImpl = await deployContract('ModularCompliance (impl)', TREX.contracts.ModularCompliance.abi, TREX.contracts.ModularCompliance.bytecode, deployer);
  const tokenImpl = await deployContract('Token (impl)', TREX.contracts.Token.abi, TREX.contracts.Token.bytecode, deployer);

  // --- 2. Deploy ONCHAINID's identity implementation + its ImplementationAuthority + Factory ---
  console.log('\n=== Step 2: ONCHAINID identity infrastructure ===');
  const identityImpl = await deployContract('Identity (impl)', OnchainID.contracts.Identity.abi, OnchainID.contracts.Identity.bytecode, deployer, [
    deployer.address,
    true, // isLibrary
  ]);
  const identityImplAuthority = await deployContract(
    'ImplementationAuthority (ONCHAINID)',
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer,
    [await identityImpl.getAddress()],
  );
  const identityFactory = await deployContract('Factory (ONCHAINID / IdFactory)', OnchainID.contracts.Factory.abi, OnchainID.contracts.Factory.bytecode, deployer, [
    await identityImplAuthority.getAddress(),
  ]);

  // --- 3. Deploy the reference TREXImplementationAuthority and register the 6 implementations as a version ---
  console.log('\n=== Step 3: TREXImplementationAuthority ===');
  const trexIA = await deployContract(
    'TREXImplementationAuthority',
    TREX.contracts.TREXImplementationAuthority.abi,
    TREX.contracts.TREXImplementationAuthority.bytecode,
    deployer,
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
  console.log('\nRegistering implementation version 4.1.3 on the TREXImplementationAuthority...');
  const addVersionTx = await (trexIA as any).addAndUseTREXVersion(versionStruct, contractsStruct);
  await addVersionTx.wait();
  console.log('  -> version registered (tx', addVersionTx.hash, ')');

  // --- 4. Deploy TREXFactory, wire it to the identity factory ---
  console.log('\n=== Step 4: TREXFactory ===');
  const trexFactory = await deployContract('TREXFactory', TREX.contracts.TREXFactory.abi, TREX.contracts.TREXFactory.bytecode, deployer, [
    await trexIA.getAddress(),
    await identityFactory.getAddress(),
  ]);
  console.log('\nAllowing TREXFactory to deploy identities through the ONCHAINID factory...');
  const addTokenFactoryTx = await (identityFactory as any).addTokenFactory(await trexFactory.getAddress());
  await addTokenFactoryTx.wait();
  console.log('  -> done (tx', addTokenFactoryTx.hash, ')');

  // --- 5. Deploy TREXGateway (the front door apps will call) and give it ownership of the Factory ---
  console.log('\n=== Step 5: TREXGateway ===');
  const trexGateway = await deployContract('TREXGateway', TREX.contracts.TREXGateway.abi, TREX.contracts.TREXGateway.bytecode, deployer, [
    await trexFactory.getAddress(),
    false, // public deployments disabled — only approved deployers (our backend) can call deployTREXSuite
  ]);
  console.log('\nTransferring TREXFactory ownership to TREXGateway (required — deployTREXSuite is onlyOwner)...');
  const transferOwnershipTx = await (trexFactory as any).transferOwnership(await trexGateway.getAddress());
  await transferOwnershipTx.wait();
  console.log('  -> done (tx', transferOwnershipTx.hash, ')');

  console.log('\nApproving the deployer wallet itself as an approved deployer on the Gateway (so Step 2 can call it)...');
  const addDeployerTx = await (trexGateway as any).addDeployer(deployer.address);
  await addDeployerTx.wait();
  console.log('  -> done (tx', addDeployerTx.hash, ')');

  // --- Persist everything Step 2 (and the eventual backend) will need ---
  const deployment = {
    network: 'sepolia',
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    platform: {
      trexImplementationAuthority: await trexIA.getAddress(),
      trexFactory: await trexFactory.getAddress(),
      trexGateway: await trexGateway.getAddress(),
      identityImplementationAuthority: await identityImplAuthority.getAddress(),
      identityFactory: await identityFactory.getAddress(),
    },
    implementations: {
      token: await tokenImpl.getAddress(),
      claimTopicsRegistry: await ctrImpl.getAddress(),
      identityRegistry: await irImpl.getAddress(),
      identityRegistryStorage: await irsImpl.getAddress(),
      trustedIssuersRegistry: await tirImpl.getAddress(),
      modularCompliance: await mcImpl.getAddress(),
      identity: await identityImpl.getAddress(),
    },
  };

  const outDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sepolia.json');
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log('\n=== Done ===');
  console.log('Platform addresses saved to', outPath);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


