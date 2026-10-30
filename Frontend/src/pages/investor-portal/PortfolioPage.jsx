import { paymentContextOf } from '@/config/payment-tokens';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Coins,
  Info,
  RefreshCcw,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';
import { portfolioAssetKey } from '@/utils/portfolioAssetKey';
import {
  getOrStartPortfolioLiveRead,
  portfolioBalanceIdentity,
  portfolioPriceIdentity,
  readPortfolioLiveCache,
  storePortfolioLiveCache,
} from '@/utils/portfolioLiveCache';
import { PaymentCurrencyAmount } from '@/components/common/PaymentCurrencyAmount';
import { ResponsiveTooltip } from '@/components/common/ResponsiveTooltip';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceTokenImage } from '@/components/investor-marketplace/MarketplaceTokenImage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorProfileData } from '@/hooks/useInvestorProfileData';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import { getInvestorPurchaseTokenBalance } from '@/services/investor/investorTokenPurchaseTransaction.service';
import { getPlatformTokenPrice } from '@/services/blockchain/trexPlatformController.service';
import { formatDecimalForDisplay } from '@/utils/currency';
import { getErrorMessage } from '@/utils/error';
import { resolveInitialTokenPriceExact } from '@/utils/tokenPrice';

const PAGE_SIZE = 5;

const exactDecimal = (value, maximumFractionDigits = 6) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '—';

  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed)
      ? parsed.toLocaleString('en-US', { maximumFractionDigits })
      : '—';
  }

  const [, sign, integerPart, decimalPart = ''] = match;
  const grouped = integerPart.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0';
  const fraction = decimalPart.slice(0, maximumFractionDigits).replace(/0+$/, '');
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
};

const tokenAmount = (value, symbol) => `${exactDecimal(value, 8)} ${symbol || 'TOKEN'}`;
const decimalParts = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const [, sign, integerPart, fraction = ''] = match;
  return {
    negative: sign === '-',
    digits: BigInt(`${integerPart}${fraction}` || '0'),
    scale: fraction.length,
  };
};

const pow10 = (value) => 10n ** BigInt(value);

// Preserve every decimal place supplied by the API/on-chain calculation for financial
// summary values. This intentionally never converts through Number and never rounds.
const formatScaledDecimalExact = (signedValue, scale) => {
  const negative = signedValue < 0n;
  const absolute = negative ? -signedValue : signedValue;
  const divisor = pow10(scale);
  const whole = scale ? absolute / divisor : absolute;
  const rawFraction = scale ? String(absolute % divisor).padStart(scale, '0') : '';
  const fraction = rawFraction.replace(/0+$/, '');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
};

const sumDecimalValuesExact = (values) => {
  const parts = values.map(decimalParts).filter(Boolean);
  if (!parts.length) return null;
  const scale = Math.max(...parts.map((part) => part.scale));
  const total = parts.reduce((sum, part) => {
    const scaled = part.digits * pow10(scale - part.scale);
    return sum + (part.negative ? -scaled : scaled);
  }, 0n);
  return formatScaledDecimalExact(total, scale);
};

const multiplyDecimalValuesExact = (left, right) => {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  if (!leftParts || !rightParts) return null;
  const sign = leftParts.negative !== rightParts.negative ? -1n : 1n;
  const product = leftParts.digits * rightParts.digits * sign;
  return formatScaledDecimalExact(product, leftParts.scale + rightParts.scale);
};

const validTokenDecimals = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : null;
};

const walletBalanceState = (status = 'loading', balance = '', reason = '') => ({ status, balance, reason });

function PortfolioLoading() {
  return (
    <Card className="investor-portfolio-list investor-portfolio-list--loading" aria-label="Loading portfolio">
      {[0, 1, 2, 3].map((row) => (
        <div className="investor-portfolio-row is-loading" key={row}>
          <span className="investor-portfolio-skeleton investor-portfolio-skeleton--logo" />
          <span className="investor-portfolio-skeleton investor-portfolio-skeleton--wide" />
          <span className="investor-portfolio-skeleton" />
          <span className="investor-portfolio-skeleton" />
        </div>
      ))}
    </Card>
  );
}

export default function PortfolioPage({ embedded = false } = {}) {
  useDocumentTitle(embedded ? 'My Investment' : 'Portfolio');
  const navigate = useNavigate();
  const investorProfileQuery = useInvestorProfileData();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const hasLoadedPortfolioRef = useRef(false);
  const latestPortfolioRequestRef = useRef(0);
  const lastResultWasOverviewRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [walletBalances, setWalletBalances] = useState({});
  const [platformPrices, setPlatformPrices] = useState({});
  const liveBalanceCacheRef = useRef(new Map());
  const livePriceCacheRef = useRef(new Map());
  const pendingBalanceReadsRef = useRef(new Map());
  const pendingPriceReadsRef = useRef(new Map());
  const forceLiveRefreshRef = useRef(false);
  // The overview represents the unfiltered portfolio and must remain stable
  // when searching or paging through the holdings table.
  const [overviewData, setOverviewData] = useState({
    items: [],
    meta: { total: 0 },
    walletBalances: {},
    platformPrices: {},
  });

  const registeredWalletAddress = String(
    investorProfileQuery.state?.wallet?.address
      || investorProfileQuery.rawInvestor?.walletAddress
      || investorProfileQuery.rawInvestor?.investor?.walletAddress
      || '',
  ).trim();

  const loadPortfolio = useCallback(async ({ quiet = false, signal } = {}) => {
    // Search and pagination must not restart the entire Portfolio page. Keep
    // the toolbar mounted and show loading feedback only inside the results.
    const requestId = ++latestPortfolioRequestRef.current;
    if (quiet) {
      setRefreshing(true);
      setTableLoading(false);
    } else if (hasLoadedPortfolioRef.current) {
      setTableLoading(true);
      setRefreshing(false);
    } else {
      setLoading(true);
    }
    setLoadError('');

    const isCurrentRequest = () => !signal?.aborted && requestId === latestPortfolioRequestRef.current;
    try {
      const result = await investorPortfolioService.list({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        signal,
      });
      if (!isCurrentRequest()) return;
      const nextItems = result.items || [];
      const nextMeta = result.meta || { page, limit: PAGE_SIZE, total: nextItems.length, totalPages: 1 };
      lastResultWasOverviewRef.current = !debouncedSearch && page === 1;
      setItems(nextItems);
      setMeta(nextMeta);
      if (!debouncedSearch && page === 1) {
        setOverviewData((previous) => ({ ...previous, items: nextItems, meta: nextMeta }));
      }
      hasLoadedPortfolioRef.current = true;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      if (!isCurrentRequest()) return;
      // Keep the last successful items so a failed search doesn't erase the
      // summary or reset the surrounding page. The error appears in results.
      if (!hasLoadedPortfolioRef.current) setItems([]);
      setLoadError(getErrorMessage(error, 'Unable to load your portfolio right now.'));
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
        setTableLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, page]);

  const updateSearch = (value) => {
    // Return to the first page as soon as the user edits the search. The fetch
    // itself still waits for the debounced term, so typing doesn't spam APIs.
    setPage(1);
    setSearch(value.slice(0, 100));
  };

  useEffect(() => {
    // Cancel an old search immediately while typing, then submit only after
    // the input has settled. Old responses must never replace newer results.
    if (search !== debouncedSearch) return undefined;
    const controller = new AbortController();
    loadPortfolio({ signal: controller.signal });
    return () => controller.abort();
  }, [loadPortfolio, search, debouncedSearch]);

  useEffect(() => {
    if (page > meta.totalPages) setPage(Math.max(meta.totalPages, 1));
  }, [meta.totalPages, page]);

  useEffect(() => {
    let active = true;
    if (!items.length) {
      setWalletBalances({});
      setPlatformPrices({});
      return () => { active = false; };
    }

    const forceRefresh = forceLiveRefreshRef.current;
    forceLiveRefreshRef.current = false;
    const isOverviewQuery = lastResultWasOverviewRef.current;
    const balanceStates = {};
    const priceStates = {};
    const pendingBalances = [];
    const pendingPrices = [];

    items.forEach((token) => {
      const assetKey = portfolioAssetKey(token);
      const balanceIdentity = portfolioBalanceIdentity(token, registeredWalletAddress);
      const priceIdentity = portfolioPriceIdentity(token, paymentContextOf(token).paymentTokenAddress);
      const balanceCached = readPortfolioLiveCache(liveBalanceCacheRef.current, assetKey, balanceIdentity);
      const priceCached = readPortfolioLiveCache(livePriceCacheRef.current, assetKey, priceIdentity);
      // Keep previously verified values visible even during a fresh read.
      // A new wallet/chain/contract changes the identity and cannot reuse them.
      balanceStates[assetKey] = balanceCached?.state || walletBalanceState('loading');
      priceStates[assetKey] = priceCached?.state || { status: 'loading', value: '', reason: '' };

      if (forceRefresh || !balanceCached?.fresh) {
        pendingBalances.push({ token, assetKey, identity: balanceIdentity });
      }
      if (forceRefresh || !priceCached?.fresh) {
        pendingPrices.push({ token, assetKey, identity: priceIdentity });
      }
    });

    setWalletBalances(balanceStates);
    setPlatformPrices(priceStates);
    if (isOverviewQuery) {
      setOverviewData((previous) => ({
        ...previous,
        walletBalances: { ...previous.walletBalances, ...balanceStates },
        platformPrices: { ...previous.platformPrices, ...priceStates },
      }));
    }

    if (!investorProfileQuery.isLoading) {
      Promise.all(pendingBalances.map(async ({ token, assetKey, identity }) => {
        const state = await getOrStartPortfolioLiveRead(
          pendingBalanceReadsRef.current, assetKey, identity, async () => {
            const decimals = validTokenDecimals(token.decimals);
            let state;
            if (!registeredWalletAddress) {
              state = walletBalanceState('unavailable', '', 'Registered wallet unavailable');
            } else if (!token.tokenAddress || !token.chainId || decimals === null) {
              state = walletBalanceState('unavailable', '', 'Token balance details unavailable');
            } else {
              try {
                const rawBalance = await getInvestorPurchaseTokenBalance({
                  tokenAddress: token.tokenAddress,
                  investorWalletAddress: registeredWalletAddress,
                  chainId: token.chainId,
                });
                state = walletBalanceState('ready', formatUnits(rawBalance, decimals));
              } catch {
                state = walletBalanceState('unavailable', '', 'Current balance unavailable');
              }
            }
            return state;
          },
        );
        storePortfolioLiveCache(liveBalanceCacheRef.current, assetKey, identity, state);
        return [assetKey, state];
      })).then((entries) => {
        if (!active || !entries.length) return;
        const next = Object.fromEntries(entries);
        setWalletBalances((previous) => ({ ...previous, ...next }));
        if (isOverviewQuery) setOverviewData((previous) => ({ ...previous, walletBalances: { ...previous.walletBalances, ...next } }));
      });
    }

    Promise.all(pendingPrices.map(async ({ token, assetKey, identity }) => {
      const state = await getOrStartPortfolioLiveRead(
        pendingPriceReadsRef.current, assetKey, identity, async () => {
          let state;
          if (!token.tokenAddress || !token.chainId) {
            state = { status: 'unavailable', value: '', reason: 'Current price unavailable' };
          } else {
            try {
              const price = await getPlatformTokenPrice({
                ...paymentContextOf(token),
                tokenAddress: token.tokenAddress,
                chainId: token.chainId,
              });
              const value = String(price.currentTokenPrice || '').trim();
              state = !value || /^0(?:\.0+)?$/.test(value)
                ? { status: 'unavailable', value: '', reason: 'Current price is unavailable' }
                : { status: 'ready', value, reason: '' };
            } catch {
              state = { status: 'unavailable', value: '', reason: 'Live current price unavailable' };
            }
          }
          return state;
        },
      );
      storePortfolioLiveCache(livePriceCacheRef.current, assetKey, identity, state);
      return [assetKey, state];
    })).then((entries) => {
      if (!active || !entries.length) return;
      const next = Object.fromEntries(entries);
      setPlatformPrices((previous) => ({ ...previous, ...next }));
      if (isOverviewQuery) setOverviewData((previous) => ({ ...previous, platformPrices: { ...previous.platformPrices, ...next } }));
    });

    return () => { active = false; };
  }, [investorProfileQuery.isLoading, items, registeredWalletAddress]);

  const currentPage = Math.min(Math.max(meta.page || page, 1), Math.max(meta.totalPages || 1, 1));
  const start = meta.total ? ((currentPage - 1) * meta.limit) + 1 : 0;
  const end = meta.total ? Math.min(currentPage * meta.limit, meta.total) : 0;

  const overview = useMemo(() => {
    const investedValues = [];
    const paymentTokens = new Map();
    const walletValues = [];
    let purchaseCount = 0;
    let verifiedBalances = 0;
    let pricedBalances = 0;

    overviewData.items.forEach((token) => {
      const payment = paymentContextOf(token);
      const paymentTokenAddress = String(payment.paymentTokenAddress || '').trim().toLowerCase();
      const paymentTokenSymbol = String(payment.paymentTokenSymbol || token?.currency || '').trim().toUpperCase();
      const chainId = Number(token?.chainId) || 0;
      const paymentTokenKey = paymentTokenAddress
        ? `${chainId}:${paymentTokenAddress}`
        : paymentTokenSymbol
          ? `${chainId}:symbol:${paymentTokenSymbol}`
          : `asset:${portfolioAssetKey(token)}`;

      if (!paymentTokens.has(paymentTokenKey)) {
        paymentTokens.set(paymentTokenKey, { symbol: paymentTokenSymbol, token });
      }

      const portfolio = token?.portfolio || {};
      if (decimalParts(portfolio.totalInvestedPaymentAmount)) investedValues.push(portfolio.totalInvestedPaymentAmount);
      purchaseCount += Number.isFinite(Number(portfolio.purchaseCount)) ? Number(portfolio.purchaseCount) : 0;

      const balanceState = overviewData.walletBalances[portfolioAssetKey(token)];
      if (balanceState?.status === 'ready') {
        verifiedBalances += 1;
        const currentPrice = overviewData.platformPrices[portfolioAssetKey(token)]?.status === 'ready'
          ? overviewData.platformPrices[portfolioAssetKey(token)].value
          : '';
        const walletValue = multiplyDecimalValuesExact(balanceState.balance, currentPrice);
        if (walletValue !== null) {
          walletValues.push(walletValue);
          pricedBalances += 1;
        }
      }
    });

    const paymentTokenEntries = [...paymentTokens.values()];
    const singleCurrency = paymentTokens.size === 1 && overviewData.items.length > 0;
    const currency = singleCurrency ? paymentTokenEntries[0]?.symbol || '' : '';
    const paymentTokenSymbols = [...new Set(paymentTokenEntries.map((entry) => entry.symbol).filter(Boolean))];

    return {
      totalInvested: singleCurrency ? sumDecimalValuesExact(investedValues) : null,
      currency,
      mixedCurrencies: paymentTokens.size > 1,
      paymentTokenCount: paymentTokens.size,
      paymentTokenSymbols,
      paymentTokenItem: singleCurrency ? paymentTokenEntries[0]?.token || null : null,
      estimatedWalletValue: singleCurrency && pricedBalances === overviewData.items.length && overviewData.items.length
        ? sumDecimalValuesExact(walletValues)
        : null,
      purchaseCount,
      verifiedBalances,
      pricedBalances,
    };
  }, [overviewData]);

  const summaryScope = overviewData.meta.total > overviewData.items.length ? 'shown on the first page' : 'across your portfolio';
  const balanceLoading = items.some((token) => walletBalances[portfolioAssetKey(token)]?.status === 'loading' || platformPrices[portfolioAssetKey(token)]?.status === 'loading');

  const openManagement = (tokenUid) => {
    navigate(`${ROUTES.assetManagement}?tokenUid=${encodeURIComponent(tokenUid)}`);
  };

  const refreshPortfolio = () => {
    // Explicit refresh bypasses the live-read cache without hiding the old
    // values while updated balances and prices are being retrieved.
    forceLiveRefreshRef.current = true;
    loadPortfolio({ quiet: true });
  };

  const estimatedCurrentValueDisplay = formatDecimalForDisplay(overview.estimatedWalletValue);
  const totalInvestedDisplay = formatDecimalForDisplay(overview.totalInvested);
  const estimatedCurrentValueLabel = estimatedCurrentValueDisplay.exact
    ? `${estimatedCurrentValueDisplay.exact} ${overview.currency}`.trim()
    : '';
  const totalInvestedLabel = totalInvestedDisplay.exact
    ? `${totalInvestedDisplay.exact} ${overview.currency}`.trim()
    : '';
  const overviewPayment = paymentContextOf(overview.paymentTokenItem);
  const mixedPaymentTokenCount = overview.paymentTokenCount || overviewData.items.length;
  const mixedPaymentTokenLabel = `${mixedPaymentTokenCount} payment token${mixedPaymentTokenCount === 1 ? '' : 's'}`;
  const mixedPaymentTokenSymbols = overview.paymentTokenSymbols.length
    ? `${overview.paymentTokenSymbols.join(' · ')} stay separated below.`
    : 'Values stay separated by payment token below.';

  return (
    <div className="page-stack investor-portfolio-page">
      <header className="investor-portfolio-header">
        <div>
          <span className="eyebrow">Your token holdings</span>
          <h1>Portfolio</h1>
          <p>Review live balances in your registered wallet together with current token prices and completed investment totals.</p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCcw}
          loading={refreshing || balanceLoading}
          onClick={refreshPortfolio}
          className="investor-portfolio-refresh"
          aria-label="Refresh portfolio"
          title="Refresh portfolio"
        >
          Refresh
        </Button>
      </header>

      {!loading && loadError && !hasLoadedPortfolioRef.current ? (
        <Card className="investor-portfolio-error" role="alert">
          <span className="investor-portfolio-error__icon"><ShieldCheck size={22} /></span>
          <div>
            <strong>Portfolio is temporarily unavailable</strong>
            <p>{loadError}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadPortfolio()}>Try again</Button>
        </Card>
      ) : null}

      <section className="investor-portfolio-summary" aria-label="Portfolio overview">
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><WalletCards size={20} /></span>
          <div>
            <span>Estimated current value</span>
            <strong className="investor-portfolio-summary__precise-amount">
              {loading ? '—' : overview.mixedCurrencies ? mixedPaymentTokenLabel : !estimatedCurrentValueDisplay.display ? '—' : (
                <ResponsiveTooltip
                  content={estimatedCurrentValueDisplay.isAbbreviated ? `Exact value: ${estimatedCurrentValueLabel}` : ''}
                  ariaLabel={estimatedCurrentValueDisplay.isAbbreviated ? `Estimated current value. Exact value ${estimatedCurrentValueLabel}` : undefined}
                  className="investor-portfolio-precision-trigger"
                >
                  <PaymentCurrencyAmount
                    paymentTokenAddress={overviewPayment.paymentTokenAddress}
                    paymentTokenSymbol={overview.currency}
                    chainUid={overview.paymentTokenItem?.chainUid}
                    chainId={overview.paymentTokenItem?.chainId}
                  >
                    {estimatedCurrentValueDisplay.display}
                  </PaymentCurrencyAmount>
                </ResponsiveTooltip>
              )}
            </strong>
            <small>{loading ? 'Checking live balances' : overview.mixedCurrencies ? mixedPaymentTokenSymbols : `Live balance × current price, ${summaryScope}`}</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Banknote size={20} /></span>
          <div>
            <span>Total invested</span>
            <strong className="investor-portfolio-summary__precise-amount">
              {loading ? '—' : overview.mixedCurrencies ? mixedPaymentTokenLabel : !totalInvestedDisplay.display ? '—' : (
                <ResponsiveTooltip
                  content={totalInvestedDisplay.isAbbreviated ? `Exact value: ${totalInvestedLabel}` : ''}
                  ariaLabel={totalInvestedDisplay.isAbbreviated ? `Total invested. Exact value ${totalInvestedLabel}` : undefined}
                  className="investor-portfolio-precision-trigger"
                >
                  <PaymentCurrencyAmount
                    paymentTokenAddress={overviewPayment.paymentTokenAddress}
                    paymentTokenSymbol={overview.currency}
                    chainUid={overview.paymentTokenItem?.chainUid}
                    chainId={overview.paymentTokenItem?.chainId}
                  >
                    {totalInvestedDisplay.display}
                  </PaymentCurrencyAmount>
                </ResponsiveTooltip>
              )}
            </strong>
            <small>{overview.mixedCurrencies ? 'Amounts are shown per payment token to avoid false conversion totals.' : `Completed purchases ${summaryScope}`}</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Briefcase size={20} /></span>
          <div>
            <span>Portfolio assets</span>
            <strong>{loading ? '—' : overviewData.meta.total}</strong>
            <small>{loading ? 'Completed investment positions' : `${overview.verifiedBalances} of ${overviewData.items.length} visible balance${overviewData.items.length === 1 ? '' : 's'} verified`}</small>
          </div>
        </Card>
      </section>

      {!loading && overviewData.items.length ? (
        <div className="investor-portfolio-price-note" role="note">
          <Info size={17} />
          <div>
            <strong>Wallet balance is the source of truth for what you currently hold</strong>
            <span>Wallet balances and current prices are read live from the blockchain. Total invested and purchase counts include only completed purchases made through T-REX Capital Market. Direct wallet transfers can change your balance without changing that purchase history, so the page avoids performance estimates when the cost basis cannot be guaranteed.</span>
          </div>
        </div>
      ) : null}

      {loading ? (
        <PortfolioLoading />
      ) : !loadError && !tableLoading && meta.total === 0 && !debouncedSearch ? (
        <Card className="investor-portfolio-empty">
          <span className="investor-portfolio-empty__icon"><Briefcase size={31} /></span>
          <h2>No completed investments yet</h2>
          <p>Your portfolio will show a token after your first purchase for that token reaches Completed. Pending, failed, and expired purchases are not included.</p>
          <Button icon={ArrowRight} onClick={() => navigate(ROUTES.marketplace)}>Explore Marketplace</Button>
        </Card>
      ) : hasLoadedPortfolioRef.current ? (
        <>
          <Card className="investor-portfolio-toolbar">
            <label className="investor-portfolio-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Search token or issuer"
                aria-label="Search portfolio"
              />
            </label>
            <div className="investor-portfolio-toolbar__meta">
              <span><Coins size={15} /> Tokens with completed platform purchases</span>
              <small aria-live="polite">{tableLoading || search !== debouncedSearch ? 'Updating holdings…' : `Showing ${start}${end > start ? `–${end}` : ''} of ${meta.total} asset${meta.total === 1 ? '' : 's'}`}</small>
            </div>
          </Card>

          <div className="investor-portfolio-results" aria-busy={tableLoading || search !== debouncedSearch}>
            {loadError && !tableLoading ? (
              <Card className="investor-portfolio-error" role="alert">
                <span className="investor-portfolio-error__icon"><ShieldCheck size={22} /></span>
                <div>
                  <strong>Unable to update portfolio results</strong>
                  <p>{loadError}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => loadPortfolio()}>Try again</Button>
              </Card>
            ) : null}
            {items.length ? (
              <Card className="investor-portfolio-list">
                <div className="investor-portfolio-list__head" aria-hidden="true">
                  <span>Asset</span>
                  <span>Current balance</span>
                  <span>Estimated value</span>
                  <span>Current price</span>
                  <span>Platform investment</span>
                  <span>Action</span>
                </div>
                {items.map((token) => {
                  const symbol = token?.symbol && token.symbol !== '—' ? token.symbol : 'TOKEN';
                  const portfolio = token?.portfolio || {};
                  const paymentContext = paymentContextOf(token);
                  const paymentSymbol = paymentContext.paymentTokenSymbol || token.currency || 'payment token';
                  const balanceState = walletBalances[portfolioAssetKey(token)] || walletBalanceState('loading');
                  const currentPriceState = platformPrices[portfolioAssetKey(token)] || { status: 'loading', value: '', reason: '' };
                  const currentPrice = currentPriceState.status === 'ready' ? currentPriceState.value : '';
                  const estimatedValueExact = balanceState.status === 'ready' && currentPriceState.status === 'ready'
                    ? multiplyDecimalValuesExact(balanceState.balance, currentPrice)
                    : null;
                  const estimatedValueDisplay = formatDecimalForDisplay(estimatedValueExact);
                  const currentPriceDisplay = formatDecimalForDisplay(currentPrice);
                  const platformInvestmentDisplay = formatDecimalForDisplay(portfolio.totalInvestedPaymentAmount);
                  const initialPriceDisplay = formatDecimalForDisplay(resolveInitialTokenPriceExact(token));
                  const averagePurchaseDisplay = formatDecimalForDisplay(portfolio.averagePurchasePrice);
                  const estimatedValueLabel = estimatedValueDisplay.exact
                    ? `${estimatedValueDisplay.exact} ${paymentSymbol}`
                    : '';
                  const currentPriceLabel = currentPriceDisplay.exact
                    ? `${currentPriceDisplay.exact} ${paymentSymbol}`
                    : '';
                  const platformInvestmentLabel = platformInvestmentDisplay.exact
                    ? `${platformInvestmentDisplay.exact} ${paymentSymbol}`
                    : '';
                  const initialPriceLabel = initialPriceDisplay.exact
                    ? `${initialPriceDisplay.exact} ${paymentSymbol}`
                    : '';
                  const averagePurchaseLabel = averagePurchaseDisplay.exact
                    ? `${averagePurchaseDisplay.exact} ${paymentSymbol}`
                    : '';

                  return (
                    <article className="investor-portfolio-row" key={portfolioAssetKey(token)}>
                      <div className="investor-portfolio-asset">
                        <MarketplaceTokenImage token={token} size="sm" />
                        <div>
                          <strong>{token?.name || symbol}</strong>
                          <span>{[symbol, token?.issuer].filter((value) => value && value !== '—').join(' · ')}</span>
                          <small>Security token</small>
                        </div>
                      </div>

                      <div className="investor-portfolio-cell investor-portfolio-balance">
                        <span className="investor-portfolio-cell__label">Current balance</span>
                        <strong>
                          {balanceState.status === 'loading'
                            ? 'Checking…'
                            : balanceState.status === 'ready'
                              ? tokenAmount(balanceState.balance, symbol)
                              : 'Unavailable'}
                        </strong>
                        <small>{balanceState.status === 'ready' ? 'Live registered-wallet balance' : balanceState.reason || 'Refresh to check balance'}</small>
                      </div>

                      <div className="investor-portfolio-cell investor-portfolio-current-value">
                        <span className="investor-portfolio-cell__label">Estimated value</span>
                        <strong>
                          {!estimatedValueDisplay.display ? '—' : (
                            <ResponsiveTooltip
                              content={estimatedValueDisplay.isAbbreviated ? `Exact value: ${estimatedValueLabel}` : ''}
                              ariaLabel={estimatedValueDisplay.isAbbreviated ? `Estimated value. Exact value ${estimatedValueLabel}` : undefined}
                              className="investor-portfolio-precision-trigger"
                            >
                              <PaymentCurrencyAmount
                                paymentTokenAddress={paymentContext.paymentTokenAddress}
                                paymentTokenSymbol={paymentSymbol}
                                chainUid={token?.chainUid}
                                chainId={token?.chainId}
                              >
                                {estimatedValueDisplay.display}
                              </PaymentCurrencyAmount>
                            </ResponsiveTooltip>
                          )}
                        </strong>
                        <small>{balanceState.status === 'ready' && currentPrice ? 'Current balance × live current price' : currentPriceState.reason || 'Available after live balance and price are verified'}</small>
                      </div>

                      <div className="investor-portfolio-cell investor-portfolio-token-price">
                        <span className="investor-portfolio-cell__label">Current price</span>
                        <strong>
                          {currentPriceState.status === 'loading'
                            ? 'Checking…'
                            : currentPriceDisplay.display
                              ? (
                                <ResponsiveTooltip
                                  content={currentPriceDisplay.isAbbreviated ? `Exact value: ${currentPriceLabel}` : ''}
                                  ariaLabel={currentPriceDisplay.isAbbreviated ? `Current price. Exact value ${currentPriceLabel}` : undefined}
                                  className="investor-portfolio-precision-trigger"
                                >
                                  <PaymentCurrencyAmount
                                    paymentTokenAddress={paymentContext.paymentTokenAddress}
                                    paymentTokenSymbol={paymentSymbol}
                                    chainUid={token?.chainUid}
                                    chainId={token?.chainId}
                                  >
                                    {currentPriceDisplay.display}
                                  </PaymentCurrencyAmount>
                                </ResponsiveTooltip>
                              )
                              : 'Unavailable'}
                        </strong>
                        {currentPriceState.status === 'ready' ? null : (
                          <small>{currentPriceState.reason || 'Live price unavailable'}</small>
                        )}
                        <small>
                          Initial price{' '}
                          {initialPriceDisplay.display ? (
                            <ResponsiveTooltip
                              content={initialPriceDisplay.isAbbreviated ? `Exact value: ${initialPriceLabel}` : ''}
                              ariaLabel={initialPriceDisplay.isAbbreviated ? `Initial price. Exact value ${initialPriceLabel}` : undefined}
                              className="investor-portfolio-inline-precision-trigger"
                            >
                              <span>{initialPriceDisplay.display} {paymentSymbol}</span>
                            </ResponsiveTooltip>
                          ) : '—'}
                        </small>
                      </div>

                      <div className="investor-portfolio-cell investor-portfolio-investment">
                        <span className="investor-portfolio-cell__label">Platform investment</span>
                        <strong>
                          {!platformInvestmentDisplay.display ? '—' : (
                            <ResponsiveTooltip
                              content={platformInvestmentDisplay.isAbbreviated ? `Exact value: ${platformInvestmentLabel}` : ''}
                              ariaLabel={platformInvestmentDisplay.isAbbreviated ? `Platform investment. Exact value ${platformInvestmentLabel}` : undefined}
                              className="investor-portfolio-precision-trigger"
                            >
                              <PaymentCurrencyAmount
                                paymentTokenAddress={paymentContext.paymentTokenAddress}
                                paymentTokenSymbol={paymentSymbol}
                                chainUid={token?.chainUid}
                                chainId={token?.chainId}
                              >
                                {platformInvestmentDisplay.display}
                              </PaymentCurrencyAmount>
                            </ResponsiveTooltip>
                          )}
                        </strong>
                        <small>
                          Avg. purchase{' '}
                          {averagePurchaseDisplay.display ? (
                            <ResponsiveTooltip
                              content={averagePurchaseDisplay.isAbbreviated ? `Exact value: ${averagePurchaseLabel}` : ''}
                              ariaLabel={averagePurchaseDisplay.isAbbreviated ? `Average purchase price. Exact value ${averagePurchaseLabel}` : undefined}
                              className="investor-portfolio-inline-precision-trigger"
                            >
                              <span>{averagePurchaseDisplay.display} {paymentSymbol}</span>
                            </ResponsiveTooltip>
                          ) : '—'}
                        </small>
                      </div>

                      <div className="investor-portfolio-actions">
                        <Button
                          size="sm"
                          icon={Briefcase}
                          onClick={() => openManagement(token.tokenUid)}
                          disabled={!token.tokenUid}
                        >
                          Manage
                        </Button>
                        <button
                          type="button"
                          className="investor-portfolio-link"
                          onClick={() => navigate(ROUTES.marketplaceToken(token.tokenUid))}
                          disabled={!token.tokenUid}
                        >
                          View token <ArrowRight size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}

                {meta.totalPages > 1 ? (
                  <div className="investor-portfolio-pagination">
                    <InvestorHistoryPagination
                      page={currentPage}
                      totalPages={meta.totalPages}
                      onPageChange={setPage}
                      disabled={refreshing || tableLoading}
                      itemLabel="portfolio assets"
                    />
                  </div>
                ) : null}
              </Card>
            ) : tableLoading || search !== debouncedSearch ? (
              <Card className="investor-portfolio-empty investor-portfolio-empty--compact" role="status">
                <p>Updating holdings…</p>
              </Card>
            ) : !loadError ? (
              <Card className="investor-portfolio-empty investor-portfolio-empty--compact">
                <span className="investor-portfolio-empty__icon"><Coins size={28} /></span>
                <h2>No matching portfolio assets</h2>
                <p>Try another token name, symbol, or issuer.</p>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
