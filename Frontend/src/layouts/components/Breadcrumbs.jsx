import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getTokenRecordSymbol, useMyToken } from '@/hooks/useMyToken';

const labels = {
  app: 'Launchpad',
  dashboard: 'Overview',
  projects: 'Token projects',
  tokens: 'Tokens',
  new: 'Create token',
  'token-information': 'Token Information',
  'supply-pricing': 'Supply & Pricing',
  'identity-claims': 'Identity & Claims',
  agents: 'Agents',
  deploying: 'Deployment Processing',
  success: 'Deployment Successful',
  identity: 'Identity registry',
  compliance: 'Compliance rules',
  investors: 'Manage Request',
  transactions: 'Transactions',
  'corporate-actions': 'Corporate actions',
  documents: 'Documents',
  reports: 'Reports',
  team: 'Team & access',
  marketplace: 'Marketplace',
  applications: 'My Applications',
  'submit-claim': 'Submit Claim',
  profile: 'Profile',
  settings: 'Settings',
  organization: 'Organization',
  'company-information': 'Company Information',
  jurisdiction: 'Jurisdiction',
  ubo: 'UBO Details',
  review: 'Final Review',
  pending: 'Verification in Progress',
  verified: 'Organization Verified',
  overview: 'Verified Overview',
  'mock-admin': 'Mock Admin',
};

export function Breadcrumbs() {
  const location = useLocation();
  const tokenRecord = useMyToken();
  const tokenSymbol = getTokenRecordSymbol(tokenRecord.token);
  const parts = location.pathname.split('/').filter(Boolean);
  const getLabel = (part, index) => {
    const isTokenIdentifier = parts[index - 1] === 'tokens' && part !== 'new';
    if (isTokenIdentifier) return tokenSymbol || 'Token details';
    if (parts[index - 1] === 'marketplace') return 'Offering Details';
    if (parts[index - 1] === 'applications') return 'Application Details';
    if (parts[index - 1] === 'investors') return 'Subscription Details';
    return labels[part] || part;
  };
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {parts.map((part, index) => {
        const path = `/${parts.slice(0, index + 1).join('/')}`;
        const current = index === parts.length - 1;
        return (
          <span key={path}>
            {index > 0 ? <ChevronRight size={13} aria-hidden="true" /> : null}
            {current ? (
              <span aria-current="page">{getLabel(part, index)}</span>
            ) : (
              <Link to={path}>{getLabel(part, index)}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
