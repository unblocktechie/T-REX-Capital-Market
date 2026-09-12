import { CheckCircle2, Copy, Network, ShieldCheck, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { cn } from '@/utils/cn';

export function WalletControl({ prominent = false, expanded = false, onboarding = false, context = 'organization' }) {
  const [open, setOpen] = useState(false);
  const wallet = useWalletConnection();
  const label = context === 'investor' ? 'Investor secure account' : 'Organization secure account';

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      toast.success('Privy wallet address copied');
    } catch {
      toast.error('Unable to copy the Privy wallet address');
    }
  };

  const switchNetwork = async () => {
    try {
      await wallet.switchChain(wallet.requiredChain.id);
      toast.success('Your Privy secure account is ready to use');
    } catch (error) {
      toast.error(error?.message || 'Unable to prepare your Privy secure account.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex max-w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition',
          expanded && 'min-h-14 w-full',
          onboarding && 'max-w-[230px]',
          prominent
            ? 'w-full justify-center border-transparent bg-[var(--primary-600)] text-white shadow-sm'
            : wallet.isCorrectNetwork
              ? 'border-emerald-200 bg-emerald-50/80 text-slate-950'
              : 'border-slate-200 bg-white text-slate-950',
        )}
        aria-label="Open Privy secure account details"
      >
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', prominent ? 'bg-white/15' : 'bg-[var(--primary-50)] text-[var(--primary-600)]')}>
          <WalletCards size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className={cn('block truncate text-xs font-semibold', prominent && 'text-white')}>
            Privy secure account
          </strong>
          <small className={cn('block truncate text-[10px] font-semibold', prominent ? 'text-white/80' : 'text-slate-500')}>
            {wallet.isConnected ? (wallet.isCorrectNetwork ? 'Ready to use' : 'Needs attention') : 'Sign in with Privy to restore access'}
          </small>
        </span>
        {wallet.isCorrectNetwork ? <CheckCircle2 size={16} className={prominent ? 'text-white' : 'text-emerald-600'} /> : null}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={label} className="sm:max-w-lg">
        <div className="grid gap-4">
          {wallet.isConnected ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-600)] text-white">
                    <ShieldCheck size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <small className="block font-semibold uppercase tracking-[0.12em] text-slate-500">Securely managed by Privy</small>
                    <strong className="mt-1 block text-sm text-slate-950">Your Privy account is linked to your T-REX profile</strong>
                    <p className="mt-2 mb-0 text-sm leading-6 text-slate-600">
                      You do not need to connect another account. Privy helps keep this secure account protected while you use T-REX.
                    </p>
                  </div>
                </div>
              </div>

              {!wallet.isCorrectNetwork ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="mb-3 flex gap-2">
                    <Network size={18} />
                    <span>Your secure account needs a quick setup check before you can confirm financial actions.</span>
                  </div>
                  <Button type="button" className="w-full" onClick={switchNetwork}>Prepare secure account</Button>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Your secure account is ready to use. T-REX will ask you to review and confirm important investment or issuer actions when needed.
                </div>
              )}

              <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <summary className="cursor-pointer font-semibold text-slate-950">View account details</summary>
                <div className="mt-4 grid gap-3">
                  <div>
                    <small className="block text-slate-500">Privy wallet address</small>
                    <div className="mt-1 flex items-start gap-2">
                      <strong className="min-w-0 flex-1 break-all font-mono text-xs text-slate-950">{wallet.address}</strong>
                      <button type="button" onClick={copyAddress} className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600" aria-label="Copy Privy wallet address">
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3"><small className="block text-slate-500">Account balance</small><strong>{wallet.balanceLabel}</strong></div>
                    <div className="rounded-xl bg-slate-50 p-3"><small className="block text-slate-500">Network</small><strong>{wallet.chain?.name || `Chain ${wallet.chainId || 'unknown'}`}</strong></div>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Your Privy secure account is not available right now. Sign out and sign in again with your verified email to restore access.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export default WalletControl;
