import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  HelpCircle,
  Info,
  Landmark,
  LockKeyhole,
  Mail,
  RotateCcw,
  Scale,
  Send,
  ShieldCheck,
  ShoppingCart,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  SubmitInterestModal,
  UploadMissingDocumentsModal,
} from '@/components/investor-marketplace/MarketplaceModals';
import { MarketplaceStatusBadge } from '@/components/investor-marketplace/MarketplaceStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { MARKETPLACE_STATUS } from '@/services/investor/investorMarketplaceLocalService';
import { getErrorMessage } from '@/utils/error';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const displayNumber = (value) => value == null ? '—' : number.format(value);
const displayPrice = (value, currency) => value == null ? '—' : `$${number.format(value)}${currency ? ` ${currency}` : ''}`;

function SnapshotCard({ label, children }) {
  return <div className="marketplace-snapshot-card"><span>{label}</span><strong>{children}</strong></div>;
}

function ComplianceRule({ icon: Icon, title, children, status }) {
  return (
    <div className="marketplace-compliance-rule">
      <span className="marketplace-compliance-rule__icon"><Icon size={17} /></span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      {status ? <span className={`marketplace-topic-state marketplace-topic-state--${status.tone}`}>{status.label}</span> : null}
    </div>
  );
}

function TokenDocument({ document }) {
  const iconByCategory = { offering: FileText, audit: FileCheck2, performance: ClipboardCheck, tax: Scale };
  const Icon = iconByCategory[document.category] || FileText;
  return (
    <button type="button" className={`marketplace-document-chip marketplace-document-chip--${document.category}`} onClick={() => toast.info('Document preview is not available for this offering yet.')}>
      <span><Icon size={17} /></span>
      <span className="marketplace-document-chip__copy"><strong>{document.name}</strong><small>{[document.type, document.size].filter(Boolean).join(' · ')}</small></span>
      <ExternalLink size={14} className="marketplace-document-chip__external" />
    </button>
  );
}

function ComplianceStatus({ token }) {
  const topics = token.eligibility?.topics || [];
  if (!topics.length) return null;
  return (
    <div className="marketplace-compliance-status">
      <span className="marketplace-side-section-label">Required claim topics</span>
      {topics.map((topic) => (
        <div key={topic.id || topic.claimTopicCode}>
          <span><UserRoundCheck size={15} /> {topic.label || topic.claimTopicCode}</span>
          <strong>{topic.rejected ? 'Re-upload' : topic.satisfied ? 'Ready' : 'Missing'}</strong>
        </div>
      ))}
    </div>
  );
}

function OfferingStatusPanel({ token, onPrimaryAction, onSecondaryAction, onInvest, onSend, onRedeem, actionLoading }) {
  const rejection = token.eligibility?.rejection || token.interest || {};
  const canResubmitDocuments = token.status === MARKETPLACE_STATUS.REJECTED
    && String(rejection.rejectReasonType || '').toUpperCase() === 'DOC_REJECTED'
    && rejection.canResubmit === true;

  return (
    <Card className="marketplace-status-panel">
      <div className="marketplace-status-panel__topline"><span>Investment Status</span><small>{token.interest?.interestUid ? `Request: ${token.interest.interestUid.slice(0, 12)}…` : 'No active request'}</small></div>

      {token.status === MARKETPLACE_STATUS.NOT_APPLIED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--neutral"><Info size={19} /><div><strong>Not Applied</strong><span>Your required claim-topic documents are complete. You can submit an interest for issuer review.</span></div></div>
          <Button className="marketplace-status-panel__primary" onClick={onPrimaryAction} loading={actionLoading}>Submit Interest</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.READY_TO_INVEST ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--warning"><CheckCircle2 size={19} /><div><strong>Action Required</strong><span>You are eligible to invest in this token. Choose Invest to continue.</span></div></div>
          <Button className="marketplace-status-panel__primary" icon={ShoppingCart} onClick={onInvest}>Invest</Button>
          <div className="marketplace-status-panel__asset-actions" aria-label="Token actions">
            <Button variant="secondary" icon={Send} onClick={onSend}>Send</Button>
            <Button variant="secondary" icon={RotateCcw} onClick={onRedeem}>Redeem</Button>
          </div>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.ACTION_REQUIRED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--warning"><LockKeyhole size={19} /><div><strong>Documents Required</strong><span>Upload the missing claim-topic documents requested for this offering.</span></div></div>
          <Button className="marketplace-status-panel__primary" onClick={onPrimaryAction} loading={actionLoading}>Upload Missing Documents</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.PENDING_REVIEW ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--pending"><Clock3 size={19} /><div><strong>Pending Review</strong><span>Your investment interest was submitted and is being reviewed by the issuer.</span></div></div>
          <p className="marketplace-status-panel__estimate">Submitted {token.interest?.submittedAt ? new Date(token.interest.submittedAt).toLocaleString() : 'recently'}.</p>
          <Button className="marketplace-status-panel__primary" onClick={onSecondaryAction}>View Application</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.CLAIM_REQUIRED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--warning"><LockKeyhole size={19} /><div><strong>Action Required</strong><span>Your application has been approved by the issuer. Submit the required claim to complete verification and enable your investment.</span></div></div>
          <Button className="marketplace-status-panel__primary" onClick={onSecondaryAction}>Submit Claim</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.CLAIMS_SUBMITTED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--pending"><Clock3 size={19} /><div><strong>Claims Submitted</strong><span>All required investor claims successfully submitted and verified on-chain. The issuer is now completing the final verification step. This may take 1–2 business days.</span></div></div>
          <Button className="marketplace-status-panel__primary" onClick={onSecondaryAction}>View Application</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.APPROVED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--success"><CheckCircle2 size={19} /><div><strong>Approved</strong><span>The issuer approved your investment interest.</span></div></div>
          <p className="marketplace-status-panel__estimate">Settlement and token purchase are not available from this page yet.</p>
          <Button className="marketplace-status-panel__primary" onClick={onSecondaryAction}>View Application</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.REJECTED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--rejected"><XCircle size={19} /><div><strong>Rejected</strong><span>{rejection.rejectReason || 'The issuer rejected this investment interest.'}</span></div></div>
          {canResubmitDocuments ? (
            <>
              {rejection.resubmitRemaining != null ? <p className="marketplace-status-panel__estimate">Resubmission attempts remaining: {rejection.resubmitRemaining}</p> : null}
              <Button className="marketplace-status-panel__primary" onClick={onPrimaryAction} loading={actionLoading}>Upload Requested Documents</Button>
            </>
          ) : <Button className="marketplace-status-panel__primary" onClick={onSecondaryAction}>View Application</Button>}
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.CANCELLED ? (
        <>
          <div className="marketplace-status-callout marketplace-status-callout--neutral"><Info size={19} /><div><strong>Cancelled</strong><span>This investment interest is no longer active.</span></div></div>
          <Button className="marketplace-status-panel__primary" onClick={onSecondaryAction}>View Application</Button>
        </>
      ) : null}

      {token.status === MARKETPLACE_STATUS.VERIFIED_HOLDER ? (
        <div className="marketplace-status-callout marketplace-status-callout--success"><CheckCircle2 size={19} /><div><strong>Verified Holder</strong><span>Your identity is whitelisted for this asset.</span></div></div>
      ) : null}

      <ComplianceStatus token={token} />
    </Card>
  );
}

export default function MarketplaceTokenDetailsPage() {
  const { tokenId } = useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [interestNote, setInterestNote] = useState('');
  const [imageObjectUrl, setImageObjectUrl] = useState('');
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documentTypesLoading, setDocumentTypesLoading] = useState(false);

  useDocumentTitle(token ? `${token.name} · Marketplace` : 'Marketplace Offering');

  const loadOffering = async () => {
    const offering = await investorMarketplaceService.getOffering(tokenId);
    setToken(offering);
    return offering;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadOffering()
      .catch((error) => {
        if (active) toast.error(getErrorMessage(error, 'Unable to load this offering.'));
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [tokenId]);

  useEffect(() => {
    if (!token?.id || (!token?.hasImage && !token?.imageUrl)) {
      setImageObjectUrl('');
      return undefined;
    }
    const controller = new AbortController();
    let nextUrl = '';
    investorMarketplaceService.getTokenImageBlob(token.id, controller.signal)
      .then((blob) => {
        if (!blob) return;
        nextUrl = URL.createObjectURL(blob);
        setImageObjectUrl(nextUrl);
      })
      .catch((error) => {
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') setImageObjectUrl('');
      });
    return () => {
      controller.abort();
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [token?.id, token?.hasImage, token?.imageUrl]);

  const copyValue = async (value, label) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied.`); }
    catch { toast.error(`Could not copy ${label.toLowerCase()}.`); }
  };

  const loadDocumentTypes = async () => {
    setDocumentTypesLoading(true);
    try {
      const options = await investorMarketplaceService.getDocumentUploadOptions();
      setDocumentTypes(options || []);
      return options || [];
    } finally {
      setDocumentTypesLoading(false);
    }
  };

  const prepareDocumentUpload = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      let current = token;
      if (current.status === MARKETPLACE_STATUS.ACTION_REQUIRED) {
        current = await investorMarketplaceService.ensureInterest(current.id);
        setToken(current);
        if (current.status === MARKETPLACE_STATUS.PENDING_REVIEW) {
          toast.success('Your investment interest is ready for issuer review.');
          return;
        }
      }

      if (current.status === MARKETPLACE_STATUS.REJECTED) {
        const rejection = current.eligibility?.rejection || current.interest || {};
        const isDocumentRejection = String(rejection.rejectReasonType || '').toUpperCase() === 'DOC_REJECTED';
        if (!isDocumentRejection || rejection.canResubmit !== true) {
          toast.error('This rejected interest is not eligible for document resubmission.');
          return;
        }
      }

      await loadDocumentTypes();
      setModal('verification');
    } catch (error) {
      if (error?.response?.status === 409) await loadOffering().catch(() => null);
      toast.error(getErrorMessage(error, 'Unable to prepare the requested document upload.'));
    } finally {
      setActionLoading(false);
    }
  };

  const openPrimaryAction = () => {
    if (!token) return;
    if (token.status === MARKETPLACE_STATUS.NOT_APPLIED) {
      if (token.eligibility?.eligible === false) void prepareDocumentUpload();
      else setModal('interest');
      return;
    }
    if (token.status === MARKETPLACE_STATUS.ACTION_REQUIRED || token.status === MARKETPLACE_STATUS.REJECTED) {
      void prepareDocumentUpload();
    }
  };

  const submitInterest = async () => {
    setActionLoading(true);
    try {
      const updated = await investorMarketplaceService.submitInterest(token.id, interestNote);
      setToken(updated);
      setInterestNote('');
      if (updated.status === MARKETPLACE_STATUS.ACTION_REQUIRED) {
        await loadDocumentTypes();
        setModal('verification');
        toast.info('Upload the required documents to complete your submission.');
      } else {
        setModal(null);
        toast.success('Investment interest submitted for issuer review.');
      }
    } catch (error) {
      if (error?.response?.status === 409) await loadOffering().catch(() => null);
      toast.error(getErrorMessage(error, 'Unable to submit investment interest.'));
    } finally {
      setActionLoading(false);
    }
  };

  const uploadClaimDocument = (documentTypeUid, file, onUploadProgress, signal) =>
    investorMarketplaceService.uploadClaimDocument(documentTypeUid, file, onUploadProgress, signal);

  const completeDocumentFlow = async () => {
    setActionLoading(true);
    try {
      const updated = await loadOffering();
      if (updated.status === MARKETPLACE_STATUS.PENDING_REVIEW) {
        setModal(null);
        toast.success('Your documents were uploaded and the investment interest is ready for issuer review.');
        return;
      }
      if (updated.status === MARKETPLACE_STATUS.ACTION_REQUIRED) {
        toast.error('Upload all required documents before submitting the interest.');
        return;
      }
      if (updated.status === MARKETPLACE_STATUS.REJECTED) {
        toast.error('The requested replacement documents are not complete yet.');
        return;
      }
      setModal(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to refresh the investment interest.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="marketplace-detail-loading" aria-label="Loading marketplace offering"><div /><div /><div /></div>;

  if (!token) {
    return <Card className="marketplace-detail-not-found"><ShieldCheck size={32} /><h1>Offering not found</h1><p>The marketplace asset may have been removed or the link is no longer valid.</p><Button onClick={() => navigate(ROUTES.marketplace)}>Back to Marketplace</Button></Card>;
  }

  const eligibilityTopics = token.eligibility?.topics?.length ? token.eligibility.topics : token.requiredClaimTopics.map((topic) => ({ ...topic, satisfied: null }));
  const tokenDisplayImage = imageObjectUrl || token.imageUrl || '';

  return (
    <div className="page-stack marketplace-token-detail-page">
      <header className="marketplace-token-detail-header">
        <div className="marketplace-token-detail-header__identity">
          <span className="marketplace-token-detail-header__logo">{tokenDisplayImage ? <img src={tokenDisplayImage} alt={`${token.name} token`} /> : <ShieldCheck size={20} />}</span>
          <div>
            <div className="marketplace-token-detail-header__name-line"><h1>{token.name}</h1><MarketplaceStatusBadge status={token.status} compact /></div>
            <p><strong>Symbol: {token.symbol}</strong><span>•</span><span>Standard: {token.standard}</span>{token.assetClass ? <><span>•</span><span>Asset: {token.assetClass}</span></> : null}</p>
          </div>
        </div>
      </header>

      <div className="marketplace-token-detail-layout">
        <main className="marketplace-token-detail-main">
          <section className="marketplace-detail-section">
            <span className="marketplace-detail-section-label">Investment snapshot</span>
            <div className="marketplace-snapshot-grid">
              <SnapshotCard label="Current Price">{displayPrice(token.price, token.currency)}</SnapshotCard>
              <SnapshotCard label="Decimals">{displayNumber(token.decimals)}</SnapshotCard>
              <SnapshotCard label="Max Investors">{displayNumber(token.maxInvestors)}</SnapshotCard>
              <SnapshotCard label="Current Investors">{displayNumber(token.currentInvestors)}</SnapshotCard>
              <SnapshotCard label="Max Balance / Holder">{token.maxBalance == null ? '—' : `${displayNumber(token.maxBalance)} ${token.symbol}`}</SnapshotCard>
            </div>
          </section>

          <Card className="marketplace-about-card">
            <span className="marketplace-detail-card-title">About Asset</span>
            {(token.description.length ? token.description : ['No additional offering description is available for this token.']).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <div className="marketplace-asset-meta">
              {token.assetClass ? <div><span>Asset Class</span><strong>{token.assetClass}</strong></div> : null}
              <div><span>Issuer</span><strong>{token.issuer}</strong></div>
              {token.expectedApy ? <div><span>Expected APY</span><strong>{token.expectedApy}</strong></div> : null}
              {token.liquidity ? <div><span>Liquidity</span><strong>{token.liquidity}</strong></div> : null}
            </div>
          </Card>

          {(token.onchainId || token.registryAddress) ? (
            <Card className="marketplace-registry-card">
              <span className="marketplace-detail-card-title"><Landmark size={15} /> Identity &amp; Registry</span>
              <div className="marketplace-registry-grid">
                {token.onchainId ? <div><span>ONCHAINID</span><strong>{token.onchainId}</strong><button type="button" aria-label="Copy ONCHAINID" onClick={() => copyValue(token.onchainId, 'ONCHAINID')}><Copy size={14} /></button></div> : null}
                {token.registryAddress ? <div><span>Registry Address</span><strong>{token.registryAddress}</strong><button type="button" aria-label="Copy registry address" onClick={() => copyValue(token.registryAddress, 'Registry address')}><Copy size={14} /></button></div> : null}
              </div>
            </Card>
          ) : null}

          <Card className="marketplace-compliance-card">
            <span className="marketplace-detail-card-title">Compliance &amp; Eligibility</span>
            <div className="marketplace-compliance-rules">
              {eligibilityTopics.length ? eligibilityTopics.map((topic) => (
                <ComplianceRule
                  key={topic.id || topic.claimTopicCode}
                  icon={topic.claimTopicCode === 'ACCREDITED_INVESTOR' ? BadgeCheck : UserRoundCheck}
                  title={topic.label || topic.claimTopicCode}
                  status={topic.satisfied == null ? null : topic.rejected ? { label: 'Re-upload', tone: 'danger' } : { label: topic.satisfied ? 'Satisfied' : 'Missing', tone: topic.satisfied ? 'success' : 'warning' }}
                >
                  {topic.description || `This claim topic is required by the issuer before an investment interest can be submitted.`}
                </ComplianceRule>
              )) : <ComplianceRule icon={ShieldCheck} title="No Required Claim Topics">No additional investor claim topics are required for this token.</ComplianceRule>}
              {token.maxBalance != null ? <ComplianceRule icon={Scale} title="Max Balance Logic">Maximum balance configured for a holder: {number.format(token.maxBalance)} {token.symbol}.</ComplianceRule> : null}
              {token.transferRestriction ? <ComplianceRule icon={LockKeyhole} title="Transfer Restrictions">{token.transferRestriction}</ComplianceRule> : null}
            </div>
          </Card>

          {token.documents.length ? (
            <section className="marketplace-documents-section">
              <div className="marketplace-documents-heading"><span className="marketplace-detail-section-label">Investment Documents</span><small>{token.documents.length} documents</small></div>
              <div className="marketplace-document-grid">{token.documents.map((document) => <TokenDocument key={document.id} document={document} />)}</div>
            </section>
          ) : null}
        </main>

        <aside className="marketplace-token-detail-aside">
          <OfferingStatusPanel
            token={token}
            onPrimaryAction={openPrimaryAction}
            onSecondaryAction={() => {
              const interestUid = token.interest?.interestUid;
              if (interestUid && token.status === MARKETPLACE_STATUS.CLAIM_REQUIRED) {
                navigate(ROUTES.applicationClaim(interestUid));
                return;
              }
              navigate(interestUid ? ROUTES.applicationDetail(interestUid) : ROUTES.applications);
            }}
            onInvest={() => {
              const interestUid = token.interest?.interestUid;
              if (interestUid) navigate(ROUTES.purchaseToken(interestUid));
            }}
            onSend={() => {
              const interestUid = token.interest?.interestUid;
              if (interestUid) navigate(ROUTES.sendToken(interestUid));
            }}
            onRedeem={() => {
              const interestUid = token.interest?.interestUid;
              if (interestUid) navigate(ROUTES.redeemToken(interestUid));
            }}
            actionLoading={actionLoading}
          />
          <Card className="marketplace-help-card"><span className="marketplace-help-card__icon"><HelpCircle size={18} /></span><div><strong>Need Help?</strong><p>Missing or rejected claim-topic documents can be uploaded directly from this offering. Your investor profile remains available for general verification details.</p><button type="button" onClick={() => navigate(`${ROUTES.profile}?token=${encodeURIComponent(token.id)}`)}><Mail size={14} /> Open Investor Profile</button></div></Card>
          <Card className="marketplace-network-card"><span><Building2 size={16} /> Permissioned security token</span><strong>{token.standard}</strong>{token.currentInvestors != null ? <p><UsersRound size={14} /> {number.format(token.currentInvestors)} current investors</p> : null}<p><Banknote size={14} /> {token.currency || 'Token'} pricing</p><p><WalletCards size={14} /> Claim-topic eligibility enforced</p></Card>
        </aside>
      </div>

      <UploadMissingDocumentsModal
        open={modal === 'verification'}
        onClose={() => setModal(null)}
        verification={token.eligibility}
        documentTypes={documentTypes}
        documentTypesLoading={documentTypesLoading}
        onUpload={uploadClaimDocument}
        onComplete={completeDocumentFlow}
        completing={actionLoading}
      />
      <SubmitInterestModal open={modal === 'interest'} onClose={() => setModal(null)} token={token} onConfirm={submitInterest} loading={actionLoading} note={interestNote} onNoteChange={setInterestNote} requiredTopics={eligibilityTopics} />
    </div>
  );
}
