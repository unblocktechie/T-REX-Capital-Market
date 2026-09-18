import {
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  http,
  isAddress,
  keccak256,
  zeroAddress,
} from 'viem';
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';

const REQUIRED_CHAIN_NAME = web3Config.requiredChain.name;
const REQUIRED_CHAIN_SHORT_NAME = web3Config.ui.requiredChainShortName;

const IDENTITY_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getIdentity',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
];

const IDENTITY_ABI = [
  {
    type: 'function',
    name: 'keyHasPurpose',
    stateMutability: 'view',
    inputs: [
      { name: '_key', type: 'bytes32' },
      { name: '_purpose', type: 'uint256' },
    ],
    outputs: [{ name: 'exists', type: 'bool' }],
  },
];

const MANAGEMENT_KEY_PURPOSE = 1n;

const normalizedAddress = (value) => {
  const candidate = String(value || '').trim();
  return isAddress(candidate, { strict: false })
    ? getAddress(candidate.toLowerCase())
    : '';
};

const hasContractCode = (code) => Boolean(code && code !== '0x');

export const organizationManagementKey = (walletAddress) =>
  keccak256(
    encodeAbiParameters(
      [{ name: 'wallet', type: 'address' }],
      [getAddress(walletAddress)],
    ),
  );

export const createOrganizationIdentityPublicClient = () =>
  createPublicClient({
    chain: web3Config.requiredChain,
    transport: http(env.web3.rpcUrl),
  });

const inspectIdentity = async ({ publicClient, identityAddress, walletAddress }) => {
  const address = normalizedAddress(identityAddress);
  if (!address || address.toLowerCase() === zeroAddress) {
    return { address: '', hasCode: false, walletIsManager: false, valid: false };
  }

  const bytecode = await publicClient.getBytecode({ address }).catch(() => null);
  if (!hasContractCode(bytecode)) {
    return { address, hasCode: false, walletIsManager: false, valid: false };
  }

  let walletIsManager = false;
  let ownershipCheckAvailable = true;
  try {
    walletIsManager = Boolean(
      await publicClient.readContract({
        address,
        abi: IDENTITY_ABI,
        functionName: 'keyHasPurpose',
        args: [organizationManagementKey(walletAddress), MANAGEMENT_KEY_PURPOSE],
      }),
    );
  } catch {
    ownershipCheckAvailable = false;
  }

  return {
    address,
    hasCode: true,
    walletIsManager,
    ownershipCheckAvailable,
    // A genuine ONCHAINID should expose keyHasPurpose. Fail closed when this
    // ownership check is unavailable instead of trusting an arbitrary contract.
    valid: ownershipCheckAvailable && walletIsManager,
  };
};

/**
 * Verifies that an approved organization has a usable ONCHAINID on the currently
 * configured chain. This is deliberately chain-aware: an identity address from a
 * different chain is not treated as valid on the required chain merely because
 * it is a syntactically valid EVM address.
 */
export async function inspectOrganizationIdentityOnRequiredChain({
  walletAddress,
  recordedIdentityAddress,
  identityFactoryAddress = env.trex.identityFactory,
  publicClient = createOrganizationIdentityPublicClient(),
}) { 
  const wallet = normalizedAddress(walletAddress);
  const factory = normalizedAddress(identityFactoryAddress);
  const recorded = normalizedAddress(recordedIdentityAddress);

  if (!wallet) {
    return {
      ready: false,
      code: 'ORGANIZATION_WALLET_INVALID',
      message: 'The approved organization secure account is missing or invalid.',
      walletAddress: '',
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: '',
      resolvedIdentityAddress: '',
    };
  }

  if (!factory) {
    return {
      ready: false,
      code: 'IDENTITY_FACTORY_INVALID',
      message: `The ${REQUIRED_CHAIN_NAME} ONCHAINID Factory address is not configured correctly.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: '',
      resolvedIdentityAddress: '',
    };
  }

  const factoryCode = await publicClient.getBytecode({ address: factory }).catch(() => null);
  const factoryHasCode = hasContractCode(factoryCode);
  let factoryIdentity = '';
  let factoryLookupError = null;

  if (factoryHasCode) {
    try {
      const value = await publicClient.readContract({
        address: factory,
        abi: IDENTITY_FACTORY_ABI,
        functionName: 'getIdentity',
        args: [wallet],
      });
      const candidate = normalizedAddress(value);
      factoryIdentity = candidate && candidate.toLowerCase() !== zeroAddress ? candidate : '';
    } catch (error) {
      factoryLookupError = error;
    }
  }

  const [recordedInspection, factoryInspection] = await Promise.all([
    recorded
      ? inspectIdentity({ publicClient, identityAddress: recorded, walletAddress: wallet })
      : Promise.resolve({ address: '', hasCode: false, walletIsManager: false, valid: false }),
    factoryIdentity
      ? inspectIdentity({ publicClient, identityAddress: factoryIdentity, walletAddress: wallet })
      : Promise.resolve({ address: '', hasCode: false, walletIsManager: false, valid: false }),
  ]);

  if (!factoryHasCode) {
    return {
      ready: false,
      code: 'IDENTITY_FACTORY_NOT_DEPLOYED',
      message: `The configured ONCHAINID Factory is not deployed on ${REQUIRED_CHAIN_NAME}.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: '',
      resolvedIdentityAddress: '',
      factoryHasCode: false,
    };
  }

  if (factoryLookupError) {
    // Do not silently ignore a broken Factory configuration. If the recorded
    // ONCHAINID is valid on the required chain we surface that fact to diagnostics,
    // but token creation remains blocked until the configured factory is usable as well.
    return {
      ready: false,
      code: 'IDENTITY_FACTORY_LOOKUP_FAILED',
      message:
        `The ${REQUIRED_CHAIN_NAME} ONCHAINID Factory could not verify this organization. Confirm the ${REQUIRED_CHAIN_SHORT_NAME} Factory deployment and migrate the organization identity before creating an asset.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: '',
      resolvedIdentityAddress: recordedInspection.valid ? recordedInspection.address : '',
      recordedIdentityValid: recordedInspection.valid,
      factoryHasCode: true,
      cause: factoryLookupError,
    };
  }

  if (!factoryIdentity) {
    return {
      ready: false,
      code: 'ORGANIZATION_IDENTITY_NOT_MIGRATED',
      message:
        `This approved organization does not yet have an ONCHAINID linked on ${REQUIRED_CHAIN_NAME}. Recreate or migrate the organization identity on ${REQUIRED_CHAIN_SHORT_NAME} and update the organization record before creating an asset.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: '',
      resolvedIdentityAddress: '',
      recordedIdentityValid: recordedInspection.valid,
      factoryHasCode: true,
    };
  }

  if (!factoryInspection.valid) {
    return {
      ready: false,
      code: factoryInspection.hasCode
        ? 'ORGANIZATION_IDENTITY_OWNER_MISMATCH'
        : 'ORGANIZATION_IDENTITY_NOT_DEPLOYED',
      message: factoryInspection.hasCode
        ? `The ${REQUIRED_CHAIN_NAME} ONCHAINID returned for this organization is not managed by the approved organization secure account.`
        : `The ONCHAINID linked by the ${REQUIRED_CHAIN_NAME} Factory is not deployed at the returned address.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: factoryIdentity,
      resolvedIdentityAddress: '',
      recordedIdentityValid: recordedInspection.valid,
      factoryHasCode: true,
    };
  }

  if (!recorded) {
    return {
      ready: false,
      code: 'ORGANIZATION_IDENTITY_RECORD_MISSING',
      message:
        `The organization ONCHAINID exists on ${REQUIRED_CHAIN_NAME}, but the backend organization record has not been updated with its ${REQUIRED_CHAIN_SHORT_NAME} identity address yet.`,
      walletAddress: wallet,
      recordedIdentityAddress: '',
      factoryIdentityAddress: factoryIdentity,
      resolvedIdentityAddress: factoryIdentity,
      factoryHasCode: true,
    };
  }

  if (recorded.toLowerCase() !== factoryIdentity.toLowerCase()) {
    return {
      ready: false,
      code: 'ORGANIZATION_IDENTITY_RECORD_OUTDATED',
      message:
        `The organization record still points to a different ONCHAINID than the ${REQUIRED_CHAIN_NAME} Factory. Update the backend with the ${REQUIRED_CHAIN_SHORT_NAME} identity address before creating an asset.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: factoryIdentity,
      resolvedIdentityAddress: factoryIdentity,
      recordedIdentityValid: recordedInspection.valid,
      factoryHasCode: true,
    };
  }

  if (!recordedInspection.valid) {
    return {
      ready: false,
      code: recordedInspection.hasCode
        ? 'ORGANIZATION_IDENTITY_OWNER_MISMATCH'
        : 'ORGANIZATION_IDENTITY_NOT_DEPLOYED',
      message: recordedInspection.hasCode
        ? `The organization ONCHAINID on ${REQUIRED_CHAIN_NAME} is not managed by the approved organization secure account.`
        : `The organization ONCHAINID saved in the backend is not deployed on ${REQUIRED_CHAIN_NAME}.`,
      walletAddress: wallet,
      recordedIdentityAddress: recorded,
      factoryIdentityAddress: factoryIdentity,
      resolvedIdentityAddress: '',
      factoryHasCode: true,
    };
  }

  return {
    ready: true,
    code: 'READY',
    message: `The approved organization ONCHAINID is linked and verified on ${REQUIRED_CHAIN_NAME}.`,
    walletAddress: wallet,
    recordedIdentityAddress: recorded,
    factoryIdentityAddress: factoryIdentity,
    resolvedIdentityAddress: factoryIdentity,
    factoryHasCode: true,
    recordedIdentityValid: true,
  };
}

export async function requireOrganizationIdentityOnRequiredChain(options) {
  const result = await inspectOrganizationIdentityOnRequiredChain(options);
  if (result.ready) return result;

  const error = new Error(result.message);
  error.code = result.code;
  error.identityMigration = result;
  if (result.cause) error.cause = result.cause;
  throw error;
}
