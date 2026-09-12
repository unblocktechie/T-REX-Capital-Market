import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { PrivyTrustBadge } from '@/components/branding/PrivyBrand';
import { Card } from '@/components/ui/Card';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { InvestorStepper } from './InvestorStepper';

export function InvestorLayout({ eyebrow = 'Investor onboarding', title, description, children, side, wide = false }) {
  const { state, setStep } = useInvestorOnboarding();
  return (
    <div className="investor-page">
      <InvestorStepper
        currentStep={state.currentStep}
        highestStepReached={state.highestStepReached}
        onStepChange={(step) => setStep(step, { markReached: false })}
      />
      <header className="investor-page__header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <div className={`investor-layout${wide ? ' investor-layout--wide' : ''}${side ? '' : ' investor-layout--single'}`}>
        <main className="investor-main">{children}</main>
        {side || null}
      </div>
    </div>
  );
}

export function InvestorSecurityCard({ title = 'Your information stays private', description = 'Uploaded documents are used only for this simulated verification flow and are not published publicly.' }) {
  return (
    <Card className="investor-side-card investor-side-card--security">
      <span className="investor-side-card__icon"><ShieldCheck size={22} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <ul>
        <li><CheckCircle2 size={16} /> Data handling messages are clearly disclosed</li>
        <li><CheckCircle2 size={16} /> Only file metadata is stored in the draft</li>
        <li><LockKeyhole size={16} /> Your Privy secure account must be ready</li>
      </ul>
      <PrivyTrustBadge
        compact
        tone="soft"
        label="Investor embedded wallet"
        className="mt-3"
      />
    </Card>
  );
}
