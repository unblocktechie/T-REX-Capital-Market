import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAddress } from 'viem';
import { AlertCircle, ArrowRightLeft, Check, CheckCircle2, ChevronDown, Copy, ExternalLink, RefreshCcw, Search, ShieldCheck, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { chainsApi } from '@/api/chains';
import { tokenApi } from '@/api/tokens';
import { NetworkIcon } from '@/components/common/NetworkIcon';
import { TokenIcon } from '@/components/common/TokenIcon';
import { Card } from '@/components/ui/Card';
import { UsdcBridgeModal } from '@/components/wallet/UsdcBridgeModal';
import { WalletControl } from '@/components/wallet/WalletControl';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useAuth } from '@/hooks/useAuth';
import { useChainConfig } from '@/hooks/useChains';
import { getTokenRecordChainId, getTokenRecordName, getTokenRecordSymbol, useMyToken } from '@/hooks/useMyToken';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import { readWalletNativeBalance, readWalletTokenBalance } from '@/services/wallet/walletAssets.service';
import { buildUsdcBridgeRoutes, getCircleBridgeChain, getUsdcBridgeConfigurationIssue } from '@/services/wallet/usdcBridge.service';
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
const nestedValue = (source, path) => path.split('.').reduce((current, part) => current?.[part], source);
const firstAddress = (source, paths) => {
  for (const path of paths) { const value = clean(nestedValue(source, path)); if (isAddress(value)) return value; }
  return '';
};
const firstImageUrl = (source, paths) => {
  for (const path of paths) { const value = clean(nestedValue(source, path)); if (value) return value; }
  return '';
};
const normalizeStatus = (value) => clean(value).toLowerCase().replace(/[\s_-]+/g, '');
const isRegisteredApplication = (application) => ['registered', 'readytoinvest', 'verifiedholder'].includes(normalizeStatus(application?.interest?.status || application?.status));
const assetManagementRoute = ({ interestUid = '', tokenUid = '' } = {}) => {
  const params = new URLSearchParams(); if (clean(interestUid)) params.set('interestUid', clean(interestUid)); if (clean(tokenUid)) params.set('tokenUid', clean(tokenUid));
  return params.toString() ? `${ROUTES.assetManagement}?${params}` : ROUTES.assetManagement;
};
const formatExactBalance = (value, maximumFractionDigits = 8) => {
  const normalized = clean(value); if (!normalized) return '—';
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/); if (!match) return normalized;
  const [, sign, integerPart, fractionPart = ''] = match;
  const grouped = (integerPart.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const safeMaximum = Math.max(0, Math.min(Number(maximumFractionDigits) || 0, 18));
  const visibleFraction = fractionPart.slice(0, safeMaximum).replace(/0+$/, '');
  if (!visibleFraction && /^0+$/.test(integerPart) && safeMaximum > 0 && /[1-9]/.test(fractionPart.slice(safeMaximum))) {
    return `${sign}<0.${'0'.repeat(Math.max(0, safeMaximum - 1))}1`;
  }
  return `${sign}${grouped}${visibleFraction ? `.${visibleFraction}` : ''}`;
};
const hasPositiveBalance = (value) => /^\d+(?:\.\d+)?$/.test(clean(value).replace(/,/g, '')) && /[1-9]/.test(clean(value));
const balanceDigits = (asset) => {
  const symbol = clean(asset?.symbol).toUpperCase();
  const decimals = Number(asset?.decimals);
  const safeDecimals = Number.isSafeInteger(decimals) && decimals >= 0 ? decimals : null;
  // Stablecoin balances are user-facing token amounts (normally 6 decimals),
  // while higher-precision assets are capped at 8 places for readability.
  if (symbol === 'USDC' || symbol === 'USDT') return Math.min(safeDecimals ?? 6, 6);
  return Math.min(safeDecimals ?? 8, 8);
};
const readInChunks = async (items, reader) => {
  const output = [];
  for (let index = 0; index < items.length; index += BALANCE_CONCURRENCY) {
    // eslint-disable-next-line no-await-in-loop
    output.push(...(await Promise.all(items.slice(index, index + BALANCE_CONCURRENCY).map(reader))));
  }
  return output;
};

const loadConfiguredAssets = ({ definitions, walletAddress, signal }) => readInChunks(definitions || [], async (definition) => {
  const base = { ...definition, balance: '', balanceStatus: 'unavailable', balanceSource: 'Balance unavailable' };
  if (signal?.aborted || !walletAddress || !definition.tokenAddress) return base;
  try {
    const result = await readWalletTokenBalance({ tokenAddress: definition.tokenAddress, walletAddress, chainId: definition.chainId, decimals: definition.decimals });
    return { ...base, decimals: result.decimals, balance: result.formatted, balanceStatus: 'ready', balanceSource: 'Live on-chain balance' };
  } catch { return base; }
});

const loadAllInvestorPortfolio = async (signal) => {
  const items = []; let page = 1; let totalPages = 1;
  do {
    // eslint-disable-next-line no-await-in-loop
    const result = await investorPortfolioService.list({ page, limit: PORTFOLIO_PAGE_SIZE, search: '', signal });
    if (signal?.aborted) return [];
    items.push(...(result.items || [])); totalPages = Math.min(Number(result.meta?.totalPages) || 1, MAX_PORTFOLIO_PAGES); page += 1;
  } while (page <= totalPages);
  return items;
};

const portfolioDescriptor = (token = {}) => {
  const tokenUid = clean(token.tokenUid || token.id); const interestUid = clean(token.interestUid || token.interest?.interestUid); const balance = clean(token.portfolio?.netTokenAmount);
  return {
    id: tokenUid || clean(token.tokenAddress) || `${clean(token.symbol)}-${clean(token.name)}`, tokenUid, interestUid, kind: 'investment',
    name: token.name || 'Investment asset', symbol: token.symbol || 'TOKEN',
    tokenAddress: firstAddress(token, ['tokenAddress', 'contractAddress', 'raw.tokenAddress', 'raw.contractAddress', 'token.tokenAddress', 'token.contractAddress', 'raw.token.tokenAddress', 'raw.token.contractAddress', 'contracts.token', 'contracts.tokenAddress']),
    chainId: firstNumber(token.chainId, token.raw?.chainId, web3Config.requiredChain?.id), decimals: firstNumber(token.decimals, token.raw?.decimals), imageUrl: firstImageUrl(token, ['imageUrl', 'logoUrl', 'iconUrl', 'logo.url', 'icon.url', 'token.imageUrl', 'token.logoUrl', 'token.iconUrl', 'token.logo.url', 'token.icon.url', 'raw.imageUrl', 'raw.logoUrl', 'raw.iconUrl', 'raw.token.imageUrl', 'raw.token.logoUrl', 'raw.token.iconUrl', 'metadata.imageUrl', 'metadata.logoUrl', 'metadata.iconUrl']),
    route: tokenUid || interestUid ? assetManagementRoute({ interestUid, tokenUid }) : ROUTES.portfolio, balance, balanceStatus: balance ? 'reported' : 'unavailable', balanceSource: balance ? 'Portfolio record' : 'Balance unavailable',
  };
};
const applicationDescriptor = (application = {}) => {
  const tokenUid = clean(application.tokenUid || application.id || application.token?.tokenUid); const interestUid = clean(application.interestUid || application.interest?.interestUid);
  return {
    id: tokenUid || clean(application.tokenAddress) || `${clean(application.symbol)}-${clean(application.name)}`, tokenUid, interestUid, kind: 'investment',
    name: application.name || application.token?.name || 'Investment asset', symbol: application.symbol || application.token?.symbol || 'TOKEN',
    tokenAddress: firstAddress(application, ['tokenAddress', 'contractAddress', 'raw.tokenAddress', 'raw.contractAddress', 'token.tokenAddress', 'token.contractAddress', 'interest.tokenAddress', 'interest.contractAddress', 'interest.token.tokenAddress', 'interest.token.contractAddress', 'raw.token.tokenAddress', 'raw.token.contractAddress']),
    chainId: firstNumber(application.chainId, application.token?.chainId, application.interest?.token?.chainId, application.raw?.chainId, application.raw?.token?.chainId, web3Config.requiredChain?.id),
    decimals: firstNumber(application.decimals, application.token?.decimals, application.interest?.token?.decimals, application.raw?.decimals), imageUrl: firstImageUrl(application, ['imageUrl', 'tokenImageUrl', 'logoUrl', 'iconUrl', 'logo.url', 'icon.url', 'token.imageUrl', 'token.tokenImageUrl', 'token.logoUrl', 'token.iconUrl', 'token.logo.url', 'token.icon.url', 'interest.token.imageUrl', 'interest.token.tokenImageUrl', 'interest.token.logoUrl', 'interest.token.iconUrl', 'interest.raw.imageUrl', 'interest.raw.tokenImageUrl', 'raw.imageUrl', 'raw.tokenImageUrl', 'raw.logoUrl', 'raw.iconUrl', 'raw.token.imageUrl', 'raw.token.tokenImageUrl', 'raw.token.logoUrl', 'raw.token.iconUrl', 'metadata.imageUrl', 'metadata.logoUrl', 'metadata.iconUrl']),
    route: assetManagementRoute({ interestUid, tokenUid }), balance: '', balanceStatus: 'unavailable', balanceSource: 'Balance unavailable',
  };
};
const assetKey = (asset) => `${Number(asset.chainId) || 0}:${clean(asset.tokenAddress).toLowerCase() || clean(asset.tokenUid).toLowerCase() || `${clean(asset.symbol)}:${clean(asset.name)}`.toLowerCase()}`;
const mergeAsset = (current = {}, next = {}) => ({ ...current, ...next, id: clean(current.id) || clean(next.id), tokenUid: clean(current.tokenUid) || clean(next.tokenUid), interestUid: clean(current.interestUid) || clean(next.interestUid), tokenAddress: clean(current.tokenAddress) || clean(next.tokenAddress), imageUrl: clean(current.imageUrl) || clean(next.imageUrl), route: clean(next.route) || clean(current.route), balance: clean(current.balance) || clean(next.balance), balanceStatus: clean(current.balance) ? current.balanceStatus : next.balanceStatus, balanceSource: clean(current.balance) ? current.balanceSource : next.balanceSource });
const loadInvestorAssets = async ({ walletAddress, signal }) => {
  const [portfolio, applications] = await Promise.allSettled([loadAllInvestorPortfolio(signal), investorMarketplaceService.listApplications()]);
  const seeds = [
    ...(portfolio.status === 'fulfilled' ? portfolio.value.map(portfolioDescriptor) : []),
    ...(applications.status === 'fulfilled' ? applications.value.filter(isRegisteredApplication).map(applicationDescriptor) : []),
  ];
  const merged = [...seeds.reduce((map, asset) => { const key = assetKey(asset); map.set(key, mergeAsset(map.get(key), asset)); return map; }, new Map()).values()];
  return readInChunks(merged, async (asset) => {
    if (!asset.tokenAddress || !asset.chainId || signal?.aborted) return asset;
    try { const result = await readWalletTokenBalance({ tokenAddress: asset.tokenAddress, walletAddress, chainId: asset.chainId, decimals: asset.decimals }); return { ...asset, decimals: result.decimals, balance: result.formatted, balanceStatus: 'ready', balanceSource: 'Live on-chain balance' }; } catch { return asset; }
  });
};

const issuerDescriptor = (tokenRecord) => {
  const token = tokenRecord.token || {}; const information = token.tokenInformation || token.information || {};
  const tokenAddress = firstAddress(token, ['tokenAddress', 'contractAddress', 'proxyAddress', 'contracts.token', 'deployment.contracts.token', 'deployment.tokenAddress', 'deployment.contractAddress']);
  if (!tokenRecord.hasToken || !tokenAddress) return null;
  return { id: tokenRecord.tokenUid || tokenAddress, tokenUid: tokenRecord.tokenUid || clean(token.tokenUid || token.uid || token.id), kind: 'investment', name: getTokenRecordName(token) || 'Investment asset', symbol: getTokenRecordSymbol(token) || 'TOKEN', tokenAddress, chainId: getTokenRecordChainId(token) || web3Config.requiredChain?.id, decimals: firstNumber(token.decimals, information.decimals, 18), imageUrl: firstImageUrl(token, ['imageUrl', 'tokenImageUrl', 'logoUrl', 'iconUrl', 'logo.url', 'icon.url', 'tokenInformation.imageUrl', 'tokenInformation.tokenImageUrl', 'tokenInformation.logoUrl', 'tokenInformation.iconUrl', 'information.imageUrl', 'information.tokenImageUrl', 'information.logoUrl', 'information.iconUrl', 'metadata.imageUrl', 'metadata.logoUrl', 'metadata.iconUrl']), route: ROUTES.tokenDetails(tokenRecord.tokenUid || tokenAddress), balance: '', balanceStatus: 'unavailable', balanceSource: 'Balance unavailable' };
};

function WalletAssetTokenIcon({ asset, isIssuer }) {
  const isInvestmentAsset = asset?.kind === 'investment';
  const tokenUid = clean(asset?.tokenUid);
  const backendImageUrl = clean(asset?.imageUrl);
  const canLoadInvestorImage = !isIssuer && isInvestmentAsset && Boolean(tokenUid || backendImageUrl);
  const canLoadIssuerImage = isIssuer && isInvestmentAsset;
  const imageQuery = useQuery({
    queryKey: [
      'wallet-management-investment-token-image',
      isIssuer ? 'issuer' : 'investor',
      tokenUid || clean(asset?.tokenAddress) || clean(asset?.id) || 'unknown-token',
      backendImageUrl || 'default-image-endpoint',
    ],
    queryFn: ({ signal }) => {
      if (isIssuer) return tokenApi.getImage(signal);
      return investorMarketplaceService.getTokenImageBlob(tokenUid, signal, backendImageUrl);
    },
    enabled: canLoadIssuerImage || canLoadInvestorImage,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    meta: { silent: true },
  });
  const [authenticatedImageUrl, setAuthenticatedImageUrl] = useState('');

  useEffect(() => {
    const blob = imageQuery.data;
    if (!(blob instanceof Blob) || !blob.size) {
      setAuthenticatedImageUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(blob);
    setAuthenticatedImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageQuery.data]);

  return (
    <TokenIcon
      symbol={asset?.symbol}
      name={asset?.name}
      imageUrl={isInvestmentAsset ? authenticatedImageUrl : backendImageUrl}
      size="lg"
      fallback={asset?.kind === 'currency' ? 'currency' : 'icon'}
      useBuiltInImages={!isInvestmentAsset}
    />
  );
}

function BalanceStatus({ asset }) {
  if (asset.balanceStatus === 'ready') return <span className="wallet-asset-status is-live"><CheckCircle2 size={13} /> Live</span>;
  if (asset.balanceStatus === 'reported') return <span className="wallet-asset-status is-reported"><ShieldCheck size={13} /> Recorded</span>;
  return <span className="wallet-asset-status is-unavailable"><AlertCircle size={13} /> Unavailable</span>;
}

export default function WalletManagementPage() {
  useDocumentTitle('Wallet Management');
  const navigate = useNavigate(); const { user } = useAuth(); const wallet = useWalletConnection(); const isIssuer = user?.role === ROLES.issuer; const tokenRecord = useMyToken({ enabled: isIssuer });
  const [search, setSearch] = useState(''); const [hideZeroBalances, setHideZeroBalances] = useState(false); const [manualRefreshing, setManualRefreshing] = useState(false); const [bridgeOpen, setBridgeOpen] = useState(false); const [bridgeRouteId, setBridgeRouteId] = useState(''); const [bridgeRoutesSnapshot, setBridgeRoutesSnapshot] = useState([]);
  const [selectedChainId, setSelectedChainId] = useState(() => web3Config.getWalletChainById(wallet.chainId)?.id || web3Config.requiredChain?.id || web3Config.walletChains[0]?.id); const [chainMenuOpen, setChainMenuOpen] = useState(false); const chainSelectorRef = useRef(null);
  const selectedChain = web3Config.getWalletChainById(selectedChainId) || web3Config.requiredChain || web3Config.walletChains[0];
  const selectedPlatformRecord = web3Config.getChainRecordById(selectedChain?.id);
  const selectedBridgeRecord = web3Config.getBridgeChainRecordById(selectedChain?.id);
  const selectedRecord = selectedPlatformRecord || selectedBridgeRecord;
  const chainConfigQuery = useChainConfig(selectedPlatformRecord?.chainUid);
  const selectedChainConfig = useMemo(() => ({
    ...(selectedRecord || {}),
    ...(selectedPlatformRecord ? chainConfigQuery.data || {} : selectedBridgeRecord || {}),
  }), [chainConfigQuery.data, selectedBridgeRecord, selectedPlatformRecord, selectedRecord]);
  const selectedChainArtwork = useMemo(() => ({
    ...selectedChainConfig,
    imageUrl: clean(selectedChainConfig?.imageUrl) || clean(selectedRecord?.imageUrl),
    nativeCurrencyImageUrl: clean(selectedChainConfig?.nativeCurrencyImageUrl) || clean(selectedRecord?.nativeCurrencyImageUrl),
  }), [selectedChainConfig, selectedRecord]);

  useEffect(() => {
    if (!chainMenuOpen) return undefined;
    const pointer = (event) => { if (!chainSelectorRef.current?.contains(event.target)) setChainMenuOpen(false); }; const key = (event) => { if (event.key === 'Escape') setChainMenuOpen(false); };
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
  }, [chainMenuOpen]);

  const configuredDefinitions = useMemo(() => (selectedChainConfig?.paymentTokens || [])
    .filter((item) => item.active !== false)
    .filter((item) => !(selectedChain?.nativeCurrency?.symbol?.toUpperCase() === 'USDC' && clean(item.symbol).toUpperCase() === 'USDC'))
    .map((item) => ({ id: `${item.chainId}-${item.contractAddress}`, kind: 'network-token', name: item.name || item.symbol, symbol: item.symbol, tokenAddress: item.contractAddress, chainId: item.chainId, decimals: item.decimals, imageUrl: item.imageUrl || '', route: '' })), [selectedChain?.nativeCurrency?.symbol, selectedChainConfig?.paymentTokens]);

  const nativeQuery = useQuery({ queryKey: ['wallet-management-native', wallet.address || 'no-wallet', selectedChain?.id], queryFn: () => readWalletNativeBalance({ walletAddress: wallet.address, chainId: selectedChain.id }), enabled: Boolean(selectedChain?.id && wallet.isConnected && isAddress(clean(wallet.address))), staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 });
  const configuredAssetsQuery = useQuery({ queryKey: ['wallet-management-payment-tokens', wallet.address || 'no-wallet', selectedChain?.id, configuredDefinitions.map((item) => item.tokenAddress).join(',')], queryFn: ({ signal }) => loadConfiguredAssets({ definitions: configuredDefinitions, walletAddress: wallet.address, signal }), enabled: Boolean(wallet.isConnected && isAddress(clean(wallet.address)) && configuredDefinitions.length), staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 });

  const issuerSeed = useMemo(() => issuerDescriptor(tokenRecord), [tokenRecord]);
  const roleAssetsQuery = useQuery({
    queryKey: ['wallet-management-role-assets', user?.role || 'unknown', wallet.address || 'no-wallet', isIssuer ? issuerSeed?.tokenAddress || 'none' : 'investor'],
    queryFn: async ({ signal }) => {
      if (!isIssuer) return loadInvestorAssets({ walletAddress: wallet.address, signal });
      if (!issuerSeed) return [];
      try { const result = await readWalletTokenBalance({ tokenAddress: issuerSeed.tokenAddress, walletAddress: wallet.address, chainId: issuerSeed.chainId, decimals: issuerSeed.decimals }); return [{ ...issuerSeed, decimals: result.decimals, balance: result.formatted, balanceStatus: 'ready', balanceSource: 'Live on-chain balance' }]; } catch { return [issuerSeed]; }
    },
    enabled: Boolean(wallet.isConnected && isAddress(clean(wallet.address)) && (isIssuer ? !tokenRecord.isLoading : user?.role === ROLES.investor)), staleTime: 20_000, refetchOnWindowFocus: true, retry: 1,
  });

  const bridgeConfigsQuery = useQuery({
    queryKey: ['wallet-management-bridge-configs', [...web3Config.chainRecords, ...web3Config.bridgeChainRecords].filter((record) => getCircleBridgeChain(record.chainId)).map((record) => `${record.chainUid}:${record.chainId}`).join(',')],
    queryFn: async ({ signal }) => {
      const platformRecords = web3Config.chainRecords.filter((record) => getCircleBridgeChain(record.chainId));
      const bridgeOnlyRecords = web3Config.bridgeChainRecords.filter((record) => getCircleBridgeChain(record.chainId));
      // Platform networks keep using authoritative backend chain configuration.
      // Bridge-only Ethereum is appended from the frontend deployment profile so
      // this independent feature does not require Ethereum in the backend catalogue.
      const platformConfigs = await Promise.all(platformRecords.map(async (record) => {
        const config = await chainsApi.getConfig(record.chainUid, { signal });
        return {
          ...record,
          ...config,
          imageUrl: clean(config?.imageUrl) || clean(record.imageUrl),
          nativeCurrencyImageUrl: clean(config?.nativeCurrencyImageUrl) || clean(record.nativeCurrencyImageUrl) || clean(record.imageUrl),
        };
      }));
      return [...platformConfigs, ...bridgeOnlyRecords];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
  const bridgeRoutes = useMemo(() => buildUsdcBridgeRoutes(bridgeConfigsQuery.data || []), [bridgeConfigsQuery.data]);
  const bridgeCatalogLoading = bridgeConfigsQuery.isPending && !bridgeConfigsQuery.data;
  const bridgeIssue = bridgeCatalogLoading ? '' : getUsdcBridgeConfigurationIssue(bridgeRoutes);
  const outgoingBridgeRoutes = useMemo(() => bridgeRoutes.filter((route) => route.source.chainId === Number(selectedChain?.id)), [bridgeRoutes, selectedChain?.id]);
  const configuredUsdcDefinition = useMemo(() => configuredDefinitions.find((item) => clean(item.symbol).toUpperCase() === 'USDC') || null, [configuredDefinitions]);
  const selectedChainUsesNativeUsdc = clean(selectedChain?.nativeCurrency?.symbol).toUpperCase() === 'USDC';
  const selectedChainSupportsCircleBridge = Boolean(getCircleBridgeChain(selectedChain?.id));

  const nativeAsset = useMemo(() => ({ id: `${selectedChain?.id}-native`, kind: 'currency', name: selectedChain?.nativeCurrency?.name || 'Native token', symbol: selectedChain?.nativeCurrency?.symbol || '', tokenAddress: '', chainId: selectedChain?.id, decimals: selectedChain?.nativeCurrency?.decimals || 18, imageUrl: selectedChainArtwork?.nativeCurrencyImageUrl || selectedChainArtwork?.imageUrl || '', route: '', balance: clean(nativeQuery.data?.formatted), balanceStatus: nativeQuery.data?.formatted ? 'ready' : 'unavailable', balanceSource: nativeQuery.data?.formatted ? `Live ${selectedChain?.name} balance` : 'Balance unavailable' }), [nativeQuery.data?.formatted, selectedChain, selectedChainArtwork?.imageUrl, selectedChainArtwork?.nativeCurrencyImageUrl]);
  const selectedRoleAssets = useMemo(() => (roleAssetsQuery.data || []).filter((asset) => Number(asset.chainId) === Number(selectedChain?.id)), [roleAssetsQuery.data, selectedChain?.id]);
  const allAssets = useMemo(() => {
    const seeds = [nativeAsset, ...(configuredAssetsQuery.data || []), ...selectedRoleAssets];
    const map = new Map();
    seeds.forEach((asset, index) => {
      if (asset.kind === 'currency') { map.set(`native-${asset.chainId}`, asset); return; }
      const key = assetKey(asset) || `asset-${index}`; map.set(key, mergeAsset(map.get(key), asset));
    });
    return [...map.values()];
  }, [configuredAssetsQuery.data, nativeAsset, selectedRoleAssets]);
  const visibleAssets = useMemo(() => { const needle = search.trim().toLowerCase(); return allAssets.filter((asset) => (!needle || [asset.name, asset.symbol, asset.tokenAddress].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))) && (!hideZeroBalances || hasPositiveBalance(asset.balance))); }, [allAssets, hideZeroBalances, search]);
  const loadingAssets = nativeQuery.isLoading || (Boolean(selectedPlatformRecord) && chainConfigQuery.isLoading) || configuredAssetsQuery.isLoading || roleAssetsQuery.isLoading;
  const refreshBusy = manualRefreshing || nativeQuery.isFetching || chainConfigQuery.isFetching || configuredAssetsQuery.isFetching || roleAssetsQuery.isFetching || bridgeConfigsQuery.isFetching;
  const positiveAssetCount = allAssets.filter((asset) => hasPositiveBalance(asset.balance)).length;
  const selectedUsdc = allAssets.find((asset) => clean(asset.symbol).toUpperCase() === 'USDC');
  const activeNetworkRecord = web3Config.getWalletChainRecordById(wallet.chainId);
  const activeNetworkName = web3Config.getWalletChainById(wallet.chainId)?.name || wallet.chain?.name || 'Unsupported network';

  const copyAddress = async (value, label) => { try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); } catch { toast.error(`Unable to copy ${label.toLowerCase()}`); } };
  const handleRefresh = async () => {
    if (manualRefreshing) return; setManualRefreshing(true);
    const results = await Promise.allSettled([nativeQuery.refetch(), ...(selectedPlatformRecord ? [chainConfigQuery.refetch()] : []), configuredAssetsQuery.refetch(), roleAssetsQuery.refetch(), bridgeConfigsQuery.refetch()]); setManualRefreshing(false);
    if (results.every((result) => result.status === 'fulfilled')) toast.success('Wallet balances refreshed'); else toast.warning('Some balances could not be refreshed.');
  };
  const openBridge = () => {
    if (bridgeCatalogLoading) { toast.info('Bridge routes are still loading. Please try again in a moment.'); return; }
    if (bridgeIssue) { toast.error(bridgeIssue); return; }
    if (!outgoingBridgeRoutes.length) { toast.error(`No configured USDC bridge route starts from ${selectedChain.name}.`); return; }
    // Freeze the currently valid route catalogue for the lifetime of this bridge.
    // Window-focus refetches caused by wallet confirmations must not temporarily
    // remove the modal while a multi-transaction bridge is in progress.
    setBridgeRoutesSnapshot(bridgeRoutes);
    setBridgeRouteId(outgoingBridgeRoutes[0].id); setBridgeOpen(true);
  };
  const handleBridgeCompleted = ({ route, amount } = {}) => {
    // A completed bridge is a terminal state inside the modal, not a reason to
    // unmount it. Keep the success result visible until the user explicitly
    // chooses Close, X, or View destination balance. This also keeps mainnet
    // behavior aligned with testnet when the wallet has switched networks.
    const amountLabel = clean(amount);
    const destination = clean(route?.destination?.networkName);
    toast.success('Bridge completed', {
      description: `${amountLabel ? `${amountLabel} USDC` : 'USDC'}${destination ? ` bridged to ${destination}` : ' bridged successfully'}. Wallet balances are being refreshed.`,
    });
    void Promise.allSettled([nativeQuery.refetch(), configuredAssetsQuery.refetch(), roleAssetsQuery.refetch()]);
  };

  return (
    <div className="page-stack wallet-management-page">
      <header className="page-header wallet-management-header wallet-management-header--simple"><div><h1>Wallet management</h1><p>View wallet and token balances across supported networks and bridge USDC between supported Circle networks.</p></div></header>

      <div className="wallet-management-overview">
        <Card className="wallet-management-account-card">
          <div className="wallet-management-account-card__heading"><div><span className="eyebrow">Current wallet</span><h2>{isIssuer ? 'Organization wallet' : 'Investor wallet'}</h2></div><span className={`wallet-management-network${wallet.isConfiguredWalletChain ? ' is-ready' : ''}`}><NetworkIcon chain={activeNetworkRecord} chainId={wallet.chainId} name={activeNetworkName} size="xs" /><span>Active: {activeNetworkName}</span></span></div>
          <div className="wallet-management-control-wrap"><WalletControl expanded context={isIssuer ? 'organization' : 'investor'} allowConfiguredWalletChains /></div>
          {wallet.address ? <button type="button" className="wallet-management-address" onClick={() => copyAddress(wallet.address, 'Wallet address')}><span><small>Wallet address</small><strong>{wallet.address}</strong></span><Copy size={17} /></button> : <div className="wallet-management-account-warning"><AlertCircle size={17} /><span>Connect your registered wallet to load balances.</span></div>}
        </Card>
        <div className="wallet-management-metrics">
          <Card className="wallet-management-metric"><span className="wallet-management-metric__icon"><WalletCards size={20} /></span><span><small>Known assets</small><strong>{loadingAssets ? '—' : allAssets.length}</strong></span></Card>
          <Card className="wallet-management-metric"><span className="wallet-management-metric__icon"><CheckCircle2 size={20} /></span><span><small>Assets with balance</small><strong>{loadingAssets ? '—' : positiveAssetCount}</strong></span></Card>
          <Card className="wallet-management-metric wallet-management-metric--usdc"><TokenIcon symbol="USDC" name="USD Coin" imageUrl={selectedUsdc?.imageUrl} size="md" /><span><small>Available USDC</small><strong className="wallet-management-metric__value">{selectedUsdc?.balance ? <><span className="wallet-management-metric__amount">{formatExactBalance(selectedUsdc.balance, balanceDigits(selectedUsdc))}</span><span className="wallet-management-metric__unit">USDC</span></> : '—'}</strong></span></Card>
        </div>
      </div>

      <Card className="wallet-assets-card">
        <div className="wallet-assets-card__header wallet-assets-card__header--compact">
          <div className="wallet-assets-card__title-block"><h2>Token balances</h2><div className="wallet-assets-card__network-line"><span>Assets on</span><div className="wallet-management-chain-selector wallet-management-chain-selector--compact" ref={chainSelectorRef}>
            <button type="button" className="wallet-management-chain-selector__trigger" aria-haspopup="listbox" aria-expanded={chainMenuOpen} onClick={() => setChainMenuOpen((open) => !open)}><NetworkIcon chain={selectedChainArtwork} chainId={selectedChain?.id} name={selectedChain?.name} size="md" /><span className="wallet-management-chain-selector__copy"><strong>{selectedChain?.name}</strong></span><ChevronDown className={chainMenuOpen ? 'is-open' : ''} size={16} /></button>
            {chainMenuOpen ? <div className="wallet-management-chain-selector__menu" role="listbox"><span className="wallet-management-chain-selector__menu-label">View balances on</span>{web3Config.walletChains.map((chain) => { const selected = chain.id === selectedChain?.id; const chainRecord = web3Config.getWalletChainRecordById(chain.id); return <button key={chain.id} type="button" role="option" aria-selected={selected} className={`wallet-management-chain-selector__option${selected ? ' is-selected' : ''}`} onClick={() => { setSelectedChainId(chain.id); setSearch(''); setHideZeroBalances(false); setChainMenuOpen(false); }}><NetworkIcon chain={chainRecord} chainId={chain.id} name={chain.name} size="sm" /><span className="wallet-management-chain-selector__option-copy"><strong>{chain.name}</strong><small>{chain.nativeCurrency.symbol} network{chainRecord?.bridgeOnly ? ' · Bridge only' : ''}</small></span><span className="wallet-management-chain-selector__option-status">{selected ? <Check size={15} /> : null}</span></button>; })}<div className="wallet-management-chain-selector__note"><ShieldCheck size={14} /><span>Balance viewing is read-only. Bridge-only networks are available here without becoming platform investment networks.</span></div></div> : null}
          </div></div></div>
          <div className="wallet-assets-card__updated"><span>{refreshBusy ? 'Updating…' : loadingAssets ? 'Loading balances…' : 'Updated just now'}</span><button type="button" className="wallet-assets-refresh-button" onClick={handleRefresh} disabled={!wallet.isConnected || refreshBusy} aria-label="Refresh wallet balances"><RefreshCcw size={16} className={refreshBusy ? 'is-spinning' : ''} /></button></div>
        </div>

        <div className="wallet-assets-toolbar"><label className="wallet-assets-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search token or symbol" /></label><label className="wallet-assets-zero-toggle"><input type="checkbox" checked={hideZeroBalances} onChange={(event) => setHideZeroBalances(event.target.checked)} /><span>Hide zero balances</span></label></div>
        {chainConfigQuery.isError ? <div className="wallet-assets-inline-message is-warning"><AlertCircle size={17} /><span>Configured payment tokens could not be loaded for {selectedChain?.name}. Native and available investment balances are still shown.</span><button type="button" onClick={() => chainConfigQuery.refetch()}>Try again</button></div> : null}

        <div className="wallet-assets-list" aria-live="polite">
          {loadingAssets ? [0, 1, 2].map((item) => <div className="wallet-asset-row is-loading" key={item} aria-hidden="true"><span className="wallet-asset-skeleton is-icon" /><span className="wallet-asset-skeleton is-wide" /><span className="wallet-asset-skeleton" /></div>) : visibleAssets.length ? visibleAssets.map((asset) => {
            const isUsdc = clean(asset.symbol).toUpperCase() === 'USDC';
            const bridgeable = isUsdc && selectedChainSupportsCircleBridge && (selectedChainUsesNativeUsdc
              ? asset.kind === 'currency'
              : Boolean(configuredUsdcDefinition?.tokenAddress) && clean(asset.tokenAddress).toLowerCase() === clean(configuredUsdcDefinition.tokenAddress).toLowerCase());
            const bridgeButtonIssue = bridgeCatalogLoading
              ? 'Loading bridge routes…'
              : bridgeIssue || (!outgoingBridgeRoutes.length ? `No configured USDC bridge route starts from ${selectedChain.name}.` : '');
            return <article className="wallet-asset-row" key={asset.id || assetKey(asset)}><WalletAssetTokenIcon asset={asset} isIssuer={isIssuer} />
              <div className="wallet-asset-row__identity"><div className="wallet-asset-row__title"><strong>{asset.name}</strong><span>{asset.symbol}</span><BalanceStatus asset={asset} /></div><small className="wallet-asset-row__meta"><span className="wallet-management-network-label"><NetworkIcon chain={selectedChainArtwork} chainId={selectedChain?.id} name={selectedChain?.name} size="xs" /><span>{selectedChain?.name} {asset.kind === 'investment' ? 'investment token' : asset.kind === 'currency' ? 'network currency' : 'token'}</span></span>{asset.tokenAddress ? <span> · {shortenWalletAddress(asset.tokenAddress, 7, 6)}</span> : null}</small></div>
              <div className="wallet-asset-row__balance"><small>Balance</small><strong title={asset.balance ? `${asset.balance} ${asset.symbol}` : undefined}><span className="wallet-asset-row__balance-value">{asset.balance ? formatExactBalance(asset.balance, balanceDigits(asset)) : '—'}</span><span className="wallet-asset-row__balance-symbol">{asset.symbol}</span></strong><em>{asset.balanceSource}</em></div>
              <div className="wallet-asset-row__actions">{bridgeable ? <button type="button" className="wallet-asset-bridge-button" onClick={openBridge} disabled={!wallet.isConnected || Boolean(bridgeButtonIssue)} title={bridgeButtonIssue || 'Bridge USDC'}><ArrowRightLeft size={15} /><span>Bridge USDC</span></button> : null}{asset.tokenAddress ? <button type="button" className="wallet-asset-icon-button" onClick={() => copyAddress(asset.tokenAddress, `${asset.symbol} contract`)} title="Copy token contract"><Copy size={16} /></button> : null}{asset.route ? <button type="button" className="wallet-asset-icon-button" onClick={() => navigate(asset.route)} title="Open asset"><ExternalLink size={16} /></button> : null}</div>
            </article>;
          }) : <div className="wallet-assets-empty"><WalletCards size={24} /><strong>No matching assets</strong><p>{hideZeroBalances ? 'No assets with a positive balance match this filter.' : 'No wallet assets match your search.'}</p></div>}
        </div>
        <div className="wallet-assets-card__footer"><ShieldCheck size={16} /><span>Your balances are view-only. Platform assets still come from supported backend networks; Ethereum is added here only for Circle USDC bridge balances.</span></div>
      </Card>

      <UsdcBridgeModal open={bridgeOpen} onClose={() => setBridgeOpen(false)} walletAddress={wallet.address} getProvider={() => wallet.connector?.getProvider?.()} switchWalletChain={async (chainId) => { if (Number(wallet.chainId) !== Number(chainId)) await wallet.switchChain(Number(chainId)); }} routes={bridgeRoutesSnapshot.length ? bridgeRoutesSnapshot : bridgeRoutes} initialRouteId={bridgeRouteId} onBridgeCompleted={handleBridgeCompleted} onViewDestinationBalance={(chainId) => { setSelectedChainId(Number(chainId)); setSearch(''); setHideZeroBalances(false); }} />
    </div>
  );
}
