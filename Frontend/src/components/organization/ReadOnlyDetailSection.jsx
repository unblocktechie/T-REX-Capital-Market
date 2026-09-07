import { Card } from '@/components/ui/Card';

export function ReadOnlyDetailSection({ title, description, rows, action, id }) {
  return (
    <Card className="org-readonly-card" id={id}>
      <header className={action ? '!relative !block !pr-20' : undefined}>
        <div className="min-w-0">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? (
          <div className="!absolute !top-0 !right-0 [&_.button]:!w-auto">{action}</div>
        ) : null}
      </header>
      <dl className="org-detail-grid">
        {rows.map((row) => (
          <div key={row.label} className={row.wide ? 'is-wide' : ''}>
            <dt>{row.label}</dt>
            <dd>{row.value || '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
