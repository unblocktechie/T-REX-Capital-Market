import { Card } from '@/components/ui/Card';
import { formatDate } from '@/utils/date';
import { getInvestmentJourney } from '@/utils/investmentJourney';

export function ApplicationSummary({ application, history, purchaseReady = false }) {
  const status = application?.interest?.status || history?.summary?.status || history?.status || application?.status || '';
  const journey = getInvestmentJourney({ status, viewerRole: 'investor', purchaseReady });
  const issuer = application?.issuer && application.issuer !== '—' ? application.issuer : '—';
  const asset = [application?.name, application?.symbol ? `(${application.symbol})` : ''].filter(Boolean).join(' ');
  const datedEvents = [...(history?.timeline || [])].filter((event) => event?.createdAt);
  const initialSubmission = datedEvents
    .filter((event) => String(event?.eventType || '').toLowerCase() === 'submitted')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const latestEvent = datedEvents
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const submittedAt = initialSubmission?.createdAt || application?.submittedAt;
  const lastUpdatedAt = latestEvent?.createdAt || application?.updatedAt || application?.decisionAt || submittedAt;

  return (
    <Card className="application-detail-summary application-detail-summary--overview">
      <div className="application-detail-summary__overview-heading">
        <span className="eyebrow">Application overview</span>
        <h2>Key details</h2>
        <p>Your application information stays here while the journey above shows what needs to happen next.</p>
      </div>

      <div className="application-detail-summary__grid">
        <div><span>Application ID</span><strong>{application?.interestUid || history?.interestUid || '—'}</strong></div>
        <div><span>Issuer</span><strong>{issuer}</strong></div>
        <div><span>Asset</span><strong>{asset || history?.tokenName || '—'}</strong></div>
        <div><span>Submitted</span><strong>{formatDate(submittedAt, 'MMM DD, YYYY hh:mm A')}</strong></div>
        <div><span>Last updated</span><strong>{formatDate(lastUpdatedAt, 'MMM DD, YYYY hh:mm A')}</strong></div>
        <div><span>Current position</span><strong className={`application-detail-summary__status-text is-${journey.tone}`}>{journey.statusLabel}</strong></div>
      </div>
    </Card>
  );
}
