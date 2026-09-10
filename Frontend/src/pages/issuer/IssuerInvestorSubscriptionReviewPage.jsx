import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ApplicationHistory } from '@/components/application-history/ApplicationHistory';
import { SecureDocumentPreviewModal } from '@/components/common/SecureDocumentPreviewModal';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { RejectInterestModal, VerifyIdentityClaimsModal } from '@/components/issuer/IssuerInterestDecisionModals';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { issuerInvestorSubscriptionsService } from '@/services/issuer/issuerInvestorSubscriptionsService';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const isClaimVerifiedStatus = (status) => ['verifiedbyissuer', 'verified'].includes(normalizeStatus(status));
const isClaimSubmittedStatus = (status) => normalizeStatus(status) === 'claimsubmitted';

const statusMeta = (status) => {
  const value = String(status || '').toLowerCase();
  if (isClaimSubmittedStatus(status)) return { label: 'Claims Submitted', tone: 'success' };
  if (isClaimVerifiedStatus(status)) return { label: 'Claim Verified', tone: 'success' };
  if (value === 'approved') return { label: 'Approved', tone: 'success' };
  if (value === 'rejected') return { label: 'Rejected', tone: 'danger' };
  if (value === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (value === 'pending') return { label: 'Documents Required', tone: 'pending' };
  return { label: 'Pending Review', tone: 'pending' };
};

const filenameFromDisposition = (value, fallback) => {
  const match = String(value || '').match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  if (!match?.[1]) return fallback;
  try { return decodeURIComponent(match[1].replace(/^\"|\"$/g, '')); } catch { return match[1].replace(/^\"|\"$/g, ''); }
};

export default function IssuerInvestorSubscriptionReviewPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingDocumentUid, setDownloadingDocumentUid] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);

  useDocumentTitle(request ? `${request.investorName} · Application Activity` : 'Application Activity');

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!requestId) return null;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [requestResult, historyResult] = await Promise.allSettled([
      issuerInvestorSubscriptionsService.getRequest(requestId),
      issuerInvestorSubscriptionsService.getRequestHistory(requestId),
    ]);

    if (requestResult.status === 'fulfilled') setRequest(requestResult.value || null);
    else {
      setRequest(null);
      toast.error(getErrorMessage(requestResult.reason, 'Unable to load this investment request.'));
    }

    if (historyResult.status === 'fulfilled') setHistory(historyResult.value || null);
    else {
      setHistory({ interestUid: requestId, summary: {}, timeline: [] });
      toast.error(getErrorMessage(historyResult.reason, 'Unable to load the application activity history.'));
    }

    if (!silent) setLoading(false);
    else setRefreshing(false);

    return {
      request: requestResult.status === 'fulfilled' ? requestResult.value : null,
      history: historyResult.status === 'fulfilled' ? historyResult.value : null,
    };
  }, [requestId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const topics = useMemo(() => request?.eligibility?.topics || [], [request]);
  const requiredClaimTopics = useMemo(() => {
    const tokenTopics = request?.token?.requiredClaimTopics;
    return Array.isArray(tokenTopics) && tokenTopics.length ? tokenTopics : topics;
  }, [request, topics]);

  const fetchDocumentBlob = useCallback(async (document) => {
    if (!document?.documentUid) throw new Error('This submission document does not include a download identifier.');
    return issuerInvestorSubscriptionsService.downloadDocument(request?.interestUid || requestId, document.documentUid);
  }, [request?.interestUid, requestId]);

  const handleDownload = async (document) => {
    setDownloadingDocumentUid(document.documentUid);
    try {
      const result = await fetchDocumentBlob(document);
      const url = URL.createObjectURL(result.blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filenameFromDisposition(
        result.contentDisposition,
        document.originalFileName || document.file || document.name || 'investor-document',
      );
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to download this submission document.'));
    } finally {
      setDownloadingDocumentUid('');
    }
  };

  const handleReject = async (payload) => {
    setDecisionLoading(true);
    try {
      await issuerInvestorSubscriptionsService.rejectRequest(request.interestUid || requestId, payload);
      await loadData({ silent: true });
      setDecisionModal(null);
      toast.success('Investment application rejected and the decision was added to its activity history.');
    } catch (error) {
      if (error?.response?.status === 409) await loadData({ silent: true });
      toast.error(getErrorMessage(error, 'Unable to reject this investment application.'));
    } finally {
      setDecisionLoading(false);
    }
  };


  const handleClaimsVerified = async () => {
    await loadData({ silent: true });
    toast.success('All required claim signatures were verified successfully.');
  };

  if (loading) {
    return <div className="page-stack issuer-investor-review-page issuer-application-activity-page"><div className="issuer-loading-shell" /><div className="issuer-loading-shell issuer-loading-shell--tall" /></div>;
  }

  if (!request) {
    return (
      <Card className="issuer-review-not-found">
        <h1>Request not found</h1>
        <p>The selected investment application could not be loaded or does not belong to this issuer.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.investors)}>Back to Requests</Button>
      </Card>
    );
  }

  const requestStatus = String(request.status || '').toLowerCase();
  const historyHasClaimSubmitted = Boolean(history?.timeline?.some((event) => isClaimSubmittedStatus(event?.eventType)));
  const claimSubmitted = isClaimSubmittedStatus(request.status)
    || isClaimSubmittedStatus(history?.status)
    || isClaimSubmittedStatus(history?.summary?.status)
    || historyHasClaimSubmitted;
  const claimVerified = !claimSubmitted && isClaimVerifiedStatus(request.status);
  const effectiveStatus = claimSubmitted ? 'claimSubmitted' : request.status;
  const canReject = requestStatus === 'submitintrest';
  const canVerify = requestStatus === 'submitintrest';
  const currentMeta = statusMeta(effectiveStatus);
  const submissionNumber = request.submissionNumber || history?.timeline?.reduce((max, event) => Math.max(max, Number(event?.submissionNumber) || 0), 0) || null;

  return (
    <div className="page-stack issuer-investor-review-page issuer-application-activity-page">
      <div className="application-detail-breadcrumbs">
        <button type="button" onClick={() => navigate(ROUTES.investors)}>Manage Requests</button>
        <span>›</span>
        <strong>Application Activity</strong>
      </div>

      <header className="issuer-application-activity-header">
        <div>
          <span className="eyebrow">Issuer review</span>
          <h1>Application Activity</h1>
          <p>Audit trail and submission history for {request.investorName}&apos;s application.</p>
        </div>
        <div className="issuer-application-activity-header__actions">
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadData({ silent: true })}>Refresh</Button>
        </div>
      </header>

      <Card className={`issuer-application-overview-card${claimVerified ? ' is-claim-verified' : ''}`}>
        <div className="issuer-application-overview-card__identity">
          <span>{request.investorName?.slice(0, 1).toUpperCase() || 'I'}</span>
          <div>
            <strong>{request.investorName}</strong>
            <small>{request.investorCode || request.email || 'Investor application'}</small>
          </div>
        </div>
        <div className="issuer-application-overview-card__grid">
          <div><span>Application ID</span><strong>{request.interestUid || request.requestReference}</strong></div>
          <div><span>Token</span><strong>{[request.tokenName, request.tokenSymbol ? `(${request.tokenSymbol})` : ''].filter(Boolean).join(' ') || '—'}</strong></div>
          <div><span>Submitted</span><strong>{formatDate(request.submittedAt || request.requestedDate, 'MMM DD, YYYY hh:mm A')}</strong></div>
          <div><span>Latest Submission</span><strong>{submissionNumber ? `Submission ${submissionNumber}` : '—'}</strong></div>
          <div><span>Status</span><AppStatusBadge status={effectiveStatus} label={currentMeta.label} tone={currentMeta.tone} compact /></div>
          <div><span>Resubmissions</span><strong>{history?.summary?.timesResubmitted ?? request?.resubmissionSummary?.timesResubmitted ?? 0}</strong></div>
        </div>
        {claimSubmitted ? (
          <div className="issuer-application-overview-card__actions issuer-application-overview-card__actions--registry">
            <Button type="button" icon={UserPlus}>Add to Registry</Button>
          </div>
        ) : claimVerified ? (
          <div className="issuer-application-overview-card__waiting" role="status">
            <Clock3 size={18} />
            <div>
              <strong>Waiting for Investor Action</strong>
              <span>The investor needs to submit the required claim from their side. Once submitted, you can add the investor to the registry.</span>
            </div>
          </div>
        ) : (
          <div className="issuer-application-overview-card__actions">
            <Button variant="danger" icon={XCircle} disabled={!canReject || decisionLoading} onClick={() => setDecisionModal('reject')}>Reject Request</Button>
            <Button icon={ShieldCheck} disabled={!canVerify || decisionLoading} onClick={() => setDecisionModal('verify')}>Verify Claims</Button>
          </div>
        )}
      </Card>

      <section className="application-history-section issuer-application-history-section">
        <div className="application-history-section__heading">
          <div>
            <h2>Application History</h2>
            <p>Expand each activity to review the exact submission snapshot, issuer decision, and resubmission details.</p>
          </div>
          <span>{history?.timeline?.length || 0} event{history?.timeline?.length === 1 ? '' : 's'}</span>
        </div>

        <ApplicationHistory
          timeline={history?.timeline || []}
          viewerRole="issuer"
          currentStatus={request.status}
          onViewDocument={setSelectedDocument}
          onDownloadDocument={handleDownload}
          downloadingDocumentUid={downloadingDocumentUid}
          showDownload
          actorNames={{
            investor: request.investorName || 'Investor account',
            issuer: user?.name || user?.fullName || 'Issuer account',
            system: 'System',
          }}
          emptyTitle="No application activity was returned"
          emptyDescription="The current request is available, but the history endpoint did not return any timeline events."
        />
      </section>

      {selectedDocument ? (
        <SecureDocumentPreviewModal
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          fetchDocumentBlob={fetchDocumentBlob}
          loadingMessage="Retrieving the exact document version from this issuer-scoped submission snapshot."
        />
      ) : null}

      <RejectInterestModal
        open={decisionModal === 'reject'}
        onClose={() => setDecisionModal(null)}
        topics={topics}
        onConfirm={handleReject}
        loading={decisionLoading}
      />
      <VerifyIdentityClaimsModal
        open={decisionModal === 'verify'}
        onClose={() => setDecisionModal(null)}
        subscriptionId={request.subscriptionId || request.interestUid || request.requestReference || requestId}
        investorIdentityAddress={request.investorIdentityAddress}
        requiredClaimTopics={requiredClaimTopics}
        onVerified={handleClaimsVerified}
      />
    </div>
  );
}
