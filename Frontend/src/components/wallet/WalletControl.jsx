import { CheckCircle2, Copy, Network, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PrivyMark, PrivyTrustBadge } from '@/components/branding/PrivyBrand';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { cn } from '@/utils/cn';

export function WalletControl({ prominent = false, expanded = false, onboarding = false, context = 'organization' }) {
  const [open, setOpen] = useState(false);
  const wallet = useWalletConnection();
  const isInvestor = context === 'investor';
  const label = isInvestor ? 'Investor Privy Wallet' : 'Organization Privy Wallet';
  const walletOwnerLabel = isInvestor ? 'investor wallet' : 'organization wallet';
  const networkName = wallet.chain?.name || wallet.requiredChain?.name || 'Configured network';

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      toast.success('Wallet address copied');
    } catch {
      toast.error('Unable to copy the wallet address');
    }
  };

  const switchNetwork = async () => {
    try {
      const target = await wallet.switchChain(wallet.requiredChain.id);
      toast.success(`Wallet ready on ${target?.name || wallet.requiredChain.name}`);
    } catch (error) {
      toast.error(error?.message || 'Unable to prepare your wallet.');
    }
  };

  const headerAddress = wallet.isConnected
    ? wallet.shortAddress || wallet.address
    : 'Wallet unavailable';
  const headerBalance = wallet.isConnected
    ? `Privy · ${wallet.balanceLabel}`
    : 'Sign in again to restore access';

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
        aria-label={`Open ${label.toLowerCase()} details${wallet.address ? ` for ${wallet.address}` : ''}`}
        title={wallet.address || label}
      >
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', prominent ? 'bg-white/15' : 'bg-[var(--primary-50)] text-[var(--primary-600)]')}>
          <PrivyMark size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className={cn('block truncate font-mono text-xs font-semibold', prominent && 'text-white')}>
            {headerAddress}
          </strong>
          <small className={cn('block truncate text-[10px] font-semibold', prominent ? 'text-white/80' : 'text-slate-500')}>
            {headerBalance}
          </small>
        </span>
        {wallet.isCorrectNetwork ? <CheckCircle2 size={16} className={prominent ? 'text-white' : 'text-emerald-600'} /> : null}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={label} className="sm:max-w-lg" trapFocus>
        <div className="grid gap-4">
          {wallet.isConnected ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-600)] text-white">
                    <ShieldCheck size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <PrivyTrustBadge
                      compact
                      tone="soft"
                      label="Secure embedded wallet"
                      className="mb-2"
                    />
                    <small className="block font-semibold uppercase tracking-[0.12em] text-slate-500">Linked to your T-REX account</small>
                    <p className="mt-2 mb-0 text-sm leading-6 text-slate-700">
                      Your {walletOwnerLabel} is linked to your T-REX account and is ready to use.
                    </p>
                  </div>
                </div>
              </div>

              {!wallet.isCorrectNetwork ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="mb-3 flex items-start gap-2">
                    <Network size={18} className="mt-0.5 shrink-0" />
                    <span>
                      Switch this wallet to <strong>{wallet.requiredChain.name}</strong> before confirming a transaction.
                    </span>
                  </div>
                  <Button type="button" className="w-full" onClick={switchNetwork}>
                    Switch to {wallet.requiredChain.name}
                  </Button>
                </div>
              ) : null}

              <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm" open>
                <summary className="cursor-pointer font-semibold text-slate-950">View account details</summary>
                <div className="mt-4 grid gap-3">
                  <div>
                    <small className="block text-slate-500">Wallet address</small>
                    <div className="mt-1 flex items-start gap-2">
                      <strong className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-slate-950">{wallet.address}</strong>
                      <button
                        type="button"
                        onClick={copyAddress}
                        className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                        aria-label="Copy wallet address"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <small className="block text-slate-500">Account balance</small>
                      <strong>{wallet.balanceLabel}</strong>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <small className="block text-slate-500">Network</small>
                      <strong>{networkName}</strong>
                    </div>
                  </div>
                </div>
              </details>

              <p className="m-0 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                {isInvestor
                  ? 'Your wallet is used to securely confirm investment actions on T-REX when required.'
                  : 'Your wallet is used to securely complete issuer actions on T-REX when required.'}
              </p>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Your wallet is not available right now. Sign out and sign in again with your verified email to restore access.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export default WalletControl;
