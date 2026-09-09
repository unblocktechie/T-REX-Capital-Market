import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LockKeyhole, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ApplicationHistory } from '@/components/application-history/ApplicationHistory';
import { ApplicationSummary } from '@/components/application-history/ApplicationSummary';
import { SecureDocumentPreviewModal } from '@/components/common/SecureDocumentPreviewModal';
import { UploadMissingDocumentsModal } from '@/components/investor-marketplace/MarketplaceModals';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { MARKETPLACE_STATUS } from '@/services/investor/investorMarketplaceLocalService';
import { getErrorMessage } from '@/utils/error';

export default function ApplicationDetailsPage() {
  const { interestUid } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [application, setApplication] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [reuploadToken, setReuploadToken] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documentTypesLoading, setDocumentTypesLoading] = useState(false);
  const [reuploadCompleting, setReuploadCompleting] = useState(false);

  useDocumentTitle(application ? `${application.name} · Application Details` : 'Application Details');

  const loadApplication = useCallback(async ({ silent = false } = {}) => {
    if (!interestUid) return null;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await investorMarketplaceService.getApplicationDetail(interestUid);
      setApplication(result.application || null);
      setHistory(result.history || null);
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to load this application and its activity history.'));
      return null;
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  }, [interestUid]);

  useEffect(() => {
    let active = true;
    if (!interestUid) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    investorMarketplaceService
      .getApplicationDetail(interestUid)
      .then((result) => {
        if (!active) return;
        setApplication(result.application || null);
        setHistory(result.history || null);
      })
      .catch((error) => {
        if (active) toast.error(getErrorMessage(error, 'Unable to load this application and its activity history.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [interestUid]);

  const currentStatus = String(application?.interest?.status || history?.summary?.status || history?.status || application?.status || '').toLowerCase();
  const currentRejectType = String(history?.summary?.rejectReasonType || application?.interest?.rejectReasonType || '').toUpperCase();
  const canResubmit = Boolean(history?.summary?.canResubmit ?? application?.interest?.canResubmit);

  const reuploadEventId = useMemo(() => {
    if (currentStatus !== 'rejected' || currentRejectType !== 'DOC_REJECTED' || !canResubmit) return '';
    return [...(history?.timeline || [])]
      .filter((event) => String(event?.eventType || '').toLowerCase() === 'rejected')
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())[0]?.id || '';
  }, [canResubmit, currentRejectType, currentStatus, history?.timeline]);

  const fetchInvestorDocument = useCallback(async (document) => {
    if (!document?.documentUid) throw new Error('This historical document does not include a document identifier.');
    return investorMarketplaceService.downloadApplicationDocument(document.documentUid);
  }, []);

  const openReupload = async () => {
    if (!application?.id) return;
    setDocumentTypesLoading(true);
    try {
      const [token, options] = await Promise.all([
        investorMarketplaceService.getOffering(application.id),
        investorMarketplaceService.getDocumentUploadOptions(),
      ]);
      setReuploadToken(token);
      setDocumentTypes(options || []);
      setReuploadOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to prepare the requested-document upload flow.'));
    } finally {
      setDocumentTypesLoading(false);
    }
  };

  const uploadClaimDocument = (documentTypeUid, file, onUploadProgress, signal) =>
    investorMarketplaceService.uploadClaimDocument(documentTypeUid, file, onUploadProgress, signal);

  const completeReupload = async () => {
    if (!application?.id) return;
    setReuploadCompleting(true);
    try {
      const token = await investorMarketplaceService.getOffering(application.id);
      setReuploadToken(token);
      const result = await loadApplication({ silent: true });
      const nextStatus = String(result?.application?.interest?.status || result?.history?.summary?.status || '').toLowerCase();
      if (token.status === MARKETPLACE_STATUS.PENDING_REVIEW || nextStatus === 'submitintrest') {
        setReuploadOpen(false);
        toast.success('Requested documents submitted. Your application is ready for issuer review.');
      } else if (token.status === MARKETPLACE_STATUS.REJECTED || nextStatus === 'rejected') {
        toast.error('The requested replacement documents are not complete yet.');
      } else {
        setReuploadOpen(false);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to refresh the application after document resubmission.'));
    } finally {
      setReuploadCompleting(false);
    }
  };

  if (loading) {
    return <div className="page-stack application-detail-page"><div className="application-detail-loading" /><div className="application-detail-loading application-detail-loading--tall" /></div>;
  }

  if (!application || !history) {
    return (
      <Card className="application-detail-not-found">
        <h1>Application not found</h1>
        <p>The selected application could not be loaded or is not available to this investor account.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.applications)}>Back to My Applications</Button>
      </Card>
    );
  }

  return (
    <div className="page-stack application-detail-page">
      <div className="application-detail-breadcrumbs">
        <button type="button" onClick={() => navigate(ROUTES.applications)}>My Applications</button>
        <span>›</span>
        <strong>Application Details</strong>
      </div>

      <header className="application-detail-header">
        <div>
          <span className="eyebrow">Application tracking</span>
          <h1>Application Details</h1>
          <p>Review the complete audit trail, exact document snapshots, rejection reasons, and current status for this investment application.</p>
        </div>
        <div className="application-detail-header__actions">
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadApplication({ silent: true })}>Refresh</Button>
        </div>
      </header>

      <ApplicationSummary application={application} history={history} />

      <section className="application-history-section">
        <div className="application-history-section__heading">
          <div>
            <h2>Application History</h2>
            <p>Review your application attempts and status updates.</p>
          </div>
          <span>{history.timeline?.length || 0} event{history.timeline?.length === 1 ? '' : 's'}</span>
        </div>

        <ApplicationHistory
          timeline={history.timeline}
          viewerRole="investor"
          currentStatus={currentStatus}
          onSubmitClaim={() => navigate(ROUTES.applicationClaim(interestUid))}
          onViewDocument={setSelectedDocument}
          reuploadEventId={reuploadEventId}
          onReupload={() => void openReupload()}
          actorNames={{
            investor: user?.name || user?.fullName || 'Investor account',
            issuer: application?.issuer || 'Issuing organization',
            system: 'System',
          }}
        />
      </section>

      <div className="application-history-privacy-note">
        <LockKeyhole size={14} />
        <span>Only you and this issuer can access this application history and its submission document snapshots.</span>
      </div>

      {selectedDocument ? (
        <SecureDocumentPreviewModal
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          fetchDocumentBlob={fetchInvestorDocument}
          loadingMessage="Retrieving the exact document version stored with this application submission."
        />
      ) : null}

      <UploadMissingDocumentsModal
        open={reuploadOpen}
        onClose={() => setReuploadOpen(false)}
        verification={reuploadToken?.eligibility}
        documentTypes={documentTypes}
        documentTypesLoading={documentTypesLoading}
        onUpload={uploadClaimDocument}
        onComplete={completeReupload}
        completing={reuploadCompleting}
      />
    </div>
  );
}
