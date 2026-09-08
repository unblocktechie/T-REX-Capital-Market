import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Fingerprint,
  Globe2,
  LoaderCircle,
  MapPin,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  WalletCards,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { adminApi } from '@/api/admin';
import { AdminActivityTimeline } from '@/components/admin/AdminActivityTimeline';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { AdminStatusBadge } from '@/components/admin/AdminBadges';
import { ApproveOrganizationModal, RejectOrganizationModal } from '@/components/admin/AdminDecisionModals';
import { DetailPageSkeleton } from '@/components/admin/AdminSkeletons';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatAdminDate, formatAdminDateTime, formatFileSize } from '@/utils/adminFormat';

export default function OrganizationReviewPage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [decisionSuccess, setDecisionSuccess] = useState(false);

  const organizationQuery = useQuery({
    queryKey: ['admin', 'organization', organizationId],
    queryFn: () => adminApi.getOrganization(organizationId),
  });
  const organization = organizationQuery.data;
  useDocumentTitle(organization ? `${organization.name} Review` : 'Organization Review');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: () => adminApi.approveOrganization(organizationId),
    onSuccess: async () => {
      toast.success('Organization approved', { description: 'The backend status is now approved.' });
      setApproveOpen(false);
      setDecisionSuccess(true);
      window.setTimeout(() => setDecisionSuccess(false), 1800);
      await refresh();
    },
    onError: (error) => toast.error('Approval failed', { description: error.message }),
  });

  const rejectMutation = useMutation({
    mutationFn: (payload) => adminApi.rejectOrganization(organizationId, payload),
    onSuccess: async () => {
      toast.success('Organization rejected', { description: 'The rejection reason was saved by the backend.' });
      setRejectOpen(false);
      await refresh();
    },
    onError: (error) => toast.error('Rejection failed', { description: error.message }),
  });

  if (organizationQuery.isLoading) return <DetailPageSkeleton />;
  if (organizationQuery.isError || !organization) {
    return (
      <div className="grid min-h-[60vh] place-items-center rounded-[20px] border border-slate-200 bg-white p-8 text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><ShieldAlert className="size-6" /></span>
          <h2 className="mt-4 mb-2 text-xl font-semibold">Organization unavailable</h2>
          <p className="m-0 text-sm text-slate-500">{organizationQuery.error?.message || 'This organization could not be loaded.'}</p>
          <button type="button" onClick={() => navigate(ROUTES.adminReviewQueue)} className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white">Return to review queue</button>
        </div>
      </div>
    );
  }

  const reviewable = ['submitted', 'resubmitted', 'pending', 'under_review'].includes(organization.status);
  const owners = organization.ubos || organization.beneficialOwners || [];
  const documents = organization.documents || [];
  const activity = organization.activity || [];

  const copyWallet = async () => {
    if (!organization.wallet?.address) return;
    await navigator.clipboard.writeText(organization.wallet.address);
    toast.success('Wallet address copied');
  };

  const copyOnChainId = async () => {
    if (!organization.wallet?.contractAddress) return;
    await navigator.clipboard.writeText(organization.wallet.contractAddress);
    toast.success('On-chain ID copied');
  };

  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Link to={ROUTES.adminReviewQueue} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-950"><ArrowLeft className="size-4" />Back to review queue</Link>
        <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-slate-950 to-slate-700 text-base font-semibold text-white shadow-lg">{organization.logo}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 break-words text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">{organization.name}</h2>
                <AdminStatusBadge status={organization.status} />
              </div>
              <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">{organization.registrationNumber || 'Registration number not provided'} · Submitted {formatAdminDateTime(organization.submittedAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"><ClipboardCheck className="size-3.5" />{documents.length} documents</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700"><UserRound className="size-3.5" />{owners.length} beneficial owners</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-6">
          <AdminPanel title="Entity summary" description="Organization data returned by the complete admin organization endpoint.">
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <EntityDetail icon={Building2} label="Legal entity name" value={organization.legalName || organization.name} />
              <EntityDetail icon={BadgeCheck} label="Registration number" value={organization.registrationNumber} />
              <EntityDetail icon={Globe2} label="Country / jurisdiction" value={organization.jurisdiction || organization.country} />
              <EntityDetail icon={Building2} label="Entity type" value={organization.entityType} />
              <EntityDetail icon={BadgeCheck} label="Tax ID" value={organization.taxId} />
              <EntityDetail icon={CalendarClock} label="Incorporation date" value={organization.registrationDate ? formatAdminDate(organization.registrationDate) : ''} />
              <EntityDetail icon={Globe2} label="Industry" value={organization.industry} />
              <EntityDetail icon={Globe2} label="Website" value={organization.website} />
              <EntityDetail icon={MapPin} label="Registered address" value={organization.address} className="sm:col-span-2 xl:col-span-3" />
            </dl>
            {organization.businessActivity ? <div className="mt-5 rounded-2xl bg-slate-50 p-4"><span className="text-[10px] font-semibold tracking-[0.12em] text-slate-400 uppercase">Business activity</span><p className="mt-2 mb-0 text-sm leading-6 text-slate-700">{organization.businessActivity}</p></div> : null}
          </AdminPanel>

          <AdminPanel title="Submitted documents" description="Uploaded files submitted by the organization for review.">
            {documents.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {documents.map((document) => (
                  <DocumentMetadataCard key={document.id} document={document} onPreview={() => setSelectedDocument(document)} />
                ))}
              </div>
            ) : <EmptySection text="No organization documents were returned by the backend." />}
          </AdminPanel>

          <AdminPanel title="Beneficial owners" description="Ownership records included in the complete organization response.">
            {owners.length ? <div className="space-y-3">{owners.map((owner, index) => <OwnerCard key={owner.id || `${owner.name}-${index}`} owner={owner} />)}</div> : <EmptySection text="No beneficial owners were returned by the backend." />}
          </AdminPanel>

          <AdminPanel title="Organization wallet" description="Wallet address submitted with the organization application.">
            {organization.wallet?.address ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="size-4" />Organization wallet available</span>
                    <p className="mt-2 mb-0 break-all font-mono text-sm font-semibold text-slate-950">{organization.wallet.address}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={copyWallet} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700"><Copy className="size-4" />Copy</button>
                    <a href={`https://sepolia.etherscan.io/address/${organization.wallet.address}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white"><ExternalLink className="size-4" />Explorer</a>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <WalletDetail label="Network" value={organization.wallet.network || 'Sepolia'} />
                  <WalletDetail label="Chain ID" value={organization.wallet.chainId || '11155111'} />
                  <WalletDetail label="Status" value="Connected" />
                </div>
                {organization.wallet.contractAddress ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <Fingerprint className="size-4" />On-chain ID
                        </span>
                        <p className="mt-2 mb-0 break-all font-mono text-xs leading-5 font-semibold text-slate-950 sm:text-sm">
                          {organization.wallet.contractAddress}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={copyOnChainId}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"
                        >
                          <Copy className="size-4" />Copy
                        </button>
                        <a
                          href={`https://sepolia.etherscan.io/address/${organization.wallet.contractAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white"
                        >
                          <ExternalLink className="size-4" />Contract
                        </a>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : <EmptySection text="No wallet address was returned for this organization." />}
          </AdminPanel>

          <AdminPanel title="Application timeline" description="Submission and final decision events available for this application.">
            {activity.length ? <AdminActivityTimeline items={activity} /> : <EmptySection text="No additional timeline events are available for this organization." />}
          </AdminPanel>
        </main>

        <aside className="min-w-0">
          <div className="space-y-4 2xl:sticky 2xl:top-[100px]">
            <AdminPanel title="Admin decision" description="Only supported backend decision actions are shown." bodyClassName="p-4 sm:p-5">
              <div className="space-y-3">
                <DecisionDetail label="Current status" value={<AdminStatusBadge status={organization.status} compact />} />
                <DecisionDetail label="Submitted" value={formatAdminDateTime(organization.submittedAt)} />
                <DecisionDetail label="Last updated" value={formatAdminDateTime(organization.updatedAt)} />
              </div>

              {organization.status === 'rejected' && organization.rejectionReason ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4"><span className="text-[10px] font-semibold tracking-[0.12em] text-rose-600 uppercase">Rejection reason</span><p className="mt-2 mb-0 text-sm leading-6 text-rose-800">{organization.rejectionReason}</p></div> : null}

              {reviewable ? (
                <div className="mt-5 grid gap-2">
                  <button type="button" onClick={() => setApproveOpen(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"><CheckCircle2 className="size-[18px]" />Approve organization</button>
                  <button type="button" onClick={() => setRejectOpen(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"><XCircle className="size-[18px]" />Reject organization</button>
                </div>
              ) : <div className={`mt-5 rounded-2xl border p-4 text-sm font-semibold ${organization.status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>This application already has a final decision.</div>}
            </AdminPanel>
          </div>
        </aside>
      </div>

      {approveOpen ? <ApproveOrganizationModal open onClose={() => setApproveOpen(false)} organization={organization} loading={approveMutation.isPending} onConfirm={() => approveMutation.mutate()} /> : null}
      {rejectOpen ? <RejectOrganizationModal open onClose={() => setRejectOpen(false)} organization={organization} loading={rejectMutation.isPending} onConfirm={(payload) => rejectMutation.mutate(payload)} /> : null}
      {selectedDocument ? <DocumentPreviewModal organizationId={organizationId} document={selectedDocument} onClose={() => setSelectedDocument(null)} /> : null}

      <AnimatePresence>
        {decisionSuccess ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1200] grid place-items-center bg-slate-950/55 p-5 backdrop-blur-md" role="status" aria-live="polite">
            <motion.div initial={{ scale: 0.82, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 20 }} className="w-full max-w-sm rounded-[28px] border border-emerald-200 bg-white p-7 text-center shadow-2xl">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1, rotate: [0, -8, 8, 0] }} transition={{ delay: 0.12, type: 'spring' }} className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-10" /></motion.span>
              <h3 className="mt-5 mb-2 text-2xl font-semibold text-slate-950">Organization approved</h3>
              <p className="m-0 text-sm leading-6 text-slate-500">{organization.name} has been approved successfully.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function EntityDetail({ icon: Icon, label, value, className = '' }) {
  return <div className={`min-w-0 ${className}`}><dt className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.11em] text-slate-400 uppercase"><Icon className="size-3.5" />{label}</dt><dd className="mt-2 mb-0 break-words text-sm font-semibold leading-6 text-slate-900">{value || 'Not provided'}</dd></div>;
}

function WalletDetail({ label, value }) {
  return <div className="rounded-xl bg-white/80 p-3 shadow-sm"><span className="text-[10px] font-semibold tracking-[0.1em] text-slate-400 uppercase">{label}</span><strong className="mt-1.5 block break-words text-xs font-semibold text-slate-900">{value || 'Not provided'}</strong></div>;
}

function OwnerCard({ owner }) {
  return <article className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-xs font-semibold text-slate-700">{owner.initials || 'BO'}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold text-slate-950">{owner.name}</strong><span className="mt-1 block text-xs text-slate-500">{owner.nationality || 'Nationality not provided'}{owner.dateOfBirth ? ` · DOB ${formatAdminDate(owner.dateOfBirth)}` : ''}</span></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{owner.ownership || 0}% ownership</span>{owner.isPrimary ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Primary owner</span> : null}</div></article>;
}

function DocumentMetadataCard({ document, onPreview }) {
  return (
    <article className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><FileText className="size-5" /></span>
        <button type="button" onClick={onPreview} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Eye className="size-4" />View</button>
      </div>
      <h3 className="mt-4 mb-1 truncate text-sm font-semibold text-slate-950">{document.name}</h3>
      <p className="m-0 truncate text-xs text-slate-500">{document.fileName}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-slate-400"><span>{document.type || 'FILE'}</span><span>•</span><span>{formatFileSize(document.size)}</span><span>•</span><span>{formatAdminDate(document.uploadedAt, { month: 'short', day: 'numeric' })}</span></div>
      <span className="mt-4 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Uploaded</span>
    </article>
  );
}

function DocumentPreviewModal({ organizationId, document, onClose }) {
  const [objectUrl, setObjectUrl] = useState('');
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const previewQuery = useQuery({
    queryKey: ['admin', 'organization-document-preview', organizationId, document.documentUid || document.id],
    queryFn: () => adminApi.previewOrganizationDocument(organizationId, document.documentUid || document.id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    const blob = previewQuery.data?.blob;
    if (!blob) {
      setObjectUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(blob);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [previewQuery.data?.blob]);

  const contentType = previewQuery.data?.contentType || previewQuery.data?.blob?.type || document?.mimeType || '';
  const previewKind = useMemo(() => {
    const mime = contentType.toLowerCase();
    const type = (document?.type || '').toLowerCase();
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(type)) return 'image';
    if (mime.includes('pdf') || type === 'pdf') return 'pdf';
    return 'file';
  }, [contentType, document?.type]);

  const downloadFile = async () => {
    setDownloading(true);
    try {
      const result = await adminApi.downloadOrganizationDocument(
        organizationId,
        document.documentUid || document.id,
      );
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName || document.fileName || 'organization-document';
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error('Document download failed', { description: error.message });
    } finally {
      setDownloading(false);
    }
  };

  const resetImage = () => {
    setScale(1);
    setRotation(0);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={document?.name || 'Submitted document'}
      className="h-[96dvh] sm:h-[92dvh] sm:max-w-6xl"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-slate-100">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-semibold text-slate-950">{document.fileName || document.name}</p>
            <p className="mt-1 mb-0 text-xs text-slate-500">{document.type || 'FILE'} · {formatFileSize(document.size)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {previewKind === 'image' && objectUrl ? (
              <>
                <button type="button" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50" aria-label="Zoom out"><ZoomOut className="size-4" /></button>
                <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.25))} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50" aria-label="Zoom in"><ZoomIn className="size-4" /></button>
                <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50" aria-label="Rotate image"><RotateCw className="size-4" /></button>
                <button type="button" onClick={resetImage} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Reset</button>
              </>
            ) : null}

            {objectUrl ? (
              <a href={objectUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"><ExternalLink className="size-4" />Open</a>
            ) : null}

            <button type="button" onClick={downloadFile} disabled={downloading || previewQuery.isLoading} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
              {downloading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-slate-200/70 p-3 sm:p-5">
          {previewQuery.isLoading ? (
            <div className="grid min-h-[420px] h-full place-items-center rounded-2xl bg-white">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-8 animate-spin text-blue-600" />
                <p className="mt-3 mb-0 text-sm font-medium text-slate-500">Loading secure document preview…</p>
              </div>
            </div>
          ) : previewQuery.isError ? (
            <div className="grid min-h-[420px] h-full place-items-center rounded-2xl bg-white p-8 text-center">
              <div>
                <FileText className="mx-auto size-10 text-slate-400" />
                <h3 className="mt-4 mb-1 text-base font-semibold text-slate-950">Document preview unavailable</h3>
                <p className="m-0 max-w-md text-sm leading-6 text-slate-500">{previewQuery.error?.message || 'The backend could not return this document for inline review.'}</p>
                <button type="button" onClick={() => previewQuery.refetch()} className="mt-4 min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Try again</button>
              </div>
            </div>
          ) : previewKind === 'image' && objectUrl ? (
            <div className="flex min-h-[420px] h-full items-center justify-center overflow-auto rounded-2xl bg-white p-3 sm:p-6">
              <img
                src={objectUrl}
                alt={document?.name || 'Organization document'}
                className="max-h-none max-w-none origin-center object-contain transition-transform duration-200"
                style={{ transform: `scale(${scale}) rotate(${rotation}deg)`, width: scale <= 1 ? 'auto' : `${Math.min(scale * 70, 180)}%` }}
              />
            </div>
          ) : previewKind === 'pdf' && objectUrl ? (
            <div className="h-full min-h-[520px] overflow-hidden rounded-2xl bg-white shadow-sm">
              <iframe src={objectUrl} title={document?.name || 'Organization PDF'} className="h-full min-h-[520px] w-full border-0" />
            </div>
          ) : objectUrl ? (
            <div className="grid min-h-[420px] h-full place-items-center rounded-2xl bg-white p-8 text-center">
              <div>
                <FileText className="mx-auto size-10 text-slate-400" />
                <h3 className="mt-4 mb-1 text-base font-semibold text-slate-950">Preview is not supported for this file type</h3>
                <p className="m-0 text-sm text-slate-500">Download the file to review it with a compatible application.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function DecisionDetail({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] font-semibold tracking-[0.1em] text-slate-400 uppercase">{label}</span><div className="mt-2 break-words text-sm font-medium text-slate-900">{value || 'Not provided'}</div></div>;
}

function EmptySection({ text }) {
  return <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">{text}</div>;
}
