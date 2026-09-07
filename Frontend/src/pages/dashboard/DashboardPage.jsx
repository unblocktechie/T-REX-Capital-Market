import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Coins,
  FileCheck2,
  Plus,
  Rocket,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '@/api/dashboard/dashboard.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROUTES } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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

export default function DashboardPage() {
  useDocumentTitle('Launchpad overview');
  const { user } = useAuth();
  const navigate = useNavigate();
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
            <Button icon={Plus} size="lg" onClick={() => navigate(ROUTES.createToken)}>
              Create security token
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate(ROUTES.projects)}>
              View projects <ArrowRight size={18} />
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
                  <Button size="sm" onClick={() => navigate(ROUTES.compliance)}>
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
            onClick={() => navigate(ROUTES.compliance)}
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
            <button className="link-button" onClick={() => navigate(ROUTES.projects)}>
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
