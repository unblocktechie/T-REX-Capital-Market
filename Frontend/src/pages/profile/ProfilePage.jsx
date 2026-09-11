import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isAddress } from 'viem';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  Mail,
  MapPin,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { investorApi } from '@/api/investor/investor.api';
import { mapInvestorDocument } from '@/api/investor/investor.mapper';
import { investmentApi } from '@/api/investments';
import { mapEligibility } from '@/api/investments/investment.mapper';
import { CompactAddress } from '@/components/common/CompactAddress';
import { InvestorDocumentList } from '@/components/investor/InvestorDocumentReview';
import { TypedDocumentUploader } from '@/components/investor/TypedDocumentUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorProfileData } from '@/hooks/useInvestorProfileData';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useCityOptions, useCountryOptions, useStateOptions } from '@/hooks/useLocationOptions';
import { getErrorMessage } from '@/utils/error';

const displayLabel = (options, value) =>
  options.find((option) => String(option.value) === String(value))?.label || value || 'Not provided';

const displayDate = (value) => {
  if (!value) return 'Not provided';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
};

function ProfileDetailList({ items }) {
  return (
    <dl className="investor-profile-detail-list">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || 'Not provided'}</dd>
        </div>
      ))}
    </dl>
  );
}


function MarketplaceEligibilityUploadCard({ tokenUid, options, identityDocuments, accreditationDocuments, onProfileRefresh }) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenUid));
  const [selectedTypes, setSelectedTypes] = useState({});
  const [topicDocuments, setTopicDocuments] = useState({});

  const allDocuments = useMemo(
    () => [...(identityDocuments || []), ...(accreditationDocuments || [])],
    [identityDocuments, accreditationDocuments],
  );

  const loadEligibility = async () => {
    if (!tokenUid) return null;
    const raw = await investmentApi.getRequiredDocuments(tokenUid);
    const mapped = mapEligibility(raw || {});
    setEligibility(mapped);
    return mapped;
  };

  useEffect(() => {
    let active = true;
    if (!tokenUid) return undefined;
    setLoading(true);
    investmentApi
      .getRequiredDocuments(tokenUid)
      .then((raw) => {
        if (!active) return;
        setEligibility(mapEligibility(raw || {}));
      })
      .catch((error) => active && toast.error(getErrorMessage(error, 'Unable to load marketplace document requirements.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [tokenUid]);

  useEffect(() => {
    if (!eligibility?.topics) return;
    const next = {};
    eligibility.topics.forEach((topic) => {
      next[topic.claimTopicCode || topic.id] = allDocuments.filter((document) => {
        if (document.claimTopicCode) return document.claimTopicCode === topic.claimTopicCode;
        if (topic.claimTopicCode === 'KYC') return document.documentCategory === 'kyc';
        if (topic.claimTopicCode === 'ACCREDITED_INVESTOR') return document.documentCategory === 'accredited';
        return false;
      });
    });
    setTopicDocuments(next);
  }, [eligibility, allDocuments]);

  if (!tokenUid) return null;

  const documentOptionsForTopic = (topic) => {
    const allOptions = [...(options.identityDocumentTypes || []), ...(options.accreditationDocumentTypes || [])];
    const exact = allOptions.filter((item) => String(item.claimTopicCode || '').toUpperCase() === topic.claimTopicCode);
    if (exact.length) return exact;
    if (topic.claimTopicCode === 'KYC') return options.identityDocumentTypes || [];
    if (topic.claimTopicCode === 'ACCREDITED_INVESTOR') return options.accreditationDocumentTypes || [];
    return [];
  };

  const uploadDocument = async (documentTypeUid, file, onUploadProgress, signal) => {
    const uploaded = await investorApi.uploadDocuments(documentTypeUid, [file], onUploadProgress, signal);
    const rows = Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : [];
    const mapped = rows.map((document) => mapInvestorDocument(document, options));
    if (!mapped.length) throw new Error('The upload completed, but no document record was returned. Please try again.');
    await onProfileRefresh?.();
    await loadEligibility();
    toast.success('Document uploaded. Marketplace eligibility has been refreshed.');
    return mapped[0];
  };

  const deleteDocument = async (documentUid) => {
    await investorApi.deleteDocument(documentUid);
    await onProfileRefresh?.();
    await loadEligibility();
  };

  return (
    <Card className="investor-profile-marketplace-requirements">
      <header>
        <div>
          <span className="eyebrow">Marketplace eligibility</span>
          <h2>Required Verification Documents</h2>
          <p>These documents are required for the token you opened. Upload the requested verification so the issuer can review your eligibility.</p>
        </div>
        {eligibility ? (
          <span className={eligibility.eligible ? 'investor-profile-status' : 'investor-profile-status is-warning'}>
            {eligibility.eligible ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
            {eligibility.eligible ? 'Eligible' : `${eligibility.missingClaimTopics.length} missing`}
          </span>
        ) : null}
      </header>

      {loading ? <Skeleton height={130} /> : eligibility?.topics?.length ? (
        <div className="investor-profile-marketplace-topic-list">
          {eligibility.topics.map((topic) => {
            const key = topic.claimTopicCode || topic.id;
            const topicDocs = topicDocuments[key] || [];
            const topicOptions = documentOptionsForTopic(topic);
            return (
              <section className="investor-profile-marketplace-topic" key={key}>
                <div className="investor-profile-marketplace-topic__heading">
                  <div>
                    <strong>{topic.label || topic.claimTopicCode}</strong>
                    <span>{topic.satisfied ? 'A matching active document is already available.' : 'Upload at least one matching document to complete this verification requirement.'}</span>
                  </div>
                  <span className={topic.satisfied ? 'is-satisfied' : 'is-missing'}>{topic.satisfied ? 'Satisfied' : 'Required'}</span>
                </div>
                {!topic.satisfied ? (
                  topicOptions.length ? (
                    <TypedDocumentUploader
                      documentTypeLabel={`${topic.label || topic.claimTopicCode} Document Type`}
                      documentTypeOptions={topicOptions}
                      documentTypeValue={selectedTypes[key] || ''}
                      onDocumentTypeChange={(value) => setSelectedTypes((current) => ({ ...current, [key]: value }))}
                      value={topicDocs}
                      onChange={(next) => setTopicDocuments((current) => ({ ...current, [key]: next }))}
                      onUpload={uploadDocument}
                      onDelete={deleteDocument}
                      selectionHint="Select a supported document type for this verification requirement, then upload a PDF or supported image."
                    />
                  ) : (
                    <div className="investor-profile-marketplace-topic__unavailable">No supported document type is currently available for this verification requirement.</div>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="investor-profile-marketplace-topic__unavailable">This token does not currently require any additional verification documents.</div>
      )}
    </Card>
  );
}

function InvestorProfilePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const marketplaceTokenUid = searchParams.get('token') || '';
  const profileQuery = useInvestorProfileData();
  const walletConnection = useWalletConnection();
  const state = profileQuery.state;
  const options = profileQuery.options;
  const identity = state?.identity || {};
  const compliance = state?.compliance || {};
  const profile = state?.investorProfile || {};
  const identityDocuments = state?.documents?.identityDocuments || [];
  const accreditationDocuments = compliance.accreditationDocuments || [];

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

  if (profileQuery.isLoading) {
    return (
      <div className="page-stack investor-profile-page">
        <Skeleton height={170} />
      <div className="investor-profile-content-grid">
          <Skeleton height={320} />
          <Skeleton height={320} />
        </div>
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <Card className="investor-profile-load-error">
        <ShieldCheck size={30} />
        <h1>Unable to load your investor profile</h1>
        <p>Your saved investor data has not been changed. Retry the secure profile request.</p>
        <Button onClick={() => profileQuery.refetch()}>Try again</Button>
      </Card>
    );
  }

  const categories = (compliance.investmentCategories || [])
    .map((value) => displayLabel(options.investmentCategories || [], value))
    .join(', ');
  const country = displayLabel(countryOptions, identity.countryOfResidence);
  const stateLabel = displayLabel(stateOptions, identity.stateProvince);
  const city = identity.city
    ? displayLabel(cityOptions, identity.city)
    : identity.cityName || 'Not provided';
  const address = [identity.streetAddress, city, stateLabel, country]
    .filter((value) => value && value !== 'Not provided')
    .join(', ');
  const fullName = `${identity.firstName || ''} ${identity.lastName || ''}`.trim() || user?.name || 'Investor';
  const walletAddress = state.wallet?.address || 'Not linked';
  const connectedWalletMatches = Boolean(
    state.wallet?.address &&
      walletConnection.address &&
      state.wallet.address.toLowerCase() === walletConnection.address.toLowerCase(),
  );
  const walletNetwork = connectedWalletMatches
    ? walletConnection.chain?.name || 'Connected network'
    : 'Connect primary wallet to view';
  const walletBalance = connectedWalletMatches
    ? walletConnection.balanceLabel || 'Balance unavailable'
    : 'Connect primary wallet to view';
  const submittedAt = profileQuery.rawInvestor?.submittedAt || state.lastUpdated;
  const submittedLabel = submittedAt && !Number.isNaN(new Date(submittedAt).getTime())
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submittedAt))
    : 'Not available';

  return (
    <div className="page-stack investor-profile-page">
      <header className="investor-profile-header">
        <div>
          <span className="eyebrow">Investor identity</span>
          <h1>Your investor profile</h1>
          <p>Review your submitted identity, suitability information, verification documents, and linked wallet.</p>
        </div>
        <span className="investor-profile-status"><CheckCircle2 size={16} /> Profile created</span>
      </header>

      <Card className="investor-profile-hero-card">
        <div className="investor-profile-avatar" aria-hidden="true">
          {(fullName || 'I')
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div className="investor-profile-hero-copy">
          <span className="eyebrow">Primary investor</span>
          <h2>{fullName}</h2>
          <p><Mail size={15} /> {user?.email || 'Email not available'}</p>
          <p><MapPin size={15} /> {address || 'Residential address not provided'}</p>
        </div>
        <div className="investor-profile-reference-grid">
          <div>
            <span><UserRoundCheck size={17} /> Profile Reference</span>
            <strong>{profile.profileId || 'Created'}</strong>
          </div>
          <div>
            <span><ShieldCheck size={17} /> On-chain Identity</span>
            {profile.onchainId && isAddress(profile.onchainId, { strict: false }) ? (
              <CompactAddress value={profile.onchainId} label="On-chain identity address" leading={5} trailing={5} />
            ) : (
              <strong>{profile.onchainId || 'Created'}</strong>
            )}
          </div>
          <div>
            <span><WalletCards size={17} /> Primary Wallet</span>
            {isAddress(walletAddress, { strict: false }) ? (
              <CompactAddress value={walletAddress} label="Primary wallet address" leading={5} trailing={5} />
            ) : (
              <strong>{walletAddress}</strong>
            )}
          </div>
          <div>
            <span><WalletCards size={17} /> Wallet Network</span>
            <strong>{walletNetwork}</strong>
          </div>
          <div>
            <span><WalletCards size={17} /> Wallet Balance</span>
            <strong>{walletBalance}</strong>
          </div>
          <div>
            <span><CalendarDays size={17} /> Created</span>
            <strong>{submittedLabel}</strong>
          </div>
        </div>
      </Card>

      <MarketplaceEligibilityUploadCard
        tokenUid={marketplaceTokenUid}
        options={options}
        identityDocuments={identityDocuments}
        accreditationDocuments={accreditationDocuments}
        onProfileRefresh={() => profileQuery.refetch()}
      />

      <div className="investor-profile-content-grid">
        <Card className="investor-profile-section-card">
          <header>
            <div>
              <span className="eyebrow">Identity details</span>
              <h2>Personal Information</h2>
            </div>
            <span className="investor-profile-section-icon"><UserRoundCheck size={19} /></span>
          </header>
          <ProfileDetailList items={[
            ['Full Legal Name', fullName],
            ['Date of Birth', displayDate(identity.dateOfBirth)],
            ['Gender', displayLabel(options.genders || [], identity.gender)],
            ['Tax Residency / Country of Residence', country],
            ['Residential Address', address || 'Not provided'],
          ]} />
        </Card>

        <Card className="investor-profile-section-card">
          <header>
            <div>
              <span className="eyebrow">Suitability profile</span>
              <h2>Investor Profile</h2>
            </div>
            <span className="investor-profile-section-icon"><FileCheck2 size={19} /></span>
          </header>
          <ProfileDetailList items={[
            ['Primary Source of Wealth', compliance.sourceOfWealth],
            ['Estimated Net Worth', compliance.estimatedNetWorth],
            ['Annual Investment Capacity', compliance.annualInvestmentCapacity],
            ['Investment Experience Categories', categories || 'Not provided'],
            ['Years of Investment Experience', compliance.yearsOfExperience],
            ['Previous RWA Experience', compliance.previousRwaExperience === 'yes' ? 'Yes' : 'No'],
            ['RWA Experience Description', compliance.rwaExperienceDescription || 'Not provided'],
          ]} />
        </Card>

        <Card className="investor-profile-section-card investor-profile-document-card">
          <header>
            <div>
              <span className="eyebrow">Verification documents</span>
              <h2>Identity Verification</h2>
            </div>
            <span className="investor-profile-document-count">{identityDocuments.length}</span>
          </header>
          <InvestorDocumentList
            documents={identityDocuments}
            title="Uploaded Identity Documents"
            categoryLabel="Identity"
            downloadDocument={investorApi.downloadDocument}
          />
        </Card>

        <Card className="investor-profile-section-card investor-profile-document-card">
          <header>
            <div>
              <span className="eyebrow">Accreditation</span>
              <h2>Accredited Investor Status</h2>
            </div>
            <span className="investor-profile-document-count">{accreditationDocuments.length}</span>
          </header>
          <ProfileDetailList items={[
            ['Accreditation Type', displayLabel(options.accreditationTypes || [], compliance.accreditationType)],
            ['Profile Status', 'Created'],
          ]} />
          <InvestorDocumentList
            documents={accreditationDocuments}
            title="Uploaded Accreditation Documents"
            categoryLabel="Accreditation"
            downloadDocument={investorApi.downloadDocument}
          />
        </Card>
      </div>

      <div className="investor-profile-security-note">
        <ShieldCheck size={18} />
        <p><strong>Protected investor record</strong><span>Your profile and documents are loaded through authenticated investor APIs. Sensitive fields are displayed only inside your signed-in workspace.</span></p>
      </div>
    </div>
  );
}


export default function ProfilePage() {
  useDocumentTitle('Profile');
  const { user } = useAuth();

  if (user?.role === ROLES.issuer) {
    return <Navigate to={ROUTES.organization} replace />;
  }

  return <InvestorProfilePage />;
}
