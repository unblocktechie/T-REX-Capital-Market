import 'dotenv/config';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { loadNetworkConfig, parseNetworkArg } from './lib/network-config';
import { NonceManager } from './lib/nonce-manager';

/**
 * Deploys the T-REX + ONCHAINID platform contracts for a NEW chain, from
 * this project's own compiled build (verify/artifacts, produced by
 * `npx hardhat compile --config hardhat.verify.config.ts`) — NOT from the
 * pre-compiled bytecode shipped inside the npm packages, which is what
 * phase0-01-deploy-platform.ts does.
 *
 * Why: block explorers verify by recompiling the source and comparing
 * bytecode. The npm packages' bytecode was built with different source
 * paths, so recompiling never matches it exactly and IdFactory/TREXFactory
 * need special-case verifiers. Deploying from the same build that
 * verification uses makes every contract a plain `hardhat verify` on any
 * chain (see verify-new-chain.ts).
 *
 * Same contracts, same constructor args, same setup transactions, same
 * deployments/<network>.json shape as phase0-01-deploy-platform.ts, so the
 * other deploy steps and the app read it unchanged. Resumable the same way:
 * contracts already on-chain are reused, and each one-off setup tx checks
 * the chain before sending.
 *
 * Run through deploy-new-chain.ts (which compiles first), or directly:
 *   npx ts-node scripts/deploy-platform-from-source.ts --network <name>
 */

const VERIFY_ARTIFACTS_DIR = path.join(__dirname, '..', 'verify', 'artifacts');
const ERC3643 = '@erc3643org/erc-3643/contracts/';
const ONCHAINID = '@onchain-id/solidity/contracts/';

function loadArtifact(sourceName: string, contractName: string): { abi: any; bytecode: string } {
  const artifactPath = path.join(VERIFY_ARTIFACTS_DIR, ...sourceName.split('/'), `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing ${artifactPath} — run: npx hardhat compile --config hardhat.verify.config.ts`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return { abi: artifact.abi, bytecode: artifact.bytecode };
}

const ARTIFACTS = {
  ClaimTopicsRegistry: loadArtifact(`${ERC3643}registry/implementation/ClaimTopicsRegistry.sol`, 'ClaimTopicsRegistry'),
  TrustedIssuersRegistry: loadArtifact(`${ERC3643}registry/implementation/TrustedIssuersRegistry.sol`, 'TrustedIssuersRegistry'),
  IdentityRegistryStorage: loadArtifact(`${ERC3643}registry/implementation/IdentityRegistryStorage.sol`, 'IdentityRegistryStorage'),
  IdentityRegistry: loadArtifact(`${ERC3643}registry/implementation/IdentityRegistry.sol`, 'IdentityRegistry'),
  ModularCompliance: loadArtifact(`${ERC3643}compliance/modular/ModularCompliance.sol`, 'ModularCompliance'),
  Token: loadArtifact(`${ERC3643}token/Token.sol`, 'Token'),
  Identity: loadArtifact(`${ONCHAINID}Identity.sol`, 'Identity'),
  ImplementationAuthority: loadArtifact(`${ONCHAINID}proxy/ImplementationAuthority.sol`, 'ImplementationAuthority'),
  IdFactory: loadArtifact(`${ONCHAINID}factory/IdFactory.sol`, 'IdFactory'),
  TREXImplementationAuthority: loadArtifact(`${ERC3643}proxy/authority/TREXImplementationAuthority.sol`, 'TREXImplementationAuthority'),
  TREXFactory: loadArtifact(`${ERC3643}factory/TREXFactory.sol`, 'TREXFactory'),
  TREXGateway: loadArtifact(`${ERC3643}factory/TREXGateway.sol`, 'TREXGateway'),
};

async function main() {
  const networkConfig = loadNetworkConfig(parseNetworkArg());

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const deployer = new ethers.Wallet(networkConfig.deployerPrivateKey, provider);

  console.log('--- Where are we running? ---');
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId.toString());
  console.log('Deployer:', deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log('Balance: ', ethers.formatEther(balance));
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 native balance on this network — fund it first.`);
  }

  const outPath = networkConfig.deploymentsPath;
  const deployment: any = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
    : {
        network: networkConfig.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        platformBuild: 'source',
        platform: {},
        implementations: {},
      };
  deployment.platform ||= {};
  deployment.implementations ||= {};

  // A chain deployed by phase0-01 (npm package bytecode) must not be resumed
  // here, or it would end up with contracts from two different builds.
  const hasContracts = Object.keys(deployment.platform).length > 0 || Object.keys(deployment.implementations).length > 0;
  if (deployment.platformBuild !== 'source' && hasContracts) {
    throw new Error(
      `${outPath} was deployed with the old flow (phase0-01 / deploy:chain, npm package bytecode). ` +
        'Resume it with `npm run deploy:chain`, or redeploy from scratch with `npm run deploy:new-chain -- --network <name> --force`.',
    );
  }
  deployment.platformBuild = 'source';

  const nonces = new NonceManager(provider, deployer.address);

  function save() {
    deployment.deployedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  }

  async function deployOrReuse(store: Record<string, string>, key: string, name: string, artifact: { abi: any; bytecode: string }, args: any[] = []) {
    const existing = store[key];
    if (existing) {
      if ((await provider.getCode(existing)) !== '0x') {
        console.log(`\nSkipping ${name} — already deployed at ${existing}`);
        return new ethers.Contract(existing, artifact.abi, deployer);
      }
      console.log(`\n${name} recorded at ${existing} but has no code on-chain, redeploying...`);
    }
    console.log(`\nDeploying ${name}...`);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    const contract = await factory.deploy(...args, { nonce: await nonces.take() });
    const receipt = await contract.deploymentTransaction()?.wait();
    const address = await contract.getAddress();
    console.log(`  -> ${name} deployed at ${address} (tx ${receipt?.hash}, block ${receipt?.blockNumber})`);
    store[key] = address;
    save();
    return contract as ethers.Contract;
  }

  // The flag alone isn't trustworthy after a crash (the tx can confirm before
  // the flag is saved, and resending would revert), so ask the chain first.
  async function runOnce(
    flagKey: string,
    description: string,
    checkDone: () => Promise<boolean>,
    send: (nonce: number) => Promise<ethers.ContractTransactionResponse>,
  ) {
    if (deployment[flagKey]) {
      console.log(`\nSkipping "${description}" — already done`);
      return;
    }
    if (await checkDone()) {
      console.log(`\nSkipping "${description}" — already true on-chain (from an interrupted earlier run)`);
      deployment[flagKey] = true;
      save();
      return;
    }
    console.log(`\n${description}...`);
    const tx = await send(await nonces.take());
    await tx.wait();
    console.log('  -> done (tx', tx.hash, ')');
    deployment[flagKey] = true;
    save();
  }

  console.log('\n=== Step 1: T-REX implementation contracts ===');
  const impl = deployment.implementations;
  const ctrImpl = await deployOrReuse(impl, 'claimTopicsRegistry', 'ClaimTopicsRegistry (impl)', ARTIFACTS.ClaimTopicsRegistry);
  const tirImpl = await deployOrReuse(impl, 'trustedIssuersRegistry', 'TrustedIssuersRegistry (impl)', ARTIFACTS.TrustedIssuersRegistry);
  const irsImpl = await deployOrReuse(impl, 'identityRegistryStorage', 'IdentityRegistryStorage (impl)', ARTIFACTS.IdentityRegistryStorage);
  const irImpl = await deployOrReuse(impl, 'identityRegistry', 'IdentityRegistry (impl)', ARTIFACTS.IdentityRegistry);
  const mcImpl = await deployOrReuse(impl, 'modularCompliance', 'ModularCompliance (impl)', ARTIFACTS.ModularCompliance);
  const tokenImpl = await deployOrReuse(impl, 'token', 'Token (impl)', ARTIFACTS.Token);

  console.log('\n=== Step 2: ONCHAINID identity infrastructure ===');
  const identityImpl = await deployOrReuse(impl, 'identity', 'Identity (impl)', ARTIFACTS.Identity, [deployer.address, true]);
  const identityImplAuthority = await deployOrReuse(
    deployment.platform,
    'identityImplementationAuthority',
    'ImplementationAuthority (ONCHAINID)',
    ARTIFACTS.ImplementationAuthority,
    [await identityImpl.getAddress()],
  );
  const identityFactory = await deployOrReuse(deployment.platform, 'identityFactory', 'Factory (ONCHAINID / IdFactory)', ARTIFACTS.IdFactory, [
    await identityImplAuthority.getAddress(),
  ]);

  console.log('\n=== Step 3: TREXImplementationAuthority ===');
  const trexIA = await deployOrReuse(deployment.platform, 'trexImplementationAuthority', 'TREXImplementationAuthority', ARTIFACTS.TREXImplementationAuthority, [
    true,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
  ]);

  const versionStruct = { major: 4, minor: 1, patch: 3 };
  const contractsStruct = {
    tokenImplementation: await tokenImpl.getAddress(),
    ctrImplementation: await ctrImpl.getAddress(),
    irImplementation: await irImpl.getAddress(),
    irsImplementation: await irsImpl.getAddress(),
    tirImplementation: await tirImpl.getAddress(),
    mcImplementation: await mcImpl.getAddress(),
  };
  await runOnce(
    'versionRegistered',
    'Registering implementation version 4.1.3 on the TREXImplementationAuthority',
    async () => {
      const current = await trexIA.getCurrentVersion();
      return Number(current.major) === versionStruct.major && Number(current.minor) === versionStruct.minor && Number(current.patch) === versionStruct.patch;
    },
    (nonce) => trexIA.addAndUseTREXVersion(versionStruct, contractsStruct, { nonce }),
  );

  console.log('\n=== Step 4: TREXFactory ===');
  const trexFactory = await deployOrReuse(deployment.platform, 'trexFactory', 'TREXFactory', ARTIFACTS.TREXFactory, [
    await trexIA.getAddress(),
    await identityFactory.getAddress(),
  ]);
  await runOnce(
    'trexFactoryAllowedOnIdentityFactory',
    'Allowing TREXFactory to deploy identities through the ONCHAINID factory',
    async () => identityFactory.isTokenFactory(await trexFactory.getAddress()),
    async (nonce) => identityFactory.addTokenFactory(await trexFactory.getAddress(), { nonce }),
  );

  console.log('\n=== Step 5: TREXGateway ===');
  const trexGateway = await deployOrReuse(deployment.platform, 'trexGateway', 'TREXGateway', ARTIFACTS.TREXGateway, [
    await trexFactory.getAddress(),
    false, // public deployments disabled — only approved deployers can call deployTREXSuite
  ]);
  await runOnce(
    'trexFactoryOwnershipTransferred',
    'Transferring TREXFactory ownership to TREXGateway (required — deployTREXSuite is onlyOwner)',
    async () => (await trexFactory.owner()).toLowerCase() === (await trexGateway.getAddress()).toLowerCase(),
    async (nonce) => trexFactory.transferOwnership(await trexGateway.getAddress(), { nonce }),
  );
  await runOnce(
    'deployerApprovedOnGateway',
    'Approving the deployer wallet as an approved deployer on the Gateway',
    async () => trexGateway.isDeployer(deployer.address),
    (nonce) => trexGateway.addDeployer(deployer.address, { nonce }),
  );

  save();

  console.log('\n=== Done ===');
  console.log('Platform addresses saved to', outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
