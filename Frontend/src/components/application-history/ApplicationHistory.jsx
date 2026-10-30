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
import { featureFlags } from '@/config/featureFlags';
import { formatDate } from '@/utils/date';
import { isRegistryRegistrationConfirmedEvent } from '@/utils/investmentPurchase';
import { isIssuerApprovalEvent, visibleApplicationHistoryEntries } from '@/utils/applicationHistoryEntries';
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

const eventMeta = (event, { viewerRole = '', currentStatus = '', registryRegistrationConfirmed = false, issuerVerificationConfirmed = false } = {}) => {
  const claimVerificationEvent = isClaimVerificationEvent(event, currentStatus)
    || (issuerVerificationConfirmed && isIssuerApprovalEvent(event));

  if (event.issuerStepEvents) {
    return {
      title: viewerRole === 'investor' ? 'Profile Verified & Registered' : 'Investor Verified & Registered',
      tone: 'success', Icon: CheckCircle2, badge: 'Complete',
    };
  }

  if (isRegistryRegistrationConfirmedEvent(event)) {
    return viewerRole === 'investor'
      ? { title: 'Registry Registration Confirmed', tone: 'success', Icon: CheckCircle2, badge: 'Registered' }
      : { title: 'Identity Registry Registration Confirmed', tone: 'success', Icon: CheckCircle2, badge: 'Registered' };
  }

  if (claimVerificationEvent && viewerRole === 'investor') {
    // When progress is confirmed before the registry event reaches history,
    // show a single completed Step 2 rather than two separate operations.
    return registryRegistrationConfirmed
      ? { title: 'Profile Verified & Registered', tone: 'success', Icon: CheckCircle2, badge: 'Complete' }
      : { title: 'Issuer Review Pending', tone: 'neutral', Icon: Clock3, badge: 'Pending' };
  }

  if (claimVerificationEvent && viewerRole === 'issuer') {
    return registryRegistrationConfirmed
      ? { title: 'Issuer Review & Registration Confirmed', tone: 'success', Icon: CheckCircle2, badge: 'Complete' }
      : { title: 'Registration Pending', tone: 'warning', Icon: Clock3, badge: 'Pending' };
  }

  switch (String(event?.eventType || '').toLowerCase()) {
    case 'claimsubmitted':
      return { title: 'Verification Completed', tone: 'success', Icon: CheckCircle2, badge: 'Submitted' };
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


const friendlyRequirementLabel = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized.includes('KYC') || normalized.includes('IDENTITY')) return 'Identity verification';
  if (normalized.includes('ACCREDIT')) return 'Investor eligibility';
  if (normalized.includes('COUNTRY') || normalized.includes('JURISDICTION')) return 'Country eligibility';
  return normalized.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

const claimSubmittedCopy = (viewerRole, applicationComplete) => {
  if (applicationComplete) {
    return viewerRole === 'investor'
      ? 'Your required claims were submitted And You can proceed with investing.'
      : 'The investor submitted their required claims and the investor can invest subject to contract eligibility.';
  }
  return viewerRole === 'investor'
    ? 'Your required claims have been submitted. Your application will complete once the required confirmations are finished.'
    : 'The investor submitted their required claims. The application is awaiting final confirmation.';
};

const defaultEventCopy = (event, viewerRole = '', applicationComplete = false) => {
  if (isRegistryRegistrationConfirmedEvent(event)) {
    return viewerRole === 'investor'
      ? 'Your Identity Registry registration is confirmed. Complete any remaining required claims before investing.'
      : 'The investor is registered. Await their required claim submissions; no further issuer approval is needed.';
  }

  switch (String(event?.eventType || '').toLowerCase()) {
    case 'claimsubmitted': return claimSubmittedCopy(viewerRole, applicationComplete);
    case 'approved': return 'This application has been approved.';
    case 'rejected': return event?.rejectReason || 'The issuer rejected this application submission.';
    case 'resubmitted': return viewerRole === 'investor' ? 'You submitted the requested updates for another review.' : 'The investor submitted the requested updates for another review.';
    case 'submitted': return viewerRole === 'investor' ? 'Your application was sent to the issuer for review.' : 'The investor submitted this application for your review.';
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
              friendlyRequirementLabel(document.claimTopicCode),
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
  claimsConfirmed = false,
  applicationComplete = false,
  issuerVerificationConfirmed = false,
  registryRegistrationConfirmed = false,
  supportContext = {},
}) {
  const combinedIssuerStep = event.issuerStepEvents;
  const claimVerificationEvent = !combinedIssuerStep && (isClaimVerificationEvent(event, currentStatus)
    || (issuerVerificationConfirmed && isIssuerApprovalEvent(event)));
  const isInvestorClaimAction = claimVerificationEvent && viewerRole === 'investor' && registryRegistrationConfirmed;
  const isIssuerReviewPending = claimVerificationEvent && viewerRole === 'issuer' && !registryRegistrationConfirmed;
  const isIssuerWaitingForInvestor = claimVerificationEvent && viewerRole === 'issuer' && registryRegistrationConfirmed;
  const isInvestorClaimsSubmitted = viewerRole === 'investor' && normalizeStatus(event?.eventType) === 'claimsubmitted';
  const [contactSupportOpen, setContactSupportOpen] = useState(false);
  const meta = eventMeta(event, { viewerRole, currentStatus, issuerVerificationConfirmed, registryRegistrationConfirmed });
  const Icon = meta.Icon;
  const hasDocuments = Array.isArray(event.documents) && event.documents.length > 0;
  const hasDetails = Boolean(
    combinedIssuerStep
    || isInvestorClaimAction
    || isIssuerWaitingForInvestor
    || isIssuerReviewPending
    || hasDocuments
    || event.rejectReason
    || event.note
    || event.rejectedClaim?.length
    || event.actorRole
    || event.resubmitAttempt != null,
  );
  const submissionLabel = event.submissionNumber != null
    ? `Version ${event.submissionNumber}`
    : event.resubmitAttempt != null
      ? `Update ${event.resubmitAttempt}`
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
                  <p>{event.rejectReason || 'The issuer did not approve this application.'}</p>
                  {event.rejectedClaim?.length ? (
                    <div className="application-history-claim-list">
                      {event.rejectedClaim.map((claim) => <span key={claim}>{friendlyRequirementLabel(claim)}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : combinedIssuerStep ? (
              <>
                <div className="application-history-message application-history-message--claim-action is-success">
                  <FileCheck2 size={16} />
                  <span>{viewerRole === 'investor'
                    ? applicationComplete
                      ? 'Your profile and required claims are confirmed. Your application is complete and you can proceed to Invest Now, subject to eligibility.'
                      : claimsConfirmed
                        ? 'Your profile and required claims are confirmed. Your application is being finalized automatically.'
                        : 'Your profile has been successfully verified! Submit your claims to complete the process and start investing.'
                    : applicationComplete
                      ? 'The investor’s profile and required claims are confirmed. The application is complete. No further issuer action is needed.'
                      : claimsConfirmed
                        ? 'The investor’s profile and required claims are confirmed. The application is being finalized automatically.'
                        : 'The investor’s profile has been successfully verified and registered. They can now submit their claims. No further issuer action is needed.'}</span>
                  {viewerRole === 'investor' && onSubmitClaim && !claimsConfirmed && !applicationComplete ? (
                    <Button size="sm" onClick={onSubmitClaim}>Submit Claim</Button>
                  ) : null}
                </div>
                <div className="application-history-issuer-step-events" aria-label="Step 2 confirmations">
                  <div>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span><strong>Required Claims Verified</strong>
                      <small>{formatDate(combinedIssuerStep.verification.createdAt, 'MMM DD, YYYY hh:mm A')}</small>
                    </span>
                  </div>
                  <div>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span><strong>Identity Registry Registration Confirmed</strong>
                      <small>{formatDate(combinedIssuerStep.registration.createdAt, 'MMM DD, YYYY hh:mm A')}</small>
                    </span>
                  </div>
                </div>
              </>
            ) : isInvestorClaimAction ? (
              <div className="application-history-message application-history-message--claim-action is-success">
                <FileCheck2 size={16} />
                <span>Your profile has been successfully verified! Submit your claims to complete the process and start investing.</span>
                {onSubmitClaim ? <Button size="sm" onClick={onSubmitClaim}>Submit Claim</Button> : null}
              </div>
            ) : isIssuerReviewPending ? (
              <div className="application-history-waiting-action" role="status">
                <Clock3 size={17} />
                <div>
                  <strong>Registration Pending</strong>
                  <span>Your verification signature is complete, but the investor has not yet been registered. Please complete the registration to finish this step.</span>
                </div>
              </div>
            ) : isIssuerWaitingForInvestor ? (
              <div className="application-history-waiting-action">
                <Clock3 size={17} />
                <div>
                  <strong>Waiting for investor</strong>
                  <span>Your verification and registration step is complete. The investor must submit their claims; you do not need to approve them again.</span>
                </div>
              </div>
            ) : isInvestorClaimsSubmitted ? (
              <div className="application-history-investor-claim-submitted">
                <div className={`application-history-message application-history-message--notify-issuer is-${meta.tone}`}>
                  <Clock3 size={16} />
                  <span>{claimSubmittedCopy('investor', applicationComplete)}</span>
                  {/*
                    Temporarily hidden via feature flag. The click handler and Contact Us
                    dialog remain intact so this action can be restored without rebuilding
                    the support flow.
                  */}
                  {featureFlags.contactSupportActions ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setContactSupportOpen(true)}
                    >
                      Get Help
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className={`application-history-message is-${meta.tone}`}>
                <FileCheck2 size={16} />
                <span>{['submitted', 'resubmitted', 'approved', 'claimsubmitted'].includes(String(event.eventType || '').toLowerCase()) || isRegistryRegistrationConfirmedEvent(event)
                  ? defaultEventCopy(event, viewerRole, applicationComplete)
                  : (event.note || defaultEventCopy(event, viewerRole, applicationComplete))}</span>
              </div>
            )}

            {hasDocuments ? (
              <div className="application-history-documents">
                <div className="application-history-documents__title">
                  <span>Submitted documents</span>
                  {event.submissionNumber != null ? <small>Version {event.submissionNumber}</small> : null}
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
              {event.resubmitAttempt != null ? <span>Update attempt: <strong>{event.resubmitAttempt}</strong></span> : null}
              {canReupload ? <Button variant="danger" size="sm" icon={UploadCloud} onClick={onReupload}>Upload Requested Documents</Button> : null}
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
  claimsConfirmed = false,
  applicationComplete = false,
  issuerVerificationConfirmed = false,
  registryRegistrationConfirmed = false,
  supportContext = {},
  emptyTitle = 'No application history yet',
  emptyDescription = 'Activity for this application will appear here as it is recorded.',
}) {
  const events = useMemo(() => visibleApplicationHistoryEntries(timeline, {
    viewerRole, issuerVerificationConfirmed, registryRegistrationConfirmed, applicationComplete,
  }), [timeline, viewerRole, issuerVerificationConfirmed, registryRegistrationConfirmed, applicationComplete]);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    if (!events.length) {
      setExpanded(new Set());
      return;
    }
    setExpanded((current) => {
      const validIds = new Set(events.map((event) => event.id));
      const retained = [...current].filter((id) => validIds.has(id));
      // If the latest refresh combined two events, open the new milestone
      // instead of retaining an expansion ID that no longer exists.
      return new Set(retained.length ? retained : [events[0].id]);
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
          claimsConfirmed={claimsConfirmed}
          applicationComplete={applicationComplete}
          issuerVerificationConfirmed={issuerVerificationConfirmed}
          registryRegistrationConfirmed={registryRegistrationConfirmed}
          supportContext={supportContext}
        />
      ))}
    </div>
  );
}
