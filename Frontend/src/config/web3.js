import { createConfig, createStorage, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { env } from '@/config/env';
import { bridgeOnlyChainRecords as configuredBridgeOnlyChainRecords } from '@/config/bridgeNetworks';

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const firstText = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const item = value.find((entry) => text(entry));
      if (item) return text(item);
      continue;
    }
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return '';
};
const positiveInteger = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};

let chainRecords = [];
let supportedChains = [];
let bridgeChainRecords = [];
let bridgeChains = [];
let walletChains = [];
let requiredChain = null;

const unwrapRows = (payload) => {
  const body = payload?.data ?? payload;
  if (Array.isArray(body)) return body;
  return body?.chains || body?.items || [];
};

export const normalizeChainRecord = (row = {}) => {
  const chainId = positiveInteger(row.chainId);
  const chainUid = text(row.chainUid || row.uid);
  const chainName = text(row.chainName || row.name);
  const publicRpcUrl = firstText(
    row.publicRpcUrl,
    row.rpcUrls?.public,
    row.rpcUrls?.default,
  );
  if (!chainId || !chainUid || !chainName || !publicRpcUrl) return null;

  const nativeCurrency = row.nativeCurrency && typeof row.nativeCurrency === 'object'
    ? row.nativeCurrency
    : {};
  const nativeCurrencyDecimals = positiveInteger(
    row.nativeCurrencyDecimals ?? nativeCurrency.decimals,
  ) || 18;
  const platformContracts = row.contracts?.platform || {};
  return {
    ...row,
    chainUid,
    chainCode: text(row.chainCode),
    chainName,
    chainId,
    networkName: text(row.networkName) || chainName,
    nativeCurrencyName:
      text(row.nativeCurrencyName || nativeCurrency.name) ||
      text(row.nativeCurrencySymbol || nativeCurrency.symbol) ||
      'Native token',
    nativeCurrencySymbol: text(row.nativeCurrencySymbol || nativeCurrency.symbol) || 'ETH',
    nativeCurrencyDecimals,
    publicRpcUrl,
    explorerUrl: text(row.explorerUrl),
    identityFactoryAddress: text(row.identityFactoryAddress || platformContracts.identityFactory),
    platformControllerAddress: text(
      row.platformControllerAddress || platformContracts.platformController,
    ),
    trexFactoryAddress: text(row.trexFactoryAddress || platformContracts.trexFactory),
    requiredConfirmations:
      positiveInteger(row.requiredConfirmations ?? row.confirmations?.transactions ?? row.confirmations) || 1,
    registryConfirmations:
      positiveInteger(row.registryConfirmations ?? row.confirmations?.registry) || 1,
    imageUrl: firstText(
      row.imageUrl,
      row.chainImageUrl,
      row.chainLogoUrl,
      row.networkImageUrl,
      row.networkLogoUrl,
      row.logoUrl,
      row.iconUrl,
      typeof row.logo === 'string' ? row.logo : '',
      typeof row.icon === 'string' ? row.icon : '',
      row.logo?.url,
      row.logo?.imageUrl,
      row.icon?.url,
      row.icon?.imageUrl,
      row.branding?.logoUrl,
      row.branding?.imageUrl,
      row.branding?.iconUrl,
      row.metadata?.logoUrl,
      row.metadata?.imageUrl,
      row.metadata?.iconUrl,
      row.metadata?.logo?.url,
      row.metadata?.icon?.url,
    ),
    nativeCurrencyImageUrl: firstText(
      row.nativeCurrencyImageUrl,
      row.nativeCurrencyLogoUrl,
      row.nativeCurrencyIconUrl,
      row.nativeTokenImageUrl,
      row.nativeTokenLogoUrl,
      row.nativeTokenIconUrl,
      nativeCurrency.imageUrl,
      nativeCurrency.logoUrl,
      nativeCurrency.iconUrl,
      nativeCurrency.logo?.url,
      nativeCurrency.icon?.url,
    ),
    isTestnet: Boolean(row.isTestnet),
    isDefault: Boolean(row.isDefault),
    isActive: row.isActive !== false,
  };
};

export const toWagmiChain = (record) => defineChain({
  id: record.chainId,
  name: record.chainName,
  nativeCurrency: {
    name: record.nativeCurrencyName,
    symbol: record.nativeCurrencySymbol,
    decimals: record.nativeCurrencyDecimals,
  },
  rpcUrls: {
    default: { http: [record.publicRpcUrl] },
    public: { http: [record.publicRpcUrl] },
  },
  ...(record.explorerUrl
    ? { blockExplorers: { default: { name: `${record.chainName} Explorer`, url: record.explorerUrl } } }
    : {}),
  testnet: record.isTestnet,
});

export const initializeWeb3Chains = (payload) => {
  const normalized = unwrapRows(payload)
    .map(normalizeChainRecord)
    .filter((item) => item?.isActive !== false);
  if (!normalized.length) {
    throw new Error('No active blockchain networks were returned by the platform.');
  }

  const seen = new Set();
  chainRecords = normalized.filter((item) => {
    if (seen.has(item.chainId)) return false;
    seen.add(item.chainId);
    return true;
  });
  supportedChains = chainRecords.map(toWagmiChain);

  // Wallet-management bridge networks are deliberately not added to the
  // platform-supported chain catalogue. They are only registered with Wagmi
  // so balance reads and wallet switching can work for the independent bridge
  // feature (for example Ethereum when the backend does not expose Ethereum).
  const platformChainIds = new Set(chainRecords.map((item) => item.chainId));
  bridgeChainRecords = configuredBridgeOnlyChainRecords.filter(
    (item) => item?.isActive !== false && !platformChainIds.has(item.chainId),
  );
  bridgeChains = bridgeChainRecords.map(toWagmiChain);
  walletChains = [...supportedChains, ...bridgeChains];

  const defaultRecord = chainRecords.find((item) => item.isDefault) || chainRecords[0];
  requiredChain = supportedChains.find((item) => item.id === defaultRecord.chainId) || supportedChains[0];
  return chainRecords;
};

export const loadWeb3Bootstrap = async () => {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${env.apiBaseUrl}/${env.apiVersion}/chains`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Network catalogue request failed (${response.status}).`);
    const payload = await response.json();
    return initializeWeb3Chains(payload);
  } finally {
    globalThis.clearTimeout(timer);
  }
};

export const getChainRecordById = (chainId) =>
  chainRecords.find((item) => item.chainId === Number(chainId)) || null;

export const getChainRecordByUid = (chainUid) =>
  chainRecords.find((item) => item.chainUid === String(chainUid || '')) || null;

export const getBridgeChainRecordById = (chainId) =>
  bridgeChainRecords.find((item) => item.chainId === Number(chainId)) || null;

export const getWalletChainRecordById = (chainId) =>
  getChainRecordById(chainId) || getBridgeChainRecordById(chainId);

export const createWagmiConfig = () => {
  if (!supportedChains.length || !walletChains.length || !requiredChain) {
    throw new Error('Blockchain networks must be loaded before the wallet provider is created.');
  }

  const connectors = [
    injected({
      target: 'metaMask',
      shimDisconnect: true,
      unstable_shimAsyncInject: 2_000,
    }),
  ];

  if (env.walletConnectProjectId) {
    connectors.push(walletConnect({
      projectId: env.walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: env.appName,
        description: 'Connect your registered wallet for compliant token activity.',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
        icons: typeof window !== 'undefined' ? [`${window.location.origin}/favicon-192.png`] : [],
      },
      qrModalOptions: { themeMode: 'light' },
    }));
  }

  const transports = Object.fromEntries(
    walletChains.map((chain) => [chain.id, http(getWalletChainRecordById(chain.id)?.publicRpcUrl)]),
  );

  return createConfig({
    chains: walletChains,
    connectors,
    multiInjectedProviderDiscovery: false,
    storage: createStorage({
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      key: 'trex-wallet-v3',
    }),
    transports,
  });
};

export const web3Config = {
  get walletConnectConfigured() { return Boolean(env.walletConnectProjectId); },
  get requiredChain() { return requiredChain; },
  get supportedChains() { return supportedChains; },
  get bridgeChains() { return bridgeChains; },
  get walletChains() { return walletChains; },
  get chainRecords() { return chainRecords; },
  get bridgeChainRecords() { return bridgeChainRecords; },
  get defaultChainRecord() {
    return requiredChain ? getChainRecordById(requiredChain.id) : null;
  },
  getChainById(chainId) {
    return supportedChains.find((item) => item.id === Number(chainId)) || null;
  },
  getBridgeChainById(chainId) {
    return bridgeChains.find((item) => item.id === Number(chainId)) || null;
  },
  getWalletChainById(chainId) {
    return walletChains.find((item) => item.id === Number(chainId)) || null;
  },
  getChainRecordById,
  getBridgeChainRecordById,
  getWalletChainRecordById,
  getChainRecordByUid,
};
