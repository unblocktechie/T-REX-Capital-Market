import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  LockKeyhole,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const modules = {
  projects: {
    eyebrow: 'Issuer workspace',
    title: 'Token projects',
    description: 'Create, review and manage compliant security tokens.',
    action: 'New project',
    cards: [
      ['Active projects', '3', 'Projects currently in preparation or live'],
      ['Ready to create', '1', 'All required setup and verification steps complete'],
      ['Draft projects', '2', 'Continue setup when your documentation is ready'],
    ],
  },
  createToken: {
    eyebrow: 'Guided token setup',
    title: 'Create an ERC-3643 token',
    description: 'Complete each stage to configure, review and create your compliant token.',
    action: 'Start setup',
    cards: [
      ['1. Issuer', 'Organization', 'Company profile, authority and jurisdiction'],
      ['2. Asset', 'Offering', 'Asset details, valuation and legal documents'],
      ['3. Compliance', 'Rules', 'Eligibility, country and transfer restrictions'],
    ],
  },
  identity: {
    eyebrow: 'On-chain identity',
    title: 'Approved investors',
    description: 'Manage verified investors and the credentials that allow them to hold your token.',
    action: 'Add identity',
    cards: [
      ['Registered identities', '248', 'Wallets linked to verified on-chain identities'],
      ['Verification providers', '4', 'Approved providers for KYC and investor eligibility'],
      ['Verification expiring', '7', 'Credentials requiring renewal in the next 30 days'],
    ],
  },
  compliance: {
    eyebrow: 'Transfer controls',
    title: 'Transfer rules',
    description: 'Configure modular rules that determine who can hold and transfer tokens.',
    action: 'Add rule',
    cards: [
      ['Active rules', '8', 'Rules enforced by the compliance contract'],
      ['Countries allowed', '32', 'Eligible investor jurisdictions'],
      ['Transfer blocks', '12', 'Non-compliant transfers prevented this month'],
    ],
  },
  investors: {
    eyebrow: 'Investor onboarding',
    title: 'Investors',
    description: 'Track onboarding, KYC status, accreditation and token eligibility.',
    action: 'Invite investor',
    cards: [
      ['Verified investors', '248', 'KYC and eligibility checks completed'],
      ['Pending review', '18', 'Applications awaiting compliance review'],
      ['Accredited', '96', 'Investors with current accreditation verification'],
    ],
  },
  transactions: {
    eyebrow: 'Token operations',
    title: 'Transactions',
    description: 'Review token issuance, removals, transfers, freezes and wallet recovery operations.',
    action: 'Export activity',
    cards: [
      ['Total transactions', '1,842', 'All compliant token operations'],
      ['Pending', '6', 'Transactions awaiting signature or confirmation'],
      ['Blocked', '12', 'Transfers stopped by your configured transfer rules'],
    ],
  },
  corporateActions: {
    eyebrow: 'Lifecycle management',
    title: 'Corporate actions',
    description: 'Manage distributions, redemptions, voting and issuer-led token events.',
    action: 'New action',
    cards: [
      ['Scheduled actions', '2', 'Upcoming issuer events'],
      ['Completed', '14', 'Actions executed with an audit trail'],
      ['Eligible holders', '211', 'Current holders included in the next record date'],
    ],
  },
  documents: {
    eyebrow: 'Document vault',
    title: 'Documents',
    description: 'Keep offering, legal, compliance and investor records organized.',
    action: 'Upload document',
    cards: [
      ['Offering documents', '18', 'Memoranda, agreements and disclosures'],
      ['Compliance records', '42', 'Policies, approvals and evidence'],
      ['Investor files', '248', 'Secure investor-specific documentation'],
    ],
  },
  reports: {
    eyebrow: 'Audit and insights',
    title: 'Reports',
    description: 'Generate issuer, investor, transaction and compliance reports.',
    action: 'Create report',
    cards: [
      ['Compliance reports', '12', 'Audit-ready eligibility and transfer records'],
      ['Cap table reports', '8', 'Ownership and token balance snapshots'],
      ['Exports this month', '23', 'CSV and PDF reports generated'],
    ],
  },
};

export default function ModulePage({ moduleKey }) {
  const navigate = useNavigate();
  const module = modules[moduleKey] || modules.projects;
  useDocumentTitle(module.title);

  return (
    <div className="page-stack module-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{module.eyebrow}</span>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <Button icon={Plus}>{module.action}</Button>
      </header>

      <section className="module-stat-grid">
        {module.cards.map(([title, value, text]) => (
          <Card className="module-stat-card" key={title}>
            <span className="module-stat-card__icon">
              <FileCheck2 size={20} />
            </span>
            <div>
              <small>{title}</small>
              <strong>{value}</strong>
              <p>{text}</p>
            </div>
          </Card>
        ))}
      </section>

      <Card className="module-empty-card">
        <div className="module-empty-card__visual">
          <ShieldCheck size={32} />
        </div>
        <div>
          <span className="eyebrow">Built for T-REX</span>
          <h2>Compliance-first workflows</h2>
          <p>
            This module is ready for service integration. Add future screens and menu items
            through the centralized navigation configuration without changing the layout.
          </p>
          <div className="module-feature-row">
            <span>
              <CheckCircle2 size={16} /> Permission-aware
            </span>
            <span>
              <LockKeyhole size={16} /> Audit-ready
            </span>
            <span>
              <CircleDashed size={16} /> Responsive
            </span>
          </div>
        </div>
        {moduleKey !== 'createToken' ? (
          <Button
            variant="secondary"
            icon={ArrowRight}
            onClick={() => navigate(ROUTES.createToken)}
          >
            Open token wizard
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
