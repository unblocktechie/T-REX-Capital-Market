import { ArrowRight, Check, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';

export default function InvestmentRequestSubmittedStep() {
  const navigate = useNavigate();

  return (
    <div className="investor-success-page investor-success-page--profile-created">
      <Card className="investor-success-hero investor-success-hero--profile-created">
        <span className="investor-success-hero__icon" aria-hidden="true">
          <Check size={34} />
        </span>
        <span className="eyebrow">Profile setup complete</span>
        <h1>Investor Profile Created</h1>
        <p className="investor-success-welcome">
          Welcome to T-REX Capital Market. Your investor profile and supporting documents have been
          saved successfully. You can now continue to your dashboard and access the investor
          portal.
        </p>
        <div className="investor-success-actions investor-success-actions--single">
          <Button icon={LayoutDashboard} onClick={() => navigate(ROUTES.dashboard)}>
            Go to Dashboard <ArrowRight size={17} />
          </Button>
        </div>
      </Card>
    </div>
  );
}
