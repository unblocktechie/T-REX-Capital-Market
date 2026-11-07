import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';
import { NonceManager } from './lib/nonce-manager';

/**
 * One-time platform deployment for TREXPlatformController
 * (contracts/platform/TREXPlatformController.sol). Run this once per
 * environment, same as phase0-01-deploy-platform.ts and
 * deploy-compliance-modules.ts — this controller is shared across every
 * issuer's token from here on. Each issuer still has to run
 * wire-platform-controller.ts once per token to actually let it operate.
 *
 * Deploys the implementation, then an ERC1967Proxy pointing at it that
 * calls `initialize` in the same transaction. The PROXY address is what gets
 * saved as `platformController` and wired into tokens; later versions are
 * rolled out with upgrade-platform-controller.ts and keep that address.
 *
 * Requires `npm run compile` to have been run first, so the artifacts these
 * addresses come from actually exist on disk.
 *
 * Network + payment tokens come from networks.json (see network-config.ts) —
 * pass --network <name> (defaults to "sepolia"). The RPC URL and deployer
 * key env var names are looked up per-network from networks.json; set the
 * actual values in .env. Payment token addresses / platform owner default
 * to the network's networks.json entry, falling back to PAYMENT_TOKEN_ADDRESSES
 * / PLATFORM_OWNER_ADDRESS in .env if that entry leaves them empty. More
 * payment tokens can be whitelisted later via add-payment-token.ts, from the
 * owner wallet, with no redeploy.
 */

const artifactPath = path.join(
  __dirname,
  '..',
  'artifacts',
  'contracts',
  'platform',
  'TREXPlatformController.sol',
  'TREXPlatformController.json',
);

const proxyArtifactPath = path.join(
  __dirname,
  '..',
  'artifacts',
  '@openzeppelin',
  'contracts',
  'proxy',
  'ERC1967',
  'ERC1967Proxy.sol',
  'ERC1967Proxy.json',
);

// keccak256('eip1967.proxy.implementation') - 1
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

async function main() {
  const networkConfig = loadNetworkConfig(parseNetworkArg());
  const deploymentsPath = networkConfig.deploymentsPath;

  const envPaymentTokenAddresses = (process.env.PAYMENT_TOKEN_ADDRESSES || '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  const paymentTokenAddresses = networkConfig.paymentTokenAddresses.length > 0
    ? networkConfig.paymentTokenAddresses
    : envPaymentTokenAddresses;

  if (paymentTokenAddresses.length === 0 || !paymentTokenAddresses.every((address) => ethers.isAddress(address))) {
    throw new Error(
      `Missing or invalid payment token addresses for network "${networkConfig.name}" — set paymentTokenAddresses in networks.json or PAYMENT_TOKEN_ADDRESSES in .env (comma-separated ERC-20 addresses).`,
    );
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const deployer = new ethers.Wallet(networkConfig.deployerPrivateKey, provider);
  const envPlatformOwnerAddress = process.env.PLATFORM_OWNER_ADDRESS && ethers.isAddress(process.env.PLATFORM_OWNER_ADDRESS)
    ? process.env.PLATFORM_OWNER_ADDRESS
    : undefined;
  const platformOwnerAddress = (networkConfig.platformOwnerAddress && ethers.isAddress(networkConfig.platformOwnerAddress))
    ? networkConfig.platformOwnerAddress
    : envPlatformOwnerAddress || deployer.address;

  console.log('--- Deploying TREXPlatformController ---');
  console.log('Deployer:       ', deployer.address);
  console.log('Platform owner: ', platformOwnerAddress);
  console.log('Payment tokens: ', paymentTokenAddresses.join(', '));

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

  const existing = deployment.platform.platformController;
  let controllerAddress: string;
  let implementationAddress: string;
  if (existing && (await provider.getCode(existing)) !== '0x') {
    const slot = await provider.getStorage(existing, IMPLEMENTATION_SLOT);
    if (BigInt(slot) === 0n) {
      // Pre-proxy controller: can't be upgraded in place, and replacing it
      // means every token must add the new address as an Agent again.
      throw new Error(
        `platformController ${existing} is the legacy non-upgradeable controller. To migrate, move it to `
        + `platform.platformControllerLegacy in ${deploymentsPath}, clear platform.platformController, and re-run.`,
      );
    }
    controllerAddress = existing;
    implementationAddress = ethers.getAddress(ethers.dataSlice(slot, 12));
    console.log(`\nSkipping deploy — TREXPlatformController proxy already deployed at ${existing}`);
  } else {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const proxyArtifact = JSON.parse(fs.readFileSync(proxyArtifactPath, 'utf8'));
    const nonces = new NonceManager(provider, deployer.address);

    const implementationFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    const implementation = await implementationFactory.deploy({ nonce: await nonces.take() });
    const implementationReceipt = await implementation.deploymentTransaction()?.wait();
    implementationAddress = await implementation.getAddress();
    console.log(`\n  -> Implementation deployed at ${implementationAddress} (tx ${implementationReceipt?.hash})`);

    const initData = implementationFactory.interface.encodeFunctionData('initialize', [platformOwnerAddress, paymentTokenAddresses]);
    const proxyFactory = new ethers.ContractFactory(proxyArtifact.abi, proxyArtifact.bytecode, deployer);
    const proxy = await proxyFactory.deploy(implementationAddress, initData, { nonce: await nonces.take() });
    const proxyReceipt = await proxy.deploymentTransaction()?.wait();
    controllerAddress = await proxy.getAddress();
    console.log(`  -> TREXPlatformController proxy deployed at ${controllerAddress} (tx ${proxyReceipt?.hash})`);
  }

  deployment.platform.platformController = controllerAddress;
  deployment.platform.platformControllerImplementation = implementationAddress;
  deployment.platform.paymentTokens = paymentTokenAddresses;
  deployment.platform.platformControllerOwner = platformOwnerAddress;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));

  console.log('\n=== Done ===');
  console.log('Next step: for each issuer token, run wire-platform-controller.ts so');
  console.log('the issuer adds this controller as an Agent and the backend sets a price.');
  console.log('Saved to', deploymentsPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
