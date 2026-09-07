import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function VerifiedCapabilityCard({ icon: Icon, eyebrow, title, description, status }) {
  return (
    <Card className="org-capability-card">
      <span className="org-capability-card__icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="org-capability-card__status">
        <CheckCircle2 size={15} /> {status}
      </span>
    </Card>
  );
}
