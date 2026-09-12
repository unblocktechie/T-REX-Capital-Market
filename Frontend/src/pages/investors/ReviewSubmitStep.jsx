import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Headphones,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PrivyTrustBadge } from '@/components/branding/PrivyBrand';
import { CreateInvestorProfileModal } from '@/components/investor/CreateInvestorProfileModal';
import { InvestorDocumentList } from '@/components/investor/InvestorDocumentReview';
import { InvestorLayout } from '@/components/investor/InvestorLayout';
import { InvestorActionBar } from '@/components/investor/InvestorPrimitives';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { useCityOptions, useCountryOptions, useStateOptions } from '@/hooks/useLocationOptions';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/utils/error';
import { isInvestorOnboardingReady } from '@/validations/investor.schemas';

const displayLabel = (options, value) =>
  options.find((option) => String(option.value) === String(value))?.label || value || 'Not provided';
const displayDate = (value) => {
  if (!value) return 'Not provided';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
};

function ReviewSection({ title, actionLabel = 'Edit', onEdit, children }) {
  return (
    <Card className="investor-review-card">
      <header>
        <h2>{title}</h2>
        <Button variant="ghost" size="sm" icon={Edit3} onClick={onEdit}>{actionLabel}</Button>
      </header>
      {children}
    </Card>
  );
}

function ReviewList({ items }) {
  return (
    <dl className="investor-review-list">
      {items.filter(([, value]) => value !== undefined && value !== '').map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>
      ))}
    </dl>
  );
}

export default function ReviewSubmitStep() {
  const {
    state,
    options,
    setStep,
    submitInvestor,
    submitting,
    downloadDocument,
  } = useInvestorOnboarding();
  const privyWalletAddress = useAuthStore((authState) => authState.user?.privyWalletAddress || '');
  const [modalOpen, setModalOpen] = useState(state.currentStep === 5);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const ready = useMemo(() => isInvestorOnboardingReady(state), [state]);
  const identity = state.identity;
  const documents = state.documents;
  const compliance = state.compliance;
  const { options: countryOptions } = useCountryOptions(
    identity.countryOfResidence
      ? [{ value: identity.countryOfResidence, label: identity.countryOfResidenceName || identity.countryOfResidence }]
      : [],
  );
  const { options: stateOptions } = useStateOptions(
    identity.countryOfResidence,
    identity.stateProvince
      ? [{ value: identity.stateProvince, label: identity.stateProvinceName || identity.stateProvince }]
      : [],
  );
  const { options: cityOptions } = useCityOptions(
    identity.stateProvince,
    identity.city ? [{ value: identity.city, label: identity.cityName || identity.city }] : [],
  );
  const openProfileModal = () => {
    if (!ready) {
      toast.error('Complete all required onboarding sections before creating the investor profile.');
      return;
    }
    if (!privyWalletAddress) {
      toast.error('Your secure wallet is not linked yet. Confirm your email before continuing.');
      return;
    }
    setSubmissionError('');
    setModalOpen(true);
    setStep(5);
  };

  const closeProfileModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setStep(4, { markReached: false });
  };

  const createProfileAndSubmit = async () => {
    if (submitting) return;
    setSubmissionError('');
    setLoadingMessage('Creating your investor profile…');
    try {
      const { result } = await submitInvestor();
      setModalOpen(false);
      const reference = result?.profileReference || '';
      toast.success(reference ? `Investor profile ${reference} created successfully.` : 'Investor profile created successfully.');
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } catch (error) {
      setSubmissionError(getErrorMessage(error, 'Unable to submit the investor onboarding profile.'));
    } finally {
      setLoadingMessage('');
    }
  };

  const categories = compliance.investmentCategories
    .map((value) => displayLabel(options.investmentCategories, value))
    .join(', ');
  const lastUpdatedDate = state.lastUpdated ? new Date(state.lastUpdated) : null;
  const lastUpdated = lastUpdatedDate && !Number.isNaN(lastUpdatedDate.getTime())
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(lastUpdatedDate)
    : 'Not saved yet';

  const actionPanel = (
    <aside className="investor-review-side">
      <Card className="investor-review-action-card">
        <span className="eyebrow">Final action</span>
        <h2>Create your investor profile</h2>
        <p>Review your information, then create your investor profile. Your secure wallet is already linked to your account.</p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <PrivyTrustBadge compact tone="soft" label="Investor embedded wallet" className="mb-3" />
          <small className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Secure wallet</small>
          <strong className="mt-2 block text-sm leading-5 text-slate-950">
            {privyWalletAddress ? 'Your wallet is securely managed and ready to use.' : 'Your secure wallet is not ready yet.'}
          </strong>
          {privyWalletAddress ? (
            <details className="mt-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-800">View wallet details</summary>
              <p className="mt-2 mb-0 break-all font-mono" title={privyWalletAddress}>
                {privyWalletAddress}
              </p>
            </details>
          ) : null}
        </div>
        <Button className="button--full" onClick={openProfileModal} disabled={!ready || !privyWalletAddress || submitting} icon={ShieldCheck}>
          Create my profile
        </Button>
        <small>Last updated: {lastUpdated}</small>
      </Card>

      <Card className="investor-help-panel">
        <span><Headphones size={20} /></span>
        <div><strong>Need compliance assistance?</strong><p>Contact the compliance desk for help understanding an onboarding field.</p><Button variant="ghost" size="sm" onClick={() => toast.info('Please contact your configured compliance support channel.')}>Contact Compliance Desk</Button></div>
      </Card>

      <div className="investor-encryption-note"><LockKeyhole size={18} /><p><strong>Secure document access</strong><span>Your records and documents are protected and available only to authorized users.</span></p></div>
    </aside>
  );

  return (
    <>
      <InvestorLayout
        eyebrow="Identification → Questionnaire → Review and Submit"
        title="Review and Submit"
        description="Confirm each section before creating your investor profile. Your Privy secure account is already linked."
        side={actionPanel}
        wide
      >
        <ReviewSection title="Personal Information" onEdit={() => setStep(1, { markReached: false })}>
          <ReviewList items={[
            ['Full Legal Name', `${identity.firstName} ${identity.lastName}`.trim()],
            ['Date of Birth', displayDate(identity.dateOfBirth)],
            ['Gender', displayLabel(options.genders, identity.gender)],
            ['Tax Residency / Country of Residence', displayLabel(countryOptions, identity.countryOfResidence)],
            ['Residential Address', [
              identity.streetAddress,
              displayLabel(cityOptions, identity.city),
              displayLabel(stateOptions, identity.stateProvince),
              displayLabel(countryOptions, identity.countryOfResidence),
            ].filter((value) => value && value !== 'Not provided').join(', ')],
          ]} />
        </ReviewSection>

        <ReviewSection title="Identity Verification" actionLabel="Update" onEdit={() => setStep(2, { markReached: false })}>
          <InvestorDocumentList
            documents={documents.identityDocuments || []}
            title="Uploaded Identity Documents"
            categoryLabel="Identity"
            downloadDocument={downloadDocument}
          />
        </ReviewSection>

        <ReviewSection title="Accredited Investor Status" actionLabel="Update" onEdit={() => setStep(3, { markReached: false })}>
          <ReviewList items={[
            ['Accreditation Type', displayLabel(options.accreditationTypes, compliance.accreditationType)],
            ['Profile Status', 'Ready to Submit'],
          ]} />
          <InvestorDocumentList
            documents={compliance.accreditationDocuments || []}
            title="Uploaded Accreditation Documents"
            categoryLabel="Accreditation"
            downloadDocument={downloadDocument}
          />
        </ReviewSection>

        <ReviewSection title="Investor Profile" onEdit={() => setStep(3, { markReached: false })}>
          <ReviewList items={[
            ['Primary Source of Wealth', compliance.sourceOfWealth],
            ['Estimated Net Worth', compliance.estimatedNetWorth],
            ['Annual Investment Capacity', compliance.annualInvestmentCapacity],
            ['Investment Experience Categories', categories],
            ['Years of Investment Experience', compliance.yearsOfExperience],
            ['Previous RWA Experience', compliance.previousRwaExperience === 'yes' ? 'Yes' : 'No'],
            ['RWA Experience Description', compliance.rwaExperienceDescription || 'Not provided'],
          ]} />
        </ReviewSection>

        <div className="investor-review-confirmation">
          <CheckCircle2 size={20} />
          <p><strong>Review complete?</strong><span>Your Privy secure account is already linked. Create your investor profile when the details are correct.</span></p>
        </div>

        <InvestorActionBar>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(3, { markReached: false })}>Back to Questionnaire</Button>
        </InvestorActionBar>
      </InvestorLayout>

      <CreateInvestorProfileModal
        open={modalOpen}
        onClose={closeProfileModal}
        onConfirm={createProfileAndSubmit}
        loading={submitting}
        loadingMessage={loadingMessage}
        error={submissionError}
        walletAddress={privyWalletAddress}
        ready={ready}
      />
    </>
  );
}
