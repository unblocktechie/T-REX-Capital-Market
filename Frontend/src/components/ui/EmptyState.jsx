import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'Nothing here yet',
  description = 'New items will appear here.',
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Inbox size={24} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
