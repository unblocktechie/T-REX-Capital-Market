import { PriceValue as CommonPriceValue } from '@/components/common/PriceValue';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ExternalLink, History, RefreshCw } from 'lucide-react';
import { TokenIcon } from '@/components/common/TokenIcon';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { transactionExplorerUrl } from '@/utils/blockExplorer';
import { usePriceHistoryData } from './useHistoryData';
import { PriceHistoryChangeIndicator, PriceHistoryMethodChip, PriceHistoryStatusChip } from './PriceHistoryIndicators';
import {
  exactPriceText, priceHistoryDate,
} from '@/services/price-history/priceHistory.utils';

function PriceValue({ value, symbol, tokenName, imageUrl }) {
  const exact = exactPriceText(value);
  if (exact === '—') return <span className="price-history-price">—</span>;
  return (
    <span className="price-history-price">
      <TokenIcon size="xs" symbol={symbol} name={tokenName || symbol} imageUrl={imageUrl} />
      <span className="price-history-price__amount"><CommonPriceValue value={value} /></span>
      {symbol ? <span className="price-history-currency">{symbol}</span> : null}
    </span>
  );
}

function HistoryRow({ row, symbol, tokenName, imageUrl, chainId, index }) {
  const explorer = transactionExplorerUrl(row.transactionHash, row.chainId || chainId);
  return (
    <article className="price-history-row" aria-label={`Price update ${row.priceUpdateUid || index}`}>
      <div className="price-history-cell price-history-cell--date" data-label="Date and time">
        <strong>{priceHistoryDate(row.createdAt)}</strong>
      </div>
      <div className="price-history-cell" data-label="Previous price"><PriceValue value={row.oldPriceFormatted} symbol={symbol} tokenName={tokenName} imageUrl={imageUrl} /></div>
      <div className="price-history-cell" data-label="New price">
        <span className="price-history-new-value">
          <PriceValue value={row.newPriceFormatted} symbol={symbol} tokenName={tokenName} imageUrl={imageUrl} />
          <PriceHistoryChangeIndicator previous={row.oldPriceFormatted} current={row.newPriceFormatted} status={row.status} />
        </span>
      </div>
      <div className="price-history-cell" data-label="Method"><PriceHistoryMethodChip row={row} /></div>
      <div className="price-history-cell" data-label="Status"><PriceHistoryStatusChip status={row.status} /></div>
      <div className="price-history-cell price-history-cell--transaction" data-label="Transaction">
        {explorer ? (
          <a className="price-history-transaction" href={explorer} target="_blank" rel="noopener noreferrer" title="View transaction in the network explorer">
            View transaction <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : <span aria-label="No transaction recorded">—</span>}
      </div>
    </article>
  );
}

export function IssuerPriceHistory({
  userKey, chainUid, selectedChainUid, symbol = '', tokenName = '', imageUrl = '',
  tokenUid = '', tokenAddress = '', chainId = null, viewer = 'issuer', compact = false,
}) {
  const [page, setPage] = useState(1);
  const investor = viewer === 'investor';
  // Full issuer history: 10 per page; investor history: 5; issuer preview: 3.
  const pageSize = compact ? 3 : investor ? 5 : 10;
  const query = usePriceHistoryData({
    userKey, chainUid, selectedChainUid, tokenUid, tokenAddress, chainId,
    viewer, page, limit: pageSize,
  });
  const { items = [], pagination = {} } = query.data || {};
  const totalPages = pagination.totalPages || 0;
  const currentPage = pagination.page || page;
  const visibleItems = items.slice(0, pageSize);
  const totalRecords = pagination.total || 0;
  const firstRecord = visibleItems.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRecord = visibleItems.length ? Math.min(totalRecords, firstRecord + visibleItems.length - 1) : 0;
  // Render a short, sliding window of page buttons to fit narrow layouts.
  const firstVisiblePage = Math.max(1, Math.min(page - 1, totalPages - 2));
  const visiblePages = !compact && totalPages > 1
    ? Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstVisiblePage + index)
    : [];

  // If history shrinks while the user is viewing its final page, recover to a valid page.
  useEffect(() => {
    if (!query.isPending && !query.isError && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages, query.isPending, query.isError]);
  return (
    <section className={`price-history-panel${investor ? ' price-history-panel--investor' : ''}`} aria-label="Asset price updates">
      <div className="price-history-heading">
        <div className="price-history-heading__icon" aria-hidden="true"><History size={21} /></div>
        <div className="price-history-heading__copy">
          <h2>{compact ? 'Latest price updates' : investor ? 'Price update records' : 'Full price history'}</h2>
          <p>{compact ? 'The three most recently recorded updates to this asset.' : 'Review recorded price changes and their transactions.'}</p>
        </div>
        {compact && !investor ? (
          <Link className="price-history-full-link" to={ROUTES.tokenPriceHistory(tokenUid)}>View Full History →</Link>
        ) : (
          <Button variant="secondary" size="sm" icon={RefreshCw} disabled={!query.enabled || query.isFetching} onClick={() => query.refetch()}>Refresh</Button>
        )}
      </div>
      {!query.matchingNetwork ? <div className="price-history-message">Select this asset’s network to view its price updates.</div>
        : !query.enabled ? <div className="price-history-message">This investment needs a token reference to load its history.</div>
        : query.isPending ? <div className="price-history-message" role="status">Loading price updates…</div>
        : query.isError ? <div className="price-history-message" role="alert">Price history is unavailable. Please try again.</div>
        : !items.length ? <div className="price-history-message" role="status">{investor
          ? 'No price updates to show yet. When the issuer changes the token price, updates will appear here.'
          : 'No price updates have been recorded yet.'}</div>
        : <div className="price-history-list" aria-busy={query.isFetching}>
          <div className="price-history-column-headings" aria-hidden="true"><span>Date and Time</span><span>Previous Price</span><span>New Price</span><span>Method</span><span>Status</span><span>Transaction</span></div>
          {visibleItems.map((row, index) => <HistoryRow key={row.priceUpdateUid || `${row.createdAt}-${index}`} row={row} index={index} symbol={symbol} tokenName={tokenName} imageUrl={imageUrl} chainId={chainId} />)}
        </div>}
      {!compact && query.enabled && !query.isError && totalPages > 0 ? (
        <div className="price-history-pagination">
          <small aria-live="polite">
            {`Showing ${firstRecord}–${lastRecord} of ${totalRecords} updates`}
            {' · '}Page {currentPage} of {totalPages}
          </small>
          <div className="price-history-pagination__controls" aria-label="Price update pages">
            <Button size="sm" variant="secondary" icon={ArrowLeft} disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            {visiblePages.map((number) => (
              <button
                key={number}
                type="button"
                className={`price-history-pagination__page${page === number ? ' is-active' : ''}`}
                aria-label={`Page ${number}`}
                aria-current={page === number ? 'page' : undefined}
                disabled={query.isFetching}
                onClick={() => setPage(number)}
              >{number}</button>
            ))}
            <Button size="sm" variant="secondary" disabled={page >= totalPages || query.isFetching} onClick={() => setPage((current) => current + 1)}>Next <ArrowRight size={15} /></Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
