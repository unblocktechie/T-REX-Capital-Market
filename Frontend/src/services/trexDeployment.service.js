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
import { env } from '@/config/env';
import { web3Config } from '@/config/web3';

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
      'Every restricted country must include a valid ISO 3166 numeric code before deployment.',
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
    `Claim topic “${topic?.shortName || topic?.name || topic?.id || 'unknown'}” has no numeric on-chain value.`,
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

const getDeploymentErrorText = (error) =>
  `${error?.name || ''} ${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''} ${
    error?.cause?.message || ''
  }`;

const isWalletTransportTimeout = (error) =>
  /transport request timed out|transporttimeouterror|metamask:\/\/connect|does not have a registered handler|failed to launch/i.test(
    getDeploymentErrorText(error),
  );

const deploymentErrorMessage = (error) => {
  const message = getDeploymentErrorText(error);

  if (isWalletTransportTimeout(error)) {
    return 'MetaMask did not respond. Open and unlock the browser extension, confirm this site is connected, then retry. No blockchain transaction was sent.';
  }
  if (/provider not found|connector not connected|wallet provider is unavailable/i.test(message)) {
    return 'The connected MetaMask provider is unavailable in this browser tab. Reconnect the wallet and try again.';
  }
  if (/user rejected|user denied|request rejected/i.test(message)) {
    return 'The deployment signature was cancelled in the connected wallet.';
  }
  if (/PublicDeploymentsNotAllowed/i.test(message)) {
    return 'Public deployments are disabled and this issuer wallet is not an approved Gateway deployer.';
  }
  if (/PublicCannotDeployOnBehalf/i.test(message)) {
    return 'The connected wallet cannot deploy this token on behalf of another owner.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'The issuer wallet does not have enough Sepolia ETH to pay the deployment gas.';
  }
  if (/transfer amount exceeds allowance|insufficient allowance/i.test(message)) {
    return 'The Gateway deployment fee token allowance is insufficient.';
  }
  if (/already deployed|create2|salt/i.test(message)) {
    return 'A T-REX suite with this owner and token name may already be deployed.';
  }

  return error?.shortMessage || error?.details || error?.message || 'T-REX deployment failed.';
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
  const identityFactoryAddress = requiredAddress(
    deploymentConfig?.identityFactory,
    'ONCHAINID Identity Factory address',
  );
  // Read, simulate, and confirm through the configured Sepolia RPC. Only the
  // transaction signature is sent through the injected wallet provider. This keeps
  // routine blockchain reads out of MetaMask's request transport and avoids a stalled
  // wallet connection from leaving the deployment page in a loading state.
  const publicClient = createPublicClient({
    chain: web3Config.requiredChain,
    transport: http(env.web3.rpcUrl),
  });
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
    ]),
    complianceModules,
    complianceSettings,
  };
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
      total: 2,
      status: 'awaiting-signature',
      title: 'Transaction 1 of 2: Create your token',
      description:
        'Approve this transaction to create the ERC-3643 token and its identity, compliance, and registry contracts on Sepolia.',
      gasRequired: true,
    });

    const transactionHash = await walletClient.writeContract(simulation.request);
    onWalletAction?.({
      key: 'create-token',
      step: 1,
      total: 2,
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

    if (receipt.status !== 'success') {
      onWalletAction?.({
        key: 'create-token',
        step: 1,
        total: 2,
        status: 'failed',
        title: 'Token creation transaction failed',
        description: 'Sepolia confirmed the transaction, but it reverted.',
        transactionHash,
        gasRequired: true,
      });
      const reverted = new Error('The deployment transaction was confirmed but reverted.');
      reverted.transactionHash = transactionHash;
      reverted.transactionSubmitted = true;
      reverted.confirmedRevert = true;
      throw reverted;
    }

    onWalletAction?.({
      key: 'create-token',
      step: 1,
      total: 2,
      status: 'confirmed',
      title: 'Token created successfully',
      description: 'The T-REX token suite is confirmed on Sepolia. One final wallet approval will activate token transfers.',
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

    // Persist the confirmed deployment hash before requesting the optional second wallet
    // transaction. This keeps the deployment recoverable even if the web session expires,
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
    const issuerIsIdentityRegistryAgent = readValue(4);
    const tokenWasPaused = readValue(5);

    let unpause = {
      attempted: false,
      status: tokenWasPaused === false ? 'already-unpaused' : 'not-attempted',
      transactionHash: '',
      blockNumber: '',
      error: '',
    };

    if (tokenWasPaused !== false) {
      unpause = { ...unpause, attempted: true, status: 'pending' };
      try {
        onWalletAction?.({
          key: 'activate-transfers',
          step: 2,
          total: 2,
          status: 'awaiting-signature',
          title: 'Transaction 2 of 2: Activate token transfers',
          description:
            'Approve this transaction to unpause the new token so eligible investors can receive and transfer it.',
          gasRequired: true,
        });

        const unpauseSimulation = await publicClient.simulateContract({
          account: activeAddress,
          address: contracts.token,
          abi: TOKEN_ACCESS_ABI,
          functionName: 'unpause',
        });
        const unpauseTransactionHash = await walletClient.writeContract(unpauseSimulation.request);
        onWalletAction?.({
          key: 'activate-transfers',
          step: 2,
          total: 2,
          status: 'confirming',
          title: 'Activating token transfers',
          description: 'The wallet approval was received. Waiting for Sepolia to confirm the activation transaction.',
          transactionHash: unpauseTransactionHash,
          gasRequired: true,
        });
        const unpauseReceipt = await publicClient.waitForTransactionReceipt({
          hash: unpauseTransactionHash,
          confirmations: 1,
        });
        onWalletAction?.({
          key: 'activate-transfers',
          step: 2,
          total: 2,
          status: unpauseReceipt.status === 'success' ? 'confirmed' : 'failed',
          title:
            unpauseReceipt.status === 'success'
              ? 'Token transfers activated'
              : 'Token activation transaction failed',
          description:
            unpauseReceipt.status === 'success'
              ? 'The token is unpaused and ready for eligible transfers.'
              : 'The token was created, but the activation transaction reverted.',
          transactionHash: unpauseTransactionHash,
          gasRequired: true,
        });
        unpause = {
          attempted: true,
          status: unpauseReceipt.status === 'success' ? 'success' : 'reverted',
          transactionHash: unpauseTransactionHash,
          blockNumber: unpauseReceipt.blockNumber.toString(),
          error:
            unpauseReceipt.status === 'success'
              ? ''
              : 'The issuer-signed unpause transaction was confirmed but reverted.',
          receipt: jsonSafe(unpauseReceipt),
        };
      } catch (unpauseError) {
        onWalletAction?.({
          key: 'activate-transfers',
          step: 2,
          total: 2,
          status: 'failed',
          title: 'Token created, but transfers are still paused',
          description:
            'The second wallet transaction was not completed. The token exists on Sepolia, but it must be unpaused before transfers can begin.',
          transactionHash: unpauseError?.transactionHash || '',
          gasRequired: true,
        });
        unpause = {
          attempted: true,
          status: 'failed',
          transactionHash: unpauseError?.transactionHash || '',
          blockNumber: '',
          error:
            unpauseError?.shortMessage ||
            unpauseError?.message ||
            'The issuer could not unpause the deployed token.',
        };
      }
    }

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
        issuerIsIdentityRegistryAgent: readError(4),
        tokenPaused: readError(5),
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
    console.log('platform isAgent(Token) :', platformIsTokenAgent);
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
