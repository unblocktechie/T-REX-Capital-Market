import { Check, Circle, SearchCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const timeline = [
  {
    title: 'Submission Received',
    description: 'Your organization application and documentation have been securely recorded.',
    state: 'complete',
  },
  {
    title: 'Regulatory Audit',
    description: 'The compliance team is validating jurisdiction, ownership, and legal filings.',
    state: 'active',
  },
  {
    title: 'Token Issuance Ready',
    description: 'Compliant issuance capabilities unlock after the KYB review is approved.',
    state: 'pending',
  },
];

export function VerificationTimeline() {
  return (
    <Card className="org-timeline-card">
      <header>
        <span className="org-timeline-card__icon"><SearchCheck size={21} /></span>
        <div>
          <h2>Verification timeline</h2>
          <p>Current compliance review progress</p>
        </div>
      </header>
      <ol>
        {timeline.map((item) => (
          <li key={item.title} className={`is-${item.state}`}>
            <span className="org-timeline__marker">
              {item.state === 'complete' ? <Check size={16} /> : <Circle size={12} />}
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              <small>{item.state === 'complete' ? 'Completed' : item.state === 'active' ? 'In progress' : 'Pending'}</small>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
