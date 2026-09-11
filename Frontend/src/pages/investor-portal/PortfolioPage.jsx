import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Coins,
  History,
  RefreshCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceTokenImage } from '@/components/investor-marketplace/MarketplaceTokenImage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorPortfolioService } from '@/services/investor/investorPortfolioService';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';
import { shortenWalletAddress } from '@/utils/wallet';

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

const tokenAmount = (value, symbol) => `${exactDecimal(value, 6)} ${symbol || 'TOKEN'}`;
const usdtAmount = (value, maximumFractionDigits = 2) => {
  const formatted = exactDecimal(value, maximumFractionDigits);
  return formatted === '—' ? '—' : `${formatted} USDT`;
};

const chainLabel = (token) => {
  if (token?.chainName) return token.chainName;
  const numericChainId = Number(token?.chainId);
  const chain = web3Config.supportedChains.find((item) => item.id === numericChainId);
  return chain?.name || (Number.isFinite(numericChainId) ? `Chain ${numericChainId}` : 'Network unavailable');
};

const activityDate = (portfolio = {}) => (
  portfolio.lastActivityAt
  || portfolio.lastRedemptionAt
  || portfolio.lastPurchaseAt
  || portfolio.firstPurchaseAt
  || ''
);

const restrictionSummary = (token) => {
  const countryCount = Array.isArray(token?.permittedCountries) ? token.permittedCountries.length : 0;
  if (countryCount > 0) return `${countryCount} permitted countr${countryCount === 1 ? 'y' : 'ies'}`;
  if (token?.transferRestriction) return token.transferRestriction;
  if (token?.restrictions && Object.keys(token.restrictions).length) return 'Transfer rules apply';
  return 'Standard compliance rules';
};

function PortfolioLoading() {
  return (
    <Card className="investor-portfolio-list investor-portfolio-list--loading" aria-label="Loading portfolio holdings">
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
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

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

  const currentPage = Math.min(Math.max(meta.page || page, 1), Math.max(meta.totalPages || 1, 1));
  const start = meta.total ? ((currentPage - 1) * meta.limit) + 1 : 0;
  const end = meta.total ? Math.min(currentPage * meta.limit, meta.total) : 0;

  const pageActivity = useMemo(() => items.reduce((summary, item) => ({
    purchases: summary.purchases + (Number(item?.portfolio?.purchaseCount) || 0),
    redemptions: summary.redemptions + (Number(item?.portfolio?.redemptionCount) || 0),
  }), { purchases: 0, redemptions: 0 }), [items]);

  const openManagement = (tokenUid) => {
    navigate(`${ROUTES.assetManagement}?tokenUid=${encodeURIComponent(tokenUid)}`);
  };

  return (
    <div className="page-stack investor-portfolio-page">
      <header className="investor-portfolio-header">
        <div>
          <span className="eyebrow">Compliant token holdings</span>
          <h1>Portfolio</h1>
          <p>Track security tokens from your completed purchases, including your current token amount, invested value, redemption activity, and offering details.</p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCcw}
          loading={refreshing}
          onClick={() => loadPortfolio({ quiet: true })}
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

      <section className="investor-portfolio-summary" aria-label="Portfolio summary">
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Coins size={20} /></span>
          <div>
            <span>Portfolio assets</span>
            <strong>{loading ? '—' : meta.total}</strong>
            <small>Tokens with at least one completed purchase</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><Banknote size={20} /></span>
          <div>
            <span>Completed purchases</span>
            <strong>{loading ? '—' : pageActivity.purchases}</strong>
            <small>Purchase transactions shown on this page</small>
          </div>
        </Card>
        <Card className="investor-portfolio-summary__card">
          <span className="investor-portfolio-summary__icon"><History size={20} /></span>
          <div>
            <span>Completed redemptions</span>
            <strong>{loading ? '—' : pageActivity.redemptions}</strong>
            <small>Redemption transactions shown on this page</small>
          </div>
        </Card>
      </section>

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
                aria-label="Search portfolio holdings"
              />
            </label>
            <div className="investor-portfolio-toolbar__meta">
              <span><ShieldCheck size={15} /> Completed activity only</span>
              <small>Showing {start}{end > start ? `–${end}` : ''} of {meta.total} asset{meta.total === 1 ? '' : 's'}</small>
            </div>
          </Card>

          {items.length ? (
            <Card className="investor-portfolio-list">
              <div className="investor-portfolio-list__head" aria-hidden="true">
                <span>Asset</span>
                <span>Current holding</span>
                <span>Investment</span>
                <span>Activity</span>
                <span>Action</span>
              </div>
              {items.map((token) => {
                const symbol = token?.symbol && token.symbol !== '—' ? token.symbol : 'TOKEN';
                const portfolio = token?.portfolio || {};
                const lastActivity = activityDate(portfolio);
                const tokenAddress = token?.tokenAddress || '';
                const claimsCount = Array.isArray(token?.requiredClaimTopics) ? token.requiredClaimTopics.length : 0;

                return (
                  <article className="investor-portfolio-row" key={token.tokenUid}>
                    <div className="investor-portfolio-asset">
                      <MarketplaceTokenImage token={token} size="sm" />
                      <div>
                        <strong>{token?.name || symbol}</strong>
                        <span>{[symbol, token?.issuer].filter((value) => value && value !== '—').join(' · ')}</span>
                        <small className="investor-portfolio-asset__network">
                          {chainLabel(token)}
                          {tokenAddress ? ` · ${shortenWalletAddress(tokenAddress, 6, 5)}` : ''}
                        </small>
                        <small className="investor-portfolio-asset__compliance">
                          {claimsCount} required claim{claimsCount === 1 ? '' : 's'} · {restrictionSummary(token)}
                        </small>
                      </div>
                    </div>

                    <div className="investor-portfolio-cell investor-portfolio-balance">
                      <span className="investor-portfolio-cell__label">Current holding</span>
                      <strong>{tokenAmount(portfolio.netTokenAmount, symbol)}</strong>
                      <small>Purchased {tokenAmount(portfolio.totalPurchasedTokenAmount, symbol)}</small>
                      <small>Redeemed {tokenAmount(portfolio.totalRedeemedTokenAmount || '0', symbol)}</small>
                    </div>

                    <div className="investor-portfolio-cell investor-portfolio-investment">
                      <span className="investor-portfolio-cell__label">Investment</span>
                      <strong>{usdtAmount(portfolio.totalInvestedUsdtAmount, 2)}</strong>
                      <small>Avg. purchase {usdtAmount(portfolio.averagePurchasePrice, 6)}</small>
                      <small>Offering price {usdtAmount(token?.initialTokenPriceExact || token?.initialTokenPrice || token?.price, 6)}</small>
                    </div>

                    <div className="investor-portfolio-cell investor-portfolio-activity">
                      <span className="investor-portfolio-cell__label">Activity</span>
                      <strong>{portfolio.purchaseCount} purchase{portfolio.purchaseCount === 1 ? '' : 's'}</strong>
                      <small>{portfolio.redemptionCount} completed redemption{portfolio.redemptionCount === 1 ? '' : 's'}</small>
                      <small>{lastActivity ? `Last activity ${formatDate(lastActivity, 'MMM DD, YYYY')}` : 'Activity date unavailable'}</small>
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
                    itemLabel="portfolio holdings"
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
