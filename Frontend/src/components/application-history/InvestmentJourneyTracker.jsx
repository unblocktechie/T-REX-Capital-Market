import { useId, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Info,
  UserRound,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { featureFlags } from '@/config/featureFlags';

const toneIcon = (tone) => {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'danger') return AlertTriangle;
  if (tone === 'warning') return UserRound;
  return Clock3;
};

const STEP_GUIDANCE = {
  investor: [
    {
      what: 'Submit your request and supporting documents for issuer review.',
      action: 'Complete all required fields and upload documents.',
      how: 'Submit your investment application with the requested documents.',
      complete: 'Your application reaches the issuer review queue.',
      next: 'The issuer verifies claims and registers your identity on-chain.',
    },
    {
      what: 'The issuer reviews your application, completes the required approvals, and finishes the registration step for you.',
      action: 'Wait for the issuer. Update your documents only if the issuer asks for changes.',
      how: 'The issuer confirms the required checks and completes one wallet transaction to finish this step.',
      complete: 'This step is complete once the issuer finishes the approvals and the registration is confirmed.',
      next: 'You can then submit your required claim from your own wallet.',
    },
    {
      what: 'Submit the signed claims to your ONCHAINID using your investor wallet.',
      action: 'Submit each required claim using your investor wallet.',
      how: 'Open Submit Claim, approve each required wallet transaction, and wait for blockchain confirmation.',
      complete: 'Every required claim is confirmed and your application moves to Completed.',
      next: 'Invest Now becomes available subject to the asset’s eligibility rules.',
    },
    {
      what: 'All application prerequisites are complete.',
      action: 'Choose Invest Now when you are ready.',
      how: 'Your investment still needs to pass the existing contract eligibility and payment checks.',
      complete: 'The application is Completed.',
      next: 'You can proceed with investing.',
    },
  ],
  issuer: [
    {
      what: 'The investor submits an application and supporting documents.',
      action: 'Wait for the submitted application.',
      how: 'The investor completes the required information and documents.',
      complete: 'The request appears in your review queue.',
      next: 'Review, sign and register the investor.',
    },
    {
      what: 'Review the investor, approve the required checks, and register the identity in one step.',
      action: 'Review the documents, confirm the required approvals, and complete the registration transaction from your issuer wallet.',
      how: 'Select Approve & Continue. Confirm the claim approvals first, then complete the MetaMask registration transaction. The issuer pays the gas fee for registration.',
      complete: 'This step is complete after the approvals and the registration transaction are successfully confirmed.',
      next: 'The investor can then submit their claim without any further issuer action.',
    },
    {
      what: 'The investor submits their signed claims to their ONCHAINID.',
      action: 'No issuer approval is required.',
      how: 'The investor sends and confirms each required claim from their own wallet.',
      complete: 'The final claim is verified and the application completes automatically.',
      next: 'The investor can proceed to investing.',
    },
    {
      what: 'The application is completed and the investor can continue independently.',
      action: 'No further issuer action is required.',
      how: 'All required confirmations have been verified.',
      complete: 'The application status is Completed.',
      next: 'The investor can invest subject to contract eligibility.',
    },
  ],
};

const ownerWaitingText = (owner) => {
  if (owner === 'Investor') return 'The investor is responsible for the current action.';
  if (owner === 'Issuer') return 'The issuer is responsible for the current action.';
  if (owner === 'Platform') return 'The platform is processing this step.';
  return 'No action is needed from you right now.';
};

const getUserAction = ({ guidance, stage, journey }) => {
  if (stage.state === 'complete' && stage.id === 'investment-stage-4') return guidance.action;
  if (stage.state === 'complete') return 'Nothing — this step is already complete.';
  if (stage.state === 'blocked') return 'Nothing — this step was not reached because this application is no longer moving forward.';

  if (stage.state === 'upcoming') {
    return `No action yet. Finish the current step first. When this step starts: ${guidance.action}`;
  }

  const roleOwner = journey.viewerRole === 'issuer' ? 'Issuer' : 'Investor';
  if (journey.owner === 'You' || journey.owner === roleOwner) return guidance.action;
  if (journey.owner === 'No action needed' || journey.owner === 'No action required') {
    return 'Nothing is needed from you for this step.';
  }

  return `Nothing needed from you right now. ${ownerWaitingText(journey.owner)}`;
};

export function InvestmentJourneyTracker({ journey, action = null, secondaryAction = null }) {
  const [openGuidanceIndex, setOpenGuidanceIndex] = useState(null);
  const guidanceId = useId();

  if (!journey) return null;
  const CurrentIcon = toneIcon(journey.tone);
  const role = journey.viewerRole === 'issuer' ? 'issuer' : 'investor';
  const openStage = openGuidanceIndex === null ? null : journey.stages[openGuidanceIndex];
  const openGuidance = openStage ? STEP_GUIDANCE[role][openGuidanceIndex] : null;
  const openPanelId = `${guidanceId}-step-guidance`;
  const hasActions = Boolean(action || secondaryAction);
  const statusMeta = (
    <div className="investment-journey__current-meta">
      <span className={`investment-journey__status is-${journey.tone}`}>{journey.statusLabel}</span>
      <span className="investment-journey__owner">Who acts next: <strong>{journey.owner}</strong></span>
    </div>
  );

  return (
    <Card className={`investment-journey investment-journey--${journey.tone}`}>
      <div className="investment-journey__heading">
        <div>
          <span className="eyebrow">Investment journey</span>
          <h2>{role === 'issuer' ? 'Request progress' : 'Your progress'}</h2>
          <p>{role === 'issuer'
            ? 'See what is complete, who needs to act now, and what happens next. Select any info icon for step-by-step help.'
            : 'See what is complete, what is happening now, and what comes next. Select any info icon for step-by-step help.'}</p>
        </div>
        <span className="investment-journey__step-count">
          {journey.complete ? 'All 4 steps complete' : `Step ${journey.currentIndex + 1} of 4`}
        </span>
      </div>

      <div className={`investment-journey__current is-${journey.tone}`} role="status">
        <span className="investment-journey__current-icon"><CurrentIcon size={20} /></span>
        <div className="investment-journey__current-copy">
          <div className="investment-journey__current-headline">
            <h3>{journey.title}</h3>
            {!hasActions ? statusMeta : null}
          </div>
          <p>{journey.message}</p>
          {journey.next ? (
            <div className="investment-journey__next">
              <ArrowRight size={15} aria-hidden="true" />
              <span><strong>Next:</strong> {journey.next}</span>
            </div>
          ) : null}
        </div>
        {hasActions ? (
          <div className="investment-journey__actions-panel">
            {statusMeta}
            <div className="investment-journey__actions">
              {action}
              {secondaryAction}
            </div>
          </div>
        ) : null}
      </div>

      <div className="investment-journey__progress" aria-hidden="true">
        <span style={{ width: `${journey.progress}%` }} />
      </div>

      <ol className="investment-journey__steps" aria-label="Investment application progress">
        {journey.stages.map((stage, index) => {
          const completed = stage.state === 'complete';
          const active = stage.state === 'current' || stage.state === 'attention';
          const Icon = completed ? Check : active ? Clock3 : Circle;
          const isGuidanceOpen = openGuidanceIndex === index;
          return (
            <li
              key={stage.id}
              className={`investment-journey__step is-${stage.state}`}
              aria-current={active ? 'step' : undefined}
            >
              <span className="investment-journey__step-marker"><Icon size={15} /></span>
              <div>
                <small>Step {index + 1}</small>
                <div className="investment-journey__step-title">
                  <strong>{stage.label}</strong>
                  <button
                    type="button"
                    className={`investment-journey__step-info${isGuidanceOpen ? ' is-open' : ''}`}
                    aria-label={`About step ${index + 1}: ${stage.label}`}
                    aria-expanded={isGuidanceOpen}
                    aria-controls={openPanelId}
                    title={`About ${stage.label}`}
                    onClick={() => setOpenGuidanceIndex(isGuidanceOpen ? null : index)}
                  >
                    <Info size={14} aria-hidden="true" />
                  </button>
                </div>
                <span>{stage.statusLabel}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {openStage && openGuidance ? (
        <section
          id={openPanelId}
          className="investment-journey__guidance"
          aria-label={`Guidance for ${openStage.label}`}
        >
          <div className="investment-journey__guidance-heading">
            <div>
              <span>Step {openGuidanceIndex + 1} help · {role === 'issuer' ? 'Issuer view' : 'Investor view'}</span>
              <h3>{openStage.label}</h3>
            </div>
            <button
              type="button"
              className="investment-journey__guidance-close"
              aria-label="Close step guidance"
              onClick={() => setOpenGuidanceIndex(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="investment-journey__guidance-grid">
            <div>
              <strong>What this step is</strong>
              <p>{openGuidance.what}</p>
            </div>
            <div className="investment-journey__guidance-action">
              <strong>What you need to do</strong>
              <p>{getUserAction({ guidance: openGuidance, stage: openStage, journey })}</p>
            </div>
            <div>
              <strong>How to complete it</strong>
              <p>{openGuidance.how}</p>
            </div>
            <div>
              <strong>How you’ll know it is complete</strong>
              <p>{openGuidance.complete}</p>
            </div>
            <div className="investment-journey__guidance-next">
              <strong>What happens next</strong>
              <p>{openGuidance.next}</p>
            </div>
          </div>
        </section>
      ) : null}
    </Card>
  );
}
