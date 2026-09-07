import { Card } from '@/components/ui/Card';

export function FormSection({ title, description, children, className = '' }) {
  return (
    <Card className={`org-form-card ${className}`}>
      <header className="org-form-card__header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </Card>
  );
}
