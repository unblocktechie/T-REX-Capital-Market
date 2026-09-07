import {
  ArrowRight,
  Check,
  Circle,
  CircleHelp,
  FilePenLine,
  LifeBuoy,
  Mail,
  ShieldX,
  X,
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { ORGANIZATION_STATUSES } from '@/services/organizationStorageService';

export default function VerificationRejectedPage() {
  useDocumentTitle('Verification Rejected');
  const navigate = useNavigate();
  const { organization, setCurrentStep } = useOrganization();

  if (organization.status === ORGANIZATION_STATUSES.SUBMITTED) {
    return <Navigate to={ROUTES.organizationPending} replace />;
  }
  if (organization.status === ORGANIZATION_STATUSES.VERIFIED_SUCCESS_PENDING) {
    return <Navigate to={organization.verifiedScreenViewed ? ROUTES.organizationOverview : ROUTES.organizationVerified} replace />;
  }
  if (organization.status === ORGANIZATION_STATUSES.VERIFIED) {
    return <Navigate to={ROUTES.organizationOverview} replace />;
  }
  if (organization.status !== ORGANIZATION_STATUSES.REJECTED) {
    return <Navigate to={ROUTES.organization} replace />;
  }

  const rejectionReason = organization.rejectionReason ||
    'The submitted organization application did not pass the compliance review. Review the requested corrections before resubmitting.';
  const canResubmit = Boolean(organization.canResubmit);

  const editAndResubmit = () => {
    if (!canResubmit) return;
    setCurrentStep(1);
    navigate(ROUTES.organizationCompany);
  };

  return (
    <section className="mx-auto grid min-h-[calc(100dvh-150px)] w-full max-w-[1180px] items-center py-6 sm:py-10">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
        <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-8 lg:border-0 lg:bg-transparent lg:p-2 lg:shadow-none">
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-rose-700 uppercase">
            <X className="size-3.5" strokeWidth={2.5} />
            Application rejected
          </span>

          <h1 className="mt-5 mb-0 max-w-[650px] text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl lg:text-5xl">
            Verification Rejected
          </h1>
          <p className="mt-4 mb-0 max-w-[680px] text-sm leading-7 text-slate-500 sm:text-base">
            Your organization application requires corrections before it can continue to ERC-3643 token issuance.
          </p>

          <div className="mt-7 max-w-[720px] rounded-2xl border border-rose-200 bg-rose-50/70 p-4 sm:p-5" role="alert">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-white text-rose-600 shadow-sm">
                <CircleHelp className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 className="m-0 text-sm font-semibold text-rose-800">Rejection reason</h2>
                <p className="mt-2 mb-0 break-words text-sm leading-6 text-slate-700">{rejectionReason}</p>
              </div>
            </div>
          </div>

          {!canResubmit ? (
            <div className="mt-6 inline-flex min-h-12 items-center rounded-2xl border border-slate-200 bg-slate-100 px-5 text-sm font-semibold text-slate-500" aria-disabled="true">
              Resubmission is not currently enabled
            </div>
          ) : null}

          <a
            href="mailto:compliance@erc3643.com"
            className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950"
          >
            <Mail className="size-4" />
            compliance@erc3643.com
          </a>
        </article>

        <aside className="grid min-w-0 gap-4">
          <article className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.09)] sm:p-6">
            <header className="mb-6">
              <h2 className="m-0 text-lg font-semibold text-slate-950">Verification timeline</h2>
              <p className="mt-1 mb-0 text-xs text-slate-500">Current compliance decision</p>
            </header>

            <ol className="space-y-0">
              <TimelineItem
                state="complete"
                title="Submission Received"
                description={organization.submittedAt ? new Date(organization.submittedAt).toLocaleString() : 'Application received'}
              />
              <TimelineItem
                state="rejected"
                title="Regulatory Audit"
                description={rejectionReason}
              />
              <TimelineItem
                state="pending"
                title="Token Issuance Ready"
                description="Available after the organization application is approved."
                last
              />
            </ol>

            {canResubmit ? (
              <button
                type="button"
                onClick={editAndResubmit}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/30"
              >
                <FilePenLine className="size-[18px]" />
                Edit &amp; Resubmit Application
              </button>
            ) : null}
          </article>

          <a
            href="mailto:compliance@erc3643.com"
            className="group flex min-h-[76px] items-center gap-3 rounded-[22px] bg-slate-950 px-5 text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <LifeBuoy className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm font-semibold">Need assistance?</strong>
              <small className="mt-1 block text-xs text-slate-300">Connect with the compliance team</small>
            </span>
            <ArrowRight className="size-5 transition group-hover:translate-x-1" />
          </a>
        </aside>
      </div>
    </section>
  );
}

function TimelineItem({ state, title, description, last = false }) {
  const complete = state === 'complete';
  const rejected = state === 'rejected';

  return (
    <li className="relative grid grid-cols-[38px_minmax(0,1fr)] gap-3 pb-7 last:pb-0">
      {!last ? <span className={`absolute top-9 bottom-0 left-[18px] w-px ${rejected ? 'border-l border-dashed border-slate-300' : 'bg-slate-200'}`} /> : null}
      <span className={`relative z-10 grid size-9 place-items-center rounded-full border-4 border-white shadow-sm ${complete ? 'bg-slate-500 text-white' : rejected ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
        {complete ? <Check className="size-4" strokeWidth={3} /> : rejected ? <ShieldX className="size-4" /> : <Circle className="size-3" />}
      </span>
      <div className="min-w-0 pt-1">
        <strong className={`block text-sm font-semibold ${state === 'pending' ? 'text-slate-400' : 'text-slate-950'}`}>{title}</strong>
        <p className={`mt-1 mb-0 break-words text-xs leading-5 ${state === 'pending' ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>
      </div>
    </li>
  );
}
