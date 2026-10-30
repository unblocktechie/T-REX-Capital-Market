import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderKanban,
  Globe2,
  Hash,
  ShieldCheck,
  MapPin,
  Network,
  Wallet,
  Link2,
  Factory,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { organizationDocumentService } from '@/services/organizationDocumentService';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';
import { shortenWalletAddress } from '@/utils/wallet';

const formatDate = (value, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, options);
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const initialsFor = (name) =>
  name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'UB';

// Presentation only: all values come from the existing organization response.
function CompanyDetail({ icon: Icon, label, value, className = '', children }) {
  return (
    <div className={`org-company-field ${className}`}>
      <span className="org-company-field__icon" aria-hidden="true"><Icon size={19} /></span>
      <div className="org-company-field__content">
        <dt>{label}</dt>
        <dd>{children ?? (value || '—')}</dd>
      </div>
    </div>
  );
}

const safeWebsite = (value) => {
  if (!value?.trim()) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

export default function OrganizationOverviewPage() {
  useDocumentTitle('Verified Organization');
  const { organization } = useOrganization();
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [ownersExpanded, setOwnersExpanded] = useState(false);
  const [documentsExpanded, setDocumentsExpanded] = useState(false);

  if (organization.status === ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING && !organization.verifiedScreenViewed) {
    return <Navigate to={ROUTES.organizationVerified} replace />;
  }
  if (organization.status !== ORGANIZATION_STATUSES.VERIFIED) {
    return <Navigate to={ROUTES.organization} replace />;
  }

  const previewDocument = async (document, download = false) => {
    try {
      await organizationDocumentService.open(document, download);
    } catch {
      toast.error('Document unavailable', { description: 'This document could not be opened. Please try again.' });
    }
  };

  const company = organization.company;
  const jurisdiction = organization.jurisdiction;
  const owners = Array.isArray(organization.beneficialOwners) ? organization.beneficialOwners : [];
  const documents = Array.isArray(organization.documents) ? organization.documents : [];
  const ownersPreview = ownersExpanded ? owners : owners.slice(0, 4);
  const documentsPreview = documentsExpanded ? documents : documents.slice(0, 5);
  const totalOwnership = owners.reduce((sum, owner) => sum + (Number(owner.ownershipPercentage) || 0), 0);
  const verifiedDate = organization.verifiedAt
    ? formatDate(organization.verifiedAt, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Verified';
  const incorporationDate = formatDate(jurisdiction.dateOfIncorporation);
  const businessActivity = jurisdiction.businessActivity?.trim() || '';
  const websiteUrl = safeWebsite(jurisdiction.website);
  const registeredAddress = [
    company.address.street,
    company.address.cityName || company.address.city,
    company.address.stateName || company.address.state,
    company.postalCode,
    company.address.countryName || company.address.country,
  ].filter(Boolean).join(', ');
  const organizationWallet = organization.walletAddress || '';
  const selectedChainIdentity = organization.selectedChainIdentity || {};
  const identityAddress = selectedChainIdentity.identityAddress || '';
  const identityChain =
    web3Config.getChainById(selectedChainIdentity.chainId) ||
    web3Config.getChainById(
      web3Config.getChainRecordByUid(selectedChainIdentity.chainUid)?.chainId,
    ) ||
    null;
  const walletChain = organizationWallet
    ? web3Config.supportedChains.find(
        (chain) => chain.id === Number(organization.walletChainId || organization.chainId),
      ) ||
      web3Config.supportedChains.find(
        (chain) => chain.name.toLowerCase() === organization.walletNetwork?.toLowerCase(),
      ) ||
      web3Config.getChainById(
        web3Config.getChainRecordByUid(organization.walletChainUid || organization.chainUid)?.chainId,
      ) ||
      null
    : null;
  const selectedChain = identityChain || walletChain;
  const walletNetworkName =
    selectedChainIdentity.chainName ||
    selectedChainIdentity.networkName ||
    selectedChain?.name ||
    organization.walletNetwork ||
    'Configured network';
  const walletExplorerUrl =
    organizationWallet && selectedChain?.blockExplorers?.default?.url
      ? `${selectedChain.blockExplorers.default.url}/address/${organizationWallet}`
      : '';
  const identityTransactionHash = selectedChainIdentity.identityTransactionHash || '';
  const identityTransactionUrl = identityTransactionHash && selectedChain?.blockExplorers?.default?.url
    ? `${selectedChain.blockExplorers.default.url}/tx/${identityTransactionHash}`
    : '';
  const identityExplorerUrl =
    identityAddress && selectedChain?.blockExplorers?.default?.url
      ? `${selectedChain.blockExplorers.default.url}/address/${identityAddress}`
      : '';

  const copyWalletAddress = async () => {
    if (!organizationWallet) return;
    try {
      await navigator.clipboard.writeText(organizationWallet);
      toast.success('Organization wallet copied');
    } catch {
      toast.error('Unable to copy organization wallet');
    }
  };

  const copyIdentityAddress = async () => {
    if (!identityAddress) return;
    try {
      await navigator.clipboard.writeText(identityAddress);
      toast.success('Organization identity address copied');
    } catch {
      toast.error('Unable to copy organization identity address');
    }
  };

  return (
    <div className="org-overview-page org-overview-page--enhanced org-overview-page--reference">
      <section className="org-overview-showcase" aria-label="Organization summary panels">
        <Card className="org-readonly-card org-overview-company-card">
          <header>
            <div>
              <h2>Company Details</h2>
              <p>Your verified company information used for your issuer account.</p>
            </div>
            <div className="org-company-statuses">
              <span className="org-readonly-verified"><BadgeCheck size={15} /> Verified</span>
              <span className="org-company-access"><ShieldCheck size={15} /> Issuer access ready</span>
            </div>
          </header>
          <dl className="org-company-grid">
            <CompanyDetail icon={Building2} label="Company name" value={company.legalName} />
            <CompanyDetail icon={Building2} label="Entity type" value={company.entityTypeName || company.entityType} />
            <CompanyDetail icon={Hash} label="Registration number" value={company.registrationNumber || 'Not provided'} />
            <CompanyDetail icon={Factory} label="Industry" value={jurisdiction.industryName || jurisdiction.industry} />
            <div className="org-company-field-group">
              <CompanyDetail icon={MapPin} label="Company country" value={company.address.countryName || company.address.country} />
              <CompanyDetail icon={Globe2} label="Country of incorporation" value={jurisdiction.countryOfIncorporationName || jurisdiction.countryOfIncorporation} />
              <CompanyDetail icon={CalendarDays} label="Date of incorporation" value={incorporationDate} />
            </div>
            <CompanyDetail className="org-company-field--full" icon={MapPin} label="Registered address" value={registeredAddress || 'Not provided'} />
            <CompanyDetail icon={FileText} label="Tax identification number" value={jurisdiction.taxIdentificationNumber || 'Not provided'} />
            <CompanyDetail icon={Link2} label="Website">
              {websiteUrl ? (
                <a className="org-company-website" href={websiteUrl} target="_blank" rel="noopener noreferrer">
                  {jurisdiction.website} <ExternalLink size={15} aria-hidden="true" />
                </a>
              ) : jurisdiction.website || 'Not provided'}
            </CompanyDetail>
            <CompanyDetail className="org-company-field--full org-company-field--activity" icon={FileText} label="Business activity">
              {businessActivity ? (
                <>
                  <p className={!activityExpanded && businessActivity.length > 150 ? 'org-company-activity--clamped' : ''}>{businessActivity}</p>
                  {businessActivity.length > 150 ? (
                    <button type="button" className="org-company-more" onClick={() => setActivityExpanded((value) => !value)} aria-expanded={activityExpanded}>
                      {activityExpanded ? 'Show less' : 'Show more'} <ChevronDown size={15} className={activityExpanded ? 'is-expanded' : ''} />
                    </button>
                  ) : null}
                </>
              ) : 'Not provided'}
            </CompanyDetail>
          </dl>
        </Card>

        <Card className="org-wallet-card">
          <header className="org-wallet-card__header">
            <div>
              <h2>Approved Organization Wallet</h2>
            </div>
            <span
              className={`org-wallet-card__status ${
                organizationWallet ? 'org-wallet-card__status--active' : 'org-wallet-card__status--inactive'
              }`}
            >
              <ShieldCheck size={14} /> {organizationWallet ? 'Active' : 'Unavailable'}
            </span>
          </header>

          <div className="org-wallet-card__body">
            <section className="org-wallet-card__address" aria-label="Primary issuer wallet">
              <span className="org-wallet-card__icon" aria-hidden="true">
                <Wallet size={20} />
              </span>
              <div className="org-wallet-card__address-copy">
                <small>Approved wallet</small>
                <strong title={organizationWallet || undefined}>
                  {organizationWallet
                    ? shortenWalletAddress(organizationWallet, 9, 9)
                    : 'Wallet address unavailable'}
                </strong>
                <p>
                  This is the wallet your organization approved. It is used to create and manage assets,
                  approve investors, and confirm important issuer actions.
                </p>
              </div>
              {organizationWallet ? (
                <button
                  type="button"
                  className="org-wallet-card__copy-button"
                  onClick={copyWalletAddress}
                  aria-label="Copy organization wallet address"
                  title="Copy organization wallet address"
                >
                  <Copy size={16} />
                </button>
              ) : null}
            </section>

            <div className="org-wallet-card__meta">
              <article>
                <span><Network size={17} /></span>
                <div>
                  <small>Blockchain network</small>
                  <strong>{walletNetworkName}</strong>
                </div>
              </article>
              <article>
                <span><ShieldCheck size={17} /></span>
                <div>
                  <small>Verified on</small>
                  <strong>{verifiedDate}</strong>
                </div>
              </article>
            </div>

            <details className="org-wallet-card__technical">
              <summary>View technical details</summary>
              <article className="org-wallet-card__contract">
                <div className="org-wallet-card__contract-copy">
                  <span className="org-wallet-card__contract-label">
                    <Fingerprint size={15} /> Organization identity address
                  </span>
                  <strong title={identityAddress || undefined}>
                    {identityAddress || 'Not created on this network yet'}
                  </strong>
                  <p>This ONCHAINID belongs to your verified organization on the selected network.</p>
                </div>
                {identityAddress ? (
                  <button
                    type="button"
                    className="org-wallet-card__copy-button org-wallet-card__copy-button--contract"
                    onClick={copyIdentityAddress}
                    aria-label="Copy organization identity address"
                    title="Copy organization identity address"
                  >
                    <Copy size={16} />
                  </button>
                ) : null}
              </article>
              {identityTransactionHash ? (
                <article className="org-wallet-card__contract org-wallet-card__transaction">
                  <div className="org-wallet-card__contract-copy">
                    <span className="org-wallet-card__contract-label">Organization identity transaction</span>
                    <strong title={identityTransactionHash}>{identityTransactionHash}</strong>
                    {identityTransactionUrl ? <a href={identityTransactionUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View transaction</a> : null}
                  </div>
                  <button type="button" className="org-wallet-card__copy-button org-wallet-card__copy-button--contract" aria-label="Copy organization identity transaction" title="Copy transaction hash" onClick={async () => {
                    try { await navigator.clipboard.writeText(identityTransactionHash); toast.success('Transaction hash copied'); }
                    catch { toast.error('Unable to copy transaction hash'); }
                  }}><Copy size={16}/></button>
                </article>
              ) : null}
              {walletExplorerUrl || identityExplorerUrl ? (
                <div className="org-wallet-card__actions org-wallet-card__technical-links">
                  {walletExplorerUrl ? <a href={walletExplorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View wallet on blockchain</a> : null}
                  {identityExplorerUrl ? <a className="org-wallet-card__action--contract" href={identityExplorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View organization identity</a> : null}
                </div>
              ) : null}
            </details>
          </div>

        </Card>
      </section>

      <section className="org-overview-lower-grid" aria-label="Organization supporting details">
        <Card className="org-readonly-card org-overview-ubo-card">
          <header>
            <div>
              <h2>Company Owners</h2>
              <p>People recorded as owners of this organization.</p>
            </div>
            <span className="org-readonly-verified"><CheckCircle2 size={15} /> {totalOwnership.toFixed(0)}% ownership provided</span>
          </header>

          <div className="org-overview-ubo-list">
            {ownersPreview.length ? ownersPreview.map((owner) => (
              <article key={owner.id || owner.fullName}>
                <span className="org-table-avatar">{initialsFor(owner.fullName)}</span>
                <div className="org-overview-ubo-list__copy">
                  <strong>{owner.fullName || 'Beneficial owner'}</strong>
                  <small>{owner.nationalityName || owner.nationality || 'Nationality not provided'}</small>
                </div>
                <div className="org-overview-ubo-list__meta">
                  <b>{Number(owner.ownershipPercentage || 0).toFixed(1)}%</b>
                  <small>{owner.isPrimary ? 'Primary owner' : 'Ownership'}</small>
                </div>
                <div className="org-overview-ubo-list__meta">
                  <b>{formatDate(owner.dateOfBirth)}</b>
                  <small>Date of birth</small>
                </div>
              </article>
            )) : (
              <div className="org-overview-empty-note">No company owners are available.</div>
            )}
          </div>
          {owners.length > 4 ? (
            <button type="button" className="org-overview-list-more" onClick={() => setOwnersExpanded((value) => !value)} aria-expanded={ownersExpanded}>
              {ownersExpanded ? 'Show fewer owners' : `Show all ${owners.length} owners`} <ChevronDown size={16} className={ownersExpanded ? 'is-expanded' : ''} />
            </button>
          ) : null}
        </Card>

        <Card className="org-readonly-card org-overview-doc-card" id="organization-documents">
          <header>
            <div>
              <h2>Verification Documents</h2>
              <p>Documents submitted to verify your organization.</p>
            </div>
            <span className="org-readonly-verified"><FolderKanban size={15} /> {documents.length} uploaded</span>
          </header>

          <div className="org-overview-doc-list">
            {documentsPreview.length ? documentsPreview.map((document) => (
              <article key={document.id} className="org-overview-doc-item">
                <span className="org-overview-doc-item__icon"><FileCheck2 size={18} /></span>
                <div className="org-overview-doc-item__copy">
                  <strong>{document.fileName}</strong>
                  <small>{formatBytes(document.fileSize)} · Submitted</small>
                </div>
                <span className="org-overview-doc-item__status">Verified</span>
                <div className="org-overview-doc-item__actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => previewDocument(document)}
                    aria-label={`Preview ${document.fileName}`}
                    title="Preview"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => previewDocument(document, true)}
                    aria-label={`Download ${document.fileName}`}
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </article>
            )) : (
              <div className="org-overview-empty-note">No documents uploaded.</div>
            )}
          </div>
          {documents.length > 5 ? (
            <button type="button" className="org-overview-list-more" onClick={() => setDocumentsExpanded((value) => !value)} aria-expanded={documentsExpanded}>
              {documentsExpanded ? 'Show fewer documents' : `Show all ${documents.length} documents`} <ChevronDown size={16} className={documentsExpanded ? 'is-expanded' : ''} />
            </button>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
