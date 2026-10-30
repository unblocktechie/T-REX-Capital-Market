import 'dotenv/config';
import { ethers } from 'ethers';
import OnchainID from '@onchain-id/solidity';
import * as fs from 'fs';
import * as path from 'path';



/**
 * Backend logic for the "Approve Organization" action.
 *
 * Creates an ONCHAINID Identity for an organization/issuer wallet, through the
 * platform's IdFactory, the moment an admin approves them:
 *   - PLATFORM wallet pays gas and is the IdFactory owner (gas sponsorship only).
 *   - The org's OWN wallet address is set as the identity's wallet, so they
 *     control it from the moment it exists.
 *   - Going through the IdFactory (instead of deploying an IdentityProxy
 *     directly) means IdFactory.getIdentity(wallet) is a real on-chain source
 *     of truth — the contract itself refuses to link a second identity to a
 *     wallet that already has one (see IdFactory.sol's `_userIdentity` check),
 *     so this is a genuine safety net, not just an app-side assumption.
 *
 * The resulting identity address is what later gets stored on the org's DB
 * record and reused as `claimDetails.issuers[0]` when that org deploys a token.
 *
 * Two layers of duplicate protection, industry-standard "check both" pattern:
 *   1. DB check (fast, no RPC/gas) — done by the caller, e.g. approveOrganization()
 *      below, before even attempting the on-chain call.
 *   2. On-chain check (authoritative, catches DB/chain drift, races, retries)
 *      — done inside createOrganizationIdentity() via IdFactory.getIdentity().
 */

export interface OrganizationIdentityResult {
  identityAddress: string;
  txHash: string | null;
  alreadyExisted: boolean;
}

function loadIdentityFactory(platform: ethers.Wallet) {
  const deploymentsPath = path.join(__dirname, '..', 'deployments', 'sepolia.json');
  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const identityFactoryAddress = deployment.platform.identityFactory;
  if (!identityFactoryAddress) {
    throw new Error('deployments/sepolia.json has no platform.identityFactory — run phase0-01 first');
  }
  return new ethers.Contract(identityFactoryAddress, OnchainID.contracts.Factory.abi, platform);
}

/**
 * Creates (or reuses) the ONCHAINID identity for one organization wallet.
 * `salt` must be unique and stable per organization — e.g. `org-${orgId}` —
 * so retries reuse the same CREATE2 salt instead of colliding with a new one.
 */
export async function createOrganizationIdentity(orgWalletAddress: string, salt: string): Promise<OrganizationIdentityResult> {
  if (!ethers.isAddress(orgWalletAddress)) {
    throw new Error(`Invalid wallet address: ${orgWalletAddress}`);
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    throw new Error('Missing SEPOLIA_RPC_URL or DEPLOYER_PRIVATE_KEY in .env');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const platform = new ethers.Wallet(privateKey, provider);
  const identityFactory = loadIdentityFactory(platform);

  // On-chain idempotency check — authoritative, independent of the DB.
  const existing = await (identityFactory as any).getIdentity(orgWalletAddress);
  if (existing !== ethers.ZeroAddress) {
    return { identityAddress: existing, txHash: null, alreadyExisted: true };
  }

  // NEW ONCHAIN IDE CONTRAT IS DEPLOYED >>> SO IT HAS AN ADDRESS 
  const tx = await (identityFactory as any).createIdentity(orgWalletAddress, salt);
  const receipt = await tx.wait();

  const identityAddress = await (identityFactory as any).getIdentity(orgWalletAddress);
  if (identityAddress === ethers.ZeroAddress) {
    throw new Error('createIdentity confirmed but getIdentity still returns zero address — check tx logs');
  }

  return { identityAddress, txHash: receipt.hash, alreadyExisted: false };
}

// --- Placeholder DB layer — replace with your real ORM/query calls ---
interface OrganizationRecord {
  id: string;
  walletAddress: string;
  onchainIdentityAddress: string | null;
  status: string;
}

declare const db: {
  organizations: {
    findById(id: string): Promise<OrganizationRecord>;
    update(id: string, data: Partial<OrganizationRecord> & { identityTxHash?: string | null; approvedAt?: Date }): Promise<void>;
  };
};

/**
 * The actual handler an API route (e.g. POST /admin/organizations/:id/approve)
 * calls. Checks the DB first (cheap), falls through to the on-chain check
 * inside createOrganizationIdentity() as a second guard, then persists.
 */
export async function approveOrganization(orgId: string): Promise<OrganizationIdentityResult> {
  const org = await db.organizations.findById(orgId);
  if (!org) {
    throw new Error(`Organization ${orgId} not found`);
  }

  // Layer 1: DB check — skip the RPC round-trip entirely if we already have it.
  if (org.onchainIdentityAddress) {
    return { identityAddress: org.onchainIdentityAddress, txHash: null, alreadyExisted: true };
  }

  // Layer 2: on-chain check happens inside createOrganizationIdentity().
  const salt = `org-${org.id}`;
  const result = await createOrganizationIdentity(org.walletAddress, salt);

  await db.organizations.update(org.id, {
    onchainIdentityAddress: result.identityAddress,
    identityTxHash: result.txHash,
    status: 'approved',
    approvedAt: new Date(),
  });

  return result;
}

// Standalone test runner: `ts-node scripts/create-organization-identity.ts <orgWalletAddress> <salt>`
if (require.main === module) {
  const orgWalletAddress = process.argv[2];
  const salt = process.argv[3];
  if (!orgWalletAddress || !salt) {
    console.error('Usage: ts-node scripts/create-organization-identity.ts <orgWalletAddress> <salt>');
    process.exit(1);
  }

  createOrganizationIdentity(orgWalletAddress, salt)
    .then((result) => {
      console.log('Identity:', result);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
