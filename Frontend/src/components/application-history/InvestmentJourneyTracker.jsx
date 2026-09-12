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

const toneIcon = (tone) => {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'danger') return AlertTriangle;
  if (tone === 'warning') return UserRound;
  return Clock3;
};

const STEP_GUIDANCE = {
  investor: [
    {
      what: 'This is your request to invest in the asset. You provide the information the issuer needs to review your request.',
      action: 'Complete the required details and documents, then submit your application.',
      how: 'Open the application, complete every required field, upload any requested documents, and select Submit.',
      complete: 'This step will show Completed and your application will move to Issuer review.',
      next: 'The issuer reviews the information and documents you submitted.',
    },
    {
      what: 'The issuer checks your application and decides whether it can move forward.',
      action: 'Usually, you only need to wait. If the issuer asks for changes, update the requested information and submit it again.',
      how: 'The issuer reviews your details. If changes are requested, open the application, make the requested updates, and resubmit it.',
      complete: 'This step will show Completed after the issuer approves the review.',
      next: 'You will be asked to complete any required investor checks.',
    },
    {
      what: 'You complete the checks required before you can be approved to invest in this asset.',
      action: 'Complete the checks shown in your application when this step becomes active.',
      how: 'Open the checks step, follow the instructions, provide the requested information, and submit it.',
      complete: 'This step will show Completed after your required checks have been successfully submitted and accepted.',
      next: 'The issuer completes the final approval needed to enable your investment access.',
    },
    {
      what: 'The issuer completes the last approval needed to give you access to invest in this asset.',
      action: 'You normally do not need to do anything here. Wait while the issuer or platform completes the approval.',
      how: 'The issuer completes the final approval. You can refresh the application to see the latest status.',
      complete: 'This step will show Completed and your application will move to Ready to invest.',
      next: 'Your investment access is enabled and you can choose to invest.',
    },
    {
      what: 'All required application checks and approvals are finished. You are approved to invest in this asset.',
      action: 'No setup action is required. Choose Invest when you are ready to continue.',
      how: 'Open the asset, select Invest, and follow the investment instructions shown on screen.',
      complete: 'You will see Ready to invest and the journey will show all steps completed.',
      next: 'You can proceed with your investment whenever you are ready.',
    },
  ],
  issuer: [
    {
      what: 'The investor is preparing and submitting their request to invest in your asset.',
      action: 'Nothing is needed from you until the investor submits the application.',
      how: 'The investor completes the required details and documents, then submits the application to you.',
      complete: 'This step will show Completed and the request will move to your review.',
      next: 'You review the investor information and submitted documents.',
    },
    {
      what: 'You review the investor information and documents before allowing the request to move forward.',
      action: 'Check the application and documents, then approve it or ask the investor to make changes.',
      how: 'Review the submitted details and documents below. Choose Approve & Continue if everything is correct, or Request changes or decline if something needs attention.',
      complete: 'This step will show Completed after your approval is confirmed.',
      next: 'The investor completes the required investor checks.',
    },
    {
      what: 'The investor completes the identity or eligibility checks required for this asset.',
      action: 'You usually do not need to do anything here. Wait for the investor to finish the required checks.',
      how: 'The investor follows the check instructions and submits the required information.',
      complete: 'This step will show Completed and the request will return to you for final approval.',
      next: 'You complete the final approval that enables the investor to participate.',
    },
    {
      what: 'This is the final approval that enables the approved investor to participate in this asset.',
      action: 'Review the completed checks and complete final approval when the request asks you to do so.',
      how: 'Select Complete Final Approval and follow the confirmation steps. If it is processing, wait for confirmation before trying again.',
      complete: 'This step will show Completed and Investor access enabled will appear on the request.',
      next: 'The investor becomes ready to invest.',
    },
    {
      what: 'The investor has completed all required checks and now has access to invest in this asset.',
      action: 'No approval action is required. You can invite the investor to invest if you want to notify them.',
      how: 'Use Invite to Invest to notify the investor, or simply wait for them to continue on their own.',
      complete: 'You will see Investor access enabled and all journey steps will show Completed.',
      next: 'The investor can proceed with their investment.',
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
  if (stage.state === 'complete' && stage.id === 'investment-stage-5') return guidance.action;
  if (stage.state === 'complete') return 'Nothing — this step is already complete.';
  if (stage.state === 'blocked') return 'Nothing — this step was not reached because this application is no longer moving forward.';

  if (stage.state === 'upcoming') {
    return `No action yet. Finish the current step first. When this step starts: ${guidance.action}`;
  }

  if (journey.owner === 'You') return guidance.action;
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
          {journey.complete ? 'All 5 steps complete' : `Step ${journey.currentIndex + 1} of 5`}
        </span>
      </div>

      <div className={`investment-journey__current is-${journey.tone}`} role="status">
        <span className="investment-journey__current-icon"><CurrentIcon size={20} /></span>
        <div className="investment-journey__current-copy">
          <div className="investment-journey__current-meta">
            <span className={`investment-journey__status is-${journey.tone}`}>{journey.statusLabel}</span>
            <span className="investment-journey__owner">Who acts next: <strong>{journey.owner}</strong></span>
          </div>
          <h3>{journey.title}</h3>
          <p>{journey.message}</p>
          {journey.next ? (
            <div className="investment-journey__next">
              <ArrowRight size={15} aria-hidden="true" />
              <span><strong>Next:</strong> {journey.next}</span>
            </div>
          ) : null}
        </div>
        {action || secondaryAction ? (
          <div className="investment-journey__actions">
            {action}
            {secondaryAction}
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
