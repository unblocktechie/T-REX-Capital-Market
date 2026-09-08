import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * One-time platform deployment for our custom compliance modules
 * (contracts/modules/*.sol). Run this once per environment, same as
 * phase0-01-deploy-platform.ts — these modules are shared across every
 * issuer's token from here on, bound in via
 * tokenDetails.complianceModules at deploy time (or added later via
 * ModularCompliance.addModule).
 *
 * Requires `npm run compile` to have been run first, so the artifacts these
 * addresses come from actually exist on disk.
 */

const deploymentsPath = path.join(__dirname, '..', 'deployments', 'sepolia.json');
const artifactsDir = path.join(__dirname, '..', 'artifacts', 'contracts', 'modules');

function loadArtifact(contractName: string) {
  const artifactPath = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function deployModule(name: string, signer: ethers.Wallet) {
  const artifact = loadArtifact(name);
  console.log(`\nDeploying ${name}...`);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  const receipt = await contract.deploymentTransaction()?.wait();
  const address = await contract.getAddress();
  console.log(`  -> ${name} deployed at ${address} (tx ${receipt?.hash})`);
  return address;
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    throw new Error('Missing SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY in .env');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const platform = new ethers.Wallet(privateKey, provider);

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

  console.log('--- Deploying platform-level compliance modules ---');
  console.log('Deployer:', platform.address);

  const countryRestrict = await deployModule('CountryRestrictModule', platform);
  const maxBalance = await deployModule('MaxBalanceModule', platform);
  const maxInvestors = await deployModule('MaxInvestorsModule', platform);

  deployment.platform.complianceModules = {
    countryRestrict,
    maxBalance,
    maxInvestors,
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));

  console.log('\n=== Done ===');
  console.log('Compliance module addresses saved to', deploymentsPath);
  console.log(deployment.platform.complianceModules);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
