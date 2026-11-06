import { useEffect, useId, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { TokenIcon } from '@/components/common/TokenIcon';
import { useYearPriceHistory } from './useHistoryData';
import {
  displayHistoryChartPrice, displayPriceTwoDecimals, exactPriceText,
  historyChartTooltipPrice, historyChartCoordinates,
  historyChartPriceTicks, historyChartDayTicks, priceHistoryDate, priceHistoryEffectiveTime,
  priceHistoryGraphRows, PRICE_GRAPH_RANGES,
} from '@/services/price-history/priceHistory.utils';

// Keep the historical order, including transactions in the same block. Chart
// coordinates are normalized from exact decimal strings before reaching Recharts
// so large/high-precision financial prices are never converted to floats.
const recordKey = (row, index) => row.priceUpdateUid || `${row.createdAt}-${index}`;

function PriceDot({ cx, cy, payload, index, activeKey, setSelectedKey, symbol }) {
  if (!payload || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const active = payload.key === activeKey;
  const choosePoint = () => setSelectedKey(payload.key);
  // On-chart labels use the value threshold; tooltips retain original precision.
  const priceLabel = `${displayHistoryChartPrice(payload.price)} ${symbol}`.trim();
  const firstPoint = index === 0 || payload.index === 0;
  const lastPoint = payload.isLastPoint;
  const nearTop = cy < 76;
  const labelX = cx + (firstPoint ? 7 : lastPoint ? -7 : 0);
  const labelAnchor = firstPoint ? 'start' : lastPoint ? 'end' : 'middle';
  const labelY = cy + (nearTop ? 28 : -16);
  return (
    <g
      className={`price-history-chart__point${active ? ' is-active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${priceHistoryDate(payload.time)}, price ${historyChartTooltipPrice(payload.price)} ${symbol}`.trim()}
      aria-pressed={active}
      onMouseEnter={choosePoint}
      onFocus={choosePoint}
      onClick={choosePoint}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choosePoint();
        }
      }}
      data-price-index={index}
    >
      <circle cx={cx} cy={cy} r={17} fill="transparent" className="price-history-chart__hit-area" />
      {active ? <circle cx={cx} cy={cy} r={11} className="price-history-chart__point-halo" pointerEvents="none" /> : null}
      <circle cx={cx} cy={cy} r={active ? 5.5 : 4} className="price-history-chart__point-dot" pointerEvents="none" />
      <text
        x={labelX} y={labelY} textAnchor={labelAnchor}
        className="price-history-chart__point-price"
        pointerEvents="none" aria-hidden="true"
      >{priceLabel}</text>
    </g>
  );
}

function PriceTooltip({ active, payload, symbol }) {
  const selected = active && payload?.[0]?.payload;
  if (!selected) return null;
  return (
    <div className="price-history-chart__tooltip" role="status">
      <span>{priceHistoryDate(selected.time)}</span>
      <strong>{historyChartTooltipPrice(selected.price)} {symbol}</strong>
    </div>
  );
}

export function PriceHistoryGraph({ viewer = 'issuer', symbol = '', tokenName = '', imageUrl = '', ...scope }) {
  const [months, setMonths] = useState(3);
  const gradientId = useId().replace(/:/g, '');
  const [selectedKey, setSelectedKey] = useState('');
  const query = useYearPriceHistory({ ...scope, viewer });
  const data = query.data;
  const visible = useMemo(() => priceHistoryGraphRows(data?.records || [], months), [data?.records, months]);
  const coordinates = useMemo(() => historyChartCoordinates(visible), [visible]);
  const ticks = useMemo(() => historyChartPriceTicks(visible), [visible]);
  const chartData = useMemo(() => coordinates.map((point, index) => ({
    index: point.x,
    normalizedPrice: 100 - point.y,
    key: recordKey(point.row, index),
    price: point.row.newPriceFormatted,
    time: priceHistoryEffectiveTime(point.row),
    isLastPoint: index === coordinates.length - 1,
  })), [coordinates]);
  // Space labels based on formatted value widths; enable scrolling on mobile.
  const widestPriceLabel = chartData.reduce((width, point) => Math.max(
    width, `${displayHistoryChartPrice(point.price)} ${symbol}`.trim().length,
  ), 0);
  const labelSpacing = Math.max(118, Math.ceil(widestPriceLabel * 6.6 * 1.6 + 12));
  const minimumChartWidth = Math.max(300, 148 + Math.max(0, chartData.length - 1) * labelSpacing);
  const dayTicks = useMemo(() => historyChartDayTicks(chartData), [chartData]);
  const dayLabels = new Map(dayTicks.map((day) => [day.index, day.label]));
  const foundIndex = chartData.findIndex((point) => point.key === selectedKey);
  const activeIndex = foundIndex >= 0 ? foundIndex : chartData.length - 1;
  const selected = visible[activeIndex];
  const currentPrice = selected?.newPriceFormatted;
  const currentTime = selected ? priceHistoryEffectiveTime(selected) : '';
  const axisTicks = ticks.length === 1 ? [50] : [0, 25, 50, 75, 100];
  const labelsByTick = new Map(ticks.map((tick) => [100 - tick.y, displayHistoryChartPrice(tick.price)]));

  useEffect(() => { setSelectedKey(''); }, [months, scope.chainUid, scope.tokenUid]);

  return (
    <section className={`price-history-panel price-history-chart${viewer === 'investor' ? ' price-history-panel--investor' : ''}`} aria-label="Token price history chart">
      <div className="price-history-heading">
        <div className="price-history-heading__icon" aria-hidden="true"><TrendingUp size={21} /></div>
        <div className="price-history-heading__copy">
          <h2>Price history</h2>
          <p>Explore recorded price changes. Select an update to see its price.</p>
        </div>
        <Button size="sm" variant="secondary" icon={RefreshCw} disabled={!query.enabled || query.isFetching} onClick={() => query.refetch()}>Refresh</Button>
      </div>
      <div className="price-history-chart__toolbar">
        <div className="price-history-range" role="group" aria-label="Price history time range">
          {PRICE_GRAPH_RANGES.map((range) => <button key={range.value} type="button" className={months === range.value ? 'is-active' : ''} aria-pressed={months === range.value} onClick={() => setMonths(range.value)}>{range.label}</button>)}
        </div>
        {chartData.length > 0 ? <div className="price-history-chart__legend" role="group" aria-label="Chart color legend">
          <span className="price-history-chart__legend-item is-line"><i aria-hidden="true" />Recorded price</span>
          <span className="price-history-chart__count">{visible.length} {visible.length === 1 ? 'update' : 'updates'}</span>
        </div> : null}
      </div>
      {!query.matchingNetwork ? (
        <div className="price-history-message">Select the asset’s network to see its price history.</div>
      ) : !query.enabled ? (
        <div className="price-history-message">This investment needs a token reference to load its history.</div>
      ) : query.isPending ? (
        <div className="price-history-message" role="status">Loading price history…</div>
      ) : query.isError ? (
        <div className="price-history-message" role="alert">Price history is unavailable right now. Try Refresh.</div>
      ) : !chartData.length ? (
        <div className="price-history-message" role="status">{viewer === 'investor'
          ? 'No price changes to show for this period. Try a longer time range, or check back after a new price update.'
          : 'No applied or confirmed price changes were recorded during this period.'}</div>
      ) : (
        <div className="price-history-chart__body">
          <div className="price-history-chart__visual">
            <div className="price-history-chart__plot-scroll" role="region" tabIndex={0} aria-label="Price chart; scroll horizontally to explore all price points">
              <div className="price-history-chart__plot" style={{ minWidth: `${minimumChartWidth}px` }} role="group" aria-label={`Recorded price updates, oldest to newest, over the past ${months} months. ${chartData.length} updates; choose a point to inspect its exact price.`}>
              <ResponsiveContainer width="100%" height="100%" debounce={60}>
                <ComposedChart data={chartData} margin={{ top: 28, right: 24, left: 0, bottom: 14 }} accessibilityLayer>
                  <defs>
                    <linearGradient id={`${gradientId}-price-history-area`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--price-history-line)" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="var(--price-history-line)" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 5" />
                  <XAxis
                    type="number" dataKey="index" domain={[0, 100]}
                    ticks={dayTicks.map((day) => day.index)}
                    tickFormatter={(value) => dayLabels.get(value) || ''}
                    interval="preserveStartEnd" minTickGap={14}
                    padding={{ left: 12, right: 12 }}
                    tickLine={false} axisLine={false} tickMargin={14} height={46}
                    tick={{ className: 'price-history-chart__day-tick' }}
                  />
                  <YAxis
                    type="number" domain={[0, 100]} ticks={axisTicks} interval={0}
                    width={72} tickLine={false} axisLine={false}
                    tick={{ className: 'price-history-chart__tick' }}
                    tickFormatter={(value) => {
                      const label = labelsByTick.get(value) || '';
                      return label.length > 11 ? `${label.slice(0, 10)}…` : label;
                    }}
                  />
                  <Tooltip
                    content={<PriceTooltip symbol={symbol} />}
                    isAnimationActive={false} offset={16}
                    position={{ y: 6 }}
                    allowEscapeViewBox={{ x: false, y: false }}
                    wrapperStyle={{ pointerEvents: 'none', zIndex: 5 }}
                    cursor={{ stroke: 'var(--primary-500)', strokeDasharray: '4 5' }}
                  />
                  <Area type="linear" dataKey="normalizedPrice" stroke="none" fill={`url(#${gradientId}-price-history-area)`} isAnimationActive={false} tooltipType="none" legendType="none" />
                  <Line
                    type="linear" dataKey="normalizedPrice" name="Recorded price" stroke="var(--price-history-line)"
                    strokeWidth={3} connectNulls isAnimationActive={false} activeDot={false}
                    className="price-history-chart__segment"
                    dot={(props) => <PriceDot {...props} activeKey={chartData[activeIndex]?.key} setSelectedKey={setSelectedKey} symbol={symbol} />}
                  />
                  {selectedKey && activeIndex >= 0 ? <ReferenceLine x={chartData[activeIndex].index} className="price-history-chart__crosshair" /> : null}
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </div>
          </div>
          {selected ? <div className="price-history-chart__details" aria-live="polite">
            <span className="price-history-chart__details-label">{selectedKey ? 'Selected price update' : 'Latest recorded price'}</span>
            <strong className="price-history-price" title={`${exactPriceText(currentPrice)} ${symbol}`.trim()} aria-label={`${exactPriceText(currentPrice)} ${symbol}`.trim()} tabIndex={0}>
              <TokenIcon size="xs" symbol={symbol} name={tokenName || symbol} imageUrl={imageUrl} />
              {displayPriceTwoDecimals(currentPrice)} {symbol}
            </strong>
            <small>{priceHistoryDate(currentTime)}</small>
          </div> : null}
          {!data.complete ? <p className="price-history-chart__hint" role="status">Only the latest {data.records.length} records are available; earlier updates may not be shown.</p> : null}
        </div>
      )}
    </section>
  );
}
