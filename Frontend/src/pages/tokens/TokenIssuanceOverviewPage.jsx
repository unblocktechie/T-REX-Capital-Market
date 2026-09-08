import {
  ArrowRight,
  BadgeCheck,
  Fingerprint,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const roadmap = [
  {
    title: 'Basics',
    description: 'Define the token name, symbol, decimals, price, treasury wallet and description.',
    icon: BadgeCheck,
  },
  {
    title: 'Claims',
    description: 'Configure required identity claims and the trusted claim issuer.',
    icon: Fingerprint,
  },
  {
    title: 'Compliance',
    description: 'Configure investor limits, balance limits and geographic restrictions.',
    icon: ShieldCheck,
  },
  {
    title: 'Governance Agents',
    description: 'Assign the Token Agent and Identity Manager.',
    icon: LockKeyhole,
  },
  {
    title: 'Review',
    description: 'Validate all configurations before deployment.',
    icon: Rocket,
  },
];

const standardBenefits = [
  ['Automated KYC enforcement', Fingerprint],
  ['On-chain identity verification', ShieldCheck],
  ['Regulatory reporting readiness', BadgeCheck],
  ['Compliance checks before token transfers', LockKeyhole],
];

export default function TokenIssuanceOverviewPage() {
  const navigate = useNavigate();
  useDocumentTitle('Asset Issuance Wizard');

  return (
    <div className="issuance-overview-page">
      <header className="issuance-overview-hero">
        <div>
          <span className="eyebrow">ERC-3643 guided deployment</span>
          <h1>Asset Issuance Wizard</h1>
          <p>
            Configure and deploy an ERC-3643 compliant security token through a focused,
            institutional issuance workflow.
          </p>
        </div>
        <Button
          icon={Rocket}
          size="lg"
          onClick={() => navigate(ROUTES.tokenIssuanceStep('token-information'))}
        >
          Start Wizard
        </Button>
      </header>

      <div className="issuance-overview-grid">
        <section className="issuance-roadmap-card">
          <div className="issuance-card-heading">
            <span className="issuance-card-icon">
              <Rocket size={20} />
            </span>
            <div>
              <span className="eyebrow">Deployment Roadmap</span>
              <h2>Five focused stages from setup to deployment</h2>
              <p>
                Each step keeps the required information clear and preserves the current draft as
                you move through the wizard.
              </p>
            </div>
          </div>
          <div className="issuance-roadmap-list">
            {roadmap.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title}>
                  <span className="issuance-roadmap-list__number">{index + 1}</span>
                  <span className="issuance-roadmap-list__icon">
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <ArrowRight size={17} aria-hidden="true" />
                </article>
              );
            })}
          </div>
        </section>

        <aside className="issuance-overview-sidebar">
          <section className="issuance-standard-card">
            <div className="issuance-card-heading issuance-card-heading--compact">
              <span className="issuance-card-icon">
                <ShieldCheck size={20} />
              </span>
              <div>
                <span className="eyebrow">ERC-3643 Standard</span>
                <h2>Compliance built into every transfer</h2>
              </div>
            </div>
            <p>
              ERC-3643 combines token contracts, ONCHAINID identities, trusted claims and
              compliance checks in one regulated-token framework.
            </p>
            <div className="issuance-benefit-list">
              {standardBenefits.map(([label, Icon]) => (
                <span key={label}>
                  <Icon size={16} /> {label}
                </span>
              ))}
            </div>
          </section>

          <section className="issuance-help-card issuance-instant-card">
            <span className="issuance-card-icon">
              <Zap size={20} />
            </span>
            <div>
              <h3>Instant Settlement</h3>
              <p>
                Approved token transfers settle on-chain after identity and compliance checks
                pass.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
