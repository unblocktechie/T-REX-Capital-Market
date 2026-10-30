import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Headphones,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CreateInvestorProfileModal } from '@/components/investor/CreateInvestorProfileModal';
import { InvestorDocumentList } from '@/components/investor/InvestorDocumentReview';
import { InvestorLayout } from '@/components/investor/InvestorLayout';
import { InvestorActionBar } from '@/components/investor/InvestorPrimitives';
import { WalletCard } from '@/components/investor/WalletCard';
import { ChainSelector } from '@/components/common/ChainSelector';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NO_INVESTMENT_EXPERIENCE_VALUE } from '@/constants/investor';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { useAuth } from '@/hooks/useAuth';
import { usePublicChains } from '@/hooks/useChains';
import { web3Config } from '@/config/web3';
import { useCityOptions, useCountryOptions, useStateOptions } from '@/hooks/useLocationOptions';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { getErrorMessage } from '@/utils/error';
import { isInvestorOnboardingReady } from '@/validations/investor.schemas';
import { formatDate } from '@/utils/date';
import { networkUserKey, useNetworkStore } from '@/store/network.store';
import { useUiStore } from '@/store/ui.store';

const displayLabel = (options, value) =>
  options.find((option) => String(option.value) === String(value))?.label || value || 'Not provided';
const displayDate = (value) =>
  value ? formatDate(value, 'MMM D, YYYY') : 'Not provided';

const getBackendErrorMessage = (error) => {
  const payload = error?.response?.data;
  const message =
    payload?.message ||
    (typeof payload?.error === 'string' ? payload.error : payload?.error?.message);

  return typeof message === 'string' ? message.trim() : '';
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
  const { user } = useAuth();
  const userKey = networkUserKey(user);
  const persistedChainId = useNetworkStore((store) => store.activeChainByUser[userKey] || null);
  const setActiveChainId = useNetworkStore((store) => store.setActiveChainId);
  const setWalletRequiredChainId = useUiStore((store) => store.setWalletRequiredChainId);
  const publicChains = usePublicChains();
  const initialChainUid = web3Config.getChainRecordById(persistedChainId)?.chainUid || web3Config.defaultChainRecord?.chainUid || '';
  const [selectedChainUid, setSelectedChainUid] = useState(initialChainUid);
  const selectedChain = (publicChains.data || []).find((item) => item.chainUid === selectedChainUid) || publicChains.data?.[0] || null;
  const connectedWallet = useWalletConnection(selectedChain?.chainId);

  useEffect(() => {
    setWalletRequiredChainId(selectedChain?.chainId);
    if (selectedChain?.chainId) setActiveChainId(user, selectedChain.chainId, selectedChain.chainUid);
  }, [selectedChain?.chainId, selectedChain?.chainUid, setActiveChainId, setWalletRequiredChainId, user]);

  useEffect(() => () => setWalletRequiredChainId(null), [setWalletRequiredChainId]);
  const [modalOpen, setModalOpen] = useState(state.currentStep === 5);
  const [loadingMessage, setLoadingMessage] = useState('');
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
    if (!selectedChain) {
      toast.error('Select the network where your investor identity should be created.');
      return;
    }
    if (!activeWallet.isConnected) {
      toast.error('Connect the primary investor wallet before continuing.');
      return;
    }
    if (!activeWallet.isCorrectNetwork) {
      toast.error('Switch the connected wallet to the supported network before continuing.');
      return;
    }
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
    setLoadingMessage('Creating your investor profile…');
    try {
      const { result } = await submitInvestor(activeWallet.address, selectedChain.chainUid);
      setModalOpen(false);
      const reference = result?.profileReference || '';
      toast.success(reference ? `Investor profile ${reference} created successfully.` : 'Investor profile created successfully.');
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } catch (error) {
      const backendMessage = getBackendErrorMessage(error);
      toast.error(
        backendMessage || getErrorMessage(error, 'Unable to submit the investor onboarding profile.'),
      );
    } finally {
      setLoadingMessage('');
    }
  };

  const categories = compliance.investmentCategories.length
    ? compliance.investmentCategories
        .map((value) =>
          value === NO_INVESTMENT_EXPERIENCE_VALUE
            ? 'None — no prior investment experience'
            : displayLabel(options.investmentCategories, value),
        )
        .join(', ')
    : String(compliance.yearsOfExperience) === '0'
      ? 'None — no prior investment experience'
      : 'Not provided';
  const lastUpdated = state.lastUpdated
    ? formatDate(state.lastUpdated, 'MMM D, YYYY, h:mm A')
    : 'Not saved yet';

  const actionPanel = (
    <aside className="investor-review-side">
      <Card className="investor-review-action-card">
        <span className="eyebrow">Final action</span>
        <h2>Create your investor profile</h2>
        <p>Connect the primary wallet, review the entered information, and submit the completed onboarding record.</p>
        <ChainSelector
          id="investor-onboarding-chain"
          chains={publicChains.data || []}
          value={selectedChainUid}
          onChange={(event) => setSelectedChainUid(event.target.value)}
          disabled={submitting || publicChains.isPending}
          label="First network"
          description="Your investor ONCHAINID will be created on this network during submission."
          error={publicChains.isError ? 'Unable to load supported networks.' : ''}
        />
        <WalletCard wallet={activeWallet} requiredChainId={selectedChain?.chainId} />
        <Button className="button--full" onClick={openProfileModal} disabled={!ready || !selectedChain || !activeWallet.isConnected || !activeWallet.isCorrectNetwork || submitting} icon={ShieldCheck}>
          Create Investor Profile
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
        description="Confirm each section before linking the primary wallet and creating the investor profile."
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
        wallet={activeWallet}
        ready={ready}
        profileCreated={false}
      />
    </>
  );
}
