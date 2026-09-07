import { useMemo, useState } from 'react';
import { Check, CheckCircle2, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { shortWallet } from '@/utils/adminFormat';

export function ApproveOrganizationModal({ open, onClose, organization, onConfirm, loading }) {
  const [confirmed, setConfirmed] = useState(false);
  const ready = confirmed && !loading;

  const resetAndClose = () => {
    setConfirmed(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title="Approve organization"
      className="sm:max-w-2xl"
      footer={
        <>
          <button type="button" onClick={resetAndClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!ready} onClick={() => onConfirm({})} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            <CheckCircle2 className="size-[18px]" />{loading ? 'Approving…' : 'Approve organization'}
          </button>
        </>
      }
    >
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><ShieldCheck className="size-5" /></span>
          <div>
            <strong className="block text-base text-emerald-950">Final compliance authorization</strong>
            <p className="mt-1 mb-0 text-sm leading-6 text-emerald-800">Approval changes the backend organization status to approved and allows the issuer to continue with the launchpad workflow.</p>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <div><dt className="text-xs font-bold text-slate-500">Organization</dt><dd className="mt-1 text-sm font-semibold text-slate-950">{organization?.name}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">Wallet address</dt><dd className="mt-1 break-all font-mono text-sm font-bold text-slate-950">{shortWallet(organization?.wallet?.address, 8, 7)}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">Current status</dt><dd className="mt-1 text-sm font-semibold text-slate-950">{organization?.status || 'submitted'}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">Backend decision</dt><dd className="mt-1 text-sm font-semibold text-emerald-700">Approved</dd></div>
      </dl>

      <DecisionCheckbox
        checked={confirmed}
        onChange={setConfirmed}
        tone="emerald"
        label="I confirm that the organization details, beneficial owners, uploaded documents, and organization wallet have been reviewed and this application can be approved."
      />
    </Modal>
  );
}

const rejectionReasons = [
  'Document verification failed',
  'Ownership information incomplete',
  'AML or sanctions concern',
  'Jurisdiction does not meet policy',
  'Wallet ownership could not be verified',
  'Other compliance concern',
];

export function RejectOrganizationModal({ open, onClose, organization, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const canSubmit = reason && comment.trim().length >= 10 && confirmed && !loading;

  const resetAndClose = () => {
    setReason('');
    setComment('');
    setConfirmed(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title="Reject organization"
      className="sm:max-w-2xl"
      footer={
        <>
          <button type="button" onClick={resetAndClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!canSubmit} onClick={() => onConfirm({ reason, comment })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
            <XCircle className="size-[18px]" />{loading ? 'Rejecting…' : 'Reject application'}
          </button>
        </>
      }
    >
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-600 text-white"><TriangleAlert className="size-5" /></span>
          <div><strong className="block text-base text-rose-950">This decision blocks organization approval</strong><p className="mt-1 mb-0 text-sm leading-6 text-rose-800">The selected reason and detailed comment are combined into the backend rejectionReason value.</p></div>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-bold text-slate-800">Reason
          <select value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10">
            <option value="">Select a rejection reason</option>
            {rejectionReasons.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold text-slate-800">Detailed comment
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} className="resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-950 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10" placeholder="Explain the issue and what must be corrected…" />
          <small className="text-xs font-medium text-slate-400">Minimum 10 characters. This becomes part of the rejection reason stored by the backend.</small>
        </label>

        <DecisionCheckbox
          checked={confirmed}
          onChange={setConfirmed}
          tone="rose"
          label={`I confirm that ${organization?.name || 'this organization'} must be rejected and understand that it cannot proceed until the compliance issue is resolved.`}
        />
      </div>
    </Modal>
  );
}

export function AssignReviewerModal({ open, onClose, organization, reviewers = [], onConfirm, loading }) {
  const initial = useMemo(() => organization?.reviewer?.id || '', [organization]);
  const [reviewerId, setReviewerId] = useState(initial);

  return (
    <Modal open={open} onClose={onClose} title="Assign reviewer" footer={<><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700">Cancel</button><button type="button" disabled={!reviewerId || loading} onClick={() => onConfirm(reviewerId)} className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Assigning…' : 'Assign reviewer'}</button></>}>
      <p className="text-sm leading-6 text-slate-500">Choose the compliance analyst responsible for <strong className="text-slate-900">{organization?.name}</strong>.</p>
      <div className="mt-4 space-y-2">
        {reviewers.map((reviewer) => (
          <label key={reviewer.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50/50">
            <input type="radio" name="reviewer" value={reviewer.id} checked={reviewerId === reviewer.id} onChange={() => setReviewerId(reviewer.id)} className="size-5 accent-blue-600" />
            <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">{reviewer.avatar}</span>
            <span className="min-w-0"><strong className="block truncate text-sm text-slate-950">{reviewer.name}</strong><small className="block truncate text-xs text-slate-500">{reviewer.role}</small></span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function DecisionCheckbox({ checked, onChange, label, tone }) {
  const checkedClasses = tone === 'rose'
    ? 'border-rose-600 bg-rose-600'
    : 'border-emerald-600 bg-emerald-600';
  const borderHover = tone === 'rose' ? 'hover:border-rose-300' : 'hover:border-emerald-300';
  const focusRing = tone === 'rose' ? 'peer-focus-visible:ring-rose-500/20' : 'peer-focus-visible:ring-emerald-500/20';

  return (
    <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition ${borderHover}`}>
      <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 size-7 cursor-pointer opacity-0 focus-visible:outline-none"
          aria-label="Confirm decision"
        />
        <span className={`grid size-7 place-items-center rounded-lg border-2 text-white transition peer-focus-visible:ring-4 ${focusRing} ${checked ? checkedClasses : 'border-slate-300 bg-white'}`} aria-hidden="true">
          {checked ? <Check className="size-[18px]" strokeWidth={3} /> : null}
        </span>
      </span>
      <span className="text-sm leading-6 text-slate-600">{label}</span>
    </label>
  );
}
