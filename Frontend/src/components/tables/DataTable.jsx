import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function DataTable({ columns, rows = [], loading = false, rowKey = 'id' }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, row) => (
                <tr key={row}>
                  {columns.map((column) => (
                    <td key={column.key} data-label={column.header || 'Actions'}>
                      <Skeleton height={18} width="70%" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={row[rowKey]}>
                  {columns.map((column) => (
                    <td key={column.key} data-label={column.header || 'Actions'}>
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try changing your filters or search terms."
        />
      ) : null}
    </div>
  );
}
