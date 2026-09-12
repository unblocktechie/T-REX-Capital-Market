import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  parseUnits,
  zeroAddress,
} from 'viem';
import { DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS, env } from '@/config/env';
import { web3Config } from '@/config/web3';
import { assertValidTransactionHash } from '@/utils/transactionHash';

const TREX_GATEWAY_ABI = [
  {
    type: 'function',
    name: 'deployTREXSuite',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_tokenDetails',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'decimals', type: 'uint8' },
          { name: 'irs', type: 'address' },
          { name: 'ONCHAINID', type: 'address' },
          { name: 'irAgents', type: 'address[]' },
          { name: 'tokenAgents', type: 'address[]' },
          { name: 'complianceModules', type: 'address[]' },
          { name: 'complianceSettings', type: 'bytes[]' },
        ],
      },
      {
        name: '_claimDetails',
        type: 'tuple',
        components: [
          { name: 'claimTopics', type: 'uint256[]' },
          { name: 'issuers', type: 'address[]' },
          { name: 'issuerClaims', type: 'uint256[][]' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getFactory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getPublicDeploymentStatus',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isDeployer',
    stateMutability: 'view',
    inputs: [{ name: 'deployer', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

const IDENTITY_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getIdentity',
    stateMutability: 'view',
    inputs: [{ name: '_wallet', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
];

const COUNTRY_RESTRICT_MODULE_ABI = [
  {
    type: 'function',
    name: 'batchRestrictCountries',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_countries', type: 'uint16[]' }],
    outputs: [],
  },
];

const MAX_BALANCE_MODULE_ABI = [
  {
    type: 'function',
    name: 'setMaxBalance',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_max', type: 'uint256' }],
    outputs: [],
  },
];

const MAX_INVESTORS_MODULE_ABI = [
  {
    type: 'function',
    name: 'setMaxInvestors',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_max', type: 'uint256' }],
    outputs: [],
  },
];

const TREX_FACTORY_EVENT_ABI = [
  {
    type: 'event',
    name: 'TREXSuiteDeployed',
    anonymous: false,
    inputs: [
      { name: '_token', type: 'address', indexed: true },
      { name: '_ir', type: 'address', indexed: false },
      { name: '_irs', type: 'address', indexed: false },
      { name: '_tir', type: 'address', indexed: false },
      { name: '_ctr', type: 'address', indexed: false },
      { name: '_mc', type: 'address', indexed: false },
      { name: '_salt', type: 'string', indexed: true },
    ],
  },
];

const TOKEN_ACCESS_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'isAgent',
    stateMutability: 'view',
    inputs: [{ name: '_agent', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
];

const IDENTITY_REGISTRY_ACCESS_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'isAgent',
    stateMutability: 'view',
    inputs: [{ name: '_agent', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

const CLAIM_TOPIC_FALLBACKS = Object.freeze({
  kyc: 1n,
  accredited: 2n,
  aml: 3n,
});

const requiredAddress = (value, label) => {
  const candidate = String(value || '').trim();
  if (!isAddress(candidate, { strict: false }) || candidate.toLowerCase() === zeroAddress) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return getAddress(candidate.toLowerCase());
};

const optionalAgentAddress = (value, fallback, label) => {
  if (!value) return fallback;
  return requiredAddress(value, label);
};

const uniqueAddresses = (addresses) => {
  const values = [];
  const seen = new Set();

  addresses.forEach((address) => {
    const normalized = getAddress(address);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      values.push(normalized);
    }
  });

  return values;
};

const jsonSafe = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
    ),
  );

const sameAddress = (left, right) =>
  Boolean(left && right && String(left).toLowerCase() === String(right).toLowerCase());

const parseDecimals = (value) => {
  const decimals = Number(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Token decimals must be a whole number between 0 and 18.');
  }
  return decimals;
};

const parsePositiveInteger = (value, label) => {
  if (value === '' || value === undefined || value === null) return null;
  const parsed = BigInt(String(value));
  if (parsed <= 0n) throw new Error(`${label} must be greater than zero.`);
  return parsed;
};

const restrictedCountryCodes = (countries) => {
  const rows = Array.isArray(countries) ? countries : [];
  const codes = rows
    .map((country) =>
      Number(
        typeof country === 'object'
          ? country?.iso3166NumericCode || country?.numericCode
          : country,
      ),
    )
    .filter((code) => Number.isInteger(code) && code >= 0 && code <= 65_535);

  if (codes.length !== rows.length) {
    throw new Error(
      'Every restricted country must be configured correctly before the token can be created.',
    );
  }

  return [...new Set(codes)];
};

const resolveClaimTopicValue = (topic) => {
  const directValue = [
    topic?.value,
    topic?.claimTopicValue,
    topic?.claimTopicCode,
    topic?.topicValue,
    topic?.code,
  ].find((value) => /^\d+$/.test(String(value ?? '').trim()));

  if (directValue !== undefined) return BigInt(String(directValue));

  const fallback = CLAIM_TOPIC_FALLBACKS[String(topic?.id || '').toLowerCase()];
  if (fallback !== undefined) return fallback;

  throw new Error(
    `Verification requirement “${topic?.shortName || topic?.name || topic?.id || 'unknown'}” is not fully configured.`,
  );
};

export function buildComplianceArrays({ compliance, decimals, moduleAddresses }) {
  const complianceModules = [];
  const complianceSettings = [];
  const countryCodes = restrictedCountryCodes(compliance?.countries || []);

  if (countryCodes.length) {
    complianceModules.push(
      requiredAddress(moduleAddresses?.countryRestrict, 'Country restriction module address'),
    );
    complianceSettings.push(
      encodeFunctionData({
        abi: COUNTRY_RESTRICT_MODULE_ABI,
        functionName: 'batchRestrictCountries',
        args: [countryCodes],
      }),
    );
  }

  if (compliance?.maximumBalance !== '' && compliance?.maximumBalance != null) {
    complianceModules.push(
      requiredAddress(moduleAddresses?.maxBalance, 'Maximum balance module address'),
    );
    complianceSettings.push(
      encodeFunctionData({
        abi: MAX_BALANCE_MODULE_ABI,
        functionName: 'setMaxBalance',
        // This is intentionally converted with the token's exact decimals.
        args: [parseUnits(String(compliance.maximumBalance), decimals)],
      }),
    );
  }

  const maxInvestors = parsePositiveInteger(
    compliance?.maximumInvestors,
    'Maximum investors',
  );
  if (maxInvestors !== null) {
    complianceModules.push(
      requiredAddress(moduleAddresses?.maxInvestors, 'Maximum investors module address'),
    );
    complianceSettings.push(
      encodeFunctionData({
        abi: MAX_INVESTORS_MODULE_ABI,
        functionName: 'setMaxInvestors',
        args: [maxInvestors],
      }),
    );
  }

  return { complianceModules, complianceSettings };
}

const extractSuiteDeployment = (receipt, factoryAddress) => {
  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: TREX_FACTORY_EVENT_ABI,
        eventName: 'TREXSuiteDeployed',
        data: log.data,
        topics: log.topics,
      });
      return {
        token: getAddress(decoded.args._token),
        ir: getAddress(decoded.args._ir),
        irs: getAddress(decoded.args._irs),
        tir: getAddress(decoded.args._tir),
        ctr: getAddress(decoded.args._ctr),
        mc: getAddress(decoded.args._mc),
      };
    } catch {
      // Ignore unrelated factory logs from the same receipt.
    }
  }
  return null;
};

const createTrexPublicClient = () =>
  createPublicClient({
    chain: web3Config.requiredChain,
    transport: http(env.web3.rpcUrl),
  });

const receiptSucceeded = (receipt) =>
  receipt?.status === 'success' || receipt?.status === 1 || receipt?.status === 1n;

const configurationError = ({
  message,
  deploymentTransactionHash,
  failedTransactionHash = '',
  tokenAddress,
  contracts,
  onChainPaused,
  cause,
}) => {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = 'TOKEN_CONFIGURATION_FAILED';
  error.failedStep = 'activate-transfers';
  error.transactionHash = deploymentTransactionHash;
  error.failedTransactionHash = failedTransactionHash;
  error.tokenAddress = tokenAddress;
  error.contracts = contracts;
  error.onChainPaused = onChainPaused;
  error.transactionSubmitted = true;
  error.deploymentConfirmed = true;
  error.mandatoryStepPending = true;
  return error;
};

/**
 * Reads the transfer state directly from the token contract. This is the source of truth
 * for pause/unpause UI; callers must not infer it from a previous React or database value.
 */
export async function readTrexTokenPaused({ tokenAddress }) {
  const token = requiredAddress(tokenAddress, 'Token contract');
  return Boolean(
    await createTrexPublicClient().readContract({
      address: token,
      abi: TOKEN_ACCESS_ABI,
      functionName: 'paused',
    }),
  );
}

/**
 * Recovers a confirmed deployment from its transaction receipt without changing state.
 * Used after refresh so mandatory post-deployment transactions can resume safely instead
 * of finalizing the database merely because transaction #1 exists.
 */
export async function recoverTrexDeploymentState({ transactionHash, deploymentConfig }) {
  const deployHash = assertValidTransactionHash(transactionHash);
  const publicClient = createTrexPublicClient();
  const gatewayAddress = requiredAddress(deploymentConfig?.gateway, 'T-REX Gateway address');
  const factoryAddress = getAddress(
    await publicClient.readContract({
      address: gatewayAddress,
      abi: TREX_GATEWAY_ABI,
      functionName: 'getFactory',
    }),
  );

  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
      confirmations: 1,
      timeout: 120_000,
    });
  } catch (cause) {
    const error = new Error(
      'The token-creation transaction is still waiting for network confirmation.',
      { cause },
    );
    error.code = 'DEPLOYMENT_CONFIRMATION_PENDING';
    error.transactionHash = deployHash;
    error.transactionSubmitted = true;
    error.syncOnly = true;
    throw error;
  }

  if (!receiptSucceeded(receipt)) {
    const error = new Error('The token-creation transaction was confirmed but reverted.');
    error.code = 'DEPLOYMENT_TRANSACTION_REVERTED';
    error.failedStep = 'deployment';
    error.transactionHash = deployHash;
    error.transactionSubmitted = true;
    error.confirmedRevert = true;
    throw error;
  }

  const contracts = extractSuiteDeployment(receipt, factoryAddress);
  if (!contracts?.token) {
    const error = new Error('The confirmed token-creation receipt did not contain the deployed token address.');
    error.code = 'DEPLOYMENT_RECEIPT_INVALID';
    error.failedStep = 'deployment';
    error.transactionHash = deployHash;
    error.transactionSubmitted = true;
    throw error;
  }

  const paused = await readTrexTokenPaused({ tokenAddress: contracts.token });
  return {
    transactionHash: deployHash,
    blockNumber: receipt.blockNumber?.toString?.() || '',
    contracts,
    tokenAddress: contracts.token,
    paused,
    receipt: jsonSafe(receipt),
  };
}

/**
 * Runs only the transfer-activation transaction for an already deployed token. It first
 * reads paused() and reads it again after a successful receipt, preventing optimistic
 * unpause state from leaking into the UI or database.
 */
export async function activateTrexTransfers({
  connector,
  connectedAddress,
  issuerWalletAddress,
  tokenAddress,
  deploymentTransactionHash,
  contracts,
  previousTransactionHash = '',
  onWalletAction,
}) {
  const deployHash = assertValidTransactionHash(deploymentTransactionHash);
  const provider = await connector?.getProvider?.();
  if (!provider?.request) {
    throw configurationError({
      message: 'The organization wallet is unavailable. Reconnect it to activate transfers.',
      deploymentTransactionHash: deployHash,
      tokenAddress,
      contracts,
      onChainPaused: null,
    });
  }

  const issuerAddress = requiredAddress(issuerWalletAddress, 'Approved organization wallet');
  const accounts = await provider.request({ method: 'eth_accounts' });
  const activeAddress = requiredAddress(accounts?.[0] || connectedAddress, 'Connected deployment wallet');
  if (activeAddress.toLowerCase() !== issuerAddress.toLowerCase()) {
    throw configurationError({
      message: 'Connect the approved organization wallet before activating transfers.',
      deploymentTransactionHash: deployHash,
      tokenAddress,
      contracts,
      onChainPaused: null,
    });
  }

  const providerChainId = Number(BigInt(await provider.request({ method: 'eth_chainId' })));
  if (providerChainId !== web3Config.requiredChain.id) {
    throw configurationError({
      message: `Switch the connected wallet to ${web3Config.requiredChain.name} before activating transfers.`,
      deploymentTransactionHash: deployHash,
      tokenAddress,
      contracts,
      onChainPaused: null,
    });
  }

  const token = requiredAddress(tokenAddress, 'Token contract');
  const publicClient = createTrexPublicClient();
  const walletClient = createWalletClient({
    account: activeAddress,
    chain: web3Config.requiredChain,
    transport: custom(provider),
  });

  const pausedBefore = Boolean(
    await publicClient.readContract({
      address: token,
      abi: TOKEN_ACCESS_ABI,
      functionName: 'paused',
    }),
  );
  if (!pausedBefore) {
    return {
      attempted: false,
      status: 'already-unpaused',
      transactionHash: '',
      blockNumber: '',
      paused: false,
    };
  }

  const previousHash = String(previousTransactionHash || '').trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(previousHash)) {
    try {
      const previousReceipt = await publicClient.waitForTransactionReceipt({
        hash: previousHash,
        confirmations: 1,
        timeout: 45_000,
      });
      if (receiptSucceeded(previousReceipt)) {
        const pausedAfterPrevious = await readTrexTokenPaused({ tokenAddress: token });
        if (!pausedAfterPrevious) {
          onWalletAction?.({
            key: 'activate-transfers',
            step: 2,
            total: 3,
            status: 'confirmed',
            title: 'Token transfers activated',
            description: 'The previously submitted activation transaction is confirmed and transfers are active.',
            transactionHash: previousHash,
            gasRequired: true,
          });
          return {
            attempted: true,
            status: 'success',
            transactionHash: previousHash,
            blockNumber: previousReceipt.blockNumber?.toString?.() || '',
            paused: false,
            receipt: jsonSafe(previousReceipt),
          };
        }
        throw configurationError({
          message: 'The previous activation transaction succeeded, but the token still reports paused. No new transaction was sent.',
          deploymentTransactionHash: deployHash,
          failedTransactionHash: previousHash,
          tokenAddress: token,
          contracts,
          onChainPaused: true,
        });
      }
      // A confirmed revert is terminal for that transaction, so a fresh retry is safe.
    } catch (cause) {
      if (cause?.code === 'TOKEN_CONFIGURATION_FAILED') throw cause;
      const pendingError = configurationError({
        message: 'The previous transfer-activation transaction is still being confirmed. Wait for it before retrying; no new transaction was sent.',
        deploymentTransactionHash: deployHash,
        failedTransactionHash: previousHash,
        tokenAddress: token,
        contracts,
        onChainPaused: true,
        cause,
      });
      pendingError.code = 'TOKEN_CONFIGURATION_PENDING';
      throw pendingError;
    }
  }

  let activationHash = '';
  try {
    onWalletAction?.({
      key: 'activate-transfers',
      step: 2,
      total: 3,
      status: 'awaiting-signature',
      title: 'Transaction 2 of 3: Activate token transfers',
      description: 'Approve this transaction to allow eligible investors to receive and transfer the token.',
      gasRequired: true,
    });
    const simulation = await publicClient.simulateContract({
      account: activeAddress,
      address: token,
      abi: TOKEN_ACCESS_ABI,
      functionName: 'unpause',
    });
    activationHash = await walletClient.writeContract(simulation.request);
    onWalletAction?.({
      key: 'activate-transfers',
      step: 2,
      total: 3,
      status: 'confirming',
      title: 'Activating token transfers',
      description: 'The wallet approval was received. Waiting for network confirmation.',
      transactionHash: activationHash,
      gasRequired: true,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: activationHash,
      confirmations: 1,
    });
    if (!receiptSucceeded(receipt)) {
      throw Object.assign(new Error('The transfer-activation transaction was confirmed but reverted.'), {
        code: 'TRANSFER_ACTIVATION_REVERTED',
        transactionHash: activationHash,
        confirmedRevert: true,
      });
    }

    const pausedAfter = Boolean(
      await publicClient.readContract({
        address: token,
        abi: TOKEN_ACCESS_ABI,
        functionName: 'paused',
      }),
    );
    if (pausedAfter) {
      throw Object.assign(
        new Error('The activation transaction succeeded, but the token is still paused on-chain.'),
        {
          code: 'TRANSFER_STATE_VERIFICATION_FAILED',
          transactionHash: activationHash,
        },
      );
    }

    onWalletAction?.({
      key: 'activate-transfers',
      step: 2,
      total: 3,
      status: 'confirmed',
      title: 'Token transfers activated',
      description: 'The transaction is confirmed and the token contract reports that transfers are active.',
      transactionHash: activationHash,
      gasRequired: true,
    });

    return {
      attempted: true,
      status: 'success',
      transactionHash: activationHash,
      blockNumber: receipt.blockNumber?.toString?.() || '',
      paused: false,
      receipt: jsonSafe(receipt),
    };
  } catch (cause) {
    let pausedAfterFailure = null;
    try {
      pausedAfterFailure = await readTrexTokenPaused({ tokenAddress: token });
    } catch {
      // If the authoritative read is unavailable, keep the value unknown and fail closed.
      pausedAfterFailure = null;
    }

    onWalletAction?.({
      key: 'activate-transfers',
      step: 2,
      total: 3,
      status: 'failed',
      title: pausedAfterFailure === true
        ? 'Token created, but transfers are still paused'
        : 'Transfer activation needs verification',
      description: pausedAfterFailure === true
        ? 'The token exists, but the transfer-activation step did not complete. Retry this step; the token will not be finalized yet.'
        : pausedAfterFailure === false
          ? 'The latest contract read shows transfers are active. Refresh the status before sending another transaction.'
          : 'The transfer transaction did not complete and the live pause state could not be read. Refresh the status before retrying.',
      transactionHash: activationHash || cause?.transactionHash || '',
      gasRequired: true,
    });

    throw configurationError({
      message: pausedAfterFailure === true
        ? 'Token creation succeeded, but transfer activation failed. The token remains paused and has not been finalized.'
        : 'Transfer activation could not be safely verified. Refresh the on-chain state before continuing.',
      deploymentTransactionHash: deployHash,
      failedTransactionHash: activationHash || cause?.transactionHash || '',
      tokenAddress: token,
      contracts,
      onChainPaused: pausedAfterFailure,
      cause,
    });
  }
}

const getDeploymentErrorText = (error) =>
  `${error?.name || ''} ${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''} ${
    error?.cause?.message || ''
  }`;

const isWalletTransportTimeout = (error) =>
  /transport request timed out|transporttimeouterror|metamask:\/\/connect|does not have a registered handler|failed to launch/i.test(
    getDeploymentErrorText(error),
  );

const deploymentErrorMessage = (error) => {
  if (['TOKEN_CONFIGURATION_FAILED', 'TOKEN_CONFIGURATION_PENDING'].includes(error?.code)) return error.message;
  const message = getDeploymentErrorText(error);

  if (isWalletTransportTimeout(error)) {
    return 'MetaMask did not respond. Open and unlock the browser extension, confirm this site is connected, then retry. No blockchain transaction was sent.';
  }
  if (/provider not found|connector not connected|wallet provider is unavailable/i.test(message)) {
    return 'The connected MetaMask provider is unavailable in this browser tab. Reconnect the wallet and try again.';
  }
  if (/user rejected|user denied|request rejected/i.test(message)) {
    return 'Token creation was cancelled in the connected wallet.';
  }
  if (/PublicDeploymentsNotAllowed/i.test(message)) {
    return 'This organization wallet is not authorized to create a token. Connect the approved organization wallet and try again.';
  }
  if (/PublicCannotDeployOnBehalf/i.test(message)) {
    return 'The connected wallet cannot create this token for a different owner. Connect the approved organization wallet.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'The organization wallet does not have enough Sepolia ETH to cover the network fee for token creation.';
  }
  if (/transfer amount exceeds allowance|insufficient allowance/i.test(message)) {
    return 'The wallet does not have enough approved fee allowance to create the token.';
  }
  if (/already deployed|create2|salt/i.test(message)) {
    return 'A token with this owner and name may already have been created. Refresh the token status before trying again.';
  }

  return error?.shortMessage || error?.details || error?.message || 'Token creation could not be completed.';
};

export async function deployTrexSuite({
  connector,
  connectedAddress,
  organization,
  tokenInformation,
  identityClaims,
  compliance,
  agents,
  deploymentConfig,
  onStageChange,
  onWalletAction,
  onTransactionSubmitted,
  onDeploymentConfirmed,
}) {
  const provider = await connector?.getProvider?.();
  if (!provider?.request) {
    throw new Error('The connected wallet provider is unavailable. Reconnect the wallet and try again.');
  }

  const issuerAddress = requiredAddress(
    organization?.walletAddress || tokenInformation?.treasuryWallet,
    'Approved organization wallet',
  );
  const treasuryAddress = requiredAddress(
    tokenInformation?.treasuryWallet || issuerAddress,
    'Treasury wallet',
  );

  if (treasuryAddress.toLowerCase() !== issuerAddress.toLowerCase()) {
    throw new Error('The token treasury wallet must match the approved organization wallet.');
  }

  // The user has already connected the wallet on the review page. Do not call
  // eth_requestAccounts again here: reconnecting can launch a mobile deep link or
  // leave a second provider request pending. Read the currently authorized account
  // and fail safely when this tab is no longer connected.
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || !accounts.length) {
    const disconnected = new Error(
      'The approved wallet is no longer connected to this browser tab. Reconnect it and retry deployment.',
    );
    disconnected.code = 'WALLET_NOT_CONNECTED';
    throw disconnected;
  }
  const activeAddress = requiredAddress(accounts[0] || connectedAddress, 'Connected deployment wallet');
  if (activeAddress.toLowerCase() !== issuerAddress.toLowerCase()) {
    throw new Error(
      `Connected wallet (${activeAddress}) does not match the organization wallet (${issuerAddress}). Switch accounts and try again.`,
    );
  }

  const providerChainId = Number(BigInt(await provider.request({ method: 'eth_chainId' })));
  if (providerChainId !== web3Config.requiredChain.id) {
    throw new Error(`Switch the connected wallet to ${web3Config.requiredChain.name} before deploying.`);
  }

  onStageChange?.(1);

  const gatewayAddress = requiredAddress(deploymentConfig?.gateway, 'T-REX Gateway address');
  const platformWalletAddress = requiredAddress(
    deploymentConfig?.platformWallet,
    'Platform Token Agent wallet',
  );
  // The Platform Controller is a mandatory default Token Agent for every token
  // created through the platform. This lets controller-based purchase/mint and
  // redemption/burn flows work immediately after creation without a separate
  // issuer Agent transaction. Keep the environment value configurable for a
  // controlled controller migration, but never omit the current platform default.
  const platformControllerAddress = requiredAddress(
    deploymentConfig?.platformController || DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS,
    'Platform Controller address',
  );
  const identityFactoryAddress = requiredAddress(
    deploymentConfig?.identityFactory,
    'ONCHAINID Identity Factory address',
  );
  // Read, simulate, and confirm through the configured Sepolia RPC. Only the
  // transaction signature is sent through the injected wallet provider. This keeps
  // routine blockchain reads out of MetaMask's request transport and avoids a stalled
  // wallet connection from leaving the deployment page in a loading state.
  const publicClient = createTrexPublicClient();
  const walletClient = createWalletClient({
    account: activeAddress,
    chain: web3Config.requiredChain,
    transport: custom(provider),
  });

  const [issuerIdentityAddress, factoryAddress, publicDeployment, isApprovedDeployer] =
    await Promise.all([
      publicClient.readContract({
        address: identityFactoryAddress,
        abi: IDENTITY_FACTORY_ABI,
        functionName: 'getIdentity',
        args: [issuerAddress],
      }),
      publicClient.readContract({
        address: gatewayAddress,
        abi: TREX_GATEWAY_ABI,
        functionName: 'getFactory',
      }),
      publicClient.readContract({
        address: gatewayAddress,
        abi: TREX_GATEWAY_ABI,
        functionName: 'getPublicDeploymentStatus',
      }),
      publicClient.readContract({
        address: gatewayAddress,
        abi: TREX_GATEWAY_ABI,
        functionName: 'isDeployer',
        args: [issuerAddress],
      }),
    ]);

  if (!publicDeployment && !isApprovedDeployer) {
    throw new Error(
      'Public T-REX deployments are disabled and the organization wallet is not an approved deployer.',
    );
  }

  if (issuerIdentityAddress.toLowerCase() === zeroAddress) {
    throw new Error(
      `Issuer ${issuerAddress} has no ONCHAINID identity. Complete the organization approval step first.`,
    );
  }

  const organizationOnchainId = String(organization?.contractAddress || '').trim();
  if (organizationOnchainId) {
    const approvedOnchainId = requiredAddress(
      organizationOnchainId,
      'Organization ONCHAINID address',
    );
    if (approvedOnchainId.toLowerCase() !== issuerIdentityAddress.toLowerCase()) {
      throw new Error(
        'The organization ONCHAINID does not match the Identity Factory record.',
      );
    }
  }

  const identityCode = await publicClient.getBytecode({ address: issuerIdentityAddress });
  if (!identityCode || identityCode === '0x') {
    throw new Error('The issuer ONCHAINID address does not contain a deployed identity contract.');
  }

  const decimals = parseDecimals(tokenInformation?.decimals);
  const { complianceModules, complianceSettings } = buildComplianceArrays({
    compliance,
    decimals,
    moduleAddresses: deploymentConfig?.complianceModules,
  });
  const claimTopics = (identityClaims?.claimTopics || [])
    .filter((topic) => topic.enabled)
    .map(resolveClaimTopicValue);

  if (!claimTopics.length) {
    throw new Error('At least one numeric claim topic is required for T-REX deployment.');
  }
  if (claimTopics.length > 5) {
    throw new Error('The T-REX Factory supports a maximum of five claim topics per deployment.');
  }

  const tokenDetails = {
    owner: issuerAddress,
    name: String(tokenInformation?.name || '').trim(),
    symbol: String(tokenInformation?.symbol || '').trim(),
    decimals,
    irs: zeroAddress,
    ONCHAINID: zeroAddress,
    irAgents: uniqueAddresses([
      optionalAgentAddress(
        agents?.identityRegistryAgent?.address,
        issuerAddress,
        'Identity Manager wallet',
      ),
      issuerAddress,
    ]),
    tokenAgents: uniqueAddresses([
      optionalAgentAddress(agents?.tokenAgent?.address, issuerAddress, 'Token Agent wallet'),
      issuerAddress,
      platformWalletAddress,
      // Required system Agent: always include the Platform Controller so buy/redeem
      // can mint/burn through the controller as soon as the token is created.
      platformControllerAddress,
    ]),
    complianceModules,
    complianceSettings,
  };

  if (
    !tokenDetails.tokenAgents.some(
      (agentAddress) => agentAddress.toLowerCase() === platformControllerAddress.toLowerCase(),
    )
  ) {
    throw new Error('Platform Controller must be configured as a Token Agent before token creation.');
  }

  const claimDetails = {
    claimTopics,
    issuers: [getAddress(issuerIdentityAddress)],
    issuerClaims: [claimTopics],
  };

  if (!tokenDetails.name || !tokenDetails.symbol) {
    throw new Error('Token name and symbol are required for T-REX deployment.');
  }

  onStageChange?.(2);

  try {
    const callData = encodeFunctionData({
      abi: TREX_GATEWAY_ABI,
      functionName: 'deployTREXSuite',
      args: [tokenDetails, claimDetails],
    });
    const requestPayload = {
      account: activeAddress,
      network: {
        name: web3Config.requiredChain.name,
        chainId: providerChainId,
      },
      gateway: {
        address: gatewayAddress,
        factoryAddress: getAddress(factoryAddress),
        functionName: 'deployTREXSuite',
      },
      transactionRequest: {
        from: activeAddress,
        to: gatewayAddress,
        chainId: providerChainId,
        value: '0',
        data: callData,
      },
      tokenDetails,
      claimDetails,
      platformWalletAddress,
      platformControllerAddress,
      maximumBalance: {
        input:
          compliance?.maximumBalance !== '' && compliance?.maximumBalance != null
            ? String(compliance.maximumBalance)
            : null,
        decimals,
        baseUnits:
          compliance?.maximumBalance !== '' && compliance?.maximumBalance != null
            ? parseUnits(String(compliance.maximumBalance), decimals)
            : null,
      },
    };

    /* eslint-disable no-console -- Required deployment diagnostics for issuer verification. */
    console.groupCollapsed(
      `[T-REX deployment request] ${tokenDetails.symbol} via ${gatewayAddress}`,
    );
    console.log('Complete deployTREXSuite payload:', requestPayload);
    console.log('JSON-safe deployment payload:', jsonSafe(requestPayload));
    console.groupEnd();
    /* eslint-enable no-console */

    const simulation = await publicClient.simulateContract({
      account: activeAddress,
      address: gatewayAddress,
      abi: TREX_GATEWAY_ABI,
      functionName: 'deployTREXSuite',
      args: [tokenDetails, claimDetails],
    });

    onWalletAction?.({
      key: 'create-token',
      step: 1,
      total: 3,
      status: 'awaiting-signature',
      title: 'Transaction 1 of 3: Create your token',
      description:
        'Approve this transaction to create the ERC-3643 token and its identity, compliance, and registry contracts on Sepolia.',
      gasRequired: true,
    });

    const transactionHash = await walletClient.writeContract(simulation.request);
    onWalletAction?.({
      key: 'create-token',
      step: 1,
      total: 3,
      status: 'confirming',
      title: 'Creating your token',
      description: 'The wallet approval was received. Waiting for Sepolia to confirm the token creation transaction.',
      transactionHash,
      gasRequired: true,
    });
    onStageChange?.(3, { transactionHash });

    if (onTransactionSubmitted) {
      try {
        await onTransactionSubmitted({
          transactionHash,
          issuerAddress,
          network: web3Config.requiredChain.name,
          chainId: providerChainId,
        });
      } catch (submissionError) {
        submissionError.transactionHash = transactionHash;
        submissionError.transactionSubmitted = true;
        submissionError.syncOnly = true;
        throw submissionError;
      }
    }

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
    });

    if (!receiptSucceeded(receipt)) {
      onWalletAction?.({
        key: 'create-token',
        step: 1,
        total: 3,
        status: 'failed',
        title: 'Token creation transaction failed',
        description: 'Sepolia confirmed the transaction, but it reverted.',
        transactionHash,
        gasRequired: true,
      });
      const reverted = new Error('The deployment transaction was confirmed but reverted.');
      reverted.code = 'DEPLOYMENT_TRANSACTION_REVERTED';
      reverted.failedStep = 'deployment';
      reverted.transactionHash = transactionHash;
      reverted.transactionSubmitted = true;
      reverted.confirmedRevert = true;
      throw reverted;
    }

    onWalletAction?.({
      key: 'create-token',
      step: 1,
      total: 3,
      status: 'confirmed',
      title: 'Asset contracts created',
      description: 'The first transaction is confirmed. The next required wallet approval will activate approved transfers.',
      transactionHash,
      gasRequired: true,
    });

    const contracts = extractSuiteDeployment(receipt, getAddress(factoryAddress));
    if (!contracts?.token) {
      const missingEvent = new Error(
        'TREXSuiteDeployed event was not found in the confirmed receipt.',
      );
      missingEvent.transactionHash = transactionHash;
      missingEvent.transactionSubmitted = true;
      throw missingEvent;
    }

    // Persist transaction #1 only after its successful receipt, before requesting the
    // mandatory transfer-activation transaction. This keeps the deployment recoverable even if the web session expires,
    // the tab reloads, or another authenticated request redirects the user to sign in.
    if (onDeploymentConfirmed) {
      try {
        await onDeploymentConfirmed({
          transactionHash,
          receipt,
          contracts,
          issuerAddress,
          network: web3Config.requiredChain.name,
          chainId: providerChainId,
          blockNumber: receipt.blockNumber.toString(),
        });
      } catch (recoveryError) {
        const durableStorageError = new Error(
          'Your token was created on Sepolia, but this browser could not save the confirmed transaction for session recovery. Keep this page open and retry synchronization before leaving.',
        );
        durableStorageError.code = 'DEPLOYMENT_RECOVERY_SAVE_FAILED';
        durableStorageError.cause = recoveryError;
        durableStorageError.transactionHash = transactionHash;
        durableStorageError.transactionSubmitted = true;
        durableStorageError.syncOnly = true;
        throw durableStorageError;
      }
    }

    const verificationReads = await Promise.allSettled([
      publicClient.readContract({
        address: contracts.token,
        abi: TOKEN_ACCESS_ABI,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: contracts.ir,
        abi: IDENTITY_REGISTRY_ACCESS_ABI,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: contracts.token,
        abi: TOKEN_ACCESS_ABI,
        functionName: 'isAgent',
        args: [issuerAddress],
      }),
      publicClient.readContract({
        address: contracts.token,
        abi: TOKEN_ACCESS_ABI,
        functionName: 'isAgent',
        args: [platformWalletAddress],
      }),
      publicClient.readContract({
        address: contracts.token,
        abi: TOKEN_ACCESS_ABI,
        functionName: 'isAgent',
        args: [platformControllerAddress],
      }),
      publicClient.readContract({
        address: contracts.ir,
        abi: IDENTITY_REGISTRY_ACCESS_ABI,
        functionName: 'isAgent',
        args: [issuerAddress],
      }),
      publicClient.readContract({
        address: contracts.token,
        abi: TOKEN_ACCESS_ABI,
        functionName: 'paused',
      }),
    ]);
    const readValue = (index) =>
      verificationReads[index]?.status === 'fulfilled' ? verificationReads[index].value : null;
    const readError = (index) =>
      verificationReads[index]?.status === 'rejected'
        ? verificationReads[index].reason?.shortMessage ||
          verificationReads[index].reason?.message ||
          'Read failed'
        : '';

    const tokenOwner = readValue(0);
    const identityRegistryOwner = readValue(1);
    const issuerIsTokenAgent = readValue(2);
    const platformIsTokenAgent = readValue(3);
    const controllerIsTokenAgent = readValue(4);
    const issuerIsIdentityRegistryAgent = readValue(5);
    const tokenWasPaused = readValue(6);

    const unpause = await activateTrexTransfers({
      connector,
      connectedAddress: activeAddress,
      issuerWalletAddress: issuerAddress,
      tokenAddress: contracts.token,
      deploymentTransactionHash: transactionHash,
      contracts,
      onWalletAction,
    });

    let deployedAt = new Date().toISOString();
    try {
      const deploymentBlock = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      deployedAt = new Date(Number(deploymentBlock.timestamp) * 1000).toISOString();
    } catch {
      // The confirmed receipt remains authoritative if the follow-up block timestamp read fails.
    }

    const claimTopicValues = claimTopics.map((topic) => topic.toString());
    const trustedIssuerWallet = String(identityClaims?.trustedIssuer?.address || '').trim();
    const claimIssuer = {
      wallet: isAddress(trustedIssuerWallet, { strict: false })
        ? getAddress(trustedIssuerWallet.toLowerCase())
        : issuerAddress,
      contract: getAddress(issuerIdentityAddress),
      claimTopic: claimTopicValues.join(','),
      claimTopics: claimTopicValues,
    };
    const verification = {
      tokenOwner: tokenOwner ? getAddress(tokenOwner) : null,
      identityRegistryOwner: identityRegistryOwner ? getAddress(identityRegistryOwner) : null,
      issuerIsTokenAgent,
      platformIsTokenAgent,
      controllerIsTokenAgent,
      issuerIsIdentityRegistryAgent,
      tokenWasPaused,
      tokenOwnerMatchesIssuer: tokenOwner ? sameAddress(tokenOwner, issuerAddress) : null,
      identityRegistryOwnerMatchesIssuer: identityRegistryOwner
        ? sameAddress(identityRegistryOwner, issuerAddress)
        : null,
      readErrors: {
        tokenOwner: readError(0),
        identityRegistryOwner: readError(1),
        issuerIsTokenAgent: readError(2),
        platformIsTokenAgent: readError(3),
        controllerIsTokenAgent: readError(4),
        issuerIsIdentityRegistryAgent: readError(5),
        tokenPaused: readError(6),
      },
    };
    const receiptDetails = {
      status: receipt.status,
      transactionHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber.toString(),
      from: receipt.from,
      to: receipt.to,
      contractAddress: receipt.contractAddress,
      cumulativeGasUsed: receipt.cumulativeGasUsed?.toString?.() || '',
      gasUsed: receipt.gasUsed?.toString?.() || '',
      effectiveGasPrice: receipt.effectiveGasPrice?.toString?.() || '',
      logsCount: receipt.logs?.length || 0,
    };
    const deploymentResponse = {
      deployedAt,
      deployTx: transactionHash,
      transactionHash,
      network: web3Config.requiredChain.name,
      chainId: providerChainId,
      gateway: gatewayAddress,
      factory: getAddress(factoryAddress),
      issuerWallet: issuerAddress,
      issuerOnchainId: getAddress(issuerIdentityAddress),
      platformWallet: platformWalletAddress,
      platformController: platformControllerAddress,
      contracts,
      claimIssuer,
      tokenAgents: tokenDetails.tokenAgents,
      identityRegistryAgents: tokenDetails.irAgents,
      verification,
      unpause,
      receipt: receiptDetails,
      rawReceipt: jsonSafe(receipt),
    };

    /* eslint-disable no-console -- Required deployment diagnostics for response verification. */
    console.groupCollapsed(
      `[T-REX deployment response] ${tokenDetails.symbol} ${transactionHash}`,
    );
    console.log('Complete confirmed deployment response:', deploymentResponse);
    console.log('Raw confirmed transaction receipt:', receipt);
    console.log(
      'Token.owner()           :',
      tokenOwner,
      verification.tokenOwnerMatchesIssuer ? '✓ issuer' : '✗ WRONG/UNAVAILABLE',
    );
    console.log(
      'IdentityRegistry.owner():',
      identityRegistryOwner,
      verification.identityRegistryOwnerMatchesIssuer ? '✓ issuer' : '✗ WRONG/UNAVAILABLE',
    );
    console.log('issuer isAgent(Token)   :', issuerIsTokenAgent);
    console.log('platform wallet isAgent(Token):', platformIsTokenAgent);
    console.log('platform controller isAgent(Token):', controllerIsTokenAgent);
    console.log('issuer isAgent(IR)      :', issuerIsIdentityRegistryAgent);
    console.log('Issuer unpause result   :', unpause);
    console.log('JSON-safe response:', jsonSafe(deploymentResponse));
    console.groupEnd();
    /* eslint-enable no-console */

    return {
      transactionHash,
      deployTx: transactionHash,
      deployedAt,
      blockNumber: receipt.blockNumber.toString(),
      chainId: providerChainId,
      network: web3Config.requiredChain.name,
      gatewayAddress,
      factoryAddress: getAddress(factoryAddress),
      issuerAddress,
      issuerIdentityAddress: getAddress(issuerIdentityAddress),
      platformWalletAddress,
      platformControllerAddress,
      tokenDetails,
      claimDetails,
      contracts,
      claimIssuer,
      verification,
      unpause,
      receipt: receiptDetails,
      deploymentResponse,
      tokenAddress: contracts.token,
      identityRegistryAddress: contracts.ir,
      identityRegistryStorageAddress: contracts.irs,
      trustedIssuersRegistryAddress: contracts.tir,
      claimTopicsRegistryAddress: contracts.ctr,
      modularComplianceAddress: contracts.mc,
    };
  } catch (error) {
    if (isWalletTransportTimeout(error)) {
      error.code = 'WALLET_TRANSPORT_TIMEOUT';
      error.transactionSubmitted = Boolean(error?.transactionHash);
    }
    error.message = deploymentErrorMessage(error);
    throw error;
  }
}
