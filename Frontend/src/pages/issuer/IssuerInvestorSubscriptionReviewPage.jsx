import { useMemo, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Info,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { formatDate } from '@/utils/date';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/error';

const statusMeta = (status) => {
  const value = String(status || '').toLowerCase();
  if (['approved', 'verified'].includes(value)) return { label: value === 'approved' ? 'Approved' : 'Verified', tone: 'success' };
  if (value === 'rejected') return { label: 'Rejected', tone: 'danger' };
  if (value === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  return { label: 'Pending Review', tone: 'warning' };
};

function ReviewStatusBadge({ status }) {
  const meta = statusMeta(status);
  const tone = meta.tone === 'warning' ? 'pending' : meta.tone;
  return <AppStatusBadge status={status} label={meta.label} tone={tone} />;
}

const filenameFromDisposition = (value, fallback) => {
  const match = String(value || '').match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
  if (!match?.[1]) return fallback;
  try { return decodeURIComponent(match[1].replace(/^"|"$/g, '')); } catch { return match[1].replace(/^"|"$/g, ''); }
};

function ClaimReviewCard({ topic, onDownload, onView, downloadingDocumentUid, viewingDocumentUid }) {
  const satisfied = topic.satisfied === true;
  return (
    <Card className="issuer-review-card">
      <header className="issuer-review-card__header">
        <div>
          <div className="issuer-review-card__title-row"><span className="issuer-review-card__icon"><ClipboardList size={18} /></span><h2>{topic.label || topic.claimTopicCode || 'Required Claim Topic'}</h2></div>
          <p>{topic.description || 'Review the investor documents associated with this required claim topic.'}</p>
        </div>
        <span className={cn('issuer-claim-state', satisfied ? 'issuer-claim-state--success' : 'issuer-claim-state--warning')}>
          {satisfied ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{satisfied ? 'Satisfied' : 'Missing'}
        </span>
      </header>

      <div className="issuer-review-card__documents">
        {topic.documents?.length ? topic.documents.map((document) => (
          <div className="issuer-document-row" key={document.documentUid || document.id}>
            <div className="issuer-document-row__file"><span><FileText size={16} /></span><div><strong>{document.name}</strong><small>{[document.file, document.size, document.claimTopicCode].filter(Boolean).join(' · ')}</small></div></div>
            <div className="issuer-document-row__actions">
              <Button variant="secondary" size="sm" icon={Eye} loading={viewingDocumentUid === document.documentUid} onClick={() => onView(document)}>View</Button>
              <Button variant="secondary" size="sm" icon={Download} loading={downloadingDocumentUid === document.documentUid} onClick={() => onDownload(document)}>Download</Button>
            </div>
          </div>
        )) : <div className="issuer-empty-topic-documents"><Info size={16} /><span>No matching document was returned for this required claim topic.</span></div>}
      </div>
    </Card>
  );
}

export default function IssuerInvestorSubscriptionReviewPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingDocumentUid, setDownloadingDocumentUid] = useState('');
  const [viewingDocumentUid, setViewingDocumentUid] = useState('');

  useDocumentTitle(request ? `${request.investorName} · Compliance Review` : 'Compliance Review');

  useEffect(() => {
    let active = true;
    setLoading(true);
    issuerInvestorSubscriptionsService
      .getRequest(requestId)
      .then((data) => active && setRequest(data))
      .catch((error) => active && toast.error(getErrorMessage(error, 'Unable to load this investment interest.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [requestId]);

  const topics = useMemo(() => {
    if (request?.eligibility?.topics?.length) return request.eligibility.topics;
    if (request?.claims) {
      return Object.entries(request.claims).map(([key, claim]) => ({
        id: key,
        claimTopicCode: key === 'accredited' ? 'ACCREDITED_INVESTOR' : key.toUpperCase(),
        label: claim.title,
        description: claim.description,
        satisfied: claim.status === 'verified',
        documents: claim.documents || [],
      }));
    }
    return [];
  }, [request]);

  const fetchDocumentBlob = async (document) => {
    if (!document.documentUid) throw new Error('This document does not include a download identifier.');
    return issuerInvestorSubscriptionsService.downloadDocument(request.interestUid || requestId, document.documentUid);
  };

  const handleDownload = async (document) => {
    setDownloadingDocumentUid(document.documentUid);
    try {
      const result = await fetchDocumentBlob(document);
      const url = URL.createObjectURL(result.blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filenameFromDisposition(result.contentDisposition, document.file || document.name || 'investor-document');
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to download this investor document.'));
    } finally {
      setDownloadingDocumentUid('');
    }
  };

  const handleView = async (document) => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      toast.error('Allow pop-ups to preview investor documents.');
      return;
    }
    popup.opener = null;
    setViewingDocumentUid(document.documentUid);
    try {
      const result = await fetchDocumentBlob(document);
      const url = URL.createObjectURL(result.blob);
      popup.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup.close();
      toast.error(getErrorMessage(error, 'Unable to open this investor document.'));
    } finally {
      setViewingDocumentUid('');
    }
  };

  if (loading) return <div className="page-stack issuer-investor-review-page"><div className="issuer-loading-shell" /><div className="issuer-loading-shell issuer-loading-shell--tall" /></div>;

  if (!request) {
    return <Card className="issuer-review-not-found"><h1>Request not found</h1><p>The selected investment interest could not be loaded.</p><Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.investors)}>Back to Requests</Button></Card>;
  }

  const activity = [
    request.submittedAt ? { id: 'submitted', label: 'Interest Submitted', at: request.submittedAt, note: 'The investor submitted this investment interest.' } : null,
    request.decisionAt ? { id: 'decision', label: `${statusMeta(request.status).label} Decision`, at: request.decisionAt, note: 'The request decision was recorded.' } : null,
  ].filter(Boolean);

  return (
    <div className="page-stack issuer-investor-review-page">
      <header className="issuer-review-header issuer-review-header--clean">
        <div className="issuer-review-header__identity">
          <h1>{request.investorName}</h1>
          <div><ReviewStatusBadge status={request.status} /><small>Interest ID: {request.interestUid || request.requestReference}</small></div>
          <p>Review required claim-topic documents submitted with this investment interest.</p>
        </div>
        <div className="issuer-review-header__actions">
          <Button variant="danger" icon={XCircle} disabled>Reject Request</Button>
          <Button icon={ShieldCheck} disabled>Verify Request</Button>
        </div>
      </header>

      <div className="issuer-review-layout">
        <div className="issuer-review-main">
          {topics.length ? topics.map((topic) => <ClaimReviewCard key={topic.id || topic.claimTopicCode} topic={topic} onDownload={handleDownload} onView={handleView} downloadingDocumentUid={downloadingDocumentUid} viewingDocumentUid={viewingDocumentUid} />) : (
            <Card className="issuer-review-card"><div className="issuer-empty-topic-documents"><Info size={18} /><span>No required claim-topic eligibility rows were returned for this interest.</span></div></Card>
          )}
        </div>

        <aside className="issuer-review-aside">
          <Card className="issuer-subscription-summary">
            <span className="issuer-side-label">Subscription Summary</span>
            <div className="issuer-summary-grid">
              <div><span>Investor</span><strong>{request.investorName}</strong></div>
              <div><span>Status</span><AppStatusBadge status={request.status} label={statusMeta(request.status).label} tone={statusMeta(request.status).tone === 'warning' ? 'pending' : statusMeta(request.status).tone} compact /></div>
              <div><span>Token</span><strong>{request.tokenName || request.token?.name}</strong></div>
              <div><span>Submitted</span><strong>{formatDate(request.submittedAt || request.requestedDate, 'MMM DD, YYYY')}</strong></div>
              {request.jurisdiction ? <div><span>Jurisdiction</span><strong>{request.jurisdiction}</strong></div> : null}
              {request.investmentAmount != null ? <div><span>Investment Amount</span><strong>${Number(request.investmentAmount).toLocaleString()}</strong></div> : null}
            </div>
            {request.note ? <div className="issuer-request-note"><span>Investor Note</span><p>{request.note}</p></div> : null}
          </Card>

          <Card className="issuer-activity-card">
            <span className="issuer-side-label">Activity Log</span>
            <div className="issuer-activity-list">
              {activity.length ? activity.map((item) => <div className="issuer-activity-item" key={item.id}><span className="issuer-activity-item__dot" /><div><strong>{item.label}</strong><small>{item.note}</small><em>{formatDate(item.at, 'MMM DD, YYYY, hh:mm A')}</em></div></div>) : <div className="issuer-empty-topic-documents">No activity timestamps were returned.</div>}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
