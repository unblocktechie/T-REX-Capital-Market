import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';

export function DataTable({
  columns,
  rows = [],
  loading = false,
  rowKey = 'id',
  className,
  rowClassName,
  loadingRows = 5,
  emptyTitle = 'No matching records',
  emptyDescription = 'Try changing your filters or search terms.',
}) {
  return (
    <div className={cn('table-scroll app-data-table-scroll', className)}>
      <table className="data-table app-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  column.align === 'end' && 'app-data-table__align-end',
                  column.align === 'center' && 'app-data-table__align-center',
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRows }, (_, row) => (
                <tr key={`loading-${row}`}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.header || 'Actions'}
                      className={cn(
                        column.align === 'end' && 'app-data-table__align-end',
                        column.align === 'center' && 'app-data-table__align-center',
                        column.cellClassName,
                      )}
                    >
                      <Skeleton height={18} width="70%" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, index) => (
                <tr
                  key={typeof rowKey === 'function' ? rowKey(row, index) : row[rowKey] ?? index}
                  className={typeof rowClassName === 'function' ? rowClassName(row, index) : rowClassName}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-label={column.header || 'Actions'}
                      className={cn(
                        column.align === 'end' && 'app-data-table__align-end',
                        column.align === 'center' && 'app-data-table__align-center',
                        column.cellClassName,
                      )}
                    >
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
    </div>
  );
}
