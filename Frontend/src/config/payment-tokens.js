import { getAddress, isAddress } from 'viem';

const text = (value) => typeof value === 'string' ? value.trim() : '';
const address = (value) => isAddress(text(value), { strict: false }) ? getAddress(text(value).toLowerCase()) : '';

// Keep the backend's canonical payment-token fields and the older admin aliases in sync.
// Some admin endpoints return `name`/`symbol`, while older list/update payloads use
// `paymentTokenName`/`paymentTokenSymbol`. UI forms should never show stale alias values
// when both shapes are present.
export const normalizePaymentTokenFields = (item = {}) => {
  const symbol = text(item.symbol || item.paymentTokenSymbol);
  const name = text(item.name || item.paymentTokenName || item.displayName) || symbol;
  const code = text(item.paymentTokenCode || item.code) || symbol;

  return {
    ...item,
    code,
    name,
    symbol,
    paymentTokenCode: code,
    paymentTokenName: name,
    paymentTokenSymbol: symbol,
  };
};

// The backend catalogue is authoritative. Never infer currency from a symbol,
// a legacy usdt* alias, or an environment-wide purchase/redemption address.
export const normalizePaymentTokens = (payload) => {
  const data = payload?.data ?? payload;
  const rows = Array.isArray(data) ? data : data?.paymentTokens || data?.items || [];
  const seen = new Set();
  return rows.map((rawItem) => {
    const item = normalizePaymentTokenFields(rawItem);
    const contractAddress = address(item.contractAddress || item.paymentTokenAddress);
    const chainId = Number(item.chainId ?? item.chain?.id ?? item.chain?.chainId);
    const decimals = Number(item.decimals);
    const symbol = item.symbol;
    const chainUid = text(item.chainUid || item.chain?.chainUid);
    const key = `${chainId}:${contractAddress}`;
    if (!contractAddress || !symbol || !Number.isSafeInteger(chainId) || chainId <= 0
      || !Number.isInteger(decimals) || decimals < 0 || decimals > 36 || seen.has(key)) return null;
    seen.add(key);
    const controllerAddress = address(
      item.platformControllerAddress ||
        item.platformController ||
        item.controllerAddress ||
        item.controller?.contractAddress,
    );
    const imageUrl = text(
      item.imageUrl
        || item.paymentTokenImageUrl
        || item.paymentTokenLogoUrl
        || item.tokenImageUrl
        || item.logoUrl
        || item.iconUrl
        || item.logo?.url
        || item.logo?.imageUrl
        || item.icon?.url
        || item.icon?.imageUrl
        || item.image?.url
        || item.image?.imageUrl
        || (typeof item.image === 'string' ? item.image : '')
        || item.metadata?.imageUrl
        || item.metadata?.logoUrl
        || item.metadata?.iconUrl
        || item.metadata?.logo?.url
        || item.metadata?.icon?.url,
    );
    const supportedActions = (Array.isArray(item.supportedActions) ? item.supportedActions : [])
      .map((action) => String(action).toUpperCase());
    return {
      ...item, contractAddress, chainId, chainUid, decimals, controllerAddress, imageUrl,
      active: item.active !== false && item.isActive !== false,
      supportsPurchase: item.supportsPurchase === true,
      supportsRedemption: item.supportsRedemption === true,
      supportedActions,
      explorerUrl: text(item.explorerUrl),
    };
  }).filter(Boolean);
};

export const supportsPaymentAction = (item, action) => {
  if (!item?.active) return false;
  const normalized = String(action || '').toLowerCase();
  const hasExplicitCapabilities =
    item.supportsPurchase === true ||
    item.supportsRedemption === true ||
    (Array.isArray(item.supportedActions) && item.supportedActions.length > 0);
  // The selected-chain config endpoint is already filtered to active tokens in
  // the controller registry. Older payloads may not include per-action flags.
  if (!hasExplicitCapabilities) return true;
  if (['redeem', 'redemption'].includes(normalized) && item.supportsRedemption) return true;
  if (['buy', 'purchase', 'invest', 'create', 'token_creation'].includes(normalized) && item.supportsPurchase) return true;
  const aliases = normalized === 'redeem' || normalized === 'redemption'
    ? ['REDEEM', 'REDEMPTION']
    : ['CREATE', 'TOKEN_CREATION', 'BUY', 'PURCHASE', 'INVEST'];
  return item.supportedActions.some((value) => aliases.includes(value));
};

export const paymentContextOf = (...records) => {
  const sources = records
    .flatMap((record) => [
      record,
      record?.raw,
      record?.token,
      record?.tokenMaster,
      record?.tokenSummary,
      record?.tokenInvestment,
      record?.tokenDetails,
      record?.asset,
      record?.asset?.token,
      record?.assetSnapshot,
      record?.tokenSnapshot,
      record?.raw?.token,
      record?.interest,
      record?.interest?.raw,
      record?.tokenInformation,
      record?.information,
      record?.supplyPricing,
      record?.pricing,
      record?.paymentToken,
      record?.metadata,
      record?.deployment,
      record?.deployment?.metadata,
      record?.deploymentConfig,
      record?.settlement,
    ])
    .filter(Boolean);
  const first = (getter) => sources.map(getter).find(Boolean) || '';
  const present = (value) => value !== undefined && value !== null && value !== '';
  const decimalsValue = records
    .flatMap((record) => [
      record?.paymentTokenDecimals,
      record?.paymentToken?.decimals,
      record?.raw?.paymentTokenDecimals,
      record?.raw?.paymentToken?.decimals,
      record?.token?.paymentTokenDecimals,
      record?.token?.paymentToken?.decimals,
      record?.tokenInformation?.paymentTokenDecimals,
      record?.tokenInformation?.paymentToken?.decimals,
      record?.information?.paymentTokenDecimals,
      record?.information?.paymentToken?.decimals,
      record?.supplyPricing?.paymentTokenDecimals,
      record?.supplyPricing?.paymentToken?.decimals,
      record?.pricing?.paymentTokenDecimals,
      record?.pricing?.paymentToken?.decimals,
      record?.metadata?.paymentTokenDecimals,
      record?.metadata?.paymentToken?.decimals,
      record?.deployment?.paymentTokenDecimals,
      record?.deployment?.paymentToken?.decimals,
    ])
    .find(present);
  const paymentTokenDecimals = Number(decimalsValue);
  return {
    paymentTokenAddress: first((source) => address(source.paymentTokenAddress || source.paymentToken?.contractAddress || source.paymentToken?.address)),
    controllerAddress: first((source) => address(source.platformControllerAddress || source.platformController || source.controllerAddress || source.controller?.contractAddress)),
    paymentTokenSymbol: first((source) => text(source.paymentTokenSymbol || source.paymentToken?.symbol)),
    paymentTokenDecimals:
      Number.isInteger(paymentTokenDecimals) && paymentTokenDecimals >= 0 && paymentTokenDecimals <= 36
        ? paymentTokenDecimals
        : null,
  };
};
