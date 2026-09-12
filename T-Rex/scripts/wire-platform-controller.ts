import 'dotenv/config';
import { ethers } from 'ethers';
import TREX from '@erc3643org/erc-3643';
import * as fs from 'fs';
import * as path from 'path';
import { getNetwork, deploymentsPathFor } from './network-config';

/**
 * Per-token onboarding step for TREXPlatformController. Run once for every
 * issuer token that should support backend-key-free buy/redeem, after
 * phase0-02-deploy-issuer-suite.ts and deploy-platform-controller.ts have
 * both already run.
 *
 * Both steps below are signed by the ISSUER's own wallet — the platform
 * never touches an Agent key, and never sets or controls the token's price:
 *
 *   1. token.addAgent(controller) — one-time, makes the controller a real
 *      Agent able to mint/burn on this token.
 *   2. controller.setPrice(token, price) — TREXPlatformController.setPrice
 *      only accepts calls from the token's own owner() (the issuer).
 *      Pricing, and responsibility for it, stays entirely with the issuer.
 *
 * Required env vars:
 *   NETWORK, ARC_TESTNET_RPC_URL / SEPOLIA_RPC_URL
 *   ISSUER_PRIVATE_KEY        the issuer's own wallet (token owner) — the
 *                             only key that can add the controller as Agent
 *                             or set this token's price.
 *   TOKEN_ADDRESS             the T-REX token to wire up.
 *   INITIAL_PRICE             human-readable price per whole token in the
 *                             payment token's units, e.g. "10" for 10 USDT.
 */

const deploymentsPath = deploymentsPathFor(getNetwork().name);
const controllerArtifactPath = path.join(
  __dirname,
  '..',
  'artifacts',
  'contracts',
  'platform',
  'TREXPlatformController.sol',
  'TREXPlatformController.json',
);

async function main() {
  const { rpcUrl, name: networkName } = getNetwork();
  const issuerPrivateKey = process.env.ISSUER_PRIVATE_KEY;
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const initialPrice = process.env.INITIAL_PRICE;

  if (!issuerPrivateKey) {
    throw new Error('Missing ISSUER_PRIVATE_KEY in .env');
  }
  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error('Missing or invalid TOKEN_ADDRESS in .env');
  }
  if (!initialPrice) {
    throw new Error('Missing INITIAL_PRICE in .env (human-readable, e.g. "10" for 10 USDT per token)');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const issuer = new ethers.Wallet(issuerPrivateKey, provider);

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const controllerAddress = deployment.platform?.platformController;
  const paymentTokenAddress = deployment.platform?.paymentToken;
  if (!controllerAddress || !paymentTokenAddress) {
    throw new Error(`platform.platformController / platform.paymentToken missing from deployments/${networkName}.json — run deploy-platform-controller.ts first`);
  }

  const controllerArtifact = JSON.parse(fs.readFileSync(controllerArtifactPath, 'utf8'));
  const controllerAsIssuer = new ethers.Contract(controllerAddress, controllerArtifact.abi, issuer);
  const token = new ethers.Contract(tokenAddress, TREX.contracts.Token.abi, provider);
  const tokenAsIssuer = token.connect(issuer);

  console.log('--- Wiring TREXPlatformController to token', tokenAddress, '---');
  console.log('Controller:', controllerAddress);
  console.log('Issuer:    ', issuer.address);

  const tokenOwner = await (token as any).owner();
  if (tokenOwner.toLowerCase() !== issuer.address.toLowerCase()) {
    throw new Error(`ISSUER_PRIVATE_KEY (${issuer.address}) is not this token's owner (${tokenOwner}) — addAgent/setPrice will revert`);
  }

  const alreadyAgent = await (token as any).isAgent(controllerAddress);
  if (alreadyAgent) {
    console.log('\nController is already an Agent of this token — skipping addAgent.');
  } else {
    console.log('\nIssuer wallet adding controller as Agent...');
    const addAgentTx = await (tokenAsIssuer as any).addAgent(controllerAddress);
    await addAgentTx.wait();
    console.log('  -> done (tx', addAgentTx.hash, ')');
  }

  // Read the payment token's own decimals on-chain rather than assuming 6 —
  // same "don't duplicate what's already on chain" principle as the
  // controller contract itself.
  const paymentToken = new ethers.Contract(paymentTokenAddress, ['function decimals() view returns (uint8)'], provider);
  const paymentDecimals = await (paymentToken as any).decimals();
  const price = ethers.parseUnits(initialPrice, paymentDecimals);

  console.log(`\nIssuer wallet setting price = ${initialPrice} (payment-token units, ${price} smallest units)...`);
  const setPriceTx = await (controllerAsIssuer as any).setPrice(tokenAddress, price);
  await setPriceTx.wait();
  console.log('  -> done (tx', setPriceTx.hash, ')');

  console.log('\n=== Done ===');
  console.log('Reminder: the issuer must also approve the controller to spend USDT');
  console.log('for redemptions: paymentToken.approve(controller, amount).');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
