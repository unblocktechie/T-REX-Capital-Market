import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { TokenApplicationCard } from '@/components/investor-marketplace/TokenApplicationCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { MARKETPLACE_STATUS } from '@/services/investor/investorMarketplaceLocalService';
import { getErrorMessage } from '@/utils/error';

const PAGE_SIZE = 6;

const CATALOGUE_OPTIONS = [
  { value: 'deployed', label: 'Deployed tokens', description: 'Show live, deployed ERC-3643 tokens' },
  { value: 'all', label: 'All token statuses', description: 'Include every token returned by the catalogue' },
];

const APPLICATION_OPTIONS = [
  { value: 'all', label: 'Application: All', description: 'Show every application state' },
  { value: 'available', label: 'Not applied', description: 'Tokens you have not applied for' },
  { value: 'action', label: 'Documents required', description: 'Additional investor documents are needed' },
  { value: 'review', label: 'Pending review', description: 'Interests currently under issuer review' },
  { value: 'approved', label: 'Approved', description: 'Approved investment interests' },
  { value: 'rejected', label: 'Rejected', description: 'Requests not approved by the issuer' },
];

const SORT_OPTIONS = [
  { value: 'featured', label: 'Recommended', description: 'Prioritize items that need your attention' },
  { value: 'name', label: 'Name', description: 'Sort alphabetically by token name' },
  { value: 'price-high', label: 'Price: High to Low', description: 'Highest token price first' },
  { value: 'price-low', label: 'Price: Low to High', description: 'Lowest token price first' },
];

function matchesApplicationStatus(token, filter) {
  if (filter === 'approved') return token.status === MARKETPLACE_STATUS.APPROVED;
  if (filter === 'review') return token.status === MARKETPLACE_STATUS.PENDING_REVIEW;
  if (filter === 'action') return token.status === MARKETPLACE_STATUS.ACTION_REQUIRED;
  if (filter === 'available') return token.status === MARKETPLACE_STATUS.NOT_APPLIED;
  if (filter === 'rejected') return token.status === MARKETPLACE_STATUS.REJECTED;
  return true;
}

const sortableNumber = (value, fallback = -Infinity) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export default function MarketplacePage() {
  useDocumentTitle('Marketplace');
  const navigate = useNavigate();
  const [tokens, setTokens] = useState([]);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 350);
  const [catalogueStatus, setCatalogueStatus] = useState('deployed');
  const [applicationStatus, setApplicationStatus] = useState('all');
  const [sortBy, setSortBy] = useState('featured');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(1);
    investorMarketplaceService
      .listOfferings({ page: 1, limit: PAGE_SIZE, search: debouncedQuery, status: catalogueStatus })
      .then(({ items, meta: nextMeta }) => {
        if (!active) return;
        setTokens(items || []);
        setMeta(nextMeta || { page: 1, totalPages: 1, total: items?.length || 0 });
      })
      .catch((error) => {
        if (!active) return;
        setTokens([]);
        toast.error(getErrorMessage(error, 'Unable to load marketplace offerings.'));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debouncedQuery, catalogueStatus]);

  const filteredTokens = useMemo(() => {
    const next = tokens.filter((token) => matchesApplicationStatus(token, applicationStatus));
    return [...next].sort((a, b) => {
      if (sortBy === 'price-high') return sortableNumber(b.price) - sortableNumber(a.price);
      if (sortBy === 'price-low') return sortableNumber(a.price, Infinity) - sortableNumber(b.price, Infinity);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const priority = {
        [MARKETPLACE_STATUS.ACTION_REQUIRED]: 0,
        [MARKETPLACE_STATUS.APPROVED]: 1,
        [MARKETPLACE_STATUS.PENDING_REVIEW]: 2,
        [MARKETPLACE_STATUS.NOT_APPLIED]: 3,
        [MARKETPLACE_STATUS.REJECTED]: 4,
      };
      return (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
    });
  }, [tokens, applicationStatus, sortBy]);

  const totalPages = Number(meta?.totalPages || 1);
  const hasMore = page < totalPages;

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await investorMarketplaceService.listOfferings({
        page: nextPage,
        limit: PAGE_SIZE,
        search: debouncedQuery,
        status: catalogueStatus,
      });
      setTokens((current) => {
        const byId = new Map(current.map((token) => [token.id, token]));
        (result.items || []).forEach((token) => byId.set(token.id, token));
        return Array.from(byId.values());
      });
      setMeta(result.meta || meta);
      setPage(nextPage);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to load more offerings.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const openOffering = (token) => navigate(ROUTES.marketplaceToken(token.id));

  return (
    <div className="page-stack investor-marketplace-page marketplace-workspace">
      <header className="marketplace-page-header">
        <div>
          <span className="eyebrow">Investor marketplace</span>
          <h1>Explore compliant tokenized investments</h1>
          <p>Browse deployed ERC-3643 security tokens and submit an investment interest when your required investor documents are complete.</p>
        </div>
        <label className="marketplace-header-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search token name or symbol…"
            aria-label="Search marketplace offerings"
          />
        </label>
      </header>

      <Card className="marketplace-filter-bar">
        <div className="marketplace-filter-group" aria-label="Marketplace filters">
          <MarketplaceDropdown
            value={catalogueStatus}
            options={CATALOGUE_OPTIONS}
            onChange={setCatalogueStatus}
            icon={SlidersHorizontal}
            ariaLabel="Filter token deployment status"
          />
          <span className="marketplace-filter-divider" />
          <MarketplaceDropdown
            value={applicationStatus}
            options={APPLICATION_OPTIONS}
            onChange={setApplicationStatus}
            icon={ShieldCheck}
            ariaLabel="Filter by application status"
          />
        </div>
        <MarketplaceDropdown
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={setSortBy}
          prefix="Sort by"
          ariaLabel="Sort marketplace offerings"
          align="end"
          className="marketplace-sort-dropdown"
        />
      </Card>

      {loading ? (
        <div className="marketplace-detail-loading" aria-label="Loading marketplace offerings"><div /><div /><div /></div>
      ) : filteredTokens.length ? (
        <>
          <section className="marketplace-token-grid" aria-label="Available tokenized offerings">
            {filteredTokens.map((token) => (
              <TokenApplicationCard
                key={token.id}
                token={token}
                onReviewApplication={openOffering}
                onViewTokenDetails={openOffering}
              />
            ))}
          </section>
          <div className="marketplace-load-more-wrap">
            {hasMore ? (
              <Button variant="secondary" loading={loadingMore} onClick={loadMore}>Load More Assets <ChevronDown size={16} /></Button>
            ) : meta?.total ? (
              <span className="marketplace-results-caption">Showing {tokens.length} of {meta.total} marketplace assets.</span>
            ) : null}
          </div>
        </>
      ) : (
        <Card className="marketplace-empty-state">
          <span><Store size={28} /></span>
          <h2>No offerings match these filters</h2>
          <p>Try a different application status, deployment status, or search term.</p>
          <Button variant="secondary" onClick={() => { setQuery(''); setCatalogueStatus('deployed'); setApplicationStatus('all'); }}>Clear filters</Button>
        </Card>
      )}

    </div>
  );
}
