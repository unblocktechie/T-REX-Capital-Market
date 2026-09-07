import { CheckCircle2, HelpCircle, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function OrganizationInfoPanel({ eyebrow = 'Institutional onboarding', title, description, items }) {
  return (
    <aside className="org-side-stack" aria-label={title}>
      <Card className="org-info-card org-info-card--primary">
        <span className="org-info-card__icon">
          <ShieldCheck size={24} />
        </span>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <ul>
          {items.map((item) => (
            <li key={item}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="org-help-card">
        <span>
          <HelpCircle size={20} />
        </span>
        <div>
          <strong>Need onboarding assistance?</strong>
          <p>Review your legal records before continuing. Drafts remain stored securely in this browser.</p>
        </div>
      </Card>
    </aside>
  );
}
