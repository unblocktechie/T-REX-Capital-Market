import { PriceValue } from '@/components/common/PriceValue';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, History, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { web3Config } from '@/config/web3';
import { priceHistoryDate } from '@/services/price-history/priceHistory.utils';
import { PriceHistoryChangeIndicator, PriceHistoryMethodChip, PriceHistoryStatusChip } from './PriceHistoryIndicators';
import { fetchRecentPublicPriceEvents } from '@/services/price-history/publicOnchainPriceHistory.service';
import { transactionExplorerUrl } from '@/utils/blockExplorer';

export function InvestorOnchainPriceHistory({ chainId, selectedChainId, tokenAddress, symbol = '', tokenUid = '' }) {
  const [showHistory, setShowHistory] = useState(false);
  const isSelectedChain = !selectedChainId || Number(selectedChainId) === Number(chainId);
  const chainRecord = web3Config.getChainRecordById(chainId);
  const canRead = Boolean(isSelectedChain && chainRecord?.platformControllerAddress && tokenAddress);
  const explorerBase = String(chainRecord?.explorerUrl || '').replace(/\/$/, '');
  const explorerLink = /^https:\/\/[^\s/?#]+/.test(explorerBase) && /^0x[a-fA-F0-9]{40}$/.test(String(tokenAddress || ''))
    ? `${explorerBase}/address/${tokenAddress}`
    : '';
  const query = useQuery({
    queryKey: ['marketplace', 'public-price-events', chainId || 'unknown', tokenUid, tokenAddress || ''],
    queryFn: ({ signal }) => fetchRecentPublicPriceEvents({ chainId, tokenAddress, signal }),
    enabled: canRead && showHistory,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="price-history-panel price-history-panel--investor" aria-label="Recent public blockchain price updates">
      <div className="price-history-heading">
        <div className="price-history-heading__icon" aria-hidden="true"><History size={20} /></div>
        <div className="price-history-heading__copy">
          <h2>Recent on-chain price changes</h2>
          <p>See publicly recorded price-change transactions for this asset.</p>
        </div>
        {showHistory ? <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => query.refetch()} disabled={!canRead || query.isFetching}>Refresh</Button> : <Button size="sm" variant="secondary" onClick={() => setShowHistory(true)} disabled={!canRead}>View changes</Button>}
      </div>
      <p className="price-history-note">This shows a limited recent window of publicly recorded blockchain events—not the issuer’s full audit. Database-only price changes and pending or failed requests are not included. The current investment price is shown above.</p>
      {!canRead ? <div className="price-history-message">{!isSelectedChain ? "Switch to this asset’s network to view its blockchain events." : "On-chain price events are not available for this asset yet."}</div> : null}
      {showHistory && canRead && query.isPending ? <div className="price-history-message" role="status">Checking recent confirmed blockchain events…</div> : null}
      {showHistory && canRead && query.isError ? <div className="price-history-message" role="alert">
        The public blockchain provider could not load price-change events. Your investment details are unaffected. Try Refresh later.
        {explorerLink ? <div className="price-history-fallback-link"><a className="price-history-transaction" href={explorerLink} target="_blank" rel="noopener noreferrer">View asset transactions on explorer <ArrowUpRight size={13} /></a></div> : null}
      </div> : null}
      {showHistory && query.isSuccess && query.data.partial ? <div className="price-history-message price-history-message--notice" role="status">Only part of the recent blockchain history could be checked. The public provider limited further requests; you can try Refresh later.</div> : null}
      {showHistory && query.isSuccess && !query.data.pricePrecisionAvailable && query.data.items.length > 0 ? <div className="price-history-message price-history-message--notice" role="status">Price amounts are hidden because the on-chain price precision could not be verified. Transaction links remain available.</div> : null}
      {showHistory && query.isSuccess && !query.data.items.length ? <div className="price-history-message">No price-change events were found in the recent blocks checked. Earlier activity may exist.</div> : null}
      {showHistory && query.isSuccess && query.data.items.length ? (
        <div className="price-history-list price-history-list--public" aria-busy={query.isFetching}>
          <div className="price-history-column-headings" aria-hidden="true"><span>Date</span><span>Previous price</span><span>New price</span><span>Method</span><span>Status</span><span>Transaction</span></div>
          {query.data.items.map((row) => {
            const link = transactionExplorerUrl(row.transactionHash, row.chainId);
            return (
              <article className="price-history-row" key={row.uid}>
                <div className="price-history-cell" data-label="Date"><strong>{priceHistoryDate(row.createdAt)}</strong></div>
                <div className="price-history-cell" data-label="Previous price"><span className="price-history-price"><PriceValue value={row.oldPriceFormatted} suffix={symbol ? ` ${symbol}` : ''} /></span></div>
                <div className="price-history-cell" data-label="New price">
                  <span className="price-history-new-value">
                    <span className="price-history-price"><PriceValue value={row.newPriceFormatted} suffix={symbol ? ` ${symbol}` : ''} /></span>
                    <PriceHistoryChangeIndicator previous={row.oldPriceFormatted} current={row.newPriceFormatted} status="CONFIRMED" />
                  </span>
                </div>
                <div className="price-history-cell" data-label="Method"><PriceHistoryMethodChip onchain /></div>
                <div className="price-history-cell" data-label="Status"><PriceHistoryStatusChip status="CONFIRMED" /></div>
                <div className="price-history-cell" data-label="Transaction">{link ? <a className="price-history-transaction" href={link} target="_blank" rel="noopener noreferrer">View on explorer <ArrowUpRight size={13} /></a> : '—'}</div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
