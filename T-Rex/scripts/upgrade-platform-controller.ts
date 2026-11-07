import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';
import { NonceManager } from './lib/nonce-manager';

/**
 * Rolls out a new TREXPlatformController implementation behind the existing
 * proxy (deployments/<network>.json -> platform.platformController). The
 * proxy address, every stored price/payment token/service wallet, and every
 * token's Agent wiring stay exactly as they are.
 *
 * Before running: make sure the new version passes the storage-layout check
 * in test/TREXPlatformController.test.ts (`npm test`) — an incompatible
 * layout corrupts live state and cannot be undone by upgrading again.
 *
 * Must be sent by the controller's owner(). Uses PLATFORM_OWNER_PRIVATE_KEY
 * from .env if set, otherwise the network's deployer key.
 *
 * Usage:
 *   npm run upgrade:platform-controller -- --network <name>
 *   npm run upgrade:platform-controller -- --network <name> --call initializeV2 --args "[42]"
 *
 * `--call`/`--args` invoke a reinitializer on the new implementation in the
 * same transaction as the upgrade (via upgradeToAndCall).
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

function argValue(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

async function main() {
  const networkConfig = loadNetworkConfig(parseNetworkArg());
  const deploymentsPath = networkConfig.deploymentsPath;
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const proxyAddress: string | undefined = deployment.platform.platformController;
  if (!proxyAddress) {
    throw new Error(`No platform.platformController in ${deploymentsPath} — run deploy-platform-controller.ts first.`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const owner = new ethers.Wallet(process.env.PLATFORM_OWNER_PRIVATE_KEY || networkConfig.deployerPrivateKey, provider);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const proxy = new ethers.Contract(proxyAddress, artifact.abi, owner);

  const currentOwner: string = await proxy.owner();
  if (currentOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(`${owner.address} is not the controller owner (${currentOwner}) — set PLATFORM_OWNER_PRIVATE_KEY.`);
  }
  const previousVersion: string = await proxy.version().catch(() => 'unknown');

  console.log('--- Upgrading TREXPlatformController ---');
  console.log('Proxy:           ', proxyAddress);
  console.log('Owner:           ', owner.address);
  console.log('Current version: ', previousVersion);

  const nonces = new NonceManager(provider, owner.address);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
  const implementation = await factory.deploy({ nonce: await nonces.take() });
  await implementation.deploymentTransaction()?.wait();
  const implementationAddress = await implementation.getAddress();
  console.log(`\n  -> New implementation deployed at ${implementationAddress}`);

  // UUPS checks the new implementation's proxiableUUID before switching,
  // so a non-UUPS contract here reverts rather than bricking the proxy.
  const callName = argValue('--call');
  const tx = callName
    ? await proxy.upgradeToAndCall(
      implementationAddress,
      factory.interface.encodeFunctionData(callName, JSON.parse(argValue('--args') || '[]')),
      { nonce: await nonces.take() },
    )
    : await proxy.upgradeTo(implementationAddress, { nonce: await nonces.take() });
  await tx.wait();
  console.log(`  -> Proxy upgraded (tx ${tx.hash})`);
  console.log('New version:     ', await proxy.version());

  deployment.platform.platformControllerImplementation = implementationAddress;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployment, null, 2));
  console.log('\nSaved to', deploymentsPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
