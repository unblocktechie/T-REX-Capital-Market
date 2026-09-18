import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * One-time platform deployment for TREXPlatformController
 * (contracts/platform/TREXPlatformController.sol). Run this once per
 * environment, same as phase0-01-deploy-platform.ts and
 * deploy-compliance-modules.ts — this controller is shared across every
 * issuer's token from here on. Each issuer still has to run
 * wire-platform-controller.ts once per token to actually let it operate.
 *
 * Requires `npm run compile` to have been run first, so the artifact this
 * address comes from actually exists on disk.
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

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const controller = await factory.deploy(platformOwnerAddress, paymentTokenAddresses.join(', '));
  const receipt = await controller.deploymentTransaction()?.wait();
  const controllerAddress = await controller.getAddress();

  console.log(`\n  -> TREXPlatformController deployed at ${controllerAddress} (tx ${receipt?.hash})`);

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  deployment.platform.platformController = controllerAddress;
  deployment.platform.paymentTokens = paymentTokenAddresses.join(', ');
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
