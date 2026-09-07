import { CheckCircle2, Clock3, FilePenLine, XCircle } from 'lucide-react';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

const statusContent = {
  [ORGANIZATION_STATUSES.DRAFT]: { label: 'Draft', icon: FilePenLine, tone: 'neutral' },
  [ORGANIZATION_STATUSES.SUBMITTED]: { label: 'In Review', icon: Clock3, tone: 'warning' },
  [ORGANIZATION_STATUSES.REJECTED]: { label: 'Rejected', icon: XCircle, tone: 'danger' },
  [ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING]: {
    label: 'Verified',
    icon: CheckCircle2,
    tone: 'success',
  },
  [ORGANIZATION_STATUSES.VERIFIED]: {
    label: 'Verified',
    icon: CheckCircle2,
    tone: 'success',
  },
};

export function OrganizationStatusBadge({ status, compact = false }) {
  const content = statusContent[status];
  if (!content) return null;
  const Icon = content.icon;

  return (
    <span className={`org-status-badge org-status-badge--${content.tone} ${compact ? 'is-compact' : ''}`}>
      <Icon size={compact ? 12 : 14} aria-hidden="true" />
      <span>{content.label}</span>
    </span>
  );
}
