import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  RotateCcw,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/utils/date';
import { isRegistryRegistrationConfirmedEvent } from '@/utils/investmentPurchase';
import { ContactSupportDialog } from './ContactSupportDialog';

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const isVerifiedByIssuerStatus = (status) => ['verifiedbyissuer', 'verified'].includes(normalizeStatus(status));

const isClaimVerificationEvent = (event, currentStatus) => {
  if (!isVerifiedByIssuerStatus(currentStatus)) return false;

  const eventType = normalizeStatus(event?.eventType);
  if (['approved', 'verified', 'verifiedbyissuer', 'claimverified', 'claimsverified'].includes(eventType)) return true;

  const note = String(event?.note || '').trim().toLowerCase();
  return note.includes('claim') && (note.includes('verified') || note.includes('verification'));
};

const eventMeta = (event, { viewerRole = '', currentStatus = '' } = {}) => {
  const claimVerificationEvent = isClaimVerificationEvent(event, currentStatus);

  if (isRegistryRegistrationConfirmedEvent(event)) {
    return viewerRole === 'investor'
      ? { title: 'Purchase Available', tone: 'success', Icon: CheckCircle2, badge: 'Ready to Purchase' }
      : { title: 'Investor Approved for Token', tone: 'success', Icon: CheckCircle2, badge: 'Approved Investor' };
  }

  if (claimVerificationEvent && viewerRole === 'investor') {
    return { title: 'Verification Approved', tone: 'success', Icon: CheckCircle2, badge: 'Approved' };
  }

  if (claimVerificationEvent && viewerRole === 'issuer') {
    return { title: 'Verification Approved', tone: 'success', Icon: CheckCircle2, badge: 'Verified' };
  }

  switch (String(event?.eventType || '').toLowerCase()) {
    case 'claimsubmitted':
      return { title: 'Verification Submitted', tone: 'success', Icon: CheckCircle2, badge: 'Submitted' };
    case 'approved':
      return { title: 'Application Approved', tone: 'success', Icon: CheckCircle2, badge: 'Approved' };
    case 'rejected':
      return { title: 'Application Rejected', tone: 'danger', Icon: XCircle, badge: 'Rejected' };
    case 'resubmitted':
      return { title: 'Documents Resubmitted', tone: 'info', Icon: RotateCcw, badge: 'Documents Resubmitted' };
    case 'submitted':
      return { title: 'Application Submitted', tone: 'info', Icon: UploadCloud, badge: 'Application Submitted' };
    default:
      return { title: 'Application Activity', tone: 'neutral', Icon: Clock3, badge: 'Activity' };
  }
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

const defaultEventCopy = (event, viewerRole = '') => {
  if (isRegistryRegistrationConfirmedEvent(event)) {
    return viewerRole === 'investor'
      ? 'You can now purchase this token.'
      : 'This investor is now eligible to purchase the token.';
  }

  switch (String(event?.eventType || '').toLowerCase()) {
    case 'claimsubmitted': return 'All required investor verification was submitted successfully.';
    case 'approved': return 'This application has been approved.';
    case 'rejected': return event?.rejectReason || 'The issuer rejected this application submission.';
    case 'resubmitted': return 'The investor resubmitted updated documents for review.';
    case 'submitted': return 'The investor submitted this application for issuer review.';
    default: return event?.note || 'Application activity was recorded.';
  }
};

export function SubmittedDocument({
  document,
  onView,
  onDownload,
  downloading = false,
  showDownload = false,
}) {
  return (
    <div className="application-history-document">
      <div className="application-history-document__identity">
        <span className="application-history-document__icon"><FileText size={16} /></span>
        <div>
          <strong>{document.documentTypeName || document.name || 'Investor document'}</strong>
          <small>
            {[
              document.originalFileName || document.file,
              document.versionNumber ? `v${document.versionNumber}` : '',
              formatBytes(document.fileSize),
              document.claimTopicCode,
            ].filter(Boolean).join(' · ')}
          </small>
        </div>
      </div>
      <div className="application-history-document__actions">
        <Button variant="secondary" size="sm" icon={Eye} onClick={() => onView?.(document)}>View</Button>
        {showDownload ? (
          <Button variant="secondary" size="sm" icon={Download} loading={downloading} onClick={() => onDownload?.(document)}>Download</Button>
        ) : null}
      </div>
    </div>
  );
}

export function ApplicationHistoryItem({
  event,
  expanded,
  onToggle,
  onViewDocument,
  onDownloadDocument,
  downloadingDocumentUid,
  showDownload = false,
  canReupload = false,
  onReupload,
  onSubmitClaim,
  actorNames = {},
  viewerRole = '',
  currentStatus = '',
  supportContext = {},
}) {
  const claimVerificationEvent = isClaimVerificationEvent(event, currentStatus);
  const isInvestorClaimAction = claimVerificationEvent && viewerRole === 'investor';
  const isIssuerWaitingForInvestor = claimVerificationEvent && viewerRole === 'issuer';
  const isInvestorClaimsSubmitted = viewerRole === 'investor' && normalizeStatus(event?.eventType) === 'claimsubmitted';
  const [contactSupportOpen, setContactSupportOpen] = useState(false);
  const meta = eventMeta(event, { viewerRole, currentStatus });
  const Icon = meta.Icon;
  const hasDocuments = Array.isArray(event.documents) && event.documents.length > 0;
  const hasDetails = Boolean(
    isInvestorClaimAction
    || isIssuerWaitingForInvestor
    || hasDocuments
    || event.rejectReason
    || event.note
    || event.rejectedClaim?.length
    || event.actorRole
    || event.resubmitAttempt != null,
  );
  const submissionLabel = event.submissionNumber != null
    ? `Submission ${event.submissionNumber}`
    : event.resubmitAttempt != null
      ? `Resubmission ${event.resubmitAttempt}`
      : '';

  const actorRole = String(event.actorRole || 'system').toLowerCase();
  const actorDisplayName = event.actorName
    || actorNames?.[actorRole]
    || event.actorUserUid
    || (actorRole === 'system' ? 'System' : 'Application user');

  return (
    <article className={`application-history-item is-${meta.tone}${expanded ? ' is-expanded' : ''}`}>
      <span className="application-history-item__rail" aria-hidden="true" />
      <span className="application-history-item__marker" aria-hidden="true"><Icon size={17} /></span>
      <div className="application-history-item__card">
        <button
          type="button"
          className="application-history-item__trigger"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={!hasDetails}
        >
          <span className="application-history-item__heading">
            {submissionLabel ? <small>{submissionLabel}</small> : null}
            <strong>{meta.title}</strong>
          </span>
          <span className="application-history-item__header-meta">
            <time>{formatDate(event.createdAt, 'MMM DD, YYYY hh:mm A')}</time>
            <span className={`application-history-item__badge is-${meta.tone}`}>{meta.badge}</span>
            {hasDetails ? (expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />) : null}
          </span>
        </button>

        {expanded && hasDetails ? (
          <div className="application-history-item__body">
            {String(event.eventType).toLowerCase() === 'rejected' ? (
              <div className="application-history-rejection">
                <XCircle size={17} />
                <div>
                  <strong>Reason</strong>
                  <p>{event.rejectReason || 'The issuer rejected this application submission.'}</p>
                  {event.rejectedClaim?.length ? (
                    <div className="application-history-claim-list">
                      {event.rejectedClaim.map((claim) => <span key={claim}>{claim.replaceAll('_', ' ')}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : isInvestorClaimAction ? (
              <div className="application-history-message application-history-message--claim-action is-success">
                <FileCheck2 size={16} />
                <span>Your application has been approved. Complete the required verification to unlock investing in this token.</span>
                {onSubmitClaim ? <Button size="sm" onClick={onSubmitClaim}>Complete Verification</Button> : null}
              </div>
            ) : isIssuerWaitingForInvestor ? (
              <div className="application-history-waiting-action">
                <Clock3 size={17} />
                <div>
                  <strong>Waiting for Investor Action</strong>
                  <span>The investor still needs to complete the required verification. Once it is submitted, you can approve them to hold this token.</span>
                </div>
              </div>
            ) : isInvestorClaimsSubmitted ? (
              <div className="application-history-investor-claim-submitted">
                <div className={`application-history-message application-history-message--notify-issuer is-${meta.tone}`}>
                  <FileCheck2 size={16} />
                  <span>The investor has submitted all required verification. You can now complete the final approval step.</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setContactSupportOpen(true)}
                  >
                    Notify Issuer
                  </Button>
                </div>
              </div>
            ) : (
              <div className={`application-history-message is-${meta.tone}`}>
                <FileCheck2 size={16} />
                <span>{isRegistryRegistrationConfirmedEvent(event) ? defaultEventCopy(event, viewerRole) : (event.note || defaultEventCopy(event, viewerRole))}</span>
              </div>
            )}

            {hasDocuments ? (
              <div className="application-history-documents">
                <div className="application-history-documents__title">
                  <span>Submitted Documents</span>
                  {event.submissionNumber != null ? <small>Snapshot #{event.submissionNumber}</small> : null}
                </div>
                {event.documents.map((document) => (
                  <SubmittedDocument
                    key={document.submissionDocumentUid || document.documentUid || document.id}
                    document={document}
                    onView={onViewDocument}
                    onDownload={onDownloadDocument}
                    downloading={downloadingDocumentUid === document.documentUid}
                    showDownload={showDownload}
                  />
                ))}
              </div>
            ) : null}

            <div className="application-history-item__footer">
              <span>Recorded by: <strong>{actorDisplayName}</strong></span>
              {event.resubmitAttempt != null ? <span>Resubmission attempt: <strong>{event.resubmitAttempt}</strong></span> : null}
              {canReupload ? <Button variant="danger" size="sm" icon={UploadCloud} onClick={onReupload}>Re-upload</Button> : null}
            </div>
          </div>
        ) : null}
      </div>
      <ContactSupportDialog
        open={contactSupportOpen}
        onClose={() => setContactSupportOpen(false)}
        context={supportContext}
      />
    </article>
  );
}

export function ApplicationHistory({
  timeline = [],
  onViewDocument,
  onDownloadDocument,
  downloadingDocumentUid = '',
  showDownload = false,
  reuploadEventId = '',
  onReupload,
  onSubmitClaim,
  actorNames = {},
  viewerRole = '',
  currentStatus = '',
  supportContext = {},
  emptyTitle = 'No application history yet',
  emptyDescription = 'Activity for this application will appear here as it is recorded.',
}) {
  const events = useMemo(
    () => [...(timeline || [])].sort((a, b) => {
      const left = new Date(a?.createdAt || 0).getTime();
      const right = new Date(b?.createdAt || 0).getTime();
      return right - left;
    }),
    [timeline],
  );
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    if (!events.length) {
      setExpanded(new Set());
      return;
    }
    setExpanded((current) => {
      if (current.size) return current;
      return new Set([events[0].id]);
    });
  }, [events]);

  if (!events.length) {
    return (
      <Card className="application-history-empty">
        <Clock3 size={25} />
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </Card>
    );
  }

  return (
    <div className="application-history-timeline">
      {events.map((event) => (
        <ApplicationHistoryItem
          key={event.id}
          event={event}
          expanded={expanded.has(event.id)}
          onToggle={() => setExpanded((current) => {
            const next = new Set(current);
            if (next.has(event.id)) next.delete(event.id);
            else next.add(event.id);
            return next;
          })}
          onViewDocument={onViewDocument}
          onDownloadDocument={onDownloadDocument}
          downloadingDocumentUid={downloadingDocumentUid}
          showDownload={showDownload}
          canReupload={Boolean(reuploadEventId && event.id === reuploadEventId)}
          onReupload={onReupload}
          onSubmitClaim={onSubmitClaim}
          actorNames={actorNames}
          viewerRole={viewerRole}
          currentStatus={currentStatus}
          supportContext={supportContext}
        />
      ))}
    </div>
  );
}
