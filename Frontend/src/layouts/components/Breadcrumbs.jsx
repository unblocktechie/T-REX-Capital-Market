import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

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
  investors: 'Investors',
  transactions: 'Transactions',
  'corporate-actions': 'Corporate actions',
  documents: 'Documents',
  reports: 'Reports',
  team: 'Team & access',
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
  const parts = location.pathname.split('/').filter(Boolean);
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {parts.map((part, index) => {
        const path = `/${parts.slice(0, index + 1).join('/')}`;
        const current = index === parts.length - 1;
        return (
          <span key={path}>
            {index > 0 ? <ChevronRight size={13} aria-hidden="true" /> : null}
            {current ? (
              <span aria-current="page">{labels[part] || part}</span>
            ) : (
              <Link to={path}>{labels[part] || part}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
