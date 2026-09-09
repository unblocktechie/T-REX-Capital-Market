import { cn } from '@/utils/cn';

const NORMALIZED_META = Object.freeze({
  approved: { label: 'Approved', tone: 'success' },
  verified: { label: 'Verified', tone: 'success' },
  complete: { label: 'Verified', tone: 'success' },
  completed: { label: 'Verified', tone: 'success' },
  final_approval: { label: 'Final Approval', tone: 'teal' },
  finalapproval: { label: 'Final Approval', tone: 'teal' },
  pending: { label: 'Pending Review', tone: 'pending' },
  pending_review: { label: 'Pending Review', tone: 'pending' },
  pending_kyc: { label: 'Pending KYC', tone: 'pending' },
  under_review: { label: 'Pending Review', tone: 'pending' },
  submitted: { label: 'Submitted', tone: 'pending' },
  rejected: { label: 'Rejected', tone: 'danger' },
  failed: { label: 'Rejected', tone: 'danger' },
  action_required: { label: 'Action Required', tone: 'warning' },
  documents_required: { label: 'Documents Required', tone: 'warning' },
  not_applied: { label: 'Not Applied', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  verified_holder: { label: 'Verified Holder', tone: 'success' },
});

const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const humanize = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export function getAppStatusMeta(status, { label, tone } = {}) {
  const normalized = normalize(status);
  const known = NORMALIZED_META[normalized];
  return {
    label: label || known?.label || humanize(normalized) || 'Status',
    tone: tone || known?.tone || 'neutral',
  };
}

export function AppStatusBadge({ status, label, tone, compact = false, className }) {
  const meta = getAppStatusMeta(status, { label, tone });

  return (
    <span
      className={cn(
        'app-status-badge',
        `app-status-badge--${meta.tone}`,
        compact && 'app-status-badge--compact',
        className,
      )}
    >
      <span>{meta.label}</span>
    </span>
  );
}
