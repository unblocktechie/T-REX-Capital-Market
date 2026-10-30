import { AlertTriangle, Network, ShieldCheck, WalletCards } from 'lucide-react';
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
  walletBalance,
  networkName,
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(false);
  }, [open, walletAddress, networkName]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm organization wallet and submit"
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={loading} disabled={!acknowledged}>
            Confirm Wallet & Submit
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
            Once submitted, organization information and documents will be locked. The connected wallet will be saved as the organization’s primary issuer wallet.
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
                  Primary organization wallet
                </small>
                <strong className="mt-1 block truncate font-mono text-base sm:text-lg">
                  {shortenWalletAddress(walletAddress, 9, 9)}
                </strong>
              </div>
            </div>
            <ShieldCheck className="shrink-0 text-emerald-400" size={23} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/[0.07] p-4">
              <small className="block text-xs text-slate-400">Wallet balance</small>
              <strong className="mt-1 block text-sm font-semibold">{walletBalance}</strong>
            </div>
            <div className="rounded-2xl bg-white/[0.07] p-4">
              <small className="flex items-center gap-1.5 text-xs text-slate-400">
                <Network size={13} /> Network
              </small>
              <strong className="mt-1 block text-sm font-semibold">{networkName}</strong>
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)]">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--primary-500)]"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span className="text-sm leading-6 text-slate-700">
            I confirm that this wallet is controlled by the organization and understand that it will be used to create and manage tokens, approve investors, and authorize future issuer actions.
          </span>
        </label>
      </div>
    </Modal>
  );
}
