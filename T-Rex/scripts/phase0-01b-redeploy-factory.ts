import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 0 / Step 1b — redeploy ONLY TREXFactory after a Factory-side contract
 * change (here: TokenPriceStorage integration) and repoint the EXISTING
 * TREXGateway at it.
 *
 * Why this script exists instead of re-running phase0-01-deploy-platform.ts:
 *   phase0-01 pulls contracts from the published npm package
 *   `@erc3643org/erc-3643@4.1.3`, which does NOT contain the TokenPriceStorage
 *   changes (those only exist in the local ERC-3643 repo source). Nothing else
 *   changed (implementations, TREXImplementationAuthority, IdFactory,
 *   TREXGateway are all untouched), so a full platform redeploy is unnecessary
 *   and would orphan every already-deployed issuer suite for no reason.
 *
 * What this script does:
 *   1. Loads TREXFactory's ABI/bytecode from vendor/erc3643/ in THIS project
 *      (NOT the npm package, which doesn't have TokenPriceStorage yet). That
 *      vendored copy is produced by `npm run sync:erc3643-artifacts` — see
 *      sync-erc3643-artifacts.ts. Run that (after compiling ERC-3643) any
 *      time TREXFactory/TokenPriceStorage change, before running this script.
 *   2. Deploys a new TREXFactory pointing at the SAME
 *      TREXImplementationAuthority + IdFactory already in deployments/<network>.json.
 *   3. Whitelists the new Factory on IdFactory (addTokenFactory) and removes
 *      the old one (removeTokenFactory) so only the live Factory can create
 *      token identities going forward.
 *   4. Transfers the new Factory's ownership to the EXISTING TREXGateway
 *      (deployTREXSuite is onlyOwner).
 *   5. Calls TREXGateway.setFactory(newFactory) — your backend keeps using the
 *      same Gateway address it always has; only the Factory it forwards to changes.
 *   6. Updates deployments/<network>.json, keeping the old Factory address in
 *      `platform.trexFactoryHistory` for audit purposes.
 *
 * IMPORTANT — long-term fix: this script reads TREXFactory from
 * vendor/erc3643/ (a checked-in copy inside THIS project, see
 * sync-erc3643-artifacts.ts), not a live path into another repo, so it works
 * the same on any machine/CI as long as vendor/erc3643/ is up to date. Once
 * TokenPriceStorage lands in a published/internal package version, this
 * script and the vendor/ folder become unnecessary and
 * phase0-01-deploy-platform.ts can be used as-is for future environments
 * (e.g. mainnet).
 */

// Only the pieces that changed need to come from the vendored local build.
// Everything else this script touches (TREXGateway, IdFactory) is unaffected
// and can keep using the npm package's ABI.
import TREXGatewayPkg from '@erc3643org/erc-3643';
import OnchainID from '@onchain-id/solidity';
import { getNetwork, deploymentsPathFor } from './network-config';

const deploymentsPath = deploymentsPathFor(getNetwork().name);
const vendorArtifactsRoot = path.join(__dirname, '..', 'vendor', 'erc3643', 'artifacts', 'contracts');

function loadLocalArtifact(relativeContractPath: string) {
  const artifactPath = path.join(vendorArtifactsRoot, relativeContractPath);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Could not find vendored artifact at ${artifactPath}. Run "npm run sync:erc3643-artifacts" first ` + `(after compiling the ERC-3643 repo).`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

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
  const { rpcUrl } = getNetwork();
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Missing DEPLOYER_PRIVATE_KEY in .env');
  }

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`No existing deployment found at ${deploymentsPath} — run phase0-01-deploy-platform.ts first.`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const { trexImplementationAuthority, trexGateway: trexGatewayAddress, identityFactory: identityFactoryAddress } = deployment.platform;
  const oldFactoryAddress = deployment.platform.trexFactory;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log('--- Where are we running? ---');
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId.toString());
  console.log('Deployer:', deployer.address);
  console.log('Reusing TREXImplementationAuthority:', trexImplementationAuthority);
  console.log('Reusing IdFactory:                  ', identityFactoryAddress);
  console.log('Reusing TREXGateway:                ', trexGatewayAddress);
  console.log('Replacing TREXFactory:               ', oldFactoryAddress, '-> (new)');

  // --- 1. Deploy the new TREXFactory from LOCAL artifacts (has TokenPriceStorage wiring) ---
  console.log('\n=== Step 1: Deploy new TREXFactory (local build, includes TokenPriceStorage) ===');
  const trexFactoryArtifact = loadLocalArtifact(path.join('factory', 'TREXFactory.sol', 'TREXFactory.json'));
  const newTrexFactory = await deployContract('TREXFactory (new)', trexFactoryArtifact.abi, trexFactoryArtifact.bytecode, deployer, [
    trexImplementationAuthority,
    identityFactoryAddress,
  ]);
  const newFactoryAddress = await newTrexFactory.getAddress();

  // --- 2. Whitelist the new Factory on IdFactory, remove the old one ---
  console.log('\n=== Step 2: Update IdFactory token-factory whitelist ===');
  const identityFactory = new ethers.Contract(identityFactoryAddress, OnchainID.contracts.Factory.abi, deployer);
  console.log('Adding new Factory as an allowed token factory...');
  const addTx = await (identityFactory as any).addTokenFactory(newFactoryAddress);
  await addTx.wait();
  console.log('  -> done (tx', addTx.hash, ')');

  console.log('Removing old Factory from the allowed token factories...');
  const removeTx = await (identityFactory as any).removeTokenFactory(oldFactoryAddress);
  await removeTx.wait();
  console.log('  -> done (tx', removeTx.hash, ')');

  // --- 3. Transfer new Factory ownership to the EXISTING Gateway ---
  console.log('\n=== Step 3: Transfer new TREXFactory ownership to the existing TREXGateway ===');
  const transferTx = await (newTrexFactory as any).transferOwnership(trexGatewayAddress);
  await transferTx.wait();
  console.log('  -> done (tx', transferTx.hash, ')');

  // --- 4. Repoint the EXISTING Gateway at the new Factory ---
  console.log('\n=== Step 4: Repoint TREXGateway at the new TREXFactory ===');
  const trexGateway = new ethers.Contract(trexGatewayAddress, TREXGatewayPkg.contracts.TREXGateway.abi, deployer);
  const setFactoryTx = await (trexGateway as any).setFactory(newFactoryAddress);
  await setFactoryTx.wait();
  console.log('  -> done (tx', setFactoryTx.hash, ')');

  // --- 5. Verify ---
  console.log('\n=== Verifying ===');
  const gatewayFactory = await (trexGateway as any).getFactory();
  const newFactoryOwner = await (newTrexFactory as any).owner();
  console.log('TREXGateway.getFactory():', gatewayFactory, gatewayFactory === newFactoryAddress ? '✓ matches new Factory' : '✗ MISMATCH');
  console.log('newTrexFactory.owner()  :', newFactoryOwner, newFactoryOwner === trexGatewayAddress ? '✓ owned by Gateway' : '✗ MISMATCH');
  if (gatewayFactory !== newFactoryAddress || newFactoryOwner !== trexGatewayAddress) {
    throw new Error('Post-migration verification failed — check the logs above before deploying any issuer suites.');
  }

  // --- 6. Persist, keeping an audit trail of the replaced Factory ---
  deployment.platform.trexFactory = newFactoryAddress;
  deployment.platform.trexFactoryHistory = deployment.platform.trexFactoryHistory || [];
  deployment.platform.trexFactoryHistory.push({
    address: oldFactoryAddress,
    replacedAt: new Date().toISOString(),
    reason: 'TokenPriceStorage integration',
  });
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));

  console.log('\n=== Done ===');
  console.log('New TREXFactory:', newFactoryAddress);
  console.log('Gateway now forwards deployTREXSuite() calls to it.');
  console.log('Saved to', deploymentsPath);
  console.log('\nNext: update phase0-02-deploy-issuer-suite.ts to pass `initialPrice` in tokenDetails,');
  console.log('and to also load the ABI for TokenPriceStorage from the local ERC-3643 artifacts so it can');
  console.log('read back `trexFactory.getTokenPriceStorage(token)` after deployment.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
