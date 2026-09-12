import { AlertTriangle, Copy, Network, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const titleFor = (issue) => {
  if (issue?.type === 'both') return 'Insufficient wallet balance';
  if (issue?.type === 'gas') return `Insufficient ${issue.nativeSymbol} for network fees`;
  return `Insufficient ${issue?.paymentSymbol || 'payment token'} balance`;
};

export function WalletFundingDialog({ issue, onClose }) {
  const open = Boolean(issue);
  const paymentSymbol = issue?.paymentSymbol || 'payment token';
  const nativeSymbol = issue?.nativeSymbol || 'native token';
  const networkName = issue?.networkName || 'the configured network';

  const copyAddress = async () => {
    if (!issue?.walletAddress) return;
    try {
      await navigator.clipboard.writeText(issue.walletAddress);
      toast.success('Wallet address copied');
    } catch {
      toast.error('Unable to copy the wallet address');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titleFor(issue)}
      className="sm:max-w-lg"
      trapFocus
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button
            type="button"
            icon={Copy}
            onClick={copyAddress}
            disabled={!issue?.walletAddress}
          >
            Copy wallet address
          </Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            {issue?.type === 'both' ? (
              <p className="m-0 text-sm leading-6">
                Your wallet doesn&apos;t have enough funds to complete this transaction.
              </p>
            ) : issue?.type === 'gas' ? (
              <p className="m-0 text-sm leading-6">
                Your wallet doesn&apos;t have enough {nativeSymbol} to cover the network fee for this transaction.
              </p>
            ) : (
              <p className="m-0 text-sm leading-6">
                You don&apos;t have enough {paymentSymbol} in your wallet to complete this transaction.
              </p>
            )}
          </div>
        </div>

        {issue?.type === 'both' ? (
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
              <strong className="text-slate-950">{paymentSymbol}</strong>
              <span className="text-slate-600">
                Required {issue?.requiredPayment ? `${issue.requiredPayment} ${paymentSymbol}` : 'for this transaction'}
                {issue?.availablePayment ? ` · Available ${issue.availablePayment} ${paymentSymbol}` : ''}
              </span>
            </div>
            <div className="border-t border-slate-100 pt-3 sm:grid sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-1">
              <strong className="text-slate-950">{nativeSymbol}</strong>
              <span className="text-slate-600">
                Required for network fees{issue?.nativeBalanceLabel ? ` · Available ${issue.nativeBalanceLabel}` : ''}
              </span>
            </div>
          </div>
        ) : issue?.type === 'payment' ? (
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
            <div>
              <small className="block font-semibold uppercase tracking-[0.08em] text-slate-500">Required</small>
              <strong className="mt-1 block text-slate-950">
                {issue?.requiredPayment ? `${issue.requiredPayment} ${paymentSymbol}` : `${paymentSymbol} for this transaction`}
              </strong>
            </div>
            <div>
              <small className="block font-semibold uppercase tracking-[0.08em] text-slate-500">Available</small>
              <strong className="mt-1 block text-slate-950">
                {issue?.availablePayment ? `${issue.availablePayment} ${paymentSymbol}` : 'Not enough'}
              </strong>
            </div>
          </div>
        ) : null}

        {issue?.type === 'both' ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <strong className="block text-slate-950">What to do</strong>
            <p className="mt-2 mb-0 leading-6">
              Add the required {paymentSymbol} and a small amount of {nativeSymbol} for network fees, then try again.
            </p>
          </div>
        ) : issue?.type === 'gas' ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <strong className="block text-slate-950">What to do</strong>
            <p className="mt-2 mb-0 leading-6">
              Add a small amount of {nativeSymbol} to your wallet to cover the network fee, then try again.
            </p>
            {issue?.nativeBalanceLabel ? (
              <p className="mt-2 mb-0 text-xs text-slate-500">Current balance: {issue.nativeBalanceLabel}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <strong className="block text-slate-950">What to do</strong>
            <p className="mt-2 mb-0 leading-6">
              Add enough {paymentSymbol} to cover the required amount, then try again.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <WalletCards size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <small className="block font-semibold uppercase tracking-[0.08em] text-slate-500">Wallet address</small>
              <strong className="mt-1 block break-all font-mono text-xs leading-5 text-slate-950">
                {issue?.walletAddress || 'Wallet address unavailable'}
              </strong>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <Network size={18} className="mt-0.5 shrink-0" />
          <p className="m-0 leading-6">
            Send {issue?.type === 'gas' ? nativeSymbol : issue?.type === 'both' ? `${paymentSymbol} and ${nativeSymbol}` : paymentSymbol} on <strong>{networkName}</strong>. Use the same network shown here so the funds arrive in the wallet T-REX is using.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default WalletFundingDialog;
