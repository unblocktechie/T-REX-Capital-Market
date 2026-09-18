import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAddFunds } from '@privy-io/react-auth';
import { isAddress } from 'viem';
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArcNetworkIcon } from '@/components/common/ArcNetworkIcon';
import { TokenIcon } from '@/components/common/TokenIcon';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { UsdcBridgeModal } from '@/components/wallet/UsdcBridgeModal';
import { WalletControl } from '@/components/wallet/WalletControl';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useAuth } from '@/hooks/useAuth';
import {
  getTokenRecordName,
  getTokenRecordSymbol,
  useMyToken,
} from '@/hooks/useMyToken';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import { readWalletNativeBalance, readWalletTokenBalance } from '@/services/wallet/walletAssets.service';
import { getUsdcBridgeConfigurationIssue } from '@/services/wallet/usdcBridge.service';
import { shortenWalletAddress } from '@/utils/wallet';

const PORTFOLIO_PAGE_SIZE = 100;
const MAX_PORTFOLIO_PAGES = 50;
const BALANCE_CONCURRENCY = 6;

const clean = (value) => String(value ?? '').trim();
const firstNumber = (...values) => {
  const value = values.find((item) => item !== '' && item !== undefined && item !== null);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const nestedValue = (source, path) =>
  path.split('.').reduce((current, part) => current?.[part], source);

const normalizeStatus = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const isRegisteredApplication = (application) => {
  const interestStatus = normalizeStatus(application?.interest?.status);
  if (interestStatus) return ['registered', 'readytoinvest', 'verifiedholder'].includes(interestStatus);
  return ['registered', 'readytoinvest', 'verifiedholder'].includes(
    normalizeStatus(application?.status),
  );
};

const assetManagementRoute = ({ interestUid = '', tokenUid = '' } = {}) => {
  const params = new URLSearchParams();
  if (clean(interestUid)) params.set('interestUid', clean(interestUid));
  if (clean(tokenUid)) params.set('tokenUid', clean(tokenUid));
  const query = params.toString();
  return query ? `${ROUTES.assetManagement}?${query}` : ROUTES.assetManagement;
};

const tokenIdentityKey = (asset = {}) => {
  const values = [
    asset.id,
    asset.tokenUid,
    asset.tokenAddress,
    `${clean(asset.symbol)}-${clean(asset.name)}`,
  ];
  return values.map(clean).find(Boolean).toLowerCase();
};

const pickPreferredRoute = (currentRoute, nextRoute) => {
  const current = clean(currentRoute);
  const next = clean(nextRoute);
  if (!current) return next;
  if (!next) return current;
  if (next.startsWith(ROUTES.assetManagement)) return next;
  if (current.startsWith(ROUTES.assetManagement)) return current;
  return current;
};

const mergeWalletAssetSeed = (current = {}, next = {}) => {
  const mergedBalance = clean(current.balance) || clean(next.balance);
  const mergedBalanceStatus = mergedBalance
    ? 'reported'
    : current.balanceStatus === 'reported' || next.balanceStatus === 'reported'
      ? 'reported'
      : current.balanceStatus || next.balanceStatus || 'unavailable';

  return {
    ...current,
    ...next,
    id: clean(current.id) || clean(next.id),
    tokenUid: clean(current.tokenUid) || clean(next.tokenUid),
    interestUid: clean(current.interestUid) || clean(next.interestUid),
    name: clean(current.name) || clean(next.name) || 'Investment asset',
    symbol: clean(current.symbol) || clean(next.symbol) || 'TOKEN',
    tokenAddress: clean(current.tokenAddress) || clean(next.tokenAddress),
    chainId: current.chainId || next.chainId || web3Config.requiredChain.id,
    decimals: current.decimals ?? next.decimals ?? null,
    imageUrl: clean(current.imageUrl) || clean(next.imageUrl),
    route: pickPreferredRoute(current.route, next.route),
    balance: mergedBalance,
    balanceStatus: mergedBalanceStatus,
    balanceSource: mergedBalance
      ? current.balanceSource === 'Portfolio record'
        ? current.balanceSource
        : next.balanceSource || current.balanceSource || 'Portfolio record'
      : current.balanceSource || next.balanceSource || 'Balance unavailable',
  };
};

const firstAddress = (source, paths) => {
  for (const path of paths) {
    const value = clean(nestedValue(source, path));
    if (isAddress(value)) return value;
  }
  return '';
};

const formatExactBalance = (value, maximumFractionDigits = 8) => {
  const normalized = clean(value);
  if (!normalized) return '—';
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return normalized;

  const [, sign, integerPart, fractionPart = ''] = match;
  const grouped = (integerPart.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = fractionPart.slice(0, maximumFractionDigits).replace(/0+$/, '');
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
};

const hasPositiveBalance = (value) => {
  const normalized = clean(value).replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  return /[1-9]/.test(normalized);
};

const assetBalanceFractionDigits = (asset) => {
  if (asset?.kind === 'currency') return String(asset?.symbol || '').toUpperCase() === 'USDC' ? 6 : 8;
  const parsed = Number(asset?.decimals);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : 18;
};

const readInChunks = async (items, reader) => {
  const output = [];
  for (let index = 0; index < items.length; index += BALANCE_CONCURRENCY) {
    const chunk = items.slice(index, index + BALANCE_CONCURRENCY);
    // Keep RPC pressure bounded for wallets with many approved T-REX assets.
    // eslint-disable-next-line no-await-in-loop
    output.push(...(await Promise.all(chunk.map(reader))));
  }
  return output;
};

const loadConfiguredChainTokenAssets = async ({ definitions, walletAddress, signal }) => {
  const assets = Array.isArray(definitions) ? definitions : [];
  return readInChunks(assets, async (definition) => {
    const base = {
      ...definition,
      route: '',
      imageUrl: definition.imageUrl || '',
      balance: '',
      balanceStatus: 'unavailable',
      balanceSource: 'Balance unavailable',
    };

    if (signal?.aborted || !walletAddress || !definition.tokenAddress || !definition.chainId) {
      return base;
    }

    try {
      const result = await readWalletTokenBalance({
        tokenAddress: definition.tokenAddress,
        walletAddress,
        chainId: definition.chainId,
        decimals: definition.decimals,
      });
      return {
        ...base,
        decimals: result.decimals,
        balance: result.formatted,
        balanceStatus: 'ready',
        balanceSource: 'Live on-chain balance',
      };
    } catch {
      return base;
    }
  });
};

function ChainSelectorIcon({ chainId, size = 'sm' }) {
  if (Number(chainId) === Number(web3Config.requiredChain.id)) {
    return <ArcNetworkIcon size={size === 'lg' ? 'md' : 'xs'} decorative />;
  }

  return (
    <span className={`wallet-chain-icon wallet-chain-icon--${size}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <path d="M16 3 8.5 16 16 20.2 23.5 16 16 3Z" fill="currentColor" opacity="0.9" />
        <path d="m16 21.8-7.5-4.3L16 29l7.5-11.5-7.5 4.3Z" fill="currentColor" opacity="0.62" />
        <path d="M16 12.1 8.5 16 16 20.2 23.5 16 16 12.1Z" fill="currentColor" opacity="0.42" />
      </svg>
    </span>
  );
}

const loadAllInvestorPortfolio = async (signal) => {
  const items = [];
  let page = 1;
  let totalPages = 1;

  do {
    // Pagination is deliberate here: Wallet Management needs the full set of
    // T-REX assets known for the account, not only the first Portfolio page.
    // eslint-disable-next-line no-await-in-loop
    const result = await investorPortfolioService.list({
      page,
      limit: PORTFOLIO_PAGE_SIZE,
      search: '',
      signal,
    });
    if (signal?.aborted) return [];
    items.push(...(result.items || []));
    totalPages = Math.min(Number(result.meta?.totalPages) || 1, MAX_PORTFOLIO_PAGES);
    page += 1;
  } while (page <= totalPages);

  const unique = new Map();
  items.forEach((item) => {
    const key = item.tokenUid || item.tokenAddress || `${item.symbol}-${item.name}`;
    if (key && !unique.has(key)) unique.set(key, item);
  });
  return [...unique.values()];
};

const investorPortfolioDescriptor = (token = {}) => {
  const tokenUid = clean(token.tokenUid || token.id);
  const interestUid = clean(token.interestUid || token.interest?.interestUid);
  const fallbackBalance = clean(token.portfolio?.netTokenAmount);

  return {
    id: tokenUid || clean(token.tokenAddress) || `${clean(token.symbol)}-${clean(token.name)}`,
    tokenUid,
    interestUid,
    kind: 'investment',
    name: token.name || 'Investment asset',
    symbol: token.symbol || 'TOKEN',
    tokenAddress: firstAddress(token, [
      'tokenAddress',
      'contractAddress',
      'raw.tokenAddress',
      'raw.contractAddress',
      'token.tokenAddress',
      'token.contractAddress',
      'raw.token.tokenAddress',
      'raw.token.contractAddress',
      'contracts.token',
      'contracts.tokenAddress',
    ]),
    chainId: firstNumber(token.chainId, token.raw?.chainId, web3Config.requiredChain.id),
    decimals: firstNumber(token.decimals, token.raw?.decimals),
    imageUrl: token.imageUrl || '',
    route: tokenUid || interestUid ? assetManagementRoute({ interestUid, tokenUid }) : ROUTES.portfolio,
    balance: fallbackBalance,
    balanceStatus: fallbackBalance ? 'reported' : 'unavailable',
    balanceSource: fallbackBalance ? 'Portfolio record' : 'Balance unavailable',
  };
};

const investorApplicationDescriptor = (application = {}) => {
  const tokenUid = clean(application.tokenUid || application.id || application.token?.tokenUid);
  const interestUid = clean(application.interestUid || application.interest?.interestUid);

  return {
    id: tokenUid || clean(application.tokenAddress) || `${clean(application.symbol)}-${clean(application.name)}`,
    tokenUid,
    interestUid,
    kind: 'investment',
    name: application.name || application.token?.name || 'Investment asset',
    symbol: application.symbol || application.token?.symbol || 'TOKEN',
    tokenAddress: firstAddress(application, [
      'tokenAddress',
      'contractAddress',
      'raw.tokenAddress',
      'raw.contractAddress',
      'token.tokenAddress',
      'token.contractAddress',
      'interest.tokenAddress',
      'interest.contractAddress',
      'interest.token.tokenAddress',
      'interest.token.contractAddress',
      'raw.token.tokenAddress',
      'raw.token.contractAddress',
      'contracts.token',
      'contracts.tokenAddress',
    ]),
    chainId: firstNumber(
      application.chainId,
      application.token?.chainId,
      application.interest?.token?.chainId,
      application.raw?.chainId,
      application.raw?.token?.chainId,
      web3Config.requiredChain.id,
    ),
    decimals: firstNumber(
      application.decimals,
      application.token?.decimals,
      application.interest?.token?.decimals,
      application.raw?.decimals,
      application.raw?.token?.decimals,
    ),
    imageUrl: application.imageUrl || application.token?.imageUrl || '',
    route: assetManagementRoute({ interestUid, tokenUid }),
    balance: '',
    balanceStatus: 'unavailable',
    balanceSource: 'Balance unavailable',
  };
};

const loadInvestorTokenAssets = async ({ walletAddress, signal }) => {
  const [portfolioResult, applicationsResult] = await Promise.allSettled([
    loadAllInvestorPortfolio(signal),
    investorMarketplaceService.listApplications(),
  ]);

  if (signal?.aborted) return [];
  if (portfolioResult.status === 'rejected' && applicationsResult.status === 'rejected') {
    throw portfolioResult.reason || applicationsResult.reason || new Error('Unable to load wallet assets.');
  }

  const seeds = [
    ...(portfolioResult.status === 'fulfilled' ? portfolioResult.value.map(investorPortfolioDescriptor) : []),
    ...(applicationsResult.status === 'fulfilled'
      ? applicationsResult.value.filter(isRegisteredApplication).map(investorApplicationDescriptor)
      : []),
  ].filter((asset) => clean(asset.id) || clean(asset.tokenAddress) || clean(asset.symbol) || clean(asset.name));

  const mergedAssets = [...seeds.reduce((map, asset, index) => {
    const key = tokenIdentityKey(asset) || `wallet-asset-${index}`;
    map.set(key, mergeWalletAssetSeed(map.get(key), asset));
    return map;
  }, new Map()).values()];

  return readInChunks(mergedAssets, async (asset) => {
    if (signal?.aborted || !asset.tokenAddress || !walletAddress || !asset.chainId) return asset;

    try {
      const result = await readWalletTokenBalance({
        tokenAddress: asset.tokenAddress,
        walletAddress,
        chainId: asset.chainId,
        decimals: asset.decimals,
      });
      return {
        ...asset,
        decimals: result.decimals,
        balance: result.formatted,
        balanceStatus: 'ready',
        balanceSource: 'Live on-chain balance',
      };
    } catch {
      return asset;
    }
  });
};

const issuerTokenDescriptor = (tokenRecord) => {
  const token = tokenRecord.token || {};
  const information = token.tokenInformation || token.information || {};
  const tokenAddress = firstAddress(token, [
    'tokenAddress',
    'contractAddress',
    'proxyAddress',
    'contracts.token',
    'deployment.contracts.token',
    'deployment.tokenAddress',
    'deployment.contractAddress',
  ]);
  const chainId = firstNumber(
    token.chainId,
    token.deployment?.chainId,
    information.chainId,
    web3Config.requiredChain.id,
  );
  const decimals = firstNumber(token.decimals, information.decimals, 18);

  if (!tokenRecord.hasToken || !tokenAddress) return null;
  return {
    id: tokenRecord.tokenUid || tokenAddress,
    kind: 'investment',
    name: getTokenRecordName(token) || 'Investment asset',
    symbol: getTokenRecordSymbol(token) || 'TOKEN',
    tokenAddress,
    chainId,
    decimals,
    imageUrl: '',
    route: ROUTES.tokenDetails(tokenRecord.tokenUid || tokenAddress),
  };
};

const loadIssuerTokenAssets = async ({ descriptor, walletAddress }) => {
  if (!descriptor) return [];
  const base = {
    ...descriptor,
    balance: '',
    balanceStatus: 'unavailable',
    balanceSource: 'Balance unavailable',
  };

  if (!walletAddress || !descriptor.tokenAddress) return [base];
  try {
    const result = await readWalletTokenBalance({
      tokenAddress: descriptor.tokenAddress,
      walletAddress,
      chainId: descriptor.chainId,
      decimals: descriptor.decimals,
    });
    return [
      {
        ...base,
        decimals: result.decimals,
        balance: result.formatted,
        balanceStatus: 'ready',
        balanceSource: 'Live on-chain balance',
      },
    ];
  } catch {
    return [base];
  }
};

function BalanceStatus({ asset }) {
  if (asset.balanceStatus === 'ready') {
    return <span className="wallet-asset-status is-live"><CheckCircle2 size={13} /> Live</span>;
  }
  if (asset.balanceStatus === 'reported') {
    return <span className="wallet-asset-status is-reported"><ShieldCheck size={13} /> Recorded</span>;
  }
  return <span className="wallet-asset-status is-unavailable"><AlertCircle size={13} /> Unavailable</span>;
}

export default function WalletManagementPage() {
  useDocumentTitle('Wallet Management');
  const navigate = useNavigate();
  const { user } = useAuth();
  const wallet = useWalletConnection();
  const { addFunds } = useAddFunds();
  const isIssuer = user?.role === ROLES.issuer;
  const tokenRecord = useMyToken({ enabled: isIssuer });
  const [search, setSearch] = useState('');
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [addingFunds, setAddingFunds] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeDirection, setBridgeDirection] = useState('toArc');
  const [selectedChainId, setSelectedChainId] = useState(web3Config.requiredChain.id);
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const chainSelectorRef = useRef(null);

  const issuerDescriptor = useMemo(
    () => issuerTokenDescriptor(tokenRecord),
    [tokenRecord],
  );

  const selectedChain = useMemo(
    () => web3Config.walletViewChains.find((chain) => chain.id === Number(selectedChainId)) || web3Config.requiredChain,
    [selectedChainId],
  );
  const isArcBalanceView = selectedChain.id === web3Config.requiredChain.id;
  const selectedChainTokenDefinitions = useMemo(
    () => web3Config.walletViewTokenAssets?.[selectedChain.id] || [],
    [selectedChain.id],
  );

  useEffect(() => {
    if (!chainMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!chainSelectorRef.current?.contains(event.target)) setChainMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setChainMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [chainMenuOpen]);

  const selectedNativeBalanceQuery = useQuery({
    queryKey: [
      'wallet-management-native-balance',
      wallet.address || 'no-wallet',
      selectedChain.id,
    ],
    queryFn: () => readWalletNativeBalance({
      walletAddress: wallet.address,
      chainId: selectedChain.id,
    }),
    enabled: wallet.isConnected && isAddress(clean(wallet.address)),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const selectedChainTokenAssetsQuery = useQuery({
    queryKey: [
      'wallet-management-configured-token-assets',
      wallet.address || 'no-wallet',
      selectedChain.id,
      selectedChainTokenDefinitions.map((asset) => asset.tokenAddress).join(','),
    ],
    queryFn: ({ signal }) => loadConfiguredChainTokenAssets({
      definitions: selectedChainTokenDefinitions,
      walletAddress: wallet.address,
      signal,
    }),
    enabled:
      !isArcBalanceView
      && wallet.isConnected
      && isAddress(clean(wallet.address))
      && selectedChainTokenDefinitions.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const bridgeSepoliaUsdcQuery = useQuery({
    queryKey: [
      'wallet-management-bridge-sepolia-usdc',
      wallet.address || 'no-wallet',
      web3Config.usdcBridge.routes.toArc.source.chainId,
      web3Config.usdcBridge.routes.toArc.source.usdcAddress,
    ],
    queryFn: () => readWalletTokenBalance({
      tokenAddress: web3Config.usdcBridge.routes.toArc.source.usdcAddress,
      walletAddress: wallet.address,
      chainId: web3Config.usdcBridge.routes.toArc.source.chainId,
      decimals: 6,
    }),
    enabled: wallet.isConnected && isAddress(clean(wallet.address)),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const bridgeSepoliaNativeQuery = useQuery({
    queryKey: [
      'wallet-management-bridge-sepolia-native',
      wallet.address || 'no-wallet',
      web3Config.usdcBridge.routes.toArc.source.chainId,
    ],
    queryFn: () => readWalletNativeBalance({
      walletAddress: wallet.address,
      chainId: web3Config.usdcBridge.routes.toArc.source.chainId,
    }),
    enabled: wallet.isConnected && isAddress(clean(wallet.address)),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const bridgeArcUsdcQuery = useQuery({
    queryKey: [
      'wallet-management-bridge-arc-usdc',
      wallet.address || 'no-wallet',
      web3Config.usdcBridge.routes.toSepolia.source.chainId,
    ],
    queryFn: () => readWalletNativeBalance({
      walletAddress: wallet.address,
      chainId: web3Config.usdcBridge.routes.toSepolia.source.chainId,
    }),
    enabled: wallet.isConnected && isAddress(clean(wallet.address)),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const tokenAssetsQuery = useQuery({
    queryKey: [
      'wallet-management-assets',
      user?.role || 'unknown',
      wallet.address || 'no-wallet',
      isIssuer ? tokenRecord.tokenUid || 'no-token' : 'investor-portfolio',
      isIssuer ? issuerDescriptor?.tokenAddress || 'no-contract' : 'all',
    ],
    queryFn: ({ signal }) =>
      isIssuer
        ? loadIssuerTokenAssets({ descriptor: issuerDescriptor, walletAddress: wallet.address })
        : loadInvestorTokenAssets({ walletAddress: wallet.address, signal }),
    enabled:
      isArcBalanceView &&
      wallet.isConnected &&
      (isIssuer ? !tokenRecord.isLoading : user?.role === ROLES.investor),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const nativeAsset = useMemo(() => {
    const selectedBalance = selectedNativeBalanceQuery.data;
    const arcFallbackBalance = isArcBalanceView && wallet.balance
      ? wallet.balanceLabel.replace(new RegExp(`\\s+${wallet.balance.symbol}$`, 'i'), '')
      : '';
    const balance = clean(selectedBalance?.formatted) || arcFallbackBalance;
    const balanceReady = Boolean(balance);

    return {
      id: `${selectedChain.id}-native-${selectedChain.nativeCurrency.symbol.toLowerCase()}`,
      kind: 'currency',
      name: selectedChain.nativeCurrency.name,
      symbol: selectedChain.nativeCurrency.symbol,
      tokenAddress: '',
      chainId: selectedChain.id,
      decimals: selectedChain.nativeCurrency.decimals,
      route: '',
      balance,
      balanceStatus: balanceReady ? 'ready' : 'unavailable',
      balanceSource: balanceReady
        ? `Live ${selectedChain.name} balance`
        : 'Balance unavailable',
    };
  }, [
    isArcBalanceView,
    selectedChain,
    selectedNativeBalanceQuery.data,
    wallet.balance,
    wallet.balanceLabel,
  ]);

  const allAssets = useMemo(
    () => isArcBalanceView
      ? [nativeAsset, ...(tokenAssetsQuery.data || [])]
      : [nativeAsset, ...(selectedChainTokenAssetsQuery.data || [])],
    [isArcBalanceView, nativeAsset, selectedChainTokenAssetsQuery.data, tokenAssetsQuery.data],
  );

  const visibleAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allAssets.filter((asset) => {
      const matchesSearch =
        !normalizedSearch ||
        [asset.name, asset.symbol, asset.tokenAddress]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesBalance = !hideZeroBalances || hasPositiveBalance(asset.balance);
      return matchesSearch && matchesBalance;
    });
  }, [allAssets, hideZeroBalances, search]);

  const positiveAssetCount = allAssets.filter((asset) => hasPositiveBalance(asset.balance)).length;
  const activeNetworkName = web3Config.walletViewChains.find((chain) => chain.id === Number(wallet.chainId))?.name
    || wallet.chain?.name
    || wallet.requiredChain?.name
    || web3Config.requiredChain.name;
  const nativeBalanceLoading = selectedNativeBalanceQuery.isLoading && !nativeAsset.balance;
  const configuredTokensLoading = !isArcBalanceView && selectedChainTokenAssetsQuery.isLoading;
  const loadingAssets = nativeBalanceLoading
    || (isArcBalanceView ? tokenAssetsQuery.isLoading : configuredTokensLoading);
  const refreshBusy = manualRefreshing
    || selectedNativeBalanceQuery.isFetching
    || (isArcBalanceView ? tokenAssetsQuery.isFetching : selectedChainTokenAssetsQuery.isFetching)
    || wallet.isBusy;
  const preferredBalanceAsset = useMemo(() => {
    if (isArcBalanceView) return nativeAsset;
    const usdc = (selectedChainTokenAssetsQuery.data || []).find(
      (asset) => String(asset.symbol || '').toUpperCase() === 'USDC',
    );
    const configuredUsdc = selectedChainTokenDefinitions.find(
      (asset) => String(asset.symbol || '').toUpperCase() === 'USDC',
    );
    return usdc || configuredUsdc || nativeAsset;
  }, [
    isArcBalanceView,
    nativeAsset,
    selectedChainTokenAssetsQuery.data,
    selectedChainTokenDefinitions,
  ]);
  const preferredBalanceLoading = preferredBalanceAsset.id === nativeAsset.id
    ? nativeBalanceLoading
    : configuredTokensLoading;
  const selectedBalanceLabel = preferredBalanceLoading
    ? 'Loading balance…'
    : preferredBalanceAsset.balance
      ? `${formatExactBalance(preferredBalanceAsset.balance, Math.min(assetBalanceFractionDigits(preferredBalanceAsset), 8))} ${preferredBalanceAsset.symbol}`
      : `— ${preferredBalanceAsset.symbol}`;
  const fundingDestination = web3Config.walletFunding;
  const canAddFunds = Boolean(
    wallet.isConnected
      && isAddress(clean(wallet.address))
      && fundingDestination?.chain
      && isAddress(clean(fundingDestination?.asset)),
  );

  const bridgeConfigurationIssue = getUsdcBridgeConfigurationIssue();
  const canBridgeUsdc = Boolean(
    wallet.isConnected
      && isAddress(clean(wallet.address))
      && !bridgeConfigurationIssue
      && web3Config.usdcBridge?.routes?.toArc?.source?.appKitChain
      && web3Config.usdcBridge?.routes?.toArc?.destination?.appKitChain
      && web3Config.usdcBridge?.routes?.toSepolia?.source?.appKitChain
      && web3Config.usdcBridge?.routes?.toSepolia?.destination?.appKitChain,
  );

  const copyAddress = async (value, label = 'Address') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  };

  const handleRefresh = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    const refreshers = [
      wallet.refresh?.(),
      selectedNativeBalanceQuery.refetch(),
      isArcBalanceView ? tokenAssetsQuery.refetch() : selectedChainTokenAssetsQuery.refetch(),
      bridgeSepoliaUsdcQuery.refetch(),
      bridgeSepoliaNativeQuery.refetch(),
      bridgeArcUsdcQuery.refetch(),
    ].filter(Boolean);
    const results = await Promise.allSettled(refreshers);
    setManualRefreshing(false);

    if (results.every((result) => result.status === 'fulfilled')) {
      toast.success('Wallet balances refreshed');
    } else {
      toast.warning('Some balances could not be refreshed. Existing wallet data is still shown.');
    }
  };

  const handleAddFunds = async () => {
    if (addingFunds) return;

    if (!wallet.isConnected || !isAddress(clean(wallet.address))) {
      toast.error('Your Privy secure account is not available yet. Sign in again and try adding funds.');
      return;
    }

    if (!fundingDestination?.chain || !isAddress(clean(fundingDestination?.asset))) {
      toast.error(`USDC funding is not configured for ${fundingDestination.networkName}.`);
      return;
    }

    setAddingFunds(true);
    try {
      const result = await addFunds({
        destination: {
          address: wallet.address,
          chain: fundingDestination.chain,
          asset: fundingDestination.asset,
        },
        fiat: {
          source: {
            assets: ['usd'],
            defaultAsset: 'usd',
          },
          environment: fundingDestination.fiatEnvironment,
        },
        // crypto: {
        //   slippageBps: fundingDestination.cryptoSlippageBps,
        // },
      });

      if (result?.method === 'fiat' && result?.status === 'submitted') {
        toast.success('Funding request submitted', {
          description: `Privy is processing the USDC purchase for this wallet on ${fundingDestination.networkName}.`,
        });
      } else if (
        (result?.method === 'fiat' && result?.status === 'confirmed')
        || (result?.method === 'crypto' && result?.status === 'completed')
      ) {
        toast.success('USDC funding completed', {
          description: `Your USDC balance on ${fundingDestination.networkName} may take a moment to update.`,
        });
      } else {
        toast.success('Funding flow completed');
      }

      // Add Funds remains intentionally independent from the read-only balance
      // network selector. Funding the configured destination must not imply that the
      // selected wallet-view balance changed immediately.
    } catch (error) {
      const message = clean(error?.message || error?.shortMessage || error);
      if (/cancel|canceled|cancelled|dismiss|closed|user rejected/i.test(message)) {
        toast.info('Funding flow closed. No funds were added.');
      } else {
        toast.error('Unable to start USDC funding', {
          description: message || 'Privy could not open the funding flow. Please try again.',
        });
      }
    } finally {
      setAddingFunds(false);
    }
  };


  const handleBridgeCompleted = async () => {
    await Promise.allSettled([
      bridgeSepoliaUsdcQuery.refetch(),
      bridgeSepoliaNativeQuery.refetch(),
      bridgeArcUsdcQuery.refetch(),
      selectedNativeBalanceQuery.refetch(),
      selectedChainTokenAssetsQuery.refetch(),
      tokenAssetsQuery.refetch(),
      wallet.refresh?.(),
    ]);
    toast.success('Bridge completed', {
      description: `Your ${web3Config.ui.walletViewChainShortName} and ${web3Config.ui.requiredChainShortName} balances are being refreshed.`,
    });
  };

  const handleViewDestinationBalance = (chainId) => {
    setSelectedChainId(Number(chainId));
    setSearch('');
    setHideZeroBalances(false);
  };

  return (
    <div className="page-stack wallet-management-page">
      <header className="page-header wallet-management-header wallet-management-header--simple">
        <div>
          <h1>Wallet management</h1>
          <p>View your wallet balances across supported networks.</p>
        </div>
        <div className="page-header__actions wallet-management-header__actions">
          <Button
            icon={Plus}
            loading={addingFunds}
            onClick={handleAddFunds}
            disabled={!canAddFunds}
            aria-label={`Add ${fundingDestination.symbol} funds to this Privy secure account on ${fundingDestination.networkName}`}
            title={`Add ${fundingDestination.symbol} to this Privy secure account on ${fundingDestination.networkName}`}
          >
            Add funds
          </Button>
        </div>
      </header>

      <div className="wallet-management-overview">
        <Card className="wallet-management-account-card">
          <div className="wallet-management-account-card__heading">
            <div>
              <span className="eyebrow">Current secure account</span>
              <h2>{isIssuer ? 'Organization wallet' : 'Investor wallet'}</h2>
            </div>
            <span className={`wallet-management-network${wallet.isCorrectNetwork ? ' is-ready' : ''}`} title="Active transaction network">
              {wallet.isCorrectNetwork ? <ArcNetworkIcon size="xs" decorative /> : <AlertCircle size={14} />}
              <span>Active: {activeNetworkName}</span>
              {wallet.isCorrectNetwork ? <CheckCircle2 size={13} className="wallet-management-network__status" aria-hidden="true" /> : null}
            </span>
          </div>

          <div className="wallet-management-control-wrap">
            <WalletControl
              expanded
              context={isIssuer ? 'organization' : 'investor'}
              balanceOverride={{
                label: selectedBalanceLabel,
                symbol: preferredBalanceAsset.symbol,
                name: preferredBalanceAsset.name,
                networkName: selectedChain.name,
                networkKind: isArcBalanceView ? 'arc' : 'ethereum',
              }}
            />
          </div>

          {wallet.address ? (
            <button
              type="button"
              className="wallet-management-address"
              onClick={() => copyAddress(wallet.address, 'Wallet address')}
              title="Copy wallet address"
            >
              <span>
                <small>Wallet address</small>
                <strong>{wallet.address}</strong>
              </span>
              <Copy size={17} aria-hidden="true" />
            </button>
          ) : (
            <div className="wallet-management-account-warning">
              <AlertCircle size={17} />
              <span>Sign in again with your verified account to restore the Privy secure wallet.</span>
            </div>
          )}
        </Card>

        <div className="wallet-management-metrics" aria-label="Wallet summary">
          <Card className="wallet-management-metric">
            <span className="wallet-management-metric__icon"><WalletCards size={20} /></span>
            <span>
              <small>Known assets</small>
              <strong>{loadingAssets ? '—' : allAssets.length}</strong>
            </span>
          </Card>
          <Card className="wallet-management-metric">
            <span className="wallet-management-metric__icon"><CheckCircle2 size={20} /></span>
            <span>
              <small>Assets with balance</small>
              <strong>{loadingAssets ? '—' : positiveAssetCount}</strong>
            </span>
          </Card>
          <Card className="wallet-management-metric wallet-management-metric--usdc">
            <TokenIcon symbol={preferredBalanceAsset.symbol} name={preferredBalanceAsset.name} size="md" />
            <span>
              <small>Available {preferredBalanceAsset.symbol}</small>
              <strong>{preferredBalanceLoading ? '—' : selectedBalanceLabel}</strong>
            </span>
          </Card>
        </div>
      </div>

      <Card className="wallet-assets-card">
        <div className="wallet-assets-card__header wallet-assets-card__header--compact">
          <div className="wallet-assets-card__title-block">
            <h2>Token balances</h2>
            <div className="wallet-assets-card__network-line">
              <span>Assets on</span>
              <div className="wallet-management-chain-selector wallet-management-chain-selector--compact" ref={chainSelectorRef}>
                <button
                  type="button"
                  className="wallet-management-chain-selector__trigger"
                  aria-haspopup="listbox"
                  aria-expanded={chainMenuOpen}
                  aria-label={`Assets on ${selectedChain.name}`}
                  onClick={() => setChainMenuOpen((open) => !open)}
                >
                  <ChainSelectorIcon chainId={selectedChain.id} size="lg" />
                  <span className="wallet-management-chain-selector__copy">
                    <strong>{selectedChain.name}</strong>
                  </span>
                  <ChevronDown className={chainMenuOpen ? 'is-open' : ''} size={16} aria-hidden="true" />
                </button>

                {chainMenuOpen ? (
                  <div className="wallet-management-chain-selector__menu" role="listbox" aria-label="Wallet balance networks">
                    <span className="wallet-management-chain-selector__menu-label">View balances on</span>
                    {web3Config.walletViewChains.map((chain) => {
                      const selected = Number(chain.id) === Number(selectedChain.id);
                      const arc = Number(chain.id) === Number(web3Config.requiredChain.id);
                      return (
                        <button
                          key={chain.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`wallet-management-chain-selector__option${selected ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedChainId(Number(chain.id));
                            setSearch('');
                            setHideZeroBalances(false);
                            setChainMenuOpen(false);
                          }}
                        >
                          <ChainSelectorIcon chainId={chain.id} size="lg" />
                          <span className="wallet-management-chain-selector__option-copy">
                            <strong>{chain.name}</strong>
                            <small>{arc ? 'Native USDC · T-REX assets' : 'Native ETH · Official USDC'}</small>
                          </span>
                          <span className="wallet-management-chain-selector__option-status" aria-hidden="true">
                            {selected ? <Check size={15} /> : null}
                          </span>
                        </button>
                      );
                    })}
                    <div className="wallet-management-chain-selector__note">
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>Balance viewing is read-only and never switches your transaction network.</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="wallet-assets-card__updated" aria-live="polite">
            <span>{refreshBusy ? 'Updating…' : loadingAssets ? 'Loading balances…' : 'Updated just now'}</span>
            <button
              type="button"
              className="wallet-assets-refresh-button"
              onClick={handleRefresh}
              disabled={!wallet.isConnected || refreshBusy}
              aria-label="Refresh wallet balances"
              title="Refresh balances"
            >
              <RefreshCcw size={16} className={refreshBusy ? 'is-spinning' : ''} />
            </button>
          </div>
        </div>

        <div className="wallet-assets-toolbar">
          <label className="wallet-assets-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search token or symbol"
              aria-label="Search wallet tokens"
            />
          </label>
          <label className="wallet-assets-zero-toggle">
            <input
              type="checkbox"
              checked={hideZeroBalances}
              onChange={(event) => setHideZeroBalances(event.target.checked)}
            />
            <span>Hide zero balances</span>
          </label>
        </div>

        {selectedNativeBalanceQuery.isError && !nativeAsset.balance ? (
          <div className="wallet-assets-inline-message is-warning">
            <AlertCircle size={17} />
            <span>
              The {selectedChain.name} native {nativeAsset.symbol} balance could not be loaded. Supported token balances and other available account information are still shown.
            </span>
            <button type="button" onClick={() => selectedNativeBalanceQuery.refetch()}>Try again</button>
          </div>
        ) : null}

        {isArcBalanceView && tokenAssetsQuery.isError ? (
          <div className="wallet-assets-inline-message is-warning">
            <AlertCircle size={17} />
            <span>
              Some T-REX assets could not be loaded. USDC and any balance data already available are still shown.
            </span>
            <button type="button" onClick={() => tokenAssetsQuery.refetch()}>Try again</button>
          </div>
        ) : null}

        <div className="wallet-assets-list" aria-live="polite">
          {loadingAssets ? (
            (isArcBalanceView ? [0, 1, 2] : [0, 1]).map((item) => (
              <div className="wallet-asset-row is-loading" key={item} aria-hidden="true">
                <span className="wallet-asset-skeleton is-icon" />
                <span className="wallet-asset-skeleton is-wide" />
                <span className="wallet-asset-skeleton" />
              </div>
            ))
          ) : visibleAssets.length ? (
            visibleAssets.map((asset) => (
              <article className="wallet-asset-row" key={asset.id}>
                <TokenIcon
                  symbol={asset.symbol}
                  name={asset.name}
                  imageUrl={asset.imageUrl}
                  size="lg"
                />

                <div className="wallet-asset-row__identity">
                  <div className="wallet-asset-row__title">
                    <strong>{asset.name}</strong>
                    <span>{asset.symbol}</span>
                    <BalanceStatus asset={asset} />
                  </div>
                  <small className="wallet-asset-row__meta">
                    {asset.kind === 'currency' ? (
                      <span className="wallet-management-network-label">
                        {isArcBalanceView ? <ArcNetworkIcon size="xs" decorative /> : <ChainSelectorIcon chainId={selectedChain.id} />}
                        <span>{selectedChain.name} network currency</span>
                      </span>
                    ) : asset.kind === 'network-token' ? (
                      <span className="wallet-management-network-label">
                        <ChainSelectorIcon chainId={selectedChain.id} />
                        <span>{selectedChain.name} token</span>
                      </span>
                    ) : (
                      <span>Investment token</span>
                    )}
                    {asset.tokenAddress ? <span> · {shortenWalletAddress(asset.tokenAddress, 7, 6)}</span> : null}
                  </small>
                </div>

                <div className="wallet-asset-row__balance">
                  <small>Balance</small>
                  <strong>
                    <span className="wallet-asset-row__balance-value">
                      {asset.balance
                        ? formatExactBalance(asset.balance, assetBalanceFractionDigits(asset))
                        : '—'}
                    </span>
                    <span className="wallet-asset-row__balance-symbol">{asset.symbol}</span>
                  </strong>
                  <em>{asset.balanceSource}</em>
                </div>

                <div className="wallet-asset-row__actions">
                  {(
                    Number(selectedChain.id) === Number(web3Config.usdcBridge.routes.toArc.source.chainId)
                      && asset.kind === 'network-token'
                      && String(asset.symbol || '').toUpperCase() === 'USDC'
                  ) || (
                    Number(selectedChain.id) === Number(web3Config.usdcBridge.routes.toSepolia.source.chainId)
                      && asset.kind === 'currency'
                      && String(asset.symbol || '').toUpperCase() === 'USDC'
                  ) ? (
                    <button
                      type="button"
                      className="wallet-asset-bridge-button"
                      onClick={() => {
                        if (bridgeConfigurationIssue) {
                          toast.error(bridgeConfigurationIssue);
                          return;
                        }
                        setBridgeDirection(isArcBalanceView ? 'toSepolia' : 'toArc');
                        setBridgeOpen(true);
                      }}
                      disabled={!canBridgeUsdc}
                      aria-label={isArcBalanceView
                        ? `Bridge this ${web3Config.requiredChain.name} USDC balance to ${web3Config.walletViewChains.find((chain) => Number(chain.id) !== Number(web3Config.requiredChain.id))?.name || 'the configured destination network'}`
                        : `Bridge this ${selectedChain.name} USDC balance to ${web3Config.requiredChain.name}`}
                      title={bridgeConfigurationIssue || (isArcBalanceView
                        ? `Bridge ${web3Config.requiredChain.name} USDC to ${web3Config.walletViewChains.find((chain) => Number(chain.id) !== Number(web3Config.requiredChain.id))?.name || 'the configured destination network'}`
                        : `Bridge ${selectedChain.name} USDC to ${web3Config.requiredChain.name}`)}
                    >
                      <ArrowRightLeft size={15} />
                      <span>{isArcBalanceView ? `Bridge to ${web3Config.ui.walletViewChainShortName}` : `Bridge to ${web3Config.ui.requiredChainShortName}`}</span>
                    </button>
                  ) : null}
                  {asset.tokenAddress ? (
                    <button
                      type="button"
                      className="wallet-asset-icon-button"
                      onClick={() => copyAddress(asset.tokenAddress, `${asset.symbol} contract`)}
                      aria-label={`Copy ${asset.symbol} token contract`}
                      title="Copy token contract"
                    >
                      <Copy size={16} />
                    </button>
                  ) : null}
                  {asset.route ? (
                    <button
                      type="button"
                      className="wallet-asset-open-button"
                      onClick={() => navigate(asset.route)}
                    >
                      <span>{isIssuer ? 'View asset' : asset.route?.startsWith(ROUTES.assetManagement) ? 'Manage asset' : 'View portfolio'}</span>
                      <ExternalLink size={15} />
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="wallet-assets-empty">
              <Search size={23} />
              <strong>No matching assets</strong>
              <p>Try another token name or show zero balances again.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setHideZeroBalances(false);
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        <footer className="wallet-assets-card__footer">
          <ShieldCheck size={17} />
          <p>
            Balance viewing is read-only and does not switch the Privy wallet's transaction network. {web3Config.requiredChain.name} includes assets known to T-REX; {web3Config.walletViewChains.find((chain) => Number(chain.id) !== Number(web3Config.requiredChain.id))?.name} includes native {web3Config.walletViewChains.find((chain) => Number(chain.id) !== Number(web3Config.requiredChain.id))?.nativeCurrency.symbol} and the official Circle {web3Config.usdcBridge.token} contract configured by T-REX.
          </p>
        </footer>
      </Card>

      <UsdcBridgeModal
        open={bridgeOpen}
        onClose={() => setBridgeOpen(false)}
        walletAddress={wallet.address}
        getProvider={() => wallet.connector?.getProvider?.()}
        initialDirection={bridgeDirection}
        bridgeBalances={{
          toArc: {
            usdcBalance: bridgeSepoliaUsdcQuery.data?.formatted || '',
            gasBalance: bridgeSepoliaNativeQuery.data?.formatted || '',
            destinationGasBalance: bridgeArcUsdcQuery.data?.formatted || '',
            usdcLoading: bridgeSepoliaUsdcQuery.isLoading || bridgeSepoliaUsdcQuery.isFetching,
            gasLoading: bridgeSepoliaNativeQuery.isLoading || bridgeSepoliaNativeQuery.isFetching,
            destinationGasLoading: bridgeArcUsdcQuery.isLoading || bridgeArcUsdcQuery.isFetching,
            usdcError: bridgeSepoliaUsdcQuery.isError,
            gasError: bridgeSepoliaNativeQuery.isError,
            destinationGasError: bridgeArcUsdcQuery.isError,
          },
          toSepolia: {
            usdcBalance: bridgeArcUsdcQuery.data?.formatted || '',
            gasBalance: bridgeArcUsdcQuery.data?.formatted || '',
            destinationGasBalance: bridgeSepoliaNativeQuery.data?.formatted || '',
            usdcLoading: bridgeArcUsdcQuery.isLoading || bridgeArcUsdcQuery.isFetching,
            gasLoading: bridgeArcUsdcQuery.isLoading || bridgeArcUsdcQuery.isFetching,
            destinationGasLoading: bridgeSepoliaNativeQuery.isLoading || bridgeSepoliaNativeQuery.isFetching,
            usdcError: bridgeArcUsdcQuery.isError,
            gasError: bridgeArcUsdcQuery.isError,
            destinationGasError: bridgeSepoliaNativeQuery.isError,
          },
        }}
        onBridgeCompleted={handleBridgeCompleted}
        onViewDestinationBalance={handleViewDestinationBalance}
      />
    </div>
  );
}
