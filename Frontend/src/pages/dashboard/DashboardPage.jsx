import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Coins,
  FileCheck2,
  FileSearch,
  Plus,
  Rocket,
  ShieldCheck,
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
import { useInvestorAccessStatus } from '@/hooks/useInvestorAccessStatus';
import { useMyToken } from '@/hooks/useMyToken';
import { formatCurrency, formatNumber } from '@/utils/currency';

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
  const investorAccess = useInvestorAccessStatus(user);
  const onboarding = investorAccess.state;
  const request = onboarding.investmentRequest;
  const profile = onboarding.investorProfile;
  const createdAt = request.submissionDate || profile.createdAt;
  const completedAt = createdAt
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(createdAt),
      )
    : 'Not available';
  const walletAddress = onboarding.wallet.displayAddress || onboarding.wallet.address || 'Not linked';
  const statusLabel = 'Profile Created';

  return (
    <div className="page-stack">
      <Card className="overflow-hidden border-[color-mix(in_srgb,var(--primary-500)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary-500)_10%,var(--surface)),var(--surface)_62%)] p-[clamp(20px,4vw,38px)]">
        <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--success-500)_28%,transparent)] bg-[color-mix(in_srgb,var(--success-500)_10%,var(--surface))] px-3 py-1.5 text-xs font-bold text-[var(--success-500)]">
              <CheckCircle2 size={15} /> {statusLabel}
            </span>
            <h1 className="m-0 max-w-3xl font-[var(--font-display)] text-[clamp(28px,4vw,46px)] leading-[1.08] tracking-[-0.035em] text-[var(--text)]">
              Welcome, {user?.name?.split(' ')[0] || 'Investor'}.
            </h1>
            <p className="mt-4 mb-0 max-w-2xl text-sm leading-6 text-[var(--text-soft)] sm:text-base sm:leading-7">
              Your investor profile has been created successfully. You can now review your onboarding information, manage your account, and use the investor portal.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button icon={UserRoundCheck} onClick={() => navigate(ROUTES.investors)}>
                View investor profile
              </Button>
              <Button variant="secondary" icon={FileSearch} onClick={() => navigate(ROUTES.profile)}>
                Account settings
              </Button>
            </div>
          </div>
          <div className="grid min-h-[220px] place-items-center rounded-3xl border border-[color-mix(in_srgb,var(--success-500)_18%,var(--border))] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] p-6 shadow-[var(--shadow-sm)]">
            <div className="grid place-items-center text-center">
              <span className="grid size-20 place-items-center rounded-full bg-[color-mix(in_srgb,var(--success-500)_12%,var(--surface))] text-[var(--success-500)]">
                <ShieldCheck size={38} />
              </span>
              <strong className="mt-4 text-lg text-[var(--text)]">Investor portal ready</strong>
              <small className="mt-1 max-w-[230px] text-sm leading-5 text-[var(--text-soft)]">
                Your onboarding information is saved and your dashboard is ready to use.
              </small>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Investor profile summary">
        <Card className="p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary-500)_11%,var(--surface))] text-[var(--primary-600)]">
            <UserRoundCheck size={20} />
          </span>
          <small className="mt-4 block text-xs font-bold tracking-[0.08em] text-[var(--text-muted)] uppercase">Investor Profile</small>
          <strong className="mt-1 block break-words text-lg text-[var(--text)]">{profile.profileId || 'Created'}</strong>
          <p className="mt-1 mb-0 text-sm text-[var(--text-soft)]">{statusLabel}</p>
        </Card>
        <Card className="p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary-500)_11%,var(--surface))] text-[var(--primary-600)]">
            <WalletCards size={20} />
          </span>
          <small className="mt-4 block text-xs font-bold tracking-[0.08em] text-[var(--text-muted)] uppercase">Connected Wallet</small>
          <strong className="mt-1 block break-all text-base text-[var(--text)]" title={onboarding.wallet.address}>
            {walletAddress}
          </strong>
          <p className="mt-1 mb-0 text-sm text-[var(--text-soft)]">{onboarding.wallet.network || 'Network unavailable'}</p>
        </Card>
        <Card className="p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary-500)_11%,var(--surface))] text-[var(--primary-600)]">
            <FileCheck2 size={20} />
          </span>
          <small className="mt-4 block text-xs font-bold tracking-[0.08em] text-[var(--text-muted)] uppercase">Onboarding Reference</small>
          <strong className="mt-1 block break-words text-lg text-[var(--text)]">{request.requestId || profile.profileId || 'Completed'}</strong>
          <p className="mt-1 mb-0 text-sm text-[var(--text-soft)]">Completed {completedAt}</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card className="p-5 sm:p-6">
          <header>
            <span className="eyebrow">Profile setup</span>
            <h2 className="mt-1 mb-1 font-[var(--font-display)] text-2xl text-[var(--text)]">Your investor workspace is ready</h2>
            <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">Your onboarding details are saved and the main investor portal is now available.</p>
          </header>
          <div className="mt-6 grid gap-4">
            {[
              ['Investor profile created', 'Completed'],
              ['Identity documents saved', 'Completed'],
              ['Primary wallet linked', 'Completed'],
              ['Dashboard access enabled', 'Available'],
            ].map(([title, detail]) => (
              <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3" key={title}>
                <span className="grid size-9 place-items-center rounded-full border border-[var(--success-500)] bg-[color-mix(in_srgb,var(--success-500)_12%,var(--surface))] text-sm font-bold text-[var(--success-500)]">
                  <Check size={16} />
                </span>
                <div className="min-w-0 border-b border-[var(--border)] pb-4 last:border-b-0">
                  <strong className="block text-sm text-[var(--text)]">{title}</strong>
                  <small className="mt-1 block text-xs text-[var(--text-soft)]">{detail}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <span className="grid size-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--success-500)_11%,var(--surface))] text-[var(--success-500)]">
            <CheckCircle2 size={23} />
          </span>
          <h2 className="mt-4 mb-2 font-[var(--font-display)] text-xl text-[var(--text)]">Profile saved</h2>
          <p className="m-0 text-sm leading-6 text-[var(--text-soft)]">
            Your completed onboarding profile remains available after logout or refresh, so you will not be asked to create it again.
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
              <dt className="text-[var(--text-soft)]">Current status</dt>
              <dd className="m-0 text-right font-bold text-[var(--text)]">{statusLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
              <dt className="text-[var(--text-soft)]">Portal access</dt>
              <dd className="m-0 text-right font-bold text-[var(--success-500)]">Enabled</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-[var(--text-soft)]">ONCHAINID</dt>
              <dd className="m-0 max-w-[190px] break-all text-right font-bold text-[var(--text)]">{profile.onchainId || 'Created'}</dd>
            </div>
          </dl>
        </Card>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  return user?.role === ROLES.investor ? <InvestorDashboardPage /> : <IssuerDashboardPage />;
}

