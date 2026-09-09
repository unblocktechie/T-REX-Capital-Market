import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function InvestorFormCard({ title, description, children, className = '' }) {
  return (
    <Card className={`investor-form-card ${className}`}>
      {title || description ? (
        <header>
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
        </header>
      ) : null}
      {children}
    </Card>
  );
}

export function InvestorActionBar({ children }) {
  return <div className="investor-action-bar">{children}</div>;
}

export function StatusNotice({ type = 'info', title, children }) {
  return (
    <div className={`investor-status-notice investor-status-notice--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <CheckCircle2 size={19} aria-hidden="true" />
      <div><strong>{title}</strong>{children ? <p>{children}</p> : null}</div>
    </div>
  );
}

