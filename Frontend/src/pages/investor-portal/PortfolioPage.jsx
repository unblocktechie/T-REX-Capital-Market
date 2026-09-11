import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getErrorMessage } from '@/utils/error';
import { resolveCurrentTokenPriceExact, resolveInitialTokenPriceExact } from '@/utils/tokenPrice';

const PAGE_SIZE = 20;

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
const usdtAmount = (value, maximumFractionDigits = 2) => {
  const formatted = exactDecimal(value, maximumFractionDigits);
  return formatted === '—' ? '—' : `${formatted} USDT`;
};

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

const formatScaledDecimal = (signedValue, scale, maximumFractionDigits = 2) => {
  let value = signedValue;
  let resolvedScale = scale;

  if (resolvedScale > maximumFractionDigits) {
    const divisor = pow10(resolvedScale - maximumFractionDigits);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const rounded = (absolute + (divisor / 2n)) / divisor;
    value = negative ? -rounded : rounded;
    resolvedScale = maximumFractionDigits;
  }

  if (resolvedScale < maximumFractionDigits) {
    value *= pow10(maximumFractionDigits - resolvedScale);
    resolvedScale = maximumFractionDigits;
  }

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = pow10(resolvedScale);
  const whole = absolute / divisor;
  const fraction = resolvedScale ? String(absolute % divisor).padStart(resolvedScale, '0') : '';
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${resolvedScale ? `.${fraction}` : ''}`;
};

const sumDecimalValues = (values, maximumFractionDigits = 2) => {
  const parts = values.map(decimalParts).filter(Boolean);
  if (!parts.length) return null;
  const scale = Math.max(...parts.map((part) => part.scale));
  const total = parts.reduce((sum, part) => {
    const scaled = part.digits * pow10(scale - part.scale);
    return sum + (part.negative ? -scaled : scaled);
  }, 0n);
  return formatScaledDecimal(total, scale, maximumFractionDigits);
};

const multiplyDecimalValues = (left, right, maximumFractionDigits = 2) => {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  if (!leftParts || !rightParts) return null;
  const sign = leftParts.negative !== rightParts.negative ? -1n : 1n;
  const product = leftParts.digits * rightParts.digits * sign;
  return formatScaledDecimal(product, leftParts.scale + rightParts.scale, maximumFractionDigits);
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

export default function PortfolioPage() {
  useDocumentTitle('Portfolio');
  const navigate = useNavigate();
  const investorProfileQuery = useInvestorProfileData();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [walletBalances, setWalletBalances] = useState({});
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  const registeredWalletAddress = String(
    investorProfileQuery.state?.wallet?.address
      || investorProfileQuery.rawInvestor?.walletAddress
      || investorProfileQuery.rawInvestor?.investor?.walletAddress
      || '',
  ).trim();

  const loadPortfolio = useCallback(async ({ quiet = false, signal } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setLoadError('');

    try {
      const result = await investorPortfolioService.list({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        signal,
      });
      if (signal?.aborted) return;
      setItems(result.items || []);
      setMeta(result.meta || { page, limit: PAGE_SIZE, total: result.items?.length || 0, totalPages: 1 });
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      setItems([]);
      setLoadError(getErrorMessage(error, 'Unable to load your portfolio right now.'));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    loadPortfolio({ signal: controller.signal });
    return () => controller.abort();
  }, [loadPortfolio]);

  useEffect(() => {
    if (page > meta.totalPages) setPage(Math.max(meta.totalPages, 1));
  }, [meta.totalPages, page]);

  useEffect(() => {
    const refreshVisibleBalances = () => setBalanceRefreshKey((value) => value + 1);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshVisibleBalances();
    };

    window.addEventListener('focus', refreshVisibleBalances);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshVisibleBalances);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!items.length || loadError) {
      setWalletBalances({});
      return () => {
        active = false;
      };
    }

    setWalletBalances(Object.fromEntries(
      items.map((token) => [token.tokenUid, walletBalanceState('loading')]),
    ));

    if (investorProfileQuery.isLoading) {
      return () => {
        active = false;
      };
    }

    if (!registeredWalletAddress) {
      setWalletBalances(Object.fromEntries(
        items.map((token) => [token.tokenUid, walletBalanceState('unavailable', '', 'Registered wallet unavailable')]),
      ));
      return () => {
        active = false;
      };
    }

    Promise.all(items.map(async (token) => {
      const tokenUid = token.tokenUid;
      const decimals = validTokenDecimals(token.decimals);
      if (!token.tokenAddress || !token.chainId || decimals === null) {
        return [tokenUid, walletBalanceState('unavailable', '', 'Token balance details unavailable')];
      }

      try {
        const rawBalance = await getInvestorPurchaseTokenBalance({
          tokenAddress: token.tokenAddress,
          investorWalletAddress: registeredWalletAddress,
          chainId: token.chainId,
        });
        return [tokenUid, walletBalanceState('ready', formatUnits(rawBalance, decimals))];
      } catch {
        return [tokenUid, walletBalanceState('unavailable', '', 'Live wallet balance unavailable')];
      }
    })).then((entries) => {
      if (active) setWalletBalances(Object.fromEntries(entries));
    });

    return () => {
      active = false;
    };
  }, [balanceRefreshKey, investorProfileQuery.isLoading, items, loadError, registeredWalletAddress]);

  const currentPage = Math.min(Math.max(meta.page || page, 1), Math.max(meta.totalPages || 1, 1));
  const start = meta.total ? ((currentPage - 1) * meta.limit) + 1 : 0;
  const end = meta.total ? Math.min(currentPage * meta.limit, meta.total) : 0;

  const overview = useMemo(() => {
    const investedValues = [];
    const walletValues = [];
    let purchaseCount = 0;
    let verifiedBalances = 0;
    let pricedBalances = 0;

    items.forEach((token) => {
      const portfolio = token?.portfolio || {};
      if (decimalParts(portfolio.totalInvestedUsdtAmount)) investedValues.push(portfolio.totalInvestedUsdtAmount);
      purchaseCount += Number.isFinite(Number(portfolio.purchaseCount)) ? Number(portfolio.purchaseCount) : 0;

      const balanceState = walletBalances[token.tokenUid];
      if (balanceState?.status === 'ready') {
        verifiedBalances += 1;
        const currentPrice = resolveCurrentTokenPriceExact(token);
        const walletValue = multiplyDecimalValues(balanceState.balance, currentPrice, 2);
        if (walletValue !== null) {
          walletValues.push(walletValue);
          pricedBalances += 1;
        }
      }
    });

    return {
      totalInvested: sumDecimalValues(investedValues, 2),
      estimatedWalletValue: pricedBalances === items.length && items.length
        ? sumDecimalValues(walletValues, 2)
        : null,
      purchaseCount,
      verifiedBalances,
      pricedBalances,
    };
  }, [items, walletBalances]);

  const summaryScope = meta.total > items.length ? 'shown on this page' : 'across your portfolio';
  const balanceLoading = items.some((token) => walletBalances[token.tokenUid]?.status === 'loading');

  const openManagement = (tokenUid) => {
    navigate(`${ROUTES.assetManagement}?tokenUid=${encodeURIComponent(tokenUid)}`);
  };

  const refreshPortfolio = () => {
    setBalanceRefreshKey((value) => value + 1);
    loadPortfolio({ quiet: true });
  };

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
        >
          Refresh portfolio
        </Button>
      </header>

      {!loading && loadError ? (
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
            <span>Estimated wallet value</span>
            <strong>{loading || overview.estimatedWalletValue === null ? '—' : `${overview.estimatedWalletValue} USDT`}</strong>
            <small>{loading ? 'Checking live balances' : `Live balance × current price, ${summaryScope}`}</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Banknote size={20} /></span>
          <div>
            <span>Total invested</span>
            <strong>{loading || overview.totalInvested === null ? '—' : `${overview.totalInvested} USDT`}</strong>
            <small>Completed purchases {summaryScope}</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Coins size={20} /></span>
          <div>
            <span>Completed purchases</span>
            <strong>{loading ? '—' : overview.purchaseCount}</strong>
            <small>Purchase records {summaryScope}</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Briefcase size={20} /></span>
          <div>
            <span>Portfolio assets</span>
            <strong>{loading ? '—' : meta.total}</strong>
            <small>{loading ? 'Completed investment positions' : `${overview.verifiedBalances} of ${items.length} visible wallet balance${items.length === 1 ? '' : 's'} verified`}</small>
          </div>
        </Card>
      </section>

      {!loading && !loadError && items.length ? (
        <div className="investor-portfolio-price-note" role="note">
          <Info size={17} />
          <div>
            <strong>Wallet balance is the source of truth for what you currently hold</strong>
            <span>Wallet balances are read live from the blockchain. Total invested and purchase counts include only completed purchases made through T-REX Capital Market. Direct wallet transfers can change your balance without changing that purchase history, so performance is not estimated when the cost basis cannot be guaranteed.</span>
          </div>
        </div>
      ) : null}

      {loading ? (
        <PortfolioLoading />
      ) : !loadError && meta.total === 0 && !debouncedSearch ? (
        <Card className="investor-portfolio-empty">
          <span className="investor-portfolio-empty__icon"><Briefcase size={31} /></span>
          <h2>No completed investments yet</h2>
          <p>Your portfolio will show a token after your first purchase for that token reaches Completed. Pending, failed, and expired purchases are not included.</p>
          <Button icon={ArrowRight} onClick={() => navigate(ROUTES.marketplace)}>Explore Marketplace</Button>
        </Card>
      ) : !loadError ? (
        <>
          <Card className="investor-portfolio-toolbar">
            <label className="investor-portfolio-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value.slice(0, 100))}
                placeholder="Search token or issuer"
                aria-label="Search portfolio"
              />
            </label>
            <div className="investor-portfolio-toolbar__meta">
              <span><Coins size={15} /> Tokens with completed platform purchases</span>
              <small>Showing {start}{end > start ? `–${end}` : ''} of {meta.total} asset{meta.total === 1 ? '' : 's'}</small>
            </div>
          </Card>

          {items.length ? (
            <Card className="investor-portfolio-list">
              <div className="investor-portfolio-list__head" aria-hidden="true">
                <span>Asset</span>
                <span>Wallet balance</span>
                <span>Estimated value</span>
                <span>Current price</span>
                <span>Platform investment</span>
                <span>Action</span>
              </div>
              {items.map((token) => {
                const symbol = token?.symbol && token.symbol !== '—' ? token.symbol : 'TOKEN';
                const portfolio = token?.portfolio || {};
                const balanceState = walletBalances[token.tokenUid] || walletBalanceState('loading');
                const currentPrice = resolveCurrentTokenPriceExact(token);
                const estimatedValue = balanceState.status === 'ready'
                  ? multiplyDecimalValues(balanceState.balance, currentPrice, 2)
                  : null;

                return (
                  <article className="investor-portfolio-row" key={token.tokenUid}>
                    <div className="investor-portfolio-asset">
                      <MarketplaceTokenImage token={token} size="sm" />
                      <div>
                        <strong>{token?.name || symbol}</strong>
                        <span>{[symbol, token?.issuer].filter((value) => value && value !== '—').join(' · ')}</span>
                        <small>Security token</small>
                      </div>
                    </div>

                    <div className="investor-portfolio-cell investor-portfolio-balance">
                      <span className="investor-portfolio-cell__label">Wallet balance</span>
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
                      <strong>{estimatedValue === null ? '—' : `${estimatedValue} USDT`}</strong>
                      <small>{balanceState.status === 'ready' && currentPrice ? 'Wallet balance × current price' : 'Available after live balance is verified'}</small>
                    </div>

                    <div className="investor-portfolio-cell investor-portfolio-token-price">
                      <span className="investor-portfolio-cell__label">Current price</span>
                      <strong>{currentPrice ? usdtAmount(currentPrice, 18) : '—'}</strong>
                      <small>Initial price {resolveInitialTokenPriceExact(token) ? usdtAmount(resolveInitialTokenPriceExact(token), 18) : '—'}</small>
                    </div>

                    <div className="investor-portfolio-cell investor-portfolio-investment">
                      <span className="investor-portfolio-cell__label">Platform investment</span>
                      <strong>{usdtAmount(portfolio.totalInvestedUsdtAmount, 2)}</strong>
                      <small>Avg. purchase {portfolio.averagePurchasePrice ? usdtAmount(portfolio.averagePurchasePrice, 18) : '—'}</small>
                      <small>{portfolio.purchaseCount} completed purchase{portfolio.purchaseCount === 1 ? '' : 's'}</small>
                    </div>

                    <div className="investor-portfolio-actions">
                      <Button
                        size="sm"
                        icon={Briefcase}
                        onClick={() => openManagement(token.tokenUid)}
                      >
                        Manage
                      </Button>
                      <button
                        type="button"
                        className="investor-portfolio-link"
                        onClick={() => navigate(ROUTES.marketplaceToken(token.tokenUid))}
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
                    disabled={refreshing}
                    itemLabel="portfolio assets"
                  />
                </div>
              ) : null}
            </Card>
          ) : (
            <Card className="investor-portfolio-empty investor-portfolio-empty--compact">
              <span className="investor-portfolio-empty__icon"><Coins size={28} /></span>
              <h2>No matching portfolio assets</h2>
              <p>Try another token name, symbol, or issuer.</p>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
