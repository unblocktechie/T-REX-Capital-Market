import { AlertTriangle, ShieldCheck, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { shortenWalletAddress } from '@/utils/wallet';

export function SubmissionConfirmationModal({
  open,
  onClose,
  onConfirm,
  loading,
  walletAddress,
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(false);
  }, [open, walletAddress]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm organization submission"
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={loading} disabled={!acknowledged || !walletAddress}>
            Confirm and submit
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="flex gap-3 rounded-2xl border border-[var(--primary-100)] bg-[var(--primary-50)] p-4 text-sm leading-6 text-[var(--primary-700)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-600)] text-white">
            <AlertTriangle size={20} />
          </span>
          <p className="m-0">
            Once submitted, your organization information and documents will be locked for review. Your Privy secure account will be linked to the organization profile for future issuer actions.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[var(--primary-100)]">
                <WalletCards size={23} />
              </span>
              <div className="min-w-0">
                <small className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Privy secure account
                </small>
                <strong className="mt-1 block text-base sm:text-lg">Securely managed by Privy</strong>
              </div>
            </div>
            <ShieldCheck className="shrink-0 text-emerald-400" size={23} />
          </div>
          <p className="mt-5 mb-0 rounded-2xl bg-white/[0.07] p-4 text-sm leading-6 text-slate-300">
            Your Privy account is linked to your T-REX profile. You do not need to connect another account or enter an address here.
          </p>
          <details className="mt-3 rounded-2xl bg-white/[0.05] p-4 text-sm text-slate-300">
            <summary className="cursor-pointer font-semibold text-white">View Privy wallet details</summary>
            <p className="mb-0 mt-3 break-all font-mono text-xs" title={walletAddress}>
              {walletAddress ? shortenWalletAddress(walletAddress, 9, 9) : 'Wallet address unavailable'}
            </p>
          </details>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)]">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--primary-500)]"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span className="text-sm leading-6 text-slate-700">
            I confirm that this Privy secure account will be used to manage assets, approve investors, and confirm important issuer actions for this organization.
          </span>
        </label>
      </div>
    </Modal>
  );
}
