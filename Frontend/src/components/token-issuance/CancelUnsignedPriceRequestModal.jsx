import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** Confirm cancellation of a backend-only price intent, never an on-chain transaction. */
export function CancelUnsignedPriceRequestModal({ open, onClose, onConfirm, loading = false }) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(false);
  }, [open]);

  const close = () => {
    if (!loading) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Close pending price request?"
      trapFocus
      dismissible={!loading}
      className="sm:max-w-lg"
      footer={(
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Keep request
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={!acknowledged || loading}
            loading={loading}
          >
            Close pending request
          </Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800" aria-hidden="true">
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            <strong className="block text-sm font-semibold sm:text-base">
              Confirm the transaction was not sent
            </strong>
            <p className="mb-0 mt-1 text-sm leading-6">
              Before closing this request, check MetaMask activity and make sure you did not sign or send the price transaction.
            </p>
          </div>
        </div>

        <p className="m-0 text-sm leading-6 text-slate-600">
          This closes only the pending price request in T-REX Capital. It does not cancel or reverse any transaction on the blockchain.
        </p>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-amber-300">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--primary-500)]"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            disabled={loading}
          />
          <span className="min-w-0 text-sm font-medium leading-6 text-slate-700">
            I did not sign or broadcast this transaction.
          </span>
        </label>
      </div>
    </Modal>
  );
}
