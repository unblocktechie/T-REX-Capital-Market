import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getTokenRecordChainUid, getTokenRecordSymbol, useMyToken } from '@/hooks/useMyToken';
import { ROUTES } from '@/config/routes';

const labels = {
  app: 'Capital Market',
  dashboard: 'Overview',
  projects: 'Token projects',
  tokens: 'Tokens',
  new: 'Create token',
  'token-information': 'Token Information',
  'supply-pricing': 'Supply & Pricing',
  'identity-claims': 'Investor Verification',
  agents: 'Platform Permissions',
  deploying: 'Creating Token',
  success: 'Token Created',
  identity: 'Approved Investors',
  compliance: 'Transfer Rules',
  investors: 'Investment Requests',
  'investor-directory': 'Investors',
  invitations: 'Invitations',
  transactions: 'Activity History',
  redemptions: 'Redemption Requests',
  'api-keys': 'Bot Configuration',
  'corporate-actions': 'Corporate actions',
  documents: 'Documents',
  reports: 'Reports',
  team: 'Team & access',
  marketplace: 'Marketplace',
  applications: 'My Applications',
  'asset-management': 'Manage Investments',
  'submit-claim': 'Complete Verification',
  profile: 'Investor Profile',
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
  // Bot settings can be opened from the token card or its price-update modal.
  // Use that existing token/chain context for a real return breadcrumb, rather
  // than linking to /app/tokens (which redirects into the token creation flow).
  const botParams = new URLSearchParams(location.search);
  const requestedTokenUid = (botParams.get('tokenUid') || '').trim();
  const requestedChainUid = (botParams.get('chainUid') || '').trim();
  const currentTokenUid = tokenRecord.tokenUid || '';
  const currentChainUid = getTokenRecordChainUid(tokenRecord.token) || tokenRecord.selectedChainUid || '';
  const canReturnToToken = location.pathname === ROUTES.issuerApiKeys &&
    Boolean(requestedTokenUid && currentTokenUid) &&
    requestedTokenUid.toLowerCase() === currentTokenUid.toLowerCase() &&
    (!requestedChainUid || requestedChainUid.toLowerCase() === currentChainUid.toLowerCase());
  if (canReturnToToken) {
    return (
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span><Link to="/app">Capital Market</Link></span>
        <span>
          <ChevronRight size={13} aria-hidden="true" />
          <Link to={ROUTES.tokenDetails(currentTokenUid)}>Token Management</Link>
        </span>
        <span>
          <ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page">Bot Configuration</span>
        </span>
      </nav>
    );
  }
  const getLabel = (part, index) => {
    const isTokenIdentifier = parts[index - 1] === 'tokens' && part !== 'new';
    if (isTokenIdentifier) return tokenSymbol || 'Token details';
    if (parts[index - 1] === 'marketplace') return 'Investment Details';
    if (parts[index - 1] === 'applications') return 'Application Details';
    if (parts[index - 1] === 'investors') return 'Investment Request Details';
    if (parts[index - 1] === 'redemptions') return 'Redemption Details';
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
