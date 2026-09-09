import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  FileCheck2,
  HelpCircle,
  Info,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { MARKETPLACE_STATUS } from '@/services/investor/investorMarketplaceLocalService';
import { getErrorMessage } from '@/utils/error';

const CLAIM_REQUIRED_STATUSES = new Set([
  'verifiedbyissuer',
  'verified_by_issuer',
  'verified-by-issuer',
  'claim_required',
]);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();


const claimTopicNumber = (topic) => {
  const value = topic?.claimTopicValue ?? topic?.claimTopic;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const claimKey = (topic, index) => {
  const directKey = topic?.claimTopicUid || topic?.claimTopicCode;
  if (directKey) return String(directKey);
  const topicNumber = claimTopicNumber(topic);
  return topicNumber !== null ? `claim-${topicNumber}` : `claim-${index}`;
};

const claimTopicIcon = (topic) => {
  const code = String(topic?.claimTopicCode || '').toUpperCase();
  if (code.includes('ACCREDIT')) return BadgeCheck;
  if (code.includes('KYC') || code.includes('IDENTITY')) return ShieldCheck;
  if (code.includes('JURISDICTION') || code.includes('COUNTRY')) return UserRoundCheck;
  return FileCheck2;
};

const claimTopicLabel = (topic, index) =>
  topic?.label
  || topic?.claimTopicCode
  || (claimTopicNumber(topic) !== null ? `Claim Topic ${claimTopicNumber(topic)}` : `Required Claim ${index + 1}`);

const claimTopicDescription = (topic, label) =>
  topic?.description || `${label} is required by this token before the investor can complete on-chain verification.`;

export default function SubmitClaimPage() {
  const { interestUid } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [application, setApplication] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useDocumentTitle(token ? `${token.name} · Submit Claim` : 'Submit Claim');

  const loadClaimContext = useCallback(async ({ silent = false } = {}) => {
    if (!interestUid) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const detail = await investorMarketplaceService.getApplicationDetail(interestUid);
      const nextApplication = detail?.application || null;
      if (!nextApplication) throw new Error('The selected investment application could not be found.');

      const tokenUid = nextApplication.id || nextApplication.tokenUid || nextApplication.interest?.tokenUid;
      if (!tokenUid) throw new Error('The selected application does not include a token identifier.');

      const offering = await investorMarketplaceService.getOffering(tokenUid);
      setApplication(nextApplication);
      setToken(offering || nextApplication);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to load the required claim topics for this application.'));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [interestUid]);

  useEffect(() => {
    void loadClaimContext();
  }, [loadClaimContext]);

  const claimTopics = useMemo(() => {
    const personalizedTopics = token?.eligibility?.topics || [];
    if (personalizedTopics.length) return personalizedTopics;
    return token?.requiredClaimTopics || [];
  }, [token]);

  const backendStatus = normalizeStatus(
    application?.interest?.status
    || token?.interest?.status
    || token?.status,
  );
  const isClaimRequired = CLAIM_REQUIRED_STATUSES.has(backendStatus)
    || token?.status === MARKETPLACE_STATUS.CLAIM_REQUIRED;

  const readyClaimCount = useMemo(
    () => claimTopics.filter((topic) => topic?.satisfied !== false && !topic?.rejected).length,
    [claimTopics],
  );

  const handleClaimSubmit = (topic, index) => {
    const label = claimTopicLabel(topic, index);
    toast.info(`${label} is ready for the on-chain transaction integration. This screen currently prepares the dynamic claim flow only.`);
  };

  if (loading) {
    return (
      <div className="page-stack investor-submit-claim-page">
        <div className="submit-claim-loading submit-claim-loading--header" />
        <div className="submit-claim-layout">
          <div className="submit-claim-loading submit-claim-loading--claims" />
          <div className="submit-claim-loading submit-claim-loading--aside" />
        </div>
      </div>
    );
  }

  if (!application || !token) {
    return (
      <Card className="submit-claim-empty-state">
        <ShieldCheck size={34} />
        <h1>Claim submission unavailable</h1>
        <p>The application or token configuration could not be loaded for this investor account.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.applications)}>
          Back to My Applications
        </Button>
      </Card>
    );
  }

  if (!isClaimRequired) {
    return (
      <Card className="submit-claim-empty-state">
        <CheckCircle2 size={34} />
        <h1>No claim action is currently required</h1>
        <p>This application is not in the issuer-verified claim-submission state. Review the latest application status before continuing.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>
          View Application Details
        </Button>
      </Card>
    );
  }

  return (
    <div className="page-stack investor-submit-claim-page">
      <div className="submit-claim-local-breadcrumbs">
        <button type="button" onClick={() => navigate(ROUTES.applications)}>My Applications</button>
        <span>›</span>
        <button type="button" onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>Application Details</button>
        <span>›</span>
        <strong>Submit Claim</strong>
      </div>

      <header className="submit-claim-header">
        <div>
          <div className="submit-claim-title-line">
            <h1>Complete On-Chain Verification</h1>
            <span className="submit-claim-action-badge"><Circle size={8} fill="currentColor" /> Action Required</span>
          </div>
          <p>
            Your off-chain eligibility has been confirmed by the issuer. Submit the claim topics required for
            <strong> {token.name} ({token.symbol})</strong> to complete the next verification step.
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void loadClaimContext({ silent: true })}>
          Refresh Requirements
        </Button>
      </header>

      <Card className="submit-claim-context-card">
        <div>
          <span>Investor</span>
          <strong>{user?.name || user?.fullName || 'Current investor'}</strong>
        </div>
        <div>
          <span>Token</span>
          <strong>{token.name} ({token.symbol})</strong>
        </div>
        <div>
          <span>Issuer</span>
          <strong>{token.issuer || application.issuer || 'Issuing organization'}</strong>
        </div>
        <div>
          <span>Application ID</span>
          <strong title={interestUid}>{interestUid}</strong>
        </div>
      </Card>

      <div className="submit-claim-layout">
        <main className="submit-claim-main">
          <div className="submit-claim-section-heading">
            <div>
              <span className="eyebrow">Required claims</span>
              <h2>Submit issuer-approved claims</h2>
              <p>The list below is loaded dynamically from this token&apos;s current claim requirements for your investor profile.</p>
            </div>
            <span className="submit-claim-count">{claimTopics.length} required</span>
          </div>

          {claimTopics.length ? (
            <div className="submit-claim-topic-list">
              {claimTopics.map((topic, index) => {
                const Icon = claimTopicIcon(topic);
                const label = claimTopicLabel(topic, index);
                const topicNumber = claimTopicNumber(topic);
                const ready = topic?.satisfied !== false && !topic?.rejected;
                return (
                  <Card key={claimKey(topic, index)} className={`submit-claim-topic-card${ready ? ' is-ready' : ' is-blocked'}`}>
                    <span className="submit-claim-topic-card__icon"><Icon size={22} /></span>
                    <div className="submit-claim-topic-card__content">
                      <div className="submit-claim-topic-card__title">
                        <h3>{label}</h3>
                        {topicNumber !== null ? <span>Topic {topicNumber}</span> : null}
                      </div>
                      <span className={`submit-claim-topic-card__state${ready ? ' is-ready' : ' is-blocked'}`}>
                        {ready ? <CheckCircle2 size={14} /> : <Info size={14} />}
                        {ready ? 'Approved by Issuer (Off-Chain)' : 'Claim requirement needs attention'}
                      </span>
                      <p>{claimTopicDescription(topic, label)}</p>
                    </div>
                    <div className="submit-claim-topic-card__action">
                      <Button
                        onClick={() => handleClaimSubmit(topic, index)}
                        disabled={!ready || topicNumber === null}
                      >
                        Submit Claim to Blockchain <WalletCards size={16} />
                      </Button>
                      <small>
                        {topicNumber === null
                          ? 'Numeric claim-topic identifier was not returned by the backend.'
                          : `Separate wallet transaction · ${web3Config.requiredChain.name}`}
                      </small>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="submit-claim-no-topics">
              <Info size={22} />
              <div>
                <strong>No required claim topics were returned</strong>
                <p>The token requirement endpoint did not return any claim topics for this investor. Refresh the page or contact the issuer before continuing.</p>
              </div>
            </Card>
          )}

          <div className="submit-claim-finalize-wrap">
            <Button size="lg" disabled>
              Finalize Subscription
            </Button>
            <small>Finalize becomes available only after every required on-chain claim has been successfully submitted.</small>
          </div>
        </main>

        <aside className="submit-claim-aside">
          <Card className="submit-claim-progress-card">
            <span className="submit-claim-aside-label">Submission Progress</span>
            <div className="submit-claim-progress-list">
              {claimTopics.map((topic, index) => {
                const label = claimTopicLabel(topic, index);
                const ready = topic?.satisfied !== false && !topic?.rejected;
                return (
                  <div key={`progress-${claimKey(topic, index)}`} className="submit-claim-progress-item">
                    <span className={`submit-claim-progress-item__marker${ready ? ' is-ready' : ''}`}><Circle size={7} fill="currentColor" /></span>
                    <div>
                      <strong>{label}</strong>
                      <small>{ready ? 'Ready for on-chain submission' : 'Waiting for requirement to be satisfied'}</small>
                    </div>
                  </div>
                );
              })}
              <div className="submit-claim-progress-item is-locked">
                <span className="submit-claim-progress-item__marker"><Circle size={7} fill="currentColor" /></span>
                <div>
                  <strong>Registry Sync</strong>
                  <small>{claimTopics.length && readyClaimCount === claimTopics.length ? 'Waiting for claim transactions' : 'Locked'}</small>
                </div>
              </div>
            </div>
          </Card>

          <Card className="submit-claim-network-card">
            <div className="submit-claim-network-card__title"><Info size={18} /><strong>Network Information</strong></div>
            <p>Each claim submission requires a wallet transaction on <strong>{web3Config.requiredChain.name}</strong>. Network fees may apply, so confirm the connected wallet and network before submitting.</p>
          </Card>

          <Card className="submit-claim-help-card">
            <span className="submit-claim-help-card__icon"><HelpCircle size={19} /></span>
            <div>
              <strong>Need assistance?</strong>
              <p>Review your application details and issuer decision before starting the on-chain claim flow.</p>
              <button type="button" onClick={() => navigate(ROUTES.applicationDetail(interestUid))}>View Application Details</button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
