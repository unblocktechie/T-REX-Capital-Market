import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';

/**
 * One-time deployment for IdFactoryAccessManager
 * (contracts/platform/IdFactoryAccessManager.sol), the access-control front
 * door for this network's IdFactory (ONCHAINID).
 *
 * Requires `npm run compile` to have been run first, so the artifact this
 * deploys from actually exists on disk, and requires the platform to already
 * be deployed (deployments/<network>.json must have platform.identityFactory
 * set — see phase0-01-deploy-platform.ts / deploy-chain.ts).
 *
 * Constructor arguments:
 *   - idFactory: platform.identityFactory from deployments/<network>.json,
 *     unless overridden via ID_FACTORY_ADDRESS in .env.
 *   - defaultAdmin: ID_FACTORY_ACCESS_MANAGER_ADMIN_ADDRESS in .env if set
 *     (should be a multisig — see the contract's constructor docs), else
 *     falls back to the deployer wallet's own address.
 *
 * IMPORTANT (manual step after this script finishes): the current owner of
 * IdFactory must call IdFactory.transferOwnership(<this contract's address>)
 * before any of IdFactoryAccessManager's forwarding functions will work.
 */

const artifactPath = path.join(
  __dirname,
  '..',
  'artifacts',
  'contracts',
  'platform',
  'IdFactoryAccessManager.sol',
  'IdFactoryAccessManager.json',
);

async function main() {
  const networkConfig = loadNetworkConfig(parseNetworkArg());
  const deploymentsPath = networkConfig.deploymentsPath;

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`${deploymentsPath} not found — deploy the platform first (npm run deploy:chain -- --network ${networkConfig.name}).`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

  const idFactoryAddress = deployment.platform?.identityFactory;
  
  
  if (!idFactoryAddress || !ethers.isAddress(idFactoryAddress)) {
    throw new Error(
      `Missing or invalid IdFactory address — set platform.identityFactory in ${deploymentsPath}, or ID_FACTORY_ADDRESS in .env.`,
    );
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const deployer = new ethers.Wallet(networkConfig.deployerPrivateKey, provider);

  const defaultAdminAddress = deployer.address;

  console.log('--- Deploying IdFactoryAccessManager ---');
  console.log('Deployer:      ', deployer.address);
  console.log('IdFactory:     ', idFactoryAddress);
  console.log('Default admin: ', defaultAdminAddress);

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const accessManager = await factory.deploy(idFactoryAddress, defaultAdminAddress);
  const receipt = await accessManager.deploymentTransaction()?.wait();
  const accessManagerAddress = await accessManager.getAddress();

  console.log(`\n  -> IdFactoryAccessManager deployed at ${accessManagerAddress} (tx ${receipt?.hash})`);

  deployment.platform.idFactoryAccessManager = accessManagerAddress;
  deployment.platform.idFactoryAccessManagerAdmin = defaultAdminAddress;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));

  console.log('\n=== Done ===');
  console.log(`Saved to ${deploymentsPath}`);
  console.log('\nNext step (required before this contract can do anything): the current owner of');
  console.log(`IdFactory (${idFactoryAddress}) must call:`);
  console.log(`  IdFactory.transferOwnership(${accessManagerAddress})`);
  console.log('Then grant IDENTITY_AUTHORIZER_ROLE to the relay back-end signer wallet from an');
  console.log('ADMIN_ROLE account (e.g. via grantRole on the explorer\'s Write Contract tab).');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
