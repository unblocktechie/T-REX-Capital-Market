import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Coins,
  Copy,
  FileClock,
  Mail,
  RefreshCcw,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { dashboardApi } from '@/api/dashboard/dashboard.api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ROLES } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { TOKEN_ISSUANCE_STEPS } from '@/config/tokenIssuance';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useInvestorProfileData } from '@/hooks/useInvestorProfileData';
import {
  getTokenRecordName,
  getTokenRecordSymbol,
  useMyToken,
} from '@/hooks/useMyToken';
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { investorInvitationService } from '@/services/investor/investorInvitationService';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';
import { formatDate } from '@/utils/date';
import {
  cleanRedemptionText,
  issuerRedemptionInvestorLabel,
  issuerRedemptionStatus,
  issuerRedemptionStatusMeta,
  issuerRedemptionTokenLabel,
  issuerRedemptionUid,
} from '@/utils/issuerRedemption';

const numberFormatter = new Intl.NumberFormat('en-US');

const firstText = (...values) =>
  String(values.find((value) => value !== undefined && value !== null && value !== '') || '').trim();

const compactStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const requestStatusMeta = (value) => {
  const status = compactStatus(value);
  if (status === 'registered') return { label: 'Registered', tone: 'success' };
  if (status === 'approved') return { label: 'Approved', tone: 'success' };
  if (status === 'rejected') return { label: 'Rejected', tone: 'danger' };
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (status === 'claimsubmitted') return { label: 'Verification submitted', tone: 'info' };
  if (status === 'verifiedbyissuer') return { label: 'Verification approved', tone: 'info' };
  if (status === 'submitintrest' || status === 'submitted' || status === 'pending') {
    return { label: 'Pending review', tone: 'warning' };
  }
  return {
    label: firstText(value).replaceAll('_', ' ') || 'Pending',
    tone: 'neutral',
  };
};

const tokenStatusMeta = (tokenRecord) => {
  const status = compactStatus(tokenRecord.status);
  if (tokenRecord.isDeployed || status === 'deployed') {
    return { label: 'Created', tone: 'success', description: 'Your investment asset has been created. Open it to review the live price and investor access.' };
  }
  if (tokenRecord.isDeploymentPending || status === 'deploymentpending') {
    return { label: 'Creating', tone: 'info', description: 'Your asset is being created. No action is needed while this finishes.' };
  }
  if (tokenRecord.isDeploymentFailed || status === 'deploymentfailed') {
    return { label: 'Needs attention', tone: 'danger', description: 'One setup action did not complete. Review the creation status before trying again.' };
  }
  if (tokenRecord.isReadyToDeploy || status === 'readytodeploy') {
    return { label: 'Ready to create', tone: 'warning', description: 'Your setup is complete. Review the details and create the asset when you are ready.' };
  }
  if (tokenRecord.hasToken) {
    return { label: 'Setup in progress', tone: 'neutral', description: 'Continue the guided setup to prepare your investment asset.' };
  }
  return { label: 'Not started', tone: 'neutral', description: 'Create your investment asset after organization verification is complete.' };
};

const organizationStatusMeta = (organization) => {
  switch (organization?.status) {
    case ORGANIZATION_STATUSES.VERIFIED:
      return { label: 'Verified', tone: 'success' };
    case ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING:
      return { label: 'Approved', tone: 'success' };
    case ORGANIZATION_STATUSES.SUBMITTED:
      return { label: 'Under review', tone: 'info' };
    case ORGANIZATION_STATUSES.REJECTED:
      return { label: 'Updates required', tone: 'danger' };
    case ORGANIZATION_STATUSES.DRAFT:
      return { label: 'Draft', tone: 'warning' };
    default:
      return { label: 'Not started', tone: 'neutral' };
  }
};

const tokenStepKey = (token) => {
  const current = compactStatus(token?.currentStep);
  if (current === 'claims' || current === 'identityclaims') return 'identity-claims';
  if (current === 'compliance') return 'compliance';
  if (current === 'governance' || current === 'agents') return 'agents';
  if (current === 'review') return 'review';
  return 'token-information';
};

const tokenWorkflowState = (tokenRecord) => {
  if (!tokenRecord.hasToken) {
    return { progress: 0, currentIndex: 0, finalized: false };
  }
  if (tokenRecord.isDeployed || tokenRecord.isDeploymentPending) {
    return { progress: 100, currentIndex: TOKEN_ISSUANCE_STEPS.length, finalized: true };
  }
  const currentKey = tokenRecord.isReadyToDeploy || tokenRecord.isDeploymentFailed
    ? 'review'
    : tokenStepKey(tokenRecord.token);
  const currentIndex = Math.max(
    0,
    TOKEN_ISSUANCE_STEPS.findIndex((step) => step.key === currentKey),
  );
  return {
    progress: Math.round((currentIndex / TOKEN_ISSUANCE_STEPS.length) * 100),
    currentIndex,
    finalized: false,
  };
};

const requestNeedsReview = (request) => {
  const status = compactStatus(request?.status);
  return ['pending', 'submitintrest', 'submitted'].includes(status);
};

const redemptionNeedsIssuerAction = (redemption) =>
  ['PENDING_ISSUER_APPROVAL', 'TOKENS_LOCKED', 'MANUAL_REVIEW'].includes(
    issuerRedemptionStatus(redemption),
  );

const rowTime = (...values) => {
  const value = firstText(...values);
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatDashboardDate = (value) => {
  if (!value || !rowTime(value)) return '—';
  return formatDate(value, 'MMM DD, YYYY');
};

const investorApplicationStatusMeta = (value) => {
  const status = compactStatus(value);
  if (status === 'registered' || status === 'readytoinvest') return { label: 'Ready to invest', tone: 'success' };
  if (status === 'approved') return { label: 'Approved', tone: 'success' };
  if (status === 'verifiedbyissuer' || status === 'verified') return { label: 'Verification required', tone: 'warning' };
  if (status === 'claimsubmitted') return { label: 'Verification submitted', tone: 'info' };
  if (status === 'submitintrest' || status === 'submitted') return { label: 'Pending review', tone: 'info' };
  if (status === 'pending') return { label: 'Action required', tone: 'warning' };
  if (status === 'rejected') return { label: 'Rejected', tone: 'danger' };
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  return { label: firstText(value).replaceAll('_', ' ') || 'Pending', tone: 'neutral' };
};

const investorInvitationStatusMeta = (value) => {
  const status = compactStatus(value);
  if (status === 'sent') return { label: 'New', tone: 'info' };
  if (status === 'viewed') return { label: 'Viewed', tone: 'neutral' };
  return { label: firstText(value).replaceAll('_', ' ') || 'Invitation', tone: 'neutral' };
};

const investorProfileStatusMeta = (value) => {
  const status = compactStatus(value);
  if (status === 'submitted' || status === 'completed') return { label: 'Submitted', tone: 'success' };
  if (status === 'draft') return { label: 'Draft', tone: 'warning' };
  if (status === 'rejected') return { label: 'Updates required', tone: 'danger' };
  return { label: firstText(value).replaceAll('_', ' ') || 'Available', tone: 'neutral' };
};

const investorApplicationNeedsAction = (application) => {
  const status = compactStatus(application?.status);
  return status === 'pending'
    || status === 'verifiedbyissuer'
    || (status === 'rejected' && application?.canResubmit);
};

const isRegisteredInvestorApplication = (application) =>
  ['registered', 'readytoinvest', 'verifiedholder'].includes(compactStatus(application?.status));

function IssuerDashboardPage() {
  useDocumentTitle('Issuer dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const tokenRecord = useMyToken();
  const organizationQuery = useOrganization();
  const organization = organizationQuery.organization;

  const overview = useQuery({
    queryKey: [
      'dashboard',
      'issuer-overview',
      tokenRecord.tokenUid || 'no-token',
      tokenRecord.isDeployed ? 'deployed' : 'not-deployed',
    ],
    queryFn: ({ signal }) =>
      dashboardApi.getIssuerOverview({
        tokenUid: tokenRecord.tokenUid,
        includeInvestors: tokenRecord.isDeployed,
        signal,
      }),
    enabled: !tokenRecord.isLoading,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const requests = overview.data?.requests || [];
  const redemptions = overview.data?.redemptions || [];
  const investors = overview.data?.investors || [];
  const investorTotal = tokenRecord.isDeployed ? overview.data?.investorMeta?.total || 0 : null;
  const pendingRequests = requests.filter(requestNeedsReview);
  const redemptionActions = redemptions.filter(redemptionNeedsIssuerAction);
  const tokenName = getTokenRecordName(tokenRecord.token) || 'Investment asset';
  const tokenSymbol = getTokenRecordSymbol(tokenRecord.token);
  const companyName = organization?.company?.legalName || user?.name || 'Your organization';
  const organizationStatus = organizationStatusMeta(organization);
  const tokenStatus = tokenStatusMeta(tokenRecord);
  const workflow = tokenWorkflowState(tokenRecord);
  const rawToken = tokenRecord.token || {};
  const tokenNetwork = firstText(
    rawToken?.networkName,
    rawToken?.network,
    rawToken?.tokenInformation?.networkName,
    rawToken?.tokenInformation?.network,
    organization?.walletNetwork,
  );
  const tokenUpdatedAt = firstText(
    rawToken?.updatedAt,
    rawToken?.deployedAt,
    rawToken?.deployment?.deployedAt,
    rawToken?.createdAt,
  );
  const tokenDestination = tokenRecord.isDeployed
    ? ROUTES.tokenDetails(tokenRecord.tokenUid || 'token')
    : tokenRecord.isDeploymentPending
      ? ROUTES.tokenDeploying
      : tokenRecord.isReadyToDeploy || tokenRecord.isDeploymentFailed
        ? ROUTES.tokenIssuanceStep('review')
        : tokenRecord.hasToken
          ? ROUTES.tokenIssuanceStep(tokenStepKey(rawToken))
          : ROUTES.createToken;
  const tokenActionLabel = tokenRecord.isDeployed
    ? 'View asset'
    : tokenRecord.isDeploymentPending
      ? 'View creation status'
      : tokenRecord.isReadyToDeploy || tokenRecord.isDeploymentFailed
        ? 'Review asset setup'
        : tokenRecord.hasToken
          ? 'Continue asset setup'
          : 'Create investment asset';

  const recentRequests = useMemo(
    () => [...requests]
      .sort((a, b) => rowTime(b?.requestedDate, b?.submittedAt, b?.updatedAt) - rowTime(a?.requestedDate, a?.submittedAt, a?.updatedAt))
      .slice(0, 4),
    [requests],
  );
  const recentRedemptions = useMemo(
    () => [...redemptions]
      .sort((a, b) => rowTime(b?.createdAt, b?.requestedAt, b?.submittedAt, b?.updatedAt) - rowTime(a?.createdAt, a?.requestedAt, a?.submittedAt, a?.updatedAt))
      .slice(0, 4),
    [redemptions],
  );

  const actionItems = useMemo(() => {
    const items = [];
    if (organization?.status !== ORGANIZATION_STATUSES.VERIFIED) {
      if (organization?.status === ORGANIZATION_STATUSES.REJECTED) {
        items.push({
          id: 'organization-rejected',
          icon: Building2,
          title: 'Organization updates required',
          description: organization.rejectionReason || 'Review the organization feedback and resubmit the required information.',
          label: 'Review organization',
          to: ROUTES.organization,
          tone: 'danger',
        });
      } else if (organization?.status === ORGANIZATION_STATUSES.SUBMITTED) {
        items.push({
          id: 'organization-review',
          icon: Building2,
          title: 'Organization review in progress',
          description: 'Your organization has been submitted and is waiting for an administrator decision.',
          label: 'View status',
          to: ROUTES.organization,
          tone: 'info',
        });
      } else if (organization?.status === ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING) {
        items.push({
          id: 'organization-approved',
          icon: CheckCircle2,
          title: 'Organization approved',
          description: 'Open the approval result to continue into the issuer workspace.',
          label: 'View approval',
          to: ROUTES.organization,
          tone: 'success',
        });
      } else {
        items.push({
          id: 'organization-onboarding',
          icon: Building2,
          title: 'Complete organization onboarding',
          description: 'Finish the remaining organization information before creating your investment asset.',
          label: 'Continue',
          to: ROUTES.organization,
          tone: 'warning',
        });
      }
      return items;
    }

    if (!tokenRecord.hasToken) {
      items.push({
        id: 'create-token',
        icon: Coins,
        title: 'Create your investment asset',
        description: 'Your organization is verified and ready to begin the guided asset setup.',
        label: 'Create asset',
        to: ROUTES.createToken,
        tone: 'info',
      });
    } else if (!tokenRecord.isDeployed) {
      items.push({
        id: 'continue-token',
        icon: Coins,
        title: tokenStatus.label,
        description: tokenStatus.description,
        label: tokenActionLabel,
        to: tokenDestination,
        tone: tokenStatus.tone,
      });
    }

    if (pendingRequests.length) {
      items.push({
        id: 'subscription-requests',
        icon: UsersRound,
        title: `${numberFormatter.format(pendingRequests.length)} investment request${pendingRequests.length === 1 ? '' : 's'} waiting for review`,
        description: 'Open Investment Requests to review the latest investor submissions.',
        label: 'Review requests',
        to: ROUTES.investors,
        tone: 'warning',
      });
    }

    if (redemptionActions.length) {
      items.push({
        id: 'redemption-actions',
        icon: RefreshCcw,
        title: `${numberFormatter.format(redemptionActions.length)} redemption${redemptionActions.length === 1 ? '' : 's'} need issuer action`,
        description: 'Review approvals, payments, or manual-review items that are waiting on the issuer.',
        label: 'Review redemptions',
        to: ROUTES.issuerRedemptions,
        tone: 'warning',
      });
    }

    if (tokenRecord.isDeployed && investors.some((investor) => investor.eligibleForInvitation)) {
      items.push({
        id: 'eligible-investors',
        icon: Mail,
        title: 'Eligible investors are available to invite',
        description: 'Open the investor directory to review eligibility and send investment invitations.',
        label: 'Open investors',
        to: ROUTES.issuerInvestorDirectory,
        tone: 'info',
      });
    }

    return items;
  }, [
    investors,
    organization?.rejectionReason,
    organization?.status,
    pendingRequests.length,
    redemptionActions.length,
    tokenActionLabel,
    tokenDestination,
    tokenRecord.hasToken,
    tokenRecord.isDeployed,
    tokenStatus.description,
    tokenStatus.label,
    tokenStatus.tone,
  ]);

  const metricCards = [
    {
      id: 'requests',
      icon: UsersRound,
      label: 'Investment requests',
      value: numberFormatter.format(requests.length),
      helper: pendingRequests.length
        ? `${numberFormatter.format(pendingRequests.length)} waiting for review`
        : requests.length
          ? 'No new requests need review'
          : 'No investment requests yet',
      to: ROUTES.investors,
    },
    {
      id: 'investors',
      icon: UserRoundCheck,
      label: 'Approved investors',
      value: investorTotal === null ? '—' : numberFormatter.format(investorTotal),
      helper: tokenRecord.isDeployed
        ? `Approved to invest in ${tokenSymbol || tokenName}`
        : 'Available after asset creation',
      to: ROUTES.issuerInvestorDirectory,
      disabled: !tokenRecord.isDeployed,
    },
    {
      id: 'redemptions',
      icon: RefreshCcw,
      label: 'Redemption requests',
      value: numberFormatter.format(redemptions.length),
      helper: redemptionActions.length
        ? `${numberFormatter.format(redemptionActions.length)} require issuer action`
        : redemptions.length
          ? 'No issuer action currently required'
          : 'No redemption requests yet',
      to: ROUTES.issuerRedemptions,
    },
    {
      id: 'token',
      icon: Coins,
      label: 'Asset status',
      value: tokenStatus.label,
      helper: tokenRecord.hasToken
        ? tokenRecord.isDeployed
          ? `${tokenSymbol || tokenName} creation complete`
          : [tokenSymbol, tokenNetwork].filter(Boolean).join(' · ') || 'Current asset setup'
        : 'No investment asset configured yet',
      to: tokenDestination,
    },
  ];

  const isDashboardLoading = overview.isLoading || tokenRecord.isLoading || organizationQuery.isLoading;
  const isRefreshing = overview.isFetching || tokenRecord.isFetching || organizationQuery.isFetching;
  const hasPartialErrors = Boolean(
    overview.data?.errors?.length || tokenRecord.isError || Boolean(organizationQuery.error),
  );

  const refreshDashboard = () => {
    void Promise.allSettled([
      overview.refetch(),
      tokenRecord.refetch(),
      organizationQuery.refresh(),
    ]);
  };

  return (
    <div className="page-stack issuer-dashboard-live">
      <header className="issuer-dashboard-live__header">
        <div>
          <span className="eyebrow">Issuer workspace</span>
          <h1>Dashboard</h1>
          <p>See what is ready, what needs your attention, and what to do next across your investment activity.</p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          loading={isRefreshing && !isDashboardLoading}
          onClick={refreshDashboard}
        >
          Refresh
        </Button>
      </header>

      <Card className="issuer-dashboard-hero-live">
        <div className="issuer-dashboard-hero-live__content">
          <div className="issuer-dashboard-hero-live__badges">
            <Badge tone={organizationStatus.tone}>Organization · {organizationStatus.label}</Badge>
            <Badge tone={tokenStatus.tone}>Asset · {tokenStatus.label}</Badge>
          </div>
          <span className="issuer-dashboard-hero-live__eyebrow">{companyName}</span>
          <h2>Welcome back, {user?.name?.split(' ')[0] || 'Issuer'}.</h2>
          <p>
            {tokenRecord.isDeployed
              ? `${tokenName}${tokenSymbol ? ` (${tokenSymbol})` : ''} has been created. Open the asset to review its live price and access settings, or continue to your approved investor list.`
              : tokenRecord.hasToken
                ? `${tokenName}${tokenSymbol ? ` (${tokenSymbol})` : ''} is currently ${tokenStatus.label.toLowerCase()}. ${tokenStatus.description}`
                : tokenStatus.description}
          </p>
          <div className="issuer-dashboard-next-step" role="note">
            <strong>Next:</strong>
            <span>
              {tokenRecord.isDeployed
                ? 'Open the asset to confirm its live settings, then review approved investors and send invitations when you are ready.'
                : tokenRecord.hasToken
                  ? 'Continue the asset setup from where you left off.'
                  : 'Start the guided asset setup when you are ready to raise investment.'}
            </span>
          </div>
          <div className="issuer-dashboard-hero-live__actions">
            <Button icon={Coins} onClick={() => navigate(tokenDestination)}>
              {tokenActionLabel}
            </Button>
            <Button
              variant="secondary"
              icon={tokenRecord.isDeployed ? UsersRound : Building2}
              onClick={() => navigate(tokenRecord.isDeployed ? ROUTES.issuerInvestorDirectory : ROUTES.organization)}
            >
              {tokenRecord.isDeployed ? 'View investors' : 'Organization'}
            </Button>
          </div>
        </div>
        <div className="issuer-dashboard-token-snapshot">
          <div className="issuer-dashboard-token-snapshot__top">
            <span className="issuer-dashboard-token-snapshot__icon"><ShieldCheck size={24} /></span>
            <div>
              <small>Current investment asset</small>
              <strong>{tokenRecord.hasToken ? tokenName : 'No asset yet'}</strong>
              {tokenSymbol ? <span>{tokenSymbol}</span> : null}
            </div>
          </div>
          <dl>
            <div><dt>Status</dt><dd>{tokenStatus.label}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDashboardDate(tokenUpdatedAt)}</dd></div>
            <div><dt>Investor access</dt><dd>{tokenRecord.isDeployed ? 'Review on asset page' : 'Not available yet'}</dd></div>
            {tokenRecord.isDeployed ? (
              <div><dt>Network</dt><dd>{tokenNetwork || '—'}</dd></div>
            ) : null}
          </dl>
        </div>
      </Card>

      {hasPartialErrors ? (
        <div className="issuer-dashboard-data-warning" role="status">
          <AlertCircle size={18} />
          <div>
            <strong>Some dashboard data could not be refreshed.</strong>
            <span>Your available data is still shown below. Retry when the connection is available.</span>
          </div>
          <button type="button" onClick={refreshDashboard}>Retry</button>
        </div>
      ) : null}

      <section className="issuer-dashboard-metric-grid" aria-label="Issuer dashboard metrics">
        {isDashboardLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <Card className="issuer-dashboard-live-metric is-loading" key={index}>
                <Skeleton width="42%" />
                <Skeleton height={34} width="62%" />
                <Skeleton width="72%" />
              </Card>
            ))
          : metricCards.map((metric) => {
              const Icon = metric.icon;
              return (
                <button
                  className="issuer-dashboard-live-metric"
                  type="button"
                  key={metric.id}
                  onClick={() => !metric.disabled && navigate(metric.to)}
                  disabled={metric.disabled}
                >
                  <span className="issuer-dashboard-live-metric__icon"><Icon size={20} /></span>
                  <span className="issuer-dashboard-live-metric__copy">
                    <small>{metric.label}</small>
                    <strong>{metric.value}</strong>
                    <span>{metric.helper}</span>
                  </span>
                  {!metric.disabled ? <ArrowRight size={17} className="issuer-dashboard-live-metric__arrow" /> : null}
                </button>
              );
            })}
      </section>

      <section className="issuer-dashboard-live__main-grid">
        <Card className="issuer-dashboard-workflow-card">
          <header className="issuer-dashboard-card-header">
            <div>
              <span className="eyebrow">Asset setup</span>
              <h2>{tokenRecord.hasToken ? tokenName : 'Investment asset setup'}</h2>
              <p>{tokenStatus.description}</p>
            </div>
            <Badge tone={tokenStatus.tone}>{tokenStatus.label}</Badge>
          </header>

          {tokenRecord.hasToken ? (
            <>
              <div className="issuer-dashboard-progress-copy">
                <span>Setup progress</span>
                <strong>{workflow.progress}%</strong>
              </div>
              <div className="issuer-dashboard-progress-track" aria-label={`Asset setup ${workflow.progress}% complete`}>
                <span style={{ width: `${workflow.progress}%` }} />
              </div>
              <div className="issuer-dashboard-workflow-list">
                {TOKEN_ISSUANCE_STEPS.map((step, index) => {
                  const complete = workflow.finalized || index < workflow.currentIndex;
                  const current = !workflow.finalized && index === workflow.currentIndex;
                  return (
                    <div className={`issuer-dashboard-workflow-step ${current ? 'is-current' : ''}`} key={step.key}>
                      <span className={`issuer-dashboard-workflow-step__marker ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}>
                        {complete ? <Check size={15} /> : current ? step.number : <Circle size={11} />}
                      </span>
                      <div>
                        <strong>{step.label}</strong>
                        <small>{step.description}</small>
                      </div>
                      {current ? <Badge tone="info">Current</Badge> : complete ? <span className="issuer-dashboard-step-done">Done</span> : null}
                    </div>
                  );
                })}
              </div>
              <Button className="button--full" variant="secondary" onClick={() => navigate(tokenDestination)}>
                {tokenActionLabel} <ArrowRight size={17} />
              </Button>
            </>
          ) : (
            <div className="issuer-dashboard-empty-panel">
              <span><Coins size={28} /></span>
              <h3>No investment asset yet</h3>
              <p>Start the guided setup when you are ready. Your progress is saved automatically as you complete each step.</p>
              <Button onClick={() => navigate(ROUTES.createToken)} disabled={organization?.status !== ORGANIZATION_STATUSES.VERIFIED}>
                Create investment asset
              </Button>
            </div>
          )}
        </Card>

        <Card className="issuer-dashboard-action-card">
          <header className="issuer-dashboard-card-header">
            <div>
              <span className="eyebrow">Action center</span>
              <h2>What should I do next?</h2>
              <p>Only actions that need you are shown here.</p>
            </div>
          </header>
          {isDashboardLoading ? (
            <div className="issuer-dashboard-action-list">
              <Skeleton height={82} />
              <Skeleton height={82} />
              <Skeleton height={82} />
            </div>
          ) : actionItems.length ? (
            <div className="issuer-dashboard-action-list">
              {actionItems.slice(0, 4).map((item) => {
                const Icon = item.icon;
                return (
                  <button type="button" className={`issuer-dashboard-action-item is-${item.tone}`} key={item.id} onClick={() => navigate(item.to)}>
                    <span className="issuer-dashboard-action-item__icon"><Icon size={19} /></span>
                    <span className="issuer-dashboard-action-item__copy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="issuer-dashboard-action-item__cta">{item.label}<ArrowRight size={15} /></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="issuer-dashboard-all-clear">
              <span><CheckCircle2 size={28} /></span>
              <h3>You&apos;re up to date</h3>
              <p>There are no issuer actions waiting in the currently loaded account data.</p>
            </div>
          )}
        </Card>
      </section>

      <section className="issuer-dashboard-live__activity-grid">
        <Card className="issuer-dashboard-list-card">
          <header className="issuer-dashboard-card-header">
            <div>
              <span className="eyebrow">Investment Requests</span>
              <h2>Recent investment requests</h2>
              <p>Latest investor requests for your investment asset.</p>
            </div>
            <button className="link-button" type="button" onClick={() => navigate(ROUTES.investors)}>
              View all
            </button>
          </header>
          {overview.isLoading ? (
            <div className="issuer-dashboard-compact-list"><Skeleton height={62} /><Skeleton height={62} /><Skeleton height={62} /></div>
          ) : recentRequests.length ? (
            <div className="issuer-dashboard-compact-list">
              {recentRequests.map((request) => {
                const meta = requestStatusMeta(request.status);
                return (
                  <button
                    type="button"
                    className="issuer-dashboard-compact-row"
                    key={request.interestUid}
                    onClick={() => navigate(`${ROUTES.investors}/${request.interestUid}`)}
                  >
                    <span className="issuer-dashboard-avatar">{(request.investorName || 'I').slice(0, 1).toUpperCase()}</span>
                    <span className="issuer-dashboard-compact-row__main">
                      <strong>{request.investorName || 'Investor'}</strong>
                      <small>{request.tokenName || request.tokenSymbol || 'Investment request'}</small>
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="issuer-dashboard-compact-row__date">{formatDashboardDate(request.requestedDate || request.submittedAt)}</span>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="issuer-dashboard-list-empty">
              <UsersRound size={24} />
              <strong>No investment requests yet</strong>
              <span>Investor requests will appear here when they are submitted.</span>
            </div>
          )}
        </Card>

        <Card className="issuer-dashboard-list-card">
          <header className="issuer-dashboard-card-header">
            <div>
              <span className="eyebrow">Redemptions</span>
              <h2>Recent redemption activity</h2>
              <p>Latest redemption requests for your organization.</p>
            </div>
            <button className="link-button" type="button" onClick={() => navigate(ROUTES.issuerRedemptions)}>
              View all
            </button>
          </header>
          {overview.isLoading ? (
            <div className="issuer-dashboard-compact-list"><Skeleton height={62} /><Skeleton height={62} /><Skeleton height={62} /></div>
          ) : recentRedemptions.length ? (
            <div className="issuer-dashboard-compact-list">
              {recentRedemptions.map((redemption, index) => {
                const status = issuerRedemptionStatusMeta(redemption?.status);
                const uid = issuerRedemptionUid(redemption);
                const date = cleanRedemptionText(redemption?.createdAt || redemption?.requestedAt || redemption?.submittedAt || redemption?.updatedAt);
                return (
                  <button
                    type="button"
                    className="issuer-dashboard-compact-row issuer-dashboard-compact-row--redemption"
                    key={uid || `redemption-${index}`}
                    onClick={() => uid && navigate(ROUTES.issuerRedemption(uid))}
                    disabled={!uid}
                  >
                    <span className="issuer-dashboard-avatar"><RefreshCcw size={16} /></span>
                    <span className="issuer-dashboard-compact-row__main">
                      <strong>{issuerRedemptionInvestorLabel(redemption)}</strong>
                      <small>{issuerRedemptionTokenLabel(redemption)}</small>
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="issuer-dashboard-compact-row__date">{formatDashboardDate(date)}</span>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="issuer-dashboard-list-empty">
              <RefreshCcw size={24} />
              <strong>No redemption activity yet</strong>
              <span>Investor redemption requests will appear here when they are created.</span>
            </div>
          )}
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

  const overview = useQuery({
    queryKey: ['dashboard', 'investor-overview'],
    queryFn: ({ signal }) => dashboardApi.getInvestorOverview({ signal }),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const onboarding = investorQuery.state || {};
  const profile = onboarding.investorProfile || {};
  const identity = onboarding.identity || {};
  const identityDocuments = onboarding.documents?.identityDocuments || [];
  const accreditationDocuments = onboarding.compliance?.accreditationDocuments || [];
  const rawInvestor = investorQuery.rawInvestor || {};
  const applications = overview.data?.applications || [];
  const invitations = overview.data?.invitations || [];
  const offerings = overview.data?.offerings || [];
  const invitationTotal = overview.data?.invitationMeta?.total || 0;
  const newInvitationTotal = overview.data?.newInvitationTotal || 0;
  const offeringTotal = overview.data?.offeringMeta?.total || 0;
  const registeredApplications = applications.filter(isRegisteredInvestorApplication);
  const applicationsNeedingAction = applications.filter(investorApplicationNeedsAction);
  const claimsRequired = applications.filter((application) => compactStatus(application?.status) === 'verifiedbyissuer');
  const resubmissionsAvailable = applications.filter(
    (application) => compactStatus(application?.status) === 'rejected' && application?.canResubmit,
  );

  const recentApplications = useMemo(
    () => [...applications]
      .sort((a, b) => rowTime(b?.updatedAt, b?.decisionAt, b?.submittedAt) - rowTime(a?.updatedAt, a?.decisionAt, a?.submittedAt))
      .slice(0, 4),
    [applications],
  );

  const recentInvitations = useMemo(
    () => [...invitations]
      .sort((a, b) => rowTime(b?.sentAt, b?.createdAt, b?.updatedAt) - rowTime(a?.sentAt, a?.createdAt, a?.updatedAt))
      .slice(0, 4),
    [invitations],
  );

  const walletAddress = onboarding.wallet?.address || '';
  const displayWallet = walletAddress
    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`
    : 'Not linked';
  const connectedMatches = Boolean(
    walletAddress
      && walletConnection.address
      && walletAddress.toLowerCase() === walletConnection.address.toLowerCase(),
  );
  const profileStatus = investorQuery.isLoading
    ? { label: 'Loading', tone: 'neutral' }
    : investorProfileStatusMeta(profile.status || onboarding.backendStatus || rawInvestor.status);
  const documentCount = identityDocuments.length + accreditationDocuments.length;
  const submittedAt = firstText(rawInvestor.submittedAt, rawInvestor.updatedAt, onboarding.lastUpdated);
  const investorName = firstText(
    user?.name,
    [identity.firstName, identity.lastName].filter(Boolean).join(' '),
    'Investor',
  );
  const locationLabel = [identity.cityName, identity.stateProvinceName, identity.countryOfResidenceName]
    .filter(Boolean)
    .join(', ') || 'Not available';

  const actionItems = useMemo(() => {
    const items = [];

    if (newInvitationTotal > 0) {
      items.push({
        id: 'new-invitations',
        icon: Mail,
        title: `${numberFormatter.format(newInvitationTotal)} new invitation${newInvitationTotal === 1 ? '' : 's'}`,
        description: 'An issuer invited you to review an investment opportunity.',
        label: 'View invitations',
        to: ROUTES.invitations,
        tone: 'info',
      });
    }

    if (claimsRequired.length > 0) {
      items.push({
        id: 'claims-required',
        icon: ShieldCheck,
        title: `${numberFormatter.format(claimsRequired.length)} application${claimsRequired.length === 1 ? '' : 's'} need verification`,
        description: 'The issuer reviewed your request and needs additional verification documents before you can continue.',
        label: 'Review applications',
        to: ROUTES.applications,
        tone: 'warning',
      });
    }

    if (resubmissionsAvailable.length > 0) {
      items.push({
        id: 'resubmit-claims',
        icon: RefreshCcw,
        title: `${numberFormatter.format(resubmissionsAvailable.length)} verification update${resubmissionsAvailable.length === 1 ? '' : 's'} available`,
        description: 'Open the affected application to review issuer feedback and update the requested verification documents.',
        label: 'Review feedback',
        to: ROUTES.applications,
        tone: 'danger',
      });
    }

    if (registeredApplications.length > 0) {
      items.push({
        id: 'registered-assets',
        icon: Coins,
        title: `${numberFormatter.format(registeredApplications.length)} approved investment${registeredApplications.length === 1 ? '' : 's'} ready`,
        description: 'You are approved for this investment. You can invest more, send, or redeem.',
        label: 'Open my assets',
        to: ROUTES.assetManagement,
        tone: 'success',
      });
    }

    if (!items.length && offeringTotal > 0) {
      items.push({
        id: 'explore-marketplace',
        icon: Store,
        title: 'Explore available investments',
        description: `${numberFormatter.format(offeringTotal)} investment opportunit${offeringTotal === 1 ? 'y is' : 'ies are'} available to review.`,
        label: 'Open marketplace',
        to: ROUTES.marketplace,
        tone: 'info',
      });
    }

    return items;
  }, [claimsRequired.length, newInvitationTotal, offeringTotal, registeredApplications.length, resubmissionsAvailable.length]);

  const isDashboardLoading = investorQuery.isLoading || overview.isLoading;
  const isRefreshing = investorQuery.isFetching || overview.isFetching;
  const hasPartialErrors = Boolean(investorQuery.isError || overview.isError || overview.data?.errors?.length);
  const allOverviewSectionsFailed = Boolean(overview.data?.errors?.length >= 4);
  const noDashboardData = investorQuery.isError && (overview.isError || allOverviewSectionsFailed);

  const refreshDashboard = () => {
    void Promise.allSettled([investorQuery.refetch(), overview.refetch()]);
  };

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

  const openInvitation = (invitation) => {
    const invitationUid = invitation?.invitationUid;
    const tokenUid = invitation?.tokenUid || invitation?.token?.tokenUid || invitation?.token?.id;
    if (!tokenUid) return;

    if (invitationUid && compactStatus(invitation?.status) !== 'viewed') {
      void investorInvitationService.markViewed(invitationUid).catch(() => {
        toast.warning('The invitation could not be marked as viewed, but you can still review the token.');
      });
    }

    navigate(ROUTES.marketplaceToken(tokenUid));
  };

  if (noDashboardData) {
    return (
      <Card className="investor-dashboard-error">
        <ShieldCheck size={28} />
        <h1>We could not load your investor dashboard</h1>
        <p>The dashboard APIs are currently unavailable. Retry to load your profile, applications, invitations, and marketplace data.</p>
        <Button onClick={refreshDashboard}>Try again</Button>
      </Card>
    );
  }

  return (
    <div className="page-stack investor-portal-dashboard investor-dashboard-live">
      <header className="investor-dashboard-live__header">
        <div>
          <span className="eyebrow">Investor workspace</span>
          <h1>Dashboard</h1>
          <p>See what needs your attention, continue applications, and manage your investments from one place.</p>
        </div>
        <div className="investor-dashboard-live__header-actions">
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={isRefreshing && !isDashboardLoading}
            onClick={refreshDashboard}
          >
            Refresh
          </Button>
          <Button icon={Store} onClick={() => navigate(ROUTES.marketplace)}>
            Explore Marketplace
          </Button>
        </div>
      </header>

      <Card className="investor-dashboard-live__hero">
        <div className="investor-dashboard-live__hero-copy">
          <div className="investor-dashboard-live__badges">
            <Badge tone={profileStatus.tone}>Profile · {profileStatus.label}</Badge>
            <Badge tone={investorQuery.isLoading ? 'neutral' : walletAddress ? 'success' : 'neutral'}>Wallet · {investorQuery.isLoading ? 'Loading' : walletAddress ? 'Connected' : 'Not connected'}</Badge>
          </div>
          <span className="investor-dashboard-live__eyebrow">{investorName}</span>
          <h2>Welcome back, {firstText(user?.name?.split(' ')[0], identity.firstName, 'Investor')}.</h2>
          <p>
            {newInvitationTotal > 0
              ? `You have ${numberFormatter.format(newInvitationTotal)} new invitation${newInvitationTotal === 1 ? '' : 's'} waiting to be reviewed.`
              : applicationsNeedingAction.length > 0
                ? `${numberFormatter.format(applicationsNeedingAction.length)} application${applicationsNeedingAction.length === 1 ? '' : 's'} currently need your attention.`
                : 'Nothing needs your attention right now. You can manage an approved investment or explore new opportunities below.'}
          </p>
          <div className="investor-dashboard-live__hero-actions">
            {newInvitationTotal > 0 ? (
              <Button icon={Mail} onClick={() => navigate(ROUTES.invitations)}>Review invitations</Button>
            ) : registeredApplications.length > 0 ? (
              <Button icon={Coins} onClick={() => navigate(ROUTES.assetManagement)}>Manage investments</Button>
            ) : (
              <Button icon={Store} onClick={() => navigate(ROUTES.marketplace)}>Browse offerings</Button>
            )}
            <Button variant="secondary" icon={FileClock} onClick={() => navigate(ROUTES.applications)}>
              My applications
            </Button>
          </div>
        </div>

        <div className="investor-dashboard-live__identity-snapshot">
          <div className="investor-dashboard-live__identity-top">
            <span className="investor-dashboard-card-icon"><UserRoundCheck size={21} /></span>
            <div>
              <small>Account setup</small>
              <strong>{profileStatus.label === 'Loading' ? 'Checking your profile…' : 'Investor profile ready'}</strong>
              <span>{locationLabel}</span>
            </div>
          </div>
          <dl>
            <div><dt>Profile reference</dt><dd>{profile.profileId || '—'}</dd></div>
            <div><dt>Documents provided</dt><dd>{numberFormatter.format(documentCount)}</dd></div>
            <div><dt>Profile submitted</dt><dd>{formatDashboardDate(submittedAt)}</dd></div>
          </dl>
          <div className="investor-dashboard-live__identity-actions">
            <button type="button" className="investor-dashboard-live__copy" onClick={() => navigate(ROUTES.profile)}>
              <UserRoundCheck size={14} /> View profile
            </button>
            {profile.onchainId || profile.profileId ? (
              <details className="investor-technical-details investor-technical-details--compact">
                <summary>Technical details</summary>
                <div>
                  <span>Technical identity reference</span>
                  <strong title={profile.onchainId || undefined}>{profile.onchainId ? `${profile.onchainId.slice(0, 8)}…${profile.onchainId.slice(-6)}` : 'Not available'}</strong>
                  <button type="button" onClick={copyIdentity}><Copy size={13} /> Copy reference</button>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </Card>

      {hasPartialErrors ? (
        <div className="investor-dashboard-live__warning" role="status">
          <AlertCircle size={18} />
          <div>
            <strong>Some dashboard data could not be refreshed.</strong>
            <span>Available account data is still shown below. Retry when the connection is available.</span>
          </div>
          <button type="button" onClick={refreshDashboard}>Retry</button>
        </div>
      ) : null}

      <section className="investor-dashboard-live__metrics" aria-label="Investor dashboard metrics">
        {isDashboardLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <Card className="investor-dashboard-live__metric is-loading" key={index}>
                <Skeleton width="42%" />
                <Skeleton height={34} width="30%" />
                <Skeleton width="66%" />
              </Card>
            ))
          : [
              {
                id: 'applications', icon: FileClock, label: 'Investment applications', value: applications.length,
                helper: applicationsNeedingAction.length ? `${applicationsNeedingAction.length} need your attention` : applications.length ? 'No immediate action required' : 'No applications submitted yet',
                to: ROUTES.applications,
              },
              {
                id: 'invitations', icon: Mail, label: 'Invitations', value: invitationTotal,
                helper: newInvitationTotal ? `${newInvitationTotal} new invitation${newInvitationTotal === 1 ? '' : 's'}` : invitationTotal ? 'All invitations have been viewed' : 'No invitations received yet',
                to: ROUTES.invitations,
              },
              {
                id: 'assets', icon: Coins, label: 'Approved investments', value: registeredApplications.length,
                helper: registeredApplications.length ? 'Approved and ready to manage' : 'Available after issuer approval',
                to: ROUTES.assetManagement,
              },
              {
                id: 'offerings', icon: Store, label: 'Available investments', value: offeringTotal,
                helper: offeringTotal ? 'Opportunities available to explore' : 'No investments available right now',
                to: ROUTES.marketplace,
              },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <button
                  type="button"
                  className="card investor-dashboard-live__metric"
                  key={metric.id}
                  onClick={() => navigate(metric.to)}
                >
                  <span className="investor-dashboard-live__metric-icon"><Icon size={20} /></span>
                  <span className="investor-dashboard-live__metric-copy">
                    <small>{metric.label}</small>
                    <strong>{numberFormatter.format(metric.value)}</strong>
                    <span>{metric.helper}</span>
                  </span>
                  <ArrowRight className="investor-dashboard-live__metric-arrow" size={17} />
                </button>
              );
            })}
      </section>

      <section className="investor-dashboard-live__main-grid">
        <Card className="investor-dashboard-live__action-card">
          <header className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Action center</span>
              <h2>What should I do next?</h2>
            </div>
            <span className="investor-dashboard-card-icon"><ShieldCheck size={20} /></span>
          </header>

          {isDashboardLoading ? (
            <div className="investor-dashboard-live__action-list">
              <Skeleton height={82} /><Skeleton height={82} /><Skeleton height={82} />
            </div>
          ) : actionItems.length ? (
            <div className="investor-dashboard-live__action-list">
              {actionItems.slice(0, 4).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    className={`investor-dashboard-live__action-item is-${item.tone}`}
                    key={item.id}
                    onClick={() => navigate(item.to)}
                  >
                    <span className="investor-dashboard-live__action-icon"><Icon size={19} /></span>
                    <span className="investor-dashboard-live__action-copy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="investor-dashboard-live__action-cta">{item.label}<ArrowRight size={15} /></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="investor-dashboard-live__all-clear">
              <span><CheckCircle2 size={28} /></span>
              <h3>You&apos;re up to date</h3>
              <p>No investor actions are waiting in the currently loaded account data.</p>
            </div>
          )}
        </Card>

        <Card className="investor-dashboard-live__account-card">
          <header className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Account</span>
              <h2>Identity & wallet</h2>
            </div>
            <button className="link-button" type="button" onClick={() => navigate(ROUTES.profile)}>View profile</button>
          </header>

          <div className="investor-dashboard-live__account-block">
            <span className="investor-dashboard-live__account-icon"><UserRoundCheck size={18} /></span>
            <div>
              <small>Investor profile</small>
              <strong>{profile.profileId || '—'}</strong>
              <span>{profileStatus.label} · {documentCount} document{documentCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="investor-dashboard-live__account-block">
            <span className="investor-dashboard-live__account-icon"><WalletCards size={18} /></span>
            <div>
              <small>Privy secure account</small>
              <strong>{walletAddress ? 'Securely managed by Privy' : 'Not linked yet'}</strong>
              <span>{walletAddress ? 'Your Privy account is linked to your T-REX profile' : 'Complete Privy secure account setup to continue'}</span>
            </div>
          </div>
          <Button className="button--full" variant="secondary" onClick={() => navigate(ROUTES.profile)}>
            View full investor profile <ArrowRight size={17} />
          </Button>
        </Card>
      </section>

      <section className="investor-dashboard-live__activity-grid">
        <Card className="investor-dashboard-live__list-card">
          <header className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Applications</span>
              <h2>Recent application activity</h2>
            </div>
            <button className="link-button" type="button" onClick={() => navigate(ROUTES.applications)}>View all</button>
          </header>

          {overview.isLoading ? (
            <div className="investor-dashboard-live__list"><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>
          ) : recentApplications.length ? (
            <div className="investor-dashboard-live__list">
              {recentApplications.map((application) => {
                const status = investorApplicationStatusMeta(application.status);
                return (
                  <button
                    type="button"
                    className="investor-dashboard-live__row"
                    key={application.interestUid}
                    onClick={() => navigate(ROUTES.applicationDetail(application.interestUid))}
                  >
                    <span className="investor-dashboard-live__row-icon">{firstText(application.token?.symbol, application.token?.name, 'T').slice(0, 1).toUpperCase()}</span>
                    <span className="investor-dashboard-live__row-main">
                      <strong>{application.token?.name || 'Token application'}</strong>
                      <small>{[application.token?.symbol, application.token?.issuer].filter(Boolean).join(' · ') || 'Investment application'}</small>
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="investor-dashboard-live__row-date">{formatDashboardDate(application.updatedAt || application.submittedAt)}</span>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="investor-dashboard-live__empty-list">
              <FileClock size={24} />
              <strong>No applications yet</strong>
              <span>Applications will appear here after you request to invest from the marketplace.</span>
              <Button variant="secondary" onClick={() => navigate(ROUTES.marketplace)}>Browse offerings</Button>
            </div>
          )}
        </Card>

        <Card className="investor-dashboard-live__list-card">
          <header className="investor-dashboard-card-heading">
            <div>
              <span className="eyebrow">Invitations</span>
              <h2>Recent issuer invitations</h2>
            </div>
            <button className="link-button" type="button" onClick={() => navigate(ROUTES.invitations)}>View all</button>
          </header>

          {overview.isLoading ? (
            <div className="investor-dashboard-live__list"><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></div>
          ) : recentInvitations.length ? (
            <div className="investor-dashboard-live__list">
              {recentInvitations.map((invitation) => {
                const status = investorInvitationStatusMeta(invitation.status);
                return (
                  <button
                    type="button"
                    className="investor-dashboard-live__row"
                    key={invitation.invitationUid}
                    onClick={() => openInvitation(invitation)}
                  >
                    <span className="investor-dashboard-live__row-icon"><Mail size={16} /></span>
                    <span className="investor-dashboard-live__row-main">
                      <strong>{invitation.token?.name || 'Token invitation'}</strong>
                      <small>{[invitation.token?.symbol, invitation.companyName].filter(Boolean).join(' · ') || 'Issuer invitation'}</small>
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="investor-dashboard-live__row-date">{formatDashboardDate(invitation.sentAt || invitation.createdAt)}</span>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="investor-dashboard-live__empty-list">
              <Mail size={24} />
              <strong>No invitations yet</strong>
              <span>Invitations sent by issuers will appear here when they become available.</span>
            </div>
          )}
        </Card>
      </section>

      <Card className="investor-dashboard-live__marketplace-card">
        <header className="investor-dashboard-card-heading">
          <div>
            <span className="eyebrow">Marketplace</span>
            <h2>Available offerings</h2>
          </div>
          <button className="link-button" type="button" onClick={() => navigate(ROUTES.marketplace)}>Explore all</button>
        </header>

        {overview.isLoading ? (
          <div className="investor-dashboard-live__offering-grid"><Skeleton height={116} /><Skeleton height={116} /><Skeleton height={116} /><Skeleton height={116} /></div>
        ) : offerings.length ? (
          <div className="investor-dashboard-live__offering-grid">
            {offerings.map((token) => (
              <button
                type="button"
                className="investor-dashboard-live__offering"
                key={token.tokenUid || token.id}
                onClick={() => navigate(ROUTES.marketplaceToken(token.tokenUid || token.id))}
              >
                <span className="investor-dashboard-live__offering-mark">{firstText(token.symbol, token.name, 'T').slice(0, 1).toUpperCase()}</span>
                <span className="investor-dashboard-live__offering-copy">
                  <small>{token.symbol || 'Token'}</small>
                  <strong>{token.name || 'Token offering'}</strong>
                  <span>{[token.issuer, token.assetClass].filter((value) => value && value !== '—').join(' · ') || 'Created offering'}</span>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="investor-dashboard-live__empty-marketplace">
            <Store size={24} />
            <div><strong>No created offerings available</strong><span>The marketplace will update when issuers make created tokens available.</span></div>
          </div>
        )}
      </Card>
    </div>
  );
}
export default function DashboardPage() {
  const { user } = useAuth();
  return user?.role === ROLES.investor ? <InvestorDashboardPage /> : <IssuerDashboardPage />;
}

