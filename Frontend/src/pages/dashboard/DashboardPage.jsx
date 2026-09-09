import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Coins,
  FileCheck2,
  FileClock,
  Plus,
  Copy,
  Rocket,
  ShieldCheck,
  Store,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '@/api/dashboard/dashboard.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorProfileData } from '@/hooks/useInvestorProfileData';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useMyToken } from '@/hooks/useMyToken';
import { formatCurrency, formatNumber } from '@/utils/currency';
import { toast } from 'sonner';

const metricIcons = [Building2, Coins, UsersRound, ShieldCheck];

const formatMetric = (metric) => {
  if (metric.format === 'currency') return formatCurrency(metric.value, 'USD');
  return formatNumber(metric.value);
};

const launchSteps = [
  { title: 'Issuer profile', text: 'Organization and authorized signers', complete: true },
  { title: 'Asset & offering', text: 'Instrument, valuation and documents', complete: true },
  { title: 'Token configuration', text: 'Supply, symbol and blockchain', complete: true },
  { title: 'Compliance rules', text: 'Claims, countries and transfer limits', current: true },
  { title: 'Review & deploy', text: 'Final validation and contract deployment' },
];

function IssuerDashboardPage() {
  useDocumentTitle('Launchpad overview');
  const { user } = useAuth();
  const navigate = useNavigate();
  const tokenRecord = useMyToken();
  const tokenDestination = tokenRecord.isDeployed
    ? ROUTES.tokenDetails(tokenRecord.tokenUid || 'token')
    : tokenRecord.isDeploymentPending
      ? ROUTES.tokenDeploying
      : tokenRecord.isReadyToDeploy || tokenRecord.isDeploymentFailed
        ? ROUTES.tokenIssuanceStep('review')
        : ROUTES.createToken;
  const tokenActionLabel = tokenRecord.isDeployed
    ? 'View token'
    : tokenRecord.isDeploymentPending
      ? 'Continue deployment'
      : tokenRecord.isReadyToDeploy || tokenRecord.isDeploymentFailed
        ? 'Review token deployment'
        : 'Create security token';
  const overview = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: dashboardApi.getOverview,
  });

  return (
    <div className="page-stack launchpad-dashboard">
      <Card className="launchpad-hero">
        <div className="launchpad-hero__content">
          <span className="launchpad-hero__badge">
            <ShieldCheck size={15} /> T-REX · ERC-3643 compliant
          </span>
          <h1>Tokenize real-world assets with confidence.</h1>
          <p>
            Guide issuers from asset setup and investor eligibility to compliant token deployment
            and lifecycle management.
          </p>
          <div className="launchpad-hero__actions">
            <Button
              icon={tokenRecord.isLocked ? Coins : Plus}
              size="lg"
              onClick={() => navigate(tokenDestination)}
            >
              {tokenActionLabel}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate(ROUTES.organization)}>
              View organization <ArrowRight size={18} />
            </Button>
          </div>
        </div>
        <div className="launchpad-hero__visual" aria-hidden="true">
          <div className="token-orbit token-orbit--outer" />
          <div className="token-orbit token-orbit--inner" />
          <span className="token-node token-node--main">
            <ShieldCheck size={33} />
          </span>
          <span className="token-node token-node--one">
            <UserRoundCheck size={19} />
          </span>
          <span className="token-node token-node--two">
            <FileCheck2 size={19} />
          </span>
          <span className="token-node token-node--three">
            <Coins size={19} />
          </span>
        </div>
      </Card>

      <header className="dashboard-welcome">
        <div>
          <span className="eyebrow">Issuer overview</span>
          <h2>Welcome back, {user?.name?.split(' ')[0]}.</h2>
          <p>Track token projects, investor eligibility and compliance readiness.</p>
        </div>
        <span className="dashboard-date-pill">Workspace · Polygon Amoy</span>
      </header>

      <section className="metric-grid" aria-label="Launchpad metrics">
        {overview.isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <Card className="metric-card launchpad-metric-card" key={index}>
                <Skeleton width="45%" />
                <Skeleton height={35} width="70%" />
                <Skeleton width="55%" />
              </Card>
            ))
          : overview.data?.metrics.map((metric, index) => {
              const Icon = metricIcons[index] || ShieldCheck;
              return (
                <Card className="metric-card launchpad-metric-card" key={metric.label}>
                  <div className="launchpad-metric-card__top">
                    <span className="launchpad-metric-card__icon">
                      <Icon size={19} />
                    </span>
                    <Badge tone={index === 3 ? 'success' : 'info'}>
                      +{metric.change}
                      {metric.format === 'currency' ? '%' : ''}
                    </Badge>
                  </div>
                  <small>{metric.label}</small>
                  <strong>{formatMetric(metric)}</strong>
                  <p>{metric.helper}</p>
                </Card>
              );
            })}
      </section>

      <section className="launchpad-main-grid">
        <Card className="launch-progress-card">
          <header className="card-header">
            <div>
              <span className="eyebrow">Guided issuance</span>
              <h2>Riverside Commercial SPV</h2>
              <p>Complete the remaining steps before deploying your ERC-3643 token.</p>
            </div>
            <Badge tone="info">72% complete</Badge>
          </header>
          <div className="launch-progress-bar">
            <span style={{ width: '72%' }} />
          </div>
          <div className="launch-step-list">
            {launchSteps.map((step, index) => (
              <div className="launch-step" key={step.title}>
                <span
                  className={`launch-step__marker ${step.complete ? 'is-complete' : ''} ${step.current ? 'is-current' : ''}`}
                >
                  {step.complete ? (
                    <Check size={16} />
                  ) : step.current ? (
                    index + 1
                  ) : (
                    <Circle size={12} />
                  )}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.text}</small>
                </div>
                {step.current ? (
                  <Button size="sm" onClick={() => navigate(tokenDestination)}>
                    Continue
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="compliance-health-card">
          <header className="card-header">
            <div>
              <span className="eyebrow">Compliance health</span>
              <h2>Ready for review</h2>
            </div>
            <span className="compliance-score">92%</span>
          </header>
          <div className="compliance-ring" style={{ '--score': '92%' }}>
            <span>
              <ShieldCheck size={30} />
              <strong>92</strong>
              <small>score</small>
            </span>
          </div>
          <div className="compliance-checks">
            <span>
              <CheckCircle2 size={17} /> Issuer verified
            </span>
            <span>
              <CheckCircle2 size={17} /> Identity registry configured
            </span>
            <span>
              <CheckCircle2 size={17} /> Trusted claim issuers added
            </span>
            <span className="is-pending">
              <Circle size={16} /> Final legal approval pending
            </span>
          </div>
          <Button
            variant="secondary"
            className="button--full"
            onClick={() => navigate(tokenDestination)}
          >
            Review compliance
          </Button>
        </Card>
      </section>

      <section className="launchpad-bottom-grid">
        <Card className="project-list-card">
          <header className="card-header">
            <div>
              <span className="eyebrow">Portfolio</span>
              <h2>Token projects</h2>
              <p>Your current issuance pipeline.</p>
            </div>
            <button className="link-button" onClick={() => navigate(tokenDestination)}>
              View all
            </button>
          </header>
          <div className="project-list">
            {overview.isLoading
              ? Array.from({ length: 3 }, (_, index) => <Skeleton height={70} key={index} />)
              : overview.data?.projects.map((project) => (
                  <button className="project-row" type="button" key={project.id}>
                    <span className="project-row__symbol">{project.symbol}</span>
                    <span className="project-row__name">
                      <strong>{project.name}</strong>
                      <small>{project.asset}</small>
                    </span>
                    <span className="project-row__stage">
                      <strong>{project.stage}</strong>
                      <span>
                        <i style={{ width: `${project.progress}%` }} />
                      </span>
                    </span>
                    <Badge
                      tone={
                        project.status === 'Ready'
                          ? 'success'
                          : project.status === 'Draft'
                            ? 'neutral'
                            : 'info'
                      }
                    >
                      {project.status}
                    </Badge>
                    <ArrowRight size={17} />
                  </button>
                ))}
          </div>
        </Card>

        <Card className="activity-card launchpad-activity-card">
          <header className="card-header">
            <div>
              <span className="eyebrow">Audit trail</span>
              <h2>Recent activity</h2>
            </div>
            <button className="link-button">View all</button>
          </header>
          <div className="activity-list">
            {overview.isLoading
              ? Array.from({ length: 4 }, (_, index) => <Skeleton height={58} key={index} />)
              : overview.data?.activity.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <span className={`activity-dot activity-dot--${item.type}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.meta}</small>
                    </div>
                  </div>
                ))}
          </div>
          <div className="launchpad-help-box">
            <Rocket size={20} />
            <div>
              <strong>Need help launching?</strong>
              <p>Follow the guided token wizard or invite a compliance specialist.</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function InvestorDashboardPage() {
  useDocumentTitle('Investor dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const walletConnection = useWalletConnection();
  const investorQuery = useInvestorProfileData();
  const onboarding = investorQuery.state;

  if (investorQuery.isLoading) {
    return (
      <div className="page-stack investor-portal-dashboard">
        <Skeleton height={150} />
        <section className="investor-dashboard-grid">
          <Skeleton height={220} />
          <Skeleton height={220} />
          <Skeleton height={220} />
        </section>
        <Skeleton height={300} />
      </div>
    );
  }

  if (investorQuery.isError) {
    return (
      <Card className="investor-dashboard-error">
        <ShieldCheck size={28} />
        <h1>We could not load your investor dashboard</h1>
        <p>Your profile is safe. Retry the authenticated investor profile request to continue.</p>
        <Button onClick={() => investorQuery.refetch()}>Try again</Button>
      </Card>
    );
  }

  const profile = onboarding.investorProfile || {};
  const identityDocuments = onboarding.documents?.identityDocuments || [];
  const accreditationDocuments = onboarding.compliance?.accreditationDocuments || [];
  const rawInvestor = investorQuery.rawInvestor || {};
  const createdAt = rawInvestor.submittedAt || rawInvestor.createdAt || onboarding.lastUpdated;
  const createdDate = createdAt && !Number.isNaN(new Date(createdAt).getTime())
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(createdAt))
    : 'Available after creation';
  const walletAddress = onboarding.wallet?.address || '';
  const displayWallet = onboarding.wallet?.displayAddress || (walletAddress
    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`
    : 'Not linked');
  const connectedMatches = Boolean(
    walletAddress &&
      walletConnection.address &&
      walletAddress.toLowerCase() === walletConnection.address.toLowerCase(),
  );
  const networkLabel = connectedMatches
    ? walletConnection.chain?.name || 'Connected network'
    : 'Primary wallet';
  const balanceLabel = connectedMatches
    ? walletConnection.balanceLabel || 'Balance unavailable'
    : 'Connect wallet to view balance';
  const latestDocumentDate = [...identityDocuments, ...accreditationDocuments]
    .map((document) => document.uploadedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const formatActivityDate = (value) => {
    if (!value || Number.isNaN(new Date(value).getTime())) return 'Completed';
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  };
  const activity = [
    {
      title: 'Investor profile created',
      detail: profile.profileId ? `Profile ${profile.profileId} is active.` : 'Investor account setup completed.',
      date: rawInvestor.submittedAt || onboarding.lastUpdated,
      tone: 'success',
    },
    {
      title: 'Primary wallet linked',
      detail: walletAddress ? `${displayWallet} is linked to your investor identity.` : 'Primary wallet linked.',
      date: rawInvestor.submittedAt || onboarding.lastUpdated,
      tone: 'primary',
    },
    {
      title: 'Verification documents saved',
      detail: `${identityDocuments.length + accreditationDocuments.length} document${identityDocuments.length + accreditationDocuments.length === 1 ? '' : 's'} available in your profile.`,
      date: latestDocumentDate || onboarding.lastUpdated,
      tone: 'neutral',
    },
  ];

  const copyIdentity = async () => {
    const value = profile.onchainId || profile.profileId;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Identity reference copied.');
    } catch {
      toast.error('Unable to copy the identity reference.');
    }
  };

  return (
    <div className="page-stack investor-portal-dashboard">
      <header className="investor-dashboard-welcome">
        <div>
          <span className="eyebrow">Investor workspace</span>
          <h1>Welcome, {user?.name?.split(' ')[0] || onboarding.identity?.firstName || 'Investor'}.</h1>
          <p>Your investor account is ready. Review your identity, discover offerings, and track applications from one place.</p>
        </div>
        <Button icon={Store} onClick={() => navigate(ROUTES.marketplace)}>
          Explore Marketplace <ArrowRight size={17} />
        </Button>
      </header>

      <section className="investor-dashboard-grid" aria-label="Investor account summary">
        <Card className="investor-dashboard-summary-card">
          <div className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Account identity</span>
              <h2>ONCHAINID</h2>
            </div>
            <span className="investor-dashboard-card-icon"><UserRoundCheck size={20} /></span>
          </div>
          <div className="investor-dashboard-reference">
            <code title={profile.onchainId || 'ONCHAINID created'}>{profile.onchainId || 'Created'}</code>
            {profile.onchainId ? (
              <button type="button" onClick={copyIdentity} aria-label="Copy ONCHAINID" title="Copy ONCHAINID">
                <Copy size={16} />
              </button>
            ) : null}
          </div>
          <dl className="investor-dashboard-facts">
            <div><dt>Status</dt><dd><span className="investor-dashboard-status"><CheckCircle2 size={14} /> Created</span></dd></div>
            <div><dt>Profile</dt><dd>{profile.profileId || 'Created'}</dd></div>
            <div><dt>Created</dt><dd>{createdDate}</dd></div>
          </dl>
        </Card>

        <Card className="investor-dashboard-summary-card">
          <div className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Connected wallet</span>
              <h2>Primary wallet</h2>
            </div>
            <span className="investor-dashboard-card-icon"><WalletCards size={20} /></span>
          </div>
          <div className="investor-dashboard-reference">
            <code title={walletAddress}>{displayWallet}</code>
          </div>
          <dl className="investor-dashboard-facts">
            <div><dt>Status</dt><dd><span className="investor-dashboard-status"><CheckCircle2 size={14} /> Linked</span></dd></div>
            <div><dt>Network</dt><dd>{networkLabel}</dd></div>
            <div><dt>Balance</dt><dd>{balanceLabel}</dd></div>
          </dl>
        </Card>

        <Card className="investor-dashboard-activity-card">
          <div className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Recent activity</span>
              <h2>Account timeline</h2>
            </div>
            <span className="investor-dashboard-card-icon"><FileClock size={20} /></span>
          </div>
          <div className="investor-dashboard-timeline">
            {activity.map((item) => (
              <div className="investor-dashboard-timeline-item" key={item.title}>
                <span className={`investor-dashboard-timeline-dot is-${item.tone}`} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>{formatActivityDate(item.date)}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="investor-dashboard-lower-grid">
        <Card className="investor-investments-card">
          <header className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Portfolio</span>
              <h2>My Investments</h2>
            </div>
            <button className="link-button" type="button" onClick={() => navigate(ROUTES.applications)}>
              My applications
            </button>
          </header>
          <div className="investor-dashboard-empty-state">
            <span><Coins size={27} /></span>
            <h3>No investments yet</h3>
            <p>Your portfolio is currently empty. Explore compliant tokenized assets when offerings become available.</p>
            <Button variant="secondary" icon={Store} onClick={() => navigate(ROUTES.marketplace)}>
              Browse available offerings
            </Button>
          </div>
        </Card>

        <Card className="investor-dashboard-profile-card">
          <span className="investor-dashboard-card-icon"><FileCheck2 size={21} /></span>
          <h2>Profile overview</h2>
          <p>Your submitted identity, suitability information, and verification documents are available in one secure profile.</p>
          <div className="investor-dashboard-profile-stats">
            <div><strong>{identityDocuments.length}</strong><span>Identity document{identityDocuments.length === 1 ? '' : 's'}</span></div>
            <div><strong>{accreditationDocuments.length}</strong><span>Accreditation document{accreditationDocuments.length === 1 ? '' : 's'}</span></div>
          </div>
          <Button className="button--full" variant="secondary" onClick={() => navigate(ROUTES.profile)}>
            View full investor profile <ArrowRight size={17} />
          </Button>
        </Card>
      </section>
    </div>
  );
}
export default function DashboardPage() {
  const { user } = useAuth();
  return user?.role === ROLES.investor ? <InvestorDashboardPage /> : <IssuerDashboardPage />;
}

