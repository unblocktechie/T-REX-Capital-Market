import { Building2, CheckCircle2, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { OrganizationStatusBadge } from './OrganizationStatusBadge';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

const initialsFor = (name) =>
  name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'OR';

export function OrganizationSummaryHeader({ organization }) {
  const company = organization.company;
  return (
    <Card className="org-summary-header">
      <div className="org-summary-header__identity">
        <span className="org-summary-header__avatar">{initialsFor(company.legalName)}</span>
        <div>
          <span className="eyebrow">Organization verified</span>
          <h1>{company.legalName || 'Verified Organization'}</h1>
          <p>
            <Building2 size={15} /> {company.entityTypeName || company.entityType || 'Registered entity'}
            <span aria-hidden="true">•</span>
            <MapPin size={15} /> {company.address.countryName || organization.jurisdiction.countryOfIncorporationName || company.address.country || organization.jurisdiction.countryOfIncorporation || 'Jurisdiction'}
          </p>
        </div>
      </div>
      <div className="org-summary-header__status">
        <OrganizationStatusBadge status={ORGANIZATION_STATUSES.VERIFIED} />
        <small>
          <CheckCircle2 size={14} /> Registration no. {company.registrationNumber || 'confirmed'}
        </small>
      </div>
    </Card>
  );
}
