import { ChevronLeft, ChevronRight } from 'lucide-react';

const pageItems = (page, totalPages) => {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const items = [1];
  const windowStart = Math.max(2, Math.min(page - 1, totalPages - 3));
  const windowEnd = Math.min(totalPages - 1, windowStart + 2);

  if (windowStart > 2) items.push('start-ellipsis');
  for (let value = windowStart; value <= windowEnd; value += 1) items.push(value);
  if (windowEnd < totalPages - 1) items.push('end-ellipsis');
  items.push(totalPages);

  return items;
};

export function InvestorHistoryPagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  itemLabel = 'history',
}) {
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), Math.max(Number(totalPages) || 1, 1));
  const pageCount = Math.max(Number(totalPages) || 1, 1);

  if (pageCount <= 1) return null;

  const goToPage = (nextPage) => {
    if (disabled) return;
    const normalizedPage = Math.min(Math.max(Number(nextPage) || 1, 1), pageCount);
    if (normalizedPage !== currentPage) onPageChange(normalizedPage);
  };

  return (
    <nav className="investor-history-pagination" aria-label={`${itemLabel} pagination`}>
      <span className="investor-history-pagination__summary">
        Page <strong>{currentPage}</strong> of {pageCount}
      </span>

      <div className="investor-history-pagination__controls">
        <button
          type="button"
          className="investor-history-pagination__arrow"
          onClick={() => goToPage(currentPage - 1)}
          disabled={disabled || currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <div className="investor-history-pagination__pages" aria-label="Choose page">
          {pageItems(currentPage, pageCount).map((item) => (
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                className={`investor-history-pagination__page${item === currentPage ? ' is-active' : ''}`}
                onClick={() => goToPage(item)}
                disabled={disabled}
                aria-current={item === currentPage ? 'page' : undefined}
                aria-label={`Page ${item}`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="investor-history-pagination__ellipsis" aria-hidden="true">…</span>
            )
          ))}
        </div>

        <button
          type="button"
          className="investor-history-pagination__arrow"
          onClick={() => goToPage(currentPage + 1)}
          disabled={disabled || currentPage >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
