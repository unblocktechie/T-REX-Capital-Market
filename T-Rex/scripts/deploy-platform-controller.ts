import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

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
 * Required env vars (see .env.example):
 *   SEPOLIA_RPC_URL
 *   DEPLOYER_PRIVATE_KEY      the platform/backend wallet — becomes the
 *                             controller's owner unless PLATFORM_OWNER_ADDRESS
 *                             is set to something else.
 *   PAYMENT_TOKEN_ADDRESS     USDT (or equivalent) contract address on Sepolia.
 * Optional:
 *   PLATFORM_OWNER_ADDRESS    defaults to the deployer's own address.
 */

const deploymentsPath = path.join(__dirname, '..', 'deployments', 'sepolia.json');
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
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const paymentTokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;

  if (!rpcUrl || !privateKey) {
    throw new Error('Missing SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY in .env');
  }
  if (!paymentTokenAddress || !ethers.isAddress(paymentTokenAddress)) {
    throw new Error('Missing or invalid PAYMENT_TOKEN_ADDRESS in .env (USDT contract address on Sepolia)');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);
  const platformOwnerAddress = process.env.PLATFORM_OWNER_ADDRESS && ethers.isAddress(process.env.PLATFORM_OWNER_ADDRESS)
    ? process.env.PLATFORM_OWNER_ADDRESS
    : deployer.address;

  console.log('--- Deploying TREXPlatformController ---');
  console.log('Deployer:      ', deployer.address);
  console.log('Platform owner:', platformOwnerAddress);
  console.log('Payment token: ', paymentTokenAddress);

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const controller = await factory.deploy(platformOwnerAddress, paymentTokenAddress);
  const receipt = await controller.deploymentTransaction()?.wait();
  const controllerAddress = await controller.getAddress();

  console.log(`\n  -> TREXPlatformController deployed at ${controllerAddress} (tx ${receipt?.hash})`);

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  deployment.platform.platformController = controllerAddress;
  deployment.platform.paymentToken = paymentTokenAddress;
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
