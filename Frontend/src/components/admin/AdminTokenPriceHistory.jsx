import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ExternalLink, LineChart as LineChartIcon, Table2 } from 'lucide-react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { PriceValue } from '@/components/common/PriceValue';
import { adminMonitoringApi } from '@/api/admin';
import { getErrorMessage } from '@/utils/error';
import {
  PriceHistoryChangeIndicator, PriceHistoryMethodChip, PriceHistoryStatusChip,
} from '@/components/price-history/PriceHistoryIndicators';
import {
  displayHistoryChartPrice, displayPriceTwoDecimals, exactPriceText,
  historyChartCoordinates, historyChartDayTicks, historyChartPriceTicks,
  historyChartTooltipPrice, priceHistoryDate, priceHistoryEffectiveTime,
  priceHistoryGraphRows, priceHistoryActor, PRICE_GRAPH_RANGES,
} from '@/services/price-history/priceHistory.utils';
import { transactionExplorerUrl } from '@/utils/blockExplorer';
import '@/assets/styles/price-history.css';
import { sortAdminTokenHistoryPage } from '@/utils/adminTokenModalSort';

const HISTORY_PAGE_SIZE = 5;
const CHART_QUERY_LIMIT = 100; // Read-only admin endpoint limit. May represent a partial history.

function HistoryPrice({ value, symbol }) {
  if (exactPriceText(value) === '—') return <span>—</span>;
  return <span className="price-history-price">
    <span className="price-history-price__amount"><PriceValue value={value}/></span>
    {symbol && <span className="price-history-currency">{symbol}</span>}
  </span>;
}

function HistoryChartDot({ cx, cy, payload, activeKey, setSelectedKey, symbol }) {
  if (!payload || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const active = payload.key === activeKey;
  const select = () => setSelectedKey(payload.key);
  const first = payload.index === 0;
  const last = payload.isLastPoint;
  const price = `${displayHistoryChartPrice(payload.price)} ${symbol}`.trim();
  return <g className={`price-history-chart__point${active ? ' is-active' : ''}`}
    role="button" tabIndex={0}
    aria-label={`${priceHistoryDate(payload.time)}, price ${historyChartTooltipPrice(payload.price)} ${symbol}`.trim()}
    aria-pressed={active} onMouseEnter={select} onFocus={select} onClick={select}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}>
    <circle cx={cx} cy={cy} r={17} fill="transparent" className="price-history-chart__hit-area"/>
    {active && <circle cx={cx} cy={cy} r={11} className="price-history-chart__point-halo" pointerEvents="none"/>}
    <circle cx={cx} cy={cy} r={active ? 5.5 : 4} className="price-history-chart__point-dot" pointerEvents="none"/>
    <text x={cx + (first ? 7 : last ? -7 : 0)} y={cy + (cy < 76 ? 28 : -16)}
      textAnchor={first ? 'start' : last ? 'end' : 'middle'}
      className="price-history-chart__point-price" pointerEvents="none" aria-hidden="true">{price}</text>
  </g>;
}

function HistoryChartTooltip({ active, payload, symbol }) {
  const point = active && payload?.[0]?.payload;
  if (!point) return null;
  return <div className="price-history-chart__tooltip" role="status">
    <span>{priceHistoryDate(point.time)}</span>
    <strong>{historyChartTooltipPrice(point.price)} {symbol}</strong>
  </div>;
}

// The chart uses the same presentation, exact-price utilities, and three time
// windows as issuer/investor charts, but fetches ONLY the admin-scoped endpoint.
function AdminHistoryChart({ items, token, symbol, truncated, months }) {
  const [selectedKey, setSelectedKey] = useState('');
  const gradientId = useId().replace(/:/g, '');
  const visible = useMemo(() => priceHistoryGraphRows(items, months), [items, months]);
  const coordinates = useMemo(() => historyChartCoordinates(visible), [visible]);
  const priceTicks = useMemo(() => historyChartPriceTicks(visible), [visible]);
  const points = useMemo(() => coordinates.map(({ row, x, y }, index) => ({
    index: x,
    normalizedPrice: 100 - y,
    key: row.priceUpdateUid || `${row.createdAt}-${index}`,
    price: row.newPriceFormatted,
    time: priceHistoryEffectiveTime(row),
    isLastPoint: index === coordinates.length - 1,
  })), [coordinates]);
  const dayTicks = useMemo(() => historyChartDayTicks(points), [points]);
  const daysByIndex = new Map(dayTicks.map(({ index, label }) => [index, label]));
  const pricesByTick = new Map(priceTicks.map(({ y, price }) => [100 - y, displayHistoryChartPrice(price)]));
  const longest = points.reduce((size, point) => Math.max(size, `${displayHistoryChartPrice(point.price)} ${symbol}`.trim().length), 0);
  const minimumWidth = Math.max(300, 148 + Math.max(0, points.length - 1) * Math.max(118, Math.ceil(longest * 10.56 + 12)));
  const selectedIndex = points.findIndex((point) => point.key === selectedKey);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : points.length - 1;
  const selected = visible[activeIndex];
  useEffect(() => { setSelectedKey(''); }, [months, token?.tokenUid]);

  return <div className="price-history-chart" aria-label="Token price history chart">
    {!points.length ? <p className="price-history-message" role="status">No applied or confirmed price changes were recorded during this period. Use Table to see other statuses.</p>
      : <div className="price-history-chart__body">
        <div className="price-history-chart__visual">
          <div className="price-history-chart__plot-scroll" role="region" tabIndex={0}
            aria-label="Price chart; scroll horizontally to explore all price points">
            <div className="price-history-chart__plot" style={{ minWidth: `${minimumWidth}px` }}>
              <ResponsiveContainer width="100%" height="100%" debounce={60}>
                <ComposedChart data={points} margin={{ top: 28, right: 24, left: 0, bottom: 14 }} accessibilityLayer>
                  <defs><linearGradient id={`${gradientId}-price-area`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--price-history-line)" stopOpacity={0.16}/>
                    <stop offset="100%" stopColor="var(--price-history-line)" stopOpacity={0.01}/>
                  </linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 5"/>
                  <XAxis type="number" dataKey="index" domain={[0, 100]} ticks={dayTicks.map(({ index }) => index)}
                    tickFormatter={(index) => daysByIndex.get(index) || ''} interval="preserveStartEnd"
                    minTickGap={14} padding={{ left: 12, right: 12 }} tickLine={false} axisLine={false}
                    tickMargin={14} height={46} tick={{ className: 'price-history-chart__day-tick' }}/>
                  <YAxis type="number" domain={[0, 100]}
                    ticks={priceTicks.length === 1 ? [50] : [0, 25, 50, 75, 100]}
                    interval={0} width={72} tickLine={false} axisLine={false}
                    tick={{ className: 'price-history-chart__tick' }}
                    tickFormatter={(y) => { const label = pricesByTick.get(y) || ''; return label.length > 11 ? `${label.slice(0, 10)}…` : label; }}/>
                  <Tooltip content={<HistoryChartTooltip symbol={symbol}/>} isAnimationActive={false}
                    position={{ y: 6 }} offset={16} allowEscapeViewBox={{ x: false, y: false }}
                    wrapperStyle={{ pointerEvents: 'none', zIndex: 5 }}
                    cursor={{ stroke: 'var(--primary-500)', strokeDasharray: '4 5' }}/>
                  <Area type="linear" dataKey="normalizedPrice" stroke="none"
                    fill={`url(#${gradientId}-price-area)`} isAnimationActive={false} tooltipType="none" legendType="none"/>
                  <Line type="linear" dataKey="normalizedPrice" name="Recorded price" stroke="var(--price-history-line)"
                    strokeWidth={3} connectNulls isAnimationActive={false} activeDot={false}
                    className="price-history-chart__segment"
                    dot={(props) => <HistoryChartDot {...props} activeKey={points[activeIndex]?.key}
                      setSelectedKey={setSelectedKey} symbol={symbol}/>}/>
                  {selectedKey && activeIndex >= 0 && <ReferenceLine x={points[activeIndex].index} className="price-history-chart__crosshair"/>}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        {selected && <div className="price-history-chart__details" aria-live="polite">
          <span className="price-history-chart__details-label">{selectedKey ? 'Selected price update' : 'Latest recorded price'}</span>
          <strong className="price-history-price" tabIndex={0} title={`${exactPriceText(selected.newPriceFormatted)} ${symbol}`.trim()}>
            {displayPriceTwoDecimals(selected.newPriceFormatted)} {symbol}
          </strong>
          <small>{priceHistoryDate(priceHistoryEffectiveTime(selected))}</small>
        </div>}
        {truncated && <p className="price-history-chart__hint" role="status">Showing up to the latest 100 updates. Earlier updates may not appear in this chart; switch to Table for the full paginated history.</p>}
      </div>}
  </div>;
}

function AdminHistoryTable({ records, token, symbol, pagination, page, setPage, fetching }) {
  const [sort, setSort] = useState({ field: '', order: 'asc' });
  const sortedRecords = useMemo(() => sortAdminTokenHistoryPage(records, sort.field, sort.order), [records, sort]);
  const changeSort = (field) => setSort((current) => ({ field, order: current.field === field && current.order === 'asc' ? 'desc' : 'asc' }));
  const sortHeading = (label, field) => <button type="button" onClick={() => changeSort(field)}
    aria-label={`Sort by ${label} ${sort.field === field && sort.order === 'asc' ? 'descending' : 'ascending'}`}
    aria-pressed={sort.field === field}
    className="inline-flex min-h-8 items-center gap-1 rounded-md text-left font-semibold text-slate-500 transition-colors hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
    {label.toUpperCase()}{sort.field === field ? sort.order === 'asc' ? <ArrowUp className="size-3.5 shrink-0 text-blue-600" aria-hidden="true"/> : <ArrowDown className="size-3.5 shrink-0 text-blue-600" aria-hidden="true"/> : <ArrowUpDown className="size-3.5 shrink-0 text-slate-400" aria-hidden="true"/>}
  </button>;
  const total = pagination.total || 0;
  const pages = Math.max(1, pagination.totalPages || 1);
  const actualPage = Math.min(page, pages);
  const start = records.length ? (actualPage - 1) * HISTORY_PAGE_SIZE + 1 : 0;
  const end = records.length ? Math.min(total, start + records.length - 1) : 0;
  const firstPage = Math.max(1, Math.min(actualPage - 1, pages - 2));
  const shownPages = Array.from({ length: Math.min(3, pages) }, (_, index) => firstPage + index);
  return <>
    <div className="price-history-list" aria-busy={fetching}>
      <div className="admin-history-mobile-sort">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
          <label htmlFor="admin-token-history-sort" className="shrink-0">Sort by</label>
          <select id="admin-token-history-sort" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900"
            aria-label="Sort price history by" value={sort.field} onChange={(event) => setSort({ field: event.target.value, order: 'asc' })}>
            <option value="">Default order</option>
            <option value="date">Date and time</option><option value="previousPrice">Previous price</option>
            <option value="newPrice">New price</option><option value="method">Method</option><option value="status">Status</option>
          </select>
          <button type="button" className="min-h-10 rounded-lg border border-slate-200 px-3" aria-label="Reverse price history sort" onClick={() => setSort((current) => ({ ...current, order: current.order === 'asc' ? 'desc' : 'asc' }))}><ArrowUpDown className="size-4" aria-hidden="true"/></button>
        </div>
      </div>
      <div className="price-history-column-headings">
        <span>{sortHeading('Date and Time', 'date')}</span><span>{sortHeading('Previous Price', 'previousPrice')}</span><span>{sortHeading('New Price', 'newPrice')}</span>
        <span>{sortHeading('Method', 'method')}</span><span>{sortHeading('Status', 'status')}</span><span>TRANSACTION</span>
      </div>
      {sortedRecords.map((row, index) => {
        const explorer = transactionExplorerUrl(row.transactionHash, row.chainId || token?.chainId);
        const actor = priceHistoryActor(row);
        return <article key={row.priceUpdateUid || `${row.createdAt}-${index}`} className="price-history-row" aria-label={`Price update ${row.priceUpdateUid || index}`}>
          <div className="price-history-cell price-history-cell--date" data-label="Date and time">
            <strong>{priceHistoryDate(row.createdAt)}</strong>
            {actor !== '—' && <small className="block" title={`Updated by ${actor}`}>By {`${actor.slice(0, 10)}…${actor.slice(-6)}`}</small>}
          </div>
          <div className="price-history-cell" data-label="Previous price"><HistoryPrice value={row.oldPriceFormatted} symbol={symbol}/></div>
          <div className="price-history-cell" data-label="New price"><span className="price-history-new-value">
            <HistoryPrice value={row.newPriceFormatted} symbol={symbol}/>
            <PriceHistoryChangeIndicator previous={row.oldPriceFormatted} current={row.newPriceFormatted} status={row.status}/>
          </span></div>
          <div className="price-history-cell" data-label="Method"><PriceHistoryMethodChip row={row}/></div>
          <div className="price-history-cell" data-label="Status"><PriceHistoryStatusChip status={row.status}/></div>
          <div className="price-history-cell price-history-cell--transaction" data-label="Transaction">
            {explorer ? <a href={explorer} className="price-history-transaction" target="_blank" rel="noopener noreferrer">
              View transaction <ExternalLink size={14} aria-hidden="true"/>
            </a> : <span aria-label="No transaction recorded">—</span>}
          </div>
        </article>;
      })}
    </div>
    <div className="price-history-pagination" aria-busy={fetching}>
      <small aria-live="polite">Showing {start}–{end} of {total} updates · Page {actualPage} of {pages}</small>
      {pages > 1 && <nav className="price-history-pagination__controls" aria-label="Price update pages">
        <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm disabled:opacity-40"
          disabled={actualPage <= 1 || fetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          <ArrowLeft size={14}/>Previous
        </button>
        {shownPages.map((number) => <button key={number} type="button"
          className={`price-history-pagination__page${actualPage === number ? ' is-active' : ''}`}
          aria-label={`Page ${number}`} aria-current={actualPage === number ? 'page' : undefined}
          disabled={fetching} onClick={() => setPage(number)}>{number}</button>)}
        <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm disabled:opacity-40"
          disabled={actualPage >= pages || fetching} onClick={() => setPage((value) => Math.min(pages, value + 1))}>
          Next<ArrowRight size={14}/>
        </button>
      </nav>}
    </div>
  </>;
}

// This view never scans an RPC or uses the selected network. The backend derives
// issuer and chain from the selected token ID in the authenticated admin path.
export function AdminTokenPriceHistory({ token, tokenUid: selectedTokenUid, paymentSymbol = '' }) {
  const [view, setView] = useState('chart');
  const [months, setMonths] = useState(3);
  const [page, setPage] = useState(1);
  const tokenUid = selectedTokenUid || token?.tokenUid;
  const limit = view === 'table' ? HISTORY_PAGE_SIZE : CHART_QUERY_LIMIT;
  const requestPage = view === 'table' ? page : 1;
  const query = useQuery({
    queryKey: ['admin', 'token-price-history', tokenUid, requestPage, limit],
    queryFn: () => adminMonitoringApi.getTokenPriceHistory(tokenUid, {
      page: requestPage, limit, source: 'all', status: 'all', search: '',
    }),
    enabled: Boolean(tokenUid),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });
  const records = query.data?.items || [];
  const pagination = query.data?.pagination || {};
  const totalPages = Math.max(1, pagination.totalPages || 1);
  useEffect(() => {
    if (view === 'table' && query.isSuccess && page > totalPages) setPage(totalPages);
  }, [view, page, totalPages, query.isSuccess]);

  const switchView = (next) => { setView(next); setPage(1); };
  return <section className="price-history-panel price-history-panel--investor price-history-panel--admin min-w-0" aria-label="Admin token price history">
    <div className="price-history-chart__toolbar admin-history-controls">
      {view === 'chart' && <div className="price-history-range" role="group" aria-label="Price history time range">
        {PRICE_GRAPH_RANGES.map((range) => <button key={range.value} type="button"
          className={months === range.value ? 'is-active' : ''}
          aria-pressed={months === range.value} onClick={() => setMonths(range.value)}>{range.label}</button>)}
      </div>}
      <div className="ml-auto inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Price history view">
        {[['chart', LineChartIcon, 'Chart'], ['table', Table2, 'Table']].map(([key, Icon, label]) =>
          <button key={key} type="button" aria-pressed={view === key} onClick={() => switchView(key)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${view === key ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white'}`}>
            <Icon size={16}/>{label}
          </button>)}
      </div>
    </div>
    {!tokenUid && <div className="price-history-message">Token history is unavailable without a token ID.</div>}
    {query.isPending && tokenUid && <div className="price-history-message" role="status">Loading price history…</div>}
    {query.isError && <div className="price-history-message" role="alert">{getErrorMessage(query.error, 'Price history is unavailable. Please try again.')}</div>}
    {query.isSuccess && records.length === 0 && <div className="price-history-message">No price updates have been recorded yet.</div>}
    {query.isSuccess && records.length > 0 && (view === 'chart'
      ? <AdminHistoryChart items={records} token={token} symbol={paymentSymbol} months={months}
          truncated={(pagination.total || 0) > records.length}/>
      : <AdminHistoryTable records={records} token={token} symbol={paymentSymbol}
          pagination={pagination} page={page} setPage={setPage} fetching={query.isFetching}/>)}
  </section>;
}
