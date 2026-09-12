import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PrivyTrustBadge } from '@/components/branding/PrivyBrand';
import { OrganizationActionBar } from '@/components/organization/OrganizationActionBar';
import { OrganizationPageLayout } from '@/components/organization/OrganizationPageLayout';
import { getOrganizationStepRoute } from '@/components/organization/OrganizationStepper';
import { ReadOnlyDetailSection } from '@/components/organization/ReadOnlyDetailSection';
import { SubmissionConfirmationModal } from '@/components/organization/SubmissionConfirmationModal';
import { UploadedDocumentList } from '@/components/organization/UploadedDocumentList';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { organizationDocumentService } from '@/services/organizationDocumentService';
import { getErrorMessage } from '@/utils/error';
import { useAuthStore } from '@/store/auth.store';
import { shortenWalletAddress } from '@/utils/wallet';
import { isOrganizationReadyForSubmission } from '@/validations/organization.schemas';

const EditButton = ({ onClick, label }) => (
  <Button variant="ghost" size="sm" icon={Edit3} onClick={onClick} aria-label={`Edit ${label}`}>
    Edit
  </Button>
);

export default function ReviewSubmissionPage() {
  useDocumentTitle('Final Review & Submission');
  const navigate = useNavigate();
  const privyWalletAddress = useAuthStore((state) => state.user?.privyWalletAddress || '');
  const { organization, refresh, saveConfirmations, setCurrentStep, submit } = useOrganization();
  const [confirmations, setConfirmations] = useState(organization.confirmations);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    setConfirmations(organization.confirmations);
  }, [organization.confirmations]);

  const allConfirmed = Object.values(confirmations).every(Boolean);
  const applicationComplete = isOrganizationReadyForSubmission(organization);
  const walletReady = Boolean(privyWalletAddress);

  const updateConfirmation = (key, checked) => {
    const next = { ...confirmations, [key]: checked };
    setConfirmations(next);
    saveConfirmations(next);
  };

  const previewDocument = async (document, download = false) => {
    try {
      await organizationDocumentService.open(document, download);
    } catch (error) {
      toast.error('Document unavailable', {
        description: getErrorMessage(error, 'The document could not be opened.'),
      });
    }
  };

  const confirmSubmission = async () => {
    if (!applicationComplete || !allConfirmed || !walletReady) return;
    setSubmitting(true);
    try {
      await submit();
      setModalOpen(false);
      toast.success('Application submitted', {
        description: 'Your Privy secure account is linked and the organization review is now in progress.',
      });
      navigate(ROUTES.organizationPending, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to submit the organization application.'));
    } finally {
      setSubmitting(false);
    }
  };

  const goToStep = (targetStep) => {
    setCurrentStep(targetStep);
    navigate(getOrganizationStepRoute(targetStep));
  };

  const company = organization.company;
  const jurisdiction = organization.jurisdiction;

  return (
    <OrganizationPageLayout
      step={5}
      title="Final Review & Submission"
      description="Review the organization details and confirm the final declarations. Your Privy secure account is already linked."
      onStepChange={submitting ? undefined : goToStep}
    >
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(330px,360px)]">
        <div className="grid min-w-0 gap-4">
          <ReadOnlyDetailSection
            title="Company Information"
            description="Official legal profile and registered office."
            action={
              <EditButton
                label="Company Information"
                onClick={() => {
                  setCurrentStep(1);
                  navigate(ROUTES.organizationCompany);
                }}
              />
            }
            rows={[
              { label: 'Legal Company Name', value: company.legalName },
              { label: 'Entity Type', value: company.entityTypeName || company.entityType },
              { label: 'Registration Number', value: company.registrationNumber },
              {
                label: 'Registered Address',
                wide: true,
                value: [
                  company.address.street,
                  company.address.cityName || company.address.city,
                  company.address.stateName || company.address.state,
                  company.address.countryName || company.address.country,
                  company.postalCode,
                ]
                  .filter(Boolean)
                  .join(', '),
              },
            ]}
          />

          <ReadOnlyDetailSection
            title="Jurisdiction and Regulatory Details"
            description="Primary incorporation and business information."
            action={
              <EditButton
                label="Jurisdiction"
                onClick={() => {
                  setCurrentStep(2);
                  navigate(ROUTES.organizationJurisdiction);
                }}
              />
            }
            rows={[
              {
                label: 'Country of Incorporation',
                value: jurisdiction.countryOfIncorporationName || jurisdiction.countryOfIncorporation,
              },
              { label: 'Date of Incorporation', value: jurisdiction.dateOfIncorporation },
              {
                label: 'Tax ID / VAT / GST Number',
                value: jurisdiction.taxIdentificationNumber || 'Not provided',
              },
              { label: 'Industry', value: jurisdiction.industryName || jurisdiction.industry },
              { label: 'Website', value: jurisdiction.website || 'Not provided' },
              { label: 'Business Activity', wide: true, value: jurisdiction.businessActivity },
            ]}
          />

          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm">
            <header className="relative block border-b border-slate-200 px-5 py-4 pr-24 sm:px-6 sm:pr-28">
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">Ultimate Beneficial Owners</h2>
                <p className="mt-1 mb-0 text-sm text-slate-500">Individuals disclosed as owners or controlling persons.</p>
              </div>
              <div className="absolute top-4 right-5 sm:right-6 [&_.button]:!w-auto">
                <EditButton
                  label="UBO Details"
                  onClick={() => {
                    setCurrentStep(3);
                    navigate(ROUTES.organizationUbo);
                  }}
                />
              </div>
            </header>
            <div className="grid gap-3 p-5 sm:p-6">
              {organization.beneficialOwners.map((owner, index) => (
                <article
                  className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
                  key={owner.id || `${owner.fullName}-${index}`}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-xs font-semibold text-white">
                    {owner.fullName
                      ?.split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase() || 'UB'}
                  </span>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-slate-950">{owner.fullName}</strong>
                    <small className="mt-1 block truncate text-xs text-slate-500">
                      {owner.nationalityName || owner.nationality} ·{' '}
                      {owner.relationship || (owner.isPrimary ? 'Primary beneficial owner' : 'Beneficial owner')}
                    </small>
                  </div>
                  <b className="rounded-lg bg-emerald-100 px-2.5 py-1 text-sm text-emerald-800">
                    {Number(owner.ownershipPercentage).toFixed(2)}%
                  </b>
                </article>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm">
            <header className="relative block border-b border-slate-200 px-5 py-4 pr-24 sm:px-6 sm:pr-28">
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">Submitted Documents</h2>
                <p className="mt-1 mb-0 text-sm text-slate-500">Legal filings prepared for the compliance review.</p>
              </div>
              <div className="absolute top-4 right-5 sm:right-6 [&_.button]:!w-auto">
                <EditButton
                  label="Documents"
                  onClick={() => {
                    setCurrentStep(4);
                    navigate(ROUTES.organizationDocuments);
                  }}
                />
              </div>
            </header>
            <div className="p-5 sm:p-6">
              <UploadedDocumentList
                documents={organization.documents}
                onPreview={previewDocument}
                onDownload={(document) => previewDocument(document, true)}
              />
            </div>
          </Card>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <Card className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-xl shadow-slate-200/60">
            <div className="bg-slate-950 p-5 text-white sm:p-6">
              <span className="grid size-12 place-items-center rounded-2xl bg-[var(--primary-500)] text-white">
                <ShieldCheck size={25} />
              </span>
              <span className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary-100)]">
                Final authorization
              </span>
              <h2 className="mt-2 mb-2 text-2xl font-semibold text-white">Ready to submit?</h2>
              <p className="m-0 text-sm leading-6 text-slate-300">
                Your Privy secure account will be used to manage assets and confirm important issuer actions.
              </p>
            </div>

            <div className="grid min-w-0 gap-5 p-5 sm:p-6">
              {!applicationComplete ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
                  Complete all required company, jurisdiction, and UBO fields, then upload at least one document before submission.
                </div>
              ) : null}

              <div className="grid min-w-0 gap-3">
                <h3 className="m-0 text-sm font-semibold text-slate-950">Privy secure account</h3>
                <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <PrivyTrustBadge compact tone="soft" label="Issuer embedded wallet" className="mb-3" />
                  <strong className="block text-sm text-slate-950">
                    {privyWalletAddress ? 'Securely managed by Privy' : 'Secure account not linked'}
                  </strong>
                  <p className="mt-2 mb-0 text-xs leading-5 text-slate-500">
                    You do not need to connect another account. Your Privy secure account is linked to your T-REX profile.
                  </p>
                  {privyWalletAddress ? (
                    <details className="mt-3 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-800">View Privy wallet details</summary>
                      <p className="mt-2 mb-0 break-all font-mono" title={privyWalletAddress}>
                        {shortenWalletAddress(privyWalletAddress, 10, 10)}
                      </p>
                    </details>
                  ) : null}
                </div>
                {!walletReady ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
                    Complete Privy email verification and secure account setup before submitting the organization.
                  </div>
                ) : null}
              </div>

              <div className="grid min-w-0 gap-3 border-t border-slate-200 pt-5">
                <h3 className="m-0 text-sm font-semibold text-slate-950">Required declarations</h3>
                {[
                  ['ownershipAccurate', 'I confirm all beneficial ownership details are current and accurate.'],
                  ['processingTimeAccepted', 'I understand that verification may take 2–3 business days.'],
                  ['authorizedSubmitter', 'I confirm that I am authorized to submit this application.'],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)]"
                  >
                    <input
                      type="checkbox"
                      required
                      aria-required="true"
                      checked={confirmations[key]}
                      onChange={(event) => updateConfirmation(key, event.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-[var(--primary-500)]"
                    />
                    <span className="min-w-0 break-words text-xs leading-5 text-slate-700">
                      {label} <span className="font-bold text-rose-600">*</span>
                    </span>
                  </label>
                ))}
              </div>

              <Button
                className="w-full"
                size="lg"
                icon={Send}
                disabled={!walletReady || !allConfirmed || !applicationComplete || submitting}
                onClick={() => setModalOpen(true)}
              >
                Submit Application
              </Button>
            </div>
          </Card>
        </aside>
      </div>

      <OrganizationActionBar>
        <Button
          variant="ghost"
          icon={ArrowLeft}
          disabled={submitting}
          onClick={() => {
            setCurrentStep(4);
            navigate(ROUTES.organizationDocuments);
          }}
        >
          Back to Documentation
        </Button>
        <span className="flex-1" />
        <span className="hidden items-center gap-2 text-sm font-semibold text-slate-500 sm:flex">
          <CheckCircle2 size={16} className="text-emerald-500" /> Review all sections before submitting
        </span>
      </OrganizationActionBar>

      <SubmissionConfirmationModal
        open={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        onConfirm={confirmSubmission}
        loading={submitting}
        walletAddress={privyWalletAddress}
      />
    </OrganizationPageLayout>
  );
}
