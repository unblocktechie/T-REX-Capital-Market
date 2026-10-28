import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Whitelists (or removes) a payment token on an already-deployed
 * TREXPlatformController, from the controller owner's wallet — no
 * redeployment and no re-wiring of already-onboarded T-REX tokens needed.
 * Run this whenever the platform wants to support a new stablecoin (e.g.
 * adding USDC alongside USDT), or to retire one.
 *
 * Requires `npm run compile` to have been run first, and
 * deploy-platform-controller.ts to have already run (deployments/sepolia.json
 * must have platform.platformController set).
 *
 * Required env vars:
 *   SEPOLIA_RPC_URL
 *   PLATFORM_OWNER_PRIVATE_KEY   the controller owner's wallet — the only
 *                                key that can add/remove payment tokens.
 *   PAYMENT_TOKEN_ADDRESS        ERC-20 contract address to add (or remove).
 * Optional:
 *   ACTION                       "add" (default) or "remove".
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
  const ownerPrivateKey = process.env.PLATFORM_OWNER_PRIVATE_KEY;
  const paymentTokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;
  const action = (process.env.ACTION || 'add').toLowerCase();

  if (!rpcUrl || !ownerPrivateKey) {
    throw new Error('Missing SEPOLIA_RPC_URL or PLATFORM_OWNER_PRIVATE_KEY in .env');
  }
  if (!paymentTokenAddress || !ethers.isAddress(paymentTokenAddress)) {
    throw new Error('Missing or invalid PAYMENT_TOKEN_ADDRESS in .env');
  }
  if (action !== 'add' && action !== 'remove') {
    throw new Error('ACTION must be "add" or "remove"');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const owner = new ethers.Wallet(ownerPrivateKey, provider);

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const controllerAddress = deployment.platform?.platformController;
  if (!controllerAddress) {
    throw new Error('platform.platformController missing from deployments/sepolia.json — run deploy-platform-controller.ts first');
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const controller = new ethers.Contract(controllerAddress, artifact.abi, owner);

  console.log(`--- ${action === 'add' ? 'Adding' : 'Removing'} payment token on TREXPlatformController ---`);
  console.log('Controller:   ', controllerAddress);
  console.log('Owner:        ', owner.address);
  console.log('Payment token:', paymentTokenAddress);

  const tx = action === 'add'
    ? await (controller as any).addPaymentToken(paymentTokenAddress)
    : await (controller as any).removePaymentToken(paymentTokenAddress);
  const receipt = await tx.wait();
  console.log(`\n  -> done (tx ${receipt?.hash})`);

  const paymentTokens: string[] = await (controller as any).paymentTokens();
  deployment.platform.paymentTokens = paymentTokens;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));

  console.log('\n=== Done ===');
  console.log('Whitelisted payment tokens now:', paymentTokens);
  console.log('Saved to', deploymentsPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
