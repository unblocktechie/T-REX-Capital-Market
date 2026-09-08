import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  FolderKanban,
  Globe2,
  Rocket,
  ShieldCheck,
  UsersRound,
  Network,
  Wallet,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { OrganizationSummaryHeader } from '@/components/organization/OrganizationSummaryHeader';
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

export default function OrganizationOverviewPage() {
  useDocumentTitle('Verified Organization');
  const { organization } = useOrganization();

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
      toast.error('Document unavailable', { description: 'The backend document could not be opened.' });
    }
  };

  const company = organization.company;
  const jurisdiction = organization.jurisdiction;
  const owners = Array.isArray(organization.beneficialOwners) ? organization.beneficialOwners : [];
  const documents = Array.isArray(organization.documents) ? organization.documents : [];
  const ownersPreview = owners.slice(0, 4);
  const documentsPreview = documents.slice(0, 5);
  const totalOwnership = owners.reduce((sum, owner) => sum + (Number(owner.ownershipPercentage) || 0), 0);
  const primaryJurisdiction =
    jurisdiction.countryOfIncorporationName ||
    company.address.countryName ||
    jurisdiction.countryOfIncorporation ||
    company.address.country ||
    'Jurisdiction';
  const verifiedDate = organization.verifiedAt
    ? formatDate(organization.verifiedAt, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Verified';
  const incorporationDate = formatDate(jurisdiction.dateOfIncorporation);
  const organizationWallet = organization.walletAddress || '';
  const walletChain = organizationWallet
    ? web3Config.supportedChains.find(
        (chain) => chain.id === Number(organization.walletChainId),
      ) ||
      web3Config.supportedChains.find(
        (chain) => chain.name.toLowerCase() === organization.walletNetwork?.toLowerCase(),
      ) ||
      web3Config.requiredChain
    : null;
  const walletNetworkName =
    organization.walletNetwork || walletChain?.name || web3Config.requiredChain.name;
  const walletExplorerUrl =
    organizationWallet && walletChain?.blockExplorers?.default?.url
      ? `${walletChain.blockExplorers.default.url}/address/${organizationWallet}`
      : '';
  const contractAddress = organization.contractAddress || '';
  const contractExplorerUrl =
    contractAddress && walletChain?.blockExplorers?.default?.url
      ? `${walletChain.blockExplorers.default.url}/address/${contractAddress}`
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

  const copyContractAddress = async () => {
    if (!contractAddress) return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      toast.success('On-chain ID copied');
    } catch {
      toast.error('Unable to copy on-chain ID');
    }
  };

  return (
    <div className="org-overview-page org-overview-page--enhanced">
      <OrganizationSummaryHeader organization={organization} />


      <section className="org-overview-metrics org-overview-metrics--enhanced" aria-label="Organization verification summary">
        {[
          {
            icon: Globe2,
            label: 'Country',
            value: primaryJurisdiction,
            helper: 'Incorporation',
            tone: 'blue',
          },
          {
            icon: Building2,
            label: 'Entity Type',
            value: company.entityTypeName || company.entityType || 'Registered entity',
            helper: 'Company',
            tone: 'purple',
          },
          {
            icon: UsersRound,
            label: 'Ultimate Beneficial Owners',
            value: owners.length,
            helper: `${owners.length === 1 ? 'Total owner' : 'Total owners'}`,
            tone: 'green',
          },
          {
            icon: Rocket,
            label: 'Token Readiness',
            value: 'Ready',
            helper: 'Launch enabled',
            tone: 'orange',
          },
          {
            icon: FileCheck2,
            label: 'Documents',
            value: documents.length,
            helper: 'Uploaded',
            tone: 'sky',
          },
        ].map((metric) => (
          <Card className={`org-overview-metric org-overview-metric--${metric.tone}`} key={metric.label}>
            <span><metric.icon size={20} /></span>
            <small>{metric.label}</small>
            <strong>{metric.value || '—'}</strong>
            <p>{metric.helper}</p>
          </Card>
        ))}
      </section>

      <section className="org-overview-showcase" aria-label="Organization summary panels">
        <Card className="org-readonly-card org-overview-company-card">
          <header>
            <div>
              <h2>Company Details</h2>
              <p>Verified legal identity, registration profile, and regulatory footprint.</p>
            </div>
            <span className="org-readonly-verified"><BadgeCheck size={15} /> Verified</span>
          </header>
          <dl className="org-detail-grid org-detail-grid--comfortable">
            <div>
              <dt>Legal Company Name</dt>
              <dd>{company.legalName || '—'}</dd>
            </div>
            <div>
              <dt>Headquarters Address</dt>
              <dd>
                {company.address.street || '—'}
                {(company.address.cityName || company.address.city) ? `, ${company.address.cityName || company.address.city}` : ''}
                {(company.address.stateName || company.address.state) ? `, ${company.address.stateName || company.address.state}` : ''}
                {(company.address.countryName || company.address.country) ? `, ${company.address.countryName || company.address.country}` : ''}
              </dd>
            </div>
            <div>
              <dt>Entity Type</dt>
              <dd>{company.entityTypeName || company.entityType || '—'}</dd>
            </div>
            <div>
              <dt>Industry</dt>
              <dd>{jurisdiction.industryName || jurisdiction.industry || '—'}</dd>
            </div>
            <div>
              <dt>Registration Number</dt>
              <dd>{company.registrationNumber || '—'}</dd>
            </div>
            <div>
              <dt>Country of Incorporation</dt>
              <dd>{primaryJurisdiction}</dd>
            </div>
            <div>
              <dt>Date of Incorporation</dt>
              <dd>{incorporationDate}</dd>
            </div>
            <div>
              <dt>Tax ID Number</dt>
              <dd>{jurisdiction.taxIdentificationNumber || 'Not provided'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="org-wallet-card">
          <header className="org-wallet-card__header">
            <div>
              <span className="org-wallet-card__eyebrow">Wallet integration</span>
              <h2>Master Organization Wallet</h2>
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
                <small>Primary issuer wallet</small>
                <strong title={organizationWallet || undefined}>
                  {organizationWallet
                    ? shortenWalletAddress(organizationWallet, 9, 9)
                    : 'Wallet address unavailable'}
                </strong>
                <p>
                  This verified wallet is used for token creation, contract deployment, and
                  organization issuer actions.
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
                  <small>Network</small>
                  <strong>{walletNetworkName}</strong>
                </div>
              </article>
              <article>
                <span><ShieldCheck size={17} /></span>
                <div>
                  <small>Verification status</small>
                  <strong>{verifiedDate}</strong>
                </div>
              </article>
            </div>

            <article className="org-wallet-card__contract">
              <div className="org-wallet-card__contract-copy">
                <span className="org-wallet-card__contract-label">
                  <Fingerprint size={15} /> On-chain ID
                </span>
                <strong title={contractAddress || undefined}>
                  {contractAddress || 'Not assigned by the backend'}
                </strong>
                <p>Smart-contract address assigned to this organization after approval.</p>
              </div>
              {contractAddress ? (
                <button
                  type="button"
                  className="org-wallet-card__copy-button org-wallet-card__copy-button--contract"
                  onClick={copyContractAddress}
                  aria-label="Copy organization on-chain ID"
                  title="Copy on-chain ID"
                >
                  <Copy size={16} />
                </button>
              ) : null}
            </article>
          </div>

          <footer className="org-wallet-card__footer">
            <div className="org-wallet-card__jurisdiction">
              <small>Primary jurisdiction</small>
              <b>{primaryJurisdiction}</b>
            </div>
            {walletExplorerUrl || contractExplorerUrl ? (
              <div className="org-wallet-card__actions">
                {walletExplorerUrl ? (
                  <a href={walletExplorerUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} /> View wallet
                  </a>
                ) : null}
                {contractExplorerUrl ? (
                  <a
                    className="org-wallet-card__action--contract"
                    href={contractExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} /> View contract
                  </a>
                ) : null}
              </div>
            ) : null}
          </footer>
        </Card>
      </section>

      <section className="org-overview-lower-grid" aria-label="Organization supporting details">
        <Card className="org-readonly-card org-overview-ubo-card">
          <header>
            <div>
              <h2>Ultimate Beneficial Owners (UBOs)</h2>
              <p>Verified ownership distribution and primary control information.</p>
            </div>
            <span className="org-readonly-verified"><CheckCircle2 size={15} /> {totalOwnership.toFixed(0)}% disclosed</span>
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
              <div className="org-overview-empty-note">No beneficial owners available.</div>
            )}
          </div>
        </Card>

        <Card className="org-readonly-card org-overview-doc-card" id="organization-documents">
          <header>
            <div>
              <h2>Document Vault</h2>
              <p>Submitted legal files securely stored and available for review.</p>
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
        </Card>
      </section>
    </div>
  );
}
