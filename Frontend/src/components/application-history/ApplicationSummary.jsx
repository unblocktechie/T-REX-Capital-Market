import { CheckCircle2, Clock3, ShoppingCart, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/utils/date';

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const summaryStatusMeta = (status) => {
  const value = normalizeStatus(status);
  if (['verifiedbyissuer', 'verified'].includes(value)) return { label: 'Action Required', tone: 'warning', Icon: Clock3 };
  if (value === 'claimsubmitted') return { label: 'Verification Submitted', tone: 'pending', Icon: CheckCircle2 };
  if (value === 'approved') return { label: 'Approved', tone: 'success', Icon: CheckCircle2 };
  if (value === 'rejected') return { label: 'Rejected', tone: 'danger', Icon: XCircle };
  if (value === 'cancelled') return { label: 'Cancelled', tone: 'neutral', Icon: XCircle };
  if (value === 'pending') return { label: 'Action Required', tone: 'warning', Icon: Clock3 };
  return { label: 'Pending Review', tone: 'pending', Icon: Clock3 };
};

export function ApplicationSummary({ application, history, purchaseReady = false, onPurchase }) {
  const status = application?.interest?.status || history?.status || application?.status || '';
  const meta = purchaseReady
    ? { label: 'Action Required', tone: 'warning', Icon: CheckCircle2 }
    : summaryStatusMeta(status);
  const Icon = meta.Icon;
  const issuer = application?.issuer && application.issuer !== '—' ? application.issuer : '—';
  const token = [application?.name, application?.symbol ? `(${application.symbol})` : ''].filter(Boolean).join(' ');
  const datedEvents = [...(history?.timeline || [])].filter((event) => event?.createdAt);
  const initialSubmission = datedEvents
    .filter((event) => String(event?.eventType || '').toLowerCase() === 'submitted')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const latestEvent = datedEvents
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const submittedAt = initialSubmission?.createdAt || application?.submittedAt;
  const lastUpdatedAt = latestEvent?.createdAt || application?.updatedAt || application?.decisionAt || submittedAt;

  return (
    <Card className={`application-detail-summary application-detail-summary--${meta.tone}`}>
      <div className="application-detail-summary__status">
        <span className="application-detail-summary__status-icon"><Icon size={28} /></span>
        <span className={`application-detail-summary__badge is-${meta.tone}`}>{meta.label}</span>
        {purchaseReady ? (
          <>
            <p>You are eligible to invest in this token. Choose Invest to continue.</p>
            {onPurchase ? (
              <Button className="application-detail-summary__purchase" icon={ShoppingCart} onClick={onPurchase}>
                Invest
              </Button>
            ) : null}
          </>
        ) : meta.tone === 'danger' ? (
          <p>Your application was rejected. Please review the reason.</p>
        ) : ['verifiedbyissuer', 'verified'].includes(normalizeStatus(status)) ? (
          <p>Your application has been approved. Complete the required verification to unlock investing in this token.</p>
        ) : normalizeStatus(status) === 'claimsubmitted' ? (
          <p>Your required verification has been submitted successfully. The issuer is completing the final approval step.</p>
        ) : meta.tone === 'success' ? (
          <p>Your application has been approved by the issuer.</p>
        ) : (
          <p>Track the latest application status and review each submission below.</p>
        )}
      </div>

      <div className="application-detail-summary__grid">
        <div><span>Application ID</span><strong>{application?.interestUid || history?.interestUid || '—'}</strong></div>
        <div><span>Issuer</span><strong>{issuer}</strong></div>
        <div><span>Token</span><strong>{token || history?.tokenName || '—'}</strong></div>
        <div><span>Submitted</span><strong>{formatDate(submittedAt, 'MMM DD, YYYY hh:mm A')}</strong></div>
        <div><span>Last Updated</span><strong>{formatDate(lastUpdatedAt, 'MMM DD, YYYY hh:mm A')}</strong></div>
        <div><span>Current Status</span><strong className={`application-detail-summary__status-text is-${meta.tone}`}>{meta.label}</strong></div>
      </div>
    </Card>
  );
}
