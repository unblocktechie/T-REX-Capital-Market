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
    description: 'Your organization details, ownership and legal documents are being reviewed.',
    state: 'active',
  },
  {
    title: 'Token Issuance Ready',
    description: 'Token creation becomes available after your organization is approved.',
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
          <p>Current organization review progress</p>
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
