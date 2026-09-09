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
import { CreateInvestorProfileModal } from '@/components/investor/CreateInvestorProfileModal';
import { InvestorDocumentReview } from '@/components/investor/InvestorDocumentReview';
import { InvestorLayout } from '@/components/investor/InvestorLayout';
import { InvestorActionBar } from '@/components/investor/InvestorPrimitives';
import { WalletCard } from '@/components/investor/WalletCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { createMockInvestorProfile, submitMockInvestmentRequest } from '@/services/investor';
import { isInvestorOnboardingReady } from '@/validations/investor.schemas';
import { INVESTMENT_CATEGORIES, ACCREDITATION_OPTIONS } from '@/constants/investor';

const displayLabel = (options, value) => options.find((option) => option.value === value)?.label || value || 'Not provided';
const formatDocumentCount = (documents = []) => `${documents.length} ${documents.length === 1 ? 'document' : 'documents'} uploaded`;
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
    updateSection,
    patchState,
    setStep,
    markSubmitted,
  } = useInvestorOnboarding();
  const connectedWallet = useWalletConnection();
  const [modalOpen, setModalOpen] = useState(state.currentStep === 5);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const ready = useMemo(() => isInvestorOnboardingReady(state), [state]);
  const identity = state.identity;
  const documents = state.documents;
  const compliance = state.compliance;
  const activeWallet = useMemo(
    () => ({
      isConnected: Boolean(connectedWallet.isConnected && connectedWallet.address),
      isCorrectNetwork: connectedWallet.isCorrectNetwork,
      address: connectedWallet.address || '',
      displayAddress: connectedWallet.shortAddress || connectedWallet.address || 'Not connected',
      network:
        connectedWallet.chain?.name ||
        (connectedWallet.isConnected ? 'Unsupported network' : 'Not connected'),
      balance: connectedWallet.balanceLabel || 'Balance unavailable',
      connectorName: connectedWallet.connector?.name || '',
    }),
    [
      connectedWallet.address,
      connectedWallet.balanceLabel,
      connectedWallet.chain?.name,
      connectedWallet.connector?.name,
      connectedWallet.isConnected,
      connectedWallet.isCorrectNetwork,
      connectedWallet.shortAddress,
    ],
  );

  const openProfileModal = () => {
    if (!ready) {
      toast.error('Complete all required onboarding sections before creating the investor profile.');
      return;
    }
    if (!activeWallet.isConnected) {
      toast.error('Connect the primary investor wallet before continuing.');
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
    setSubmitting(true);
    setSubmissionError('');
    try {
      let profile = state.investorProfile;
      if (!profile.profileId) {
        setLoadingMessage('Creating your simulated investor profile and ONCHAINID reference…');
        profile = await createMockInvestorProfile({ walletAddress: activeWallet.address });
        if (!profile?.profileId) throw new Error('The profile service returned an empty response. Please retry.');
        updateSection('investorProfile', profile);
        toast.success(`Investor profile ${profile.profileId} created.`);
      }

      setLoadingMessage('Finalizing your investor profile…');
      const request = await submitMockInvestmentRequest({
        investorProfileId: profile.profileId,
        walletAddress: activeWallet.address,
      });
      if (!request?.requestId) throw new Error('The profile completion service returned an empty response. Please retry.');
      const completedState = {
        ...state,
        wallet: activeWallet,
        currentStep: 6,
        highestStepReached: 6,
        investorProfile: profile,
        investmentRequest: request,
        lastUpdated: new Date().toISOString(),
      };
      patchState({ wallet: activeWallet, investorProfile: profile, investmentRequest: request });
      markSubmitted(completedState);
      setModalOpen(false);
      toast.success('Investor profile created successfully.');
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } catch (error) {
      setSubmissionError(error.message || 'Unable to finish creating the investor profile.');
    } finally {
      setSubmitting(false);
      setLoadingMessage('');
    }
  };

  const categories = compliance.investmentCategories.map((value) => displayLabel(INVESTMENT_CATEGORIES, value)).join(', ');
  const lastUpdated = state.lastUpdated
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.lastUpdated))
    : 'Not saved yet';

  const actionPanel = (
    <aside className="investor-review-side">
      <Card className="investor-review-action-card">
        <span className="eyebrow">Final action</span>
        <h2>Create your investor profile</h2>
        <p>Connect the primary wallet, review the entered information, and complete your investor profile setup.</p>
        <WalletCard wallet={activeWallet} />
        <Button className="button--full" onClick={openProfileModal} disabled={!ready || !activeWallet.isConnected || !activeWallet.isCorrectNetwork} icon={ShieldCheck}>
          Create Investor Profile
        </Button>
        <small>Last updated: {lastUpdated}</small>
      </Card>

      <Card className="investor-help-panel">
        <span><Headphones size={20} /></span>
        <div><strong>Need compliance assistance?</strong><p>Contact the compliance desk for help understanding an onboarding field.</p><Button variant="ghost" size="sm" onClick={() => toast.info('Compliance desk contact is simulated in this frontend flow.')}>Contact Compliance Desk</Button></div>
      </Card>

      <div className="investor-encryption-note"><LockKeyhole size={18} /><p><strong>AES-256 Encryption</strong><span>This is an informational UI message only; no production encryption service is connected.</span></p></div>
    </aside>
  );

  return (
    <>
      <InvestorLayout
        eyebrow="Identification → Questionnaire → Review and Submit"
        title="Review and Submit"
        description="Confirm each section before linking the primary wallet and creating the investor profile."
        side={actionPanel}
        wide
      >
        <ReviewSection title="Personal Information" onEdit={() => setStep(1, { markReached: false })}>
          <ReviewList items={[
            ['Full Legal Name', `${identity.firstName} ${identity.lastName}`.trim()],
            ['Date of Birth', displayDate(identity.dateOfBirth)],
            ['Gender', identity.gender ? identity.gender[0].toUpperCase() + identity.gender.slice(1) : 'Not provided'],
            ['Tax Residency / Country of Residence', identity.countryOfResidence],
            ['Residential Address', `${identity.streetAddress}, ${identity.city}, ${identity.stateProvince}, ${identity.countryOfResidence}`],
          ]} />
        </ReviewSection>

        <ReviewSection title="Identity Verification" actionLabel="Update" onEdit={() => setStep(2, { markReached: false })}>
          <ReviewList items={[
            ['Uploaded Identity Documents', formatDocumentCount(documents.identityDocuments || [])],
          ]} />
        </ReviewSection>

        <ReviewSection title="Accredited Investor Status" actionLabel="Update" onEdit={() => setStep(3, { markReached: false })}>
          <ReviewList items={[
            ['Accreditation Type', displayLabel(ACCREDITATION_OPTIONS, compliance.accreditationType)],
            ['Uploaded Accreditation Documents', formatDocumentCount(compliance.accreditationDocuments || [])],
            ['Profile Status', 'Ready to Create'],
          ]} />
        </ReviewSection>

        <InvestorDocumentReview
          identityDocuments={documents.identityDocuments || []}
          accreditationDocuments={compliance.accreditationDocuments || []}
        />

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
          <p><strong>Review complete?</strong><span>Connect the wallet in the action panel and create your investor profile.</span></p>
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
        wallet={activeWallet}
        ready={ready}
        profileCreated={Boolean(state.investorProfile.profileId)}
      />
    </>
  );
}
