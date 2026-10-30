import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';
import { NonceManager } from './lib/nonce-manager';

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
 *
 * Resumable: deployments/<network>.json is written after each module (not
 * just at the end), and modules already recorded there with live on-chain
 * code are reused instead of redeployed — see phase0-01-deploy-platform.ts
 * for why this matters.
 */

const artifactsDir = path.join(__dirname, '..', 'artifacts', 'contracts', 'modules');

function loadArtifact(contractName: string) {
  const artifactPath = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  const networkConfig = loadNetworkConfig(parseNetworkArg());
  const deploymentsPath = networkConfig.deploymentsPath;

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const deployer = new ethers.Wallet(networkConfig.deployerPrivateKey, provider);
  const nonces = new NonceManager(provider, deployer.address);

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  deployment.platform.complianceModules ||= {};
  const modules = deployment.platform.complianceModules;

  function save() {
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));
  }

  async function deployOrReuseModule(key: string, name: string) {
    const existing = modules[key];
    if (existing) {
      const code = await provider.getCode(existing);
      if (code !== '0x') {
        console.log(`\nSkipping ${name} — already deployed at ${existing}`);
        return;
      }
      console.log(`\n${name} recorded at ${existing} but has no code on-chain, redeploying...`);
    }
    const artifact = loadArtifact(name);
    console.log(`\nDeploying ${name}...`);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    const contract = await factory.deploy({ nonce: await nonces.take() });
    const receipt = await contract.deploymentTransaction()?.wait();
    const address = await contract.getAddress();
    console.log(`  -> ${name} deployed at ${address} (tx ${receipt?.hash})`);
    modules[key] = address;
    save();
  }

  console.log('--- Deploying platform-level compliance modules ---');
  console.log('Deployer:', deployer.address);

  await deployOrReuseModule('countryRestrict', 'CountryRestrictModule');
  await deployOrReuseModule('maxBalance', 'MaxBalanceModule');
  await deployOrReuseModule('maxInvestors', 'MaxInvestorsModule');

  console.log('\n=== Done ===');
  console.log('Compliance module addresses saved to', deploymentsPath);
  console.log(deployment.platform.complianceModules);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
