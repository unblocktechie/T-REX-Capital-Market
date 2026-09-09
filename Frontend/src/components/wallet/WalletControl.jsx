import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  Network,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { cn } from '@/utils/cn';
import { getWalletErrorMessage, shortenWalletAddress } from '@/utils/wallet';

const WALLET_LOGOS = Object.freeze({
  metamask: '/wallets/metamask.png',
  walletconnect: '/wallets/walletconnect.png',
});

const isWalletConnectConnector = (connector) =>
  /walletconnect/i.test(`${connector?.id || ''} ${connector?.name || ''}`);

const isMetaMaskConnector = (connector) =>
  /metamask/i.test(`${connector?.id || ''} ${connector?.name || ''}`);

function getWalletType(connector) {
  return isWalletConnectConnector(connector) ? 'walletconnect' : 'metamask';
}

function WalletBrandImage({ type, className }) {
  return (
    <img
      src={WALLET_LOGOS[type]}
      className={cn('size-9 object-contain', className)}
      alt={`${type === 'walletconnect' ? 'WalletConnect' : 'MetaMask'} logo`}
    />
  );
}

function WalletOption({ type, title, description, disabled, loading, onClick }) {
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:shadow-none"
      disabled={disabled || loading}
      onClick={onClick}
    >
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition group-hover:border-[var(--primary-400)]">
        {loading ? (
          <RefreshCcw className="animate-spin text-[var(--primary-600)]" size={21} />
        ) : (
          <WalletBrandImage type={type} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold text-slate-950 sm:text-base">{title}</strong>
        <small className="mt-1 block text-xs leading-5 text-slate-500 sm:text-sm">{description}</small>
      </span>
      <ChevronDown className="-rotate-90 text-slate-400 transition group-hover:text-[var(--primary-600)]" size={18} />
    </button>
  );
}

export function WalletControl({
  onboarding = false,
  prominent = false,
  expanded = false,
  context = 'organization',
}) {
  const [open, setOpen] = useState(false);
  const wallet = useWalletConnection();
  const isInvestorContext = context === 'investor';

  const connectWith = async (connector) => {
    try {
      await wallet.connect(connector);
      setOpen(false);
      toast.success('Wallet connected', {
        description: `Connected to ${wallet.requiredChain.name}.`,
      });
    } catch (error) {
      toast.error('Wallet connection failed', {
        description: getWalletErrorMessage(error),
      });
    }
  };

  const switchTo = async (chainId) => {
    try {
      await wallet.switchChain(chainId);
      toast.success(`Switched to ${wallet.requiredChain.name}`, {
        description: 'The wallet is ready for the next action.',
      });
    } catch (error) {
      toast.error('Unable to switch network', {
        description: `${getWalletErrorMessage(
          error,
        )} You can also reconnect the wallet and try again.`,
      });
    }
  };

  const reconnect = async () => {
    try {
      await wallet.disconnect();
      toast.info('Choose a wallet to reconnect', {
        description: `Reconnect on ${wallet.requiredChain.name} to continue.`,
      });
    } catch (error) {
      toast.error('Unable to reconnect wallet', {
        description: getWalletErrorMessage(error),
      });
    }
  };

  const disconnect = async () => {
    try {
      await wallet.disconnect();
      setOpen(false);
      toast.success('Wallet disconnected');
    } catch (error) {
      toast.error('Unable to disconnect wallet', {
        description: getWalletErrorMessage(error),
      });
    }
  };

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      toast.success('Wallet address copied');
    } catch {
      toast.error('Unable to copy wallet address');
    }
  };

  const connectorOptions = wallet.connectors.filter(
    (connector, index, connectors) =>
      (isMetaMaskConnector(connector) || isWalletConnectConnector(connector)) &&
      connectors.findIndex((item) => item.id === connector.id) === index,
  );
  const connectedWalletType = wallet.connector ? getWalletType(wallet.connector) : 'metamask';
  const currentNetworkLabel =
    wallet.chain?.name ||
    `Unsupported network${wallet.chainId ? ` (Chain ID ${wallet.chainId})` : ''}`;
  const modalTitle = wallet.isConnected
    ? isInvestorContext
      ? 'Investor wallet'
      : 'Organization wallet'
    : isInvestorContext
      ? 'Connect investor wallet'
      : 'Connect organization wallet';

  const triggerClasses = prominent
    ? isInvestorContext
      ? 'investor-wallet-connect-trigger min-h-12 w-full justify-center border-transparent px-4 text-white'
      : 'min-h-12 w-full justify-center border-transparent bg-[linear-gradient(135deg,var(--primary-500),var(--primary-600))] px-4 text-white shadow-[0_10px_24px_rgba(47,128,237,0.24)] hover:-translate-y-0.5 hover:border-transparent hover:bg-[linear-gradient(135deg,var(--primary-600),var(--primary-700))] hover:text-white hover:shadow-[0_14px_30px_rgba(47,128,237,0.3)]'
    : wallet.isConnected
      ? wallet.isCorrectNetwork
        ? 'border-emerald-200 bg-emerald-50/80 text-slate-950 hover:border-emerald-300 hover:bg-emerald-50'
        : 'border-rose-200 bg-rose-50 text-slate-950 hover:border-rose-300'
      : 'border-slate-200 bg-white text-slate-950 hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)]';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group flex max-w-full shrink-0 items-center rounded-xl border text-left transition',
          expanded
            ? 'min-h-14 w-full min-w-0 justify-start gap-3 px-3.5 py-2.5'
            : 'min-h-10 gap-2 px-2.5 py-1.5 sm:px-3',
          triggerClasses,
          onboarding && 'max-w-[220px]',
        )}
        aria-label={wallet.isConnected ? 'Open wallet menu' : 'Connect wallet'}
      >
        <span
          className={cn(
            'relative grid shrink-0 place-items-center',
            expanded ? 'size-9 rounded-xl' : 'size-8 rounded-lg',
            wallet.isConnected
              ? 'overflow-hidden border border-slate-200 bg-white shadow-sm'
              : prominent
                ? 'bg-white/15 text-white'
                : 'bg-[var(--primary-600)] text-white',
          )}
        >
          {wallet.isConnected ? (
            <>
              <WalletBrandImage type={connectedWalletType} className={expanded ? 'size-8' : 'size-7'} />
              <span
                className={cn(
                  'absolute right-0 bottom-0 size-2 rounded-full border border-white',
                  wallet.isCorrectNetwork ? 'bg-emerald-500' : 'bg-rose-500',
                )}
                aria-hidden="true"
              />
            </>
          ) : (
            <WalletCards size={16} />
          )}
        </span>

        <span
          className={cn(
            'min-w-0',
            expanded ? 'block flex-1' : prominent ? 'block' : 'block max-w-[82px] sm:max-w-[132px]',
          )}
        >
          {wallet.isConnected ? (
            <>
              <strong
                className={cn(
                  'block truncate font-semibold',
                  expanded ? 'text-sm' : 'text-[10px] sm:text-xs',
                  prominent ? 'text-white' : 'text-slate-950',
                )}
              >
                {wallet.shortAddress}
              </strong>
              <small
                className={cn(
                  'block truncate font-semibold',
                  expanded ? 'mt-0.5 max-w-none text-[11px] leading-4' : 'max-w-28 text-[9px] sm:text-[10px]',
                  prominent ? 'text-white/80' : 'text-slate-500',
                )}
              >
                {wallet.balanceLabel}
              </small>
            </>
          ) : (
            <strong className={cn('block whitespace-nowrap font-semibold', prominent ? 'text-sm text-white' : 'text-xs text-slate-950')}>
              Connect Wallet
            </strong>
          )}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0',
            expanded
              ? 'ml-auto block text-slate-400 transition group-hover:text-slate-600'
              : prominent
                ? 'block text-white'
                : 'hidden text-slate-400 sm:block',
          )}
          size={expanded ? 16 : 14}
        />
      </button>

      <Modal
        open={open}
        onClose={() => !wallet.isBusy && setOpen(false)}
        title={modalTitle}
        className="sm:max-w-lg"
      >
        {wallet.isConnected ? (
          <div className="grid gap-5">
            <div
              className={cn(
                'rounded-3xl border p-5',
                wallet.isCorrectNetwork
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-rose-200 bg-rose-50',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <WalletBrandImage type={connectedWalletType} className="size-8" />
                    <span
                      className={cn(
                        'absolute right-0.5 bottom-0.5 size-2.5 rounded-full border-2 border-white',
                        wallet.isCorrectNetwork ? 'bg-emerald-500' : 'bg-rose-500',
                      )}
                      aria-hidden="true"
                    />
                  </span>
                  <div className="min-w-0">
                    <small className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Connected with {wallet.connector?.name || 'wallet'}
                    </small>
                    <strong className="mt-1 block truncate font-mono text-sm text-slate-950 sm:text-base">
                      {shortenWalletAddress(wallet.address, 8, 8)}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-[var(--primary-400)] hover:text-[var(--primary-600)]"
                  onClick={copyAddress}
                  aria-label="Copy wallet address"
                >
                  <Copy size={16} />
                </button>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="rounded-2xl bg-white/85 p-3.5">
                  <small className="block text-xs font-semibold text-slate-500">Wallet balance</small>
                  <strong className="mt-1 block truncate text-sm font-semibold text-slate-950">
                    {wallet.balanceLabel}
                  </strong>
                </div>
                <div className="rounded-2xl bg-white/85 p-3.5">
                  <small className="block text-xs font-semibold text-slate-500">Current network</small>
                  <strong className="mt-1 block truncate text-sm font-semibold text-slate-950">
                    {currentNetworkLabel}
                  </strong>
                </div>
              </div>
            </div>

            {!wallet.isCorrectNetwork ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
                <strong className="block font-semibold">Wrong network connected</strong>
                <span className="mt-1 block">
                  Switch to {wallet.requiredChain.name} below, or reconnect the wallet if the
                  switch request does not open.
                </span>
              </div>
            ) : null}

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Network size={17} className="text-[var(--primary-600)]" />
                <h3 className="m-0 text-sm font-semibold text-slate-950">Required network</h3>
              </div>
              <button
                type="button"
                disabled={wallet.isCorrectNetwork || wallet.isBusy}
                onClick={() => switchTo(wallet.requiredChain.id)}
                className={cn(
                  'flex min-h-14 w-full flex-col items-stretch justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition min-[420px]:flex-row min-[420px]:items-center',
                  wallet.isCorrectNetwork
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-[var(--primary-100)] bg-[var(--primary-50)] text-[var(--primary-700)] hover:border-[var(--primary-400)]',
                )}
              >
                <span>
                  <strong className="block text-sm">{wallet.requiredChain.name}</strong>
                  <small className="block text-xs opacity-70">{isInvestorContext ? 'Required investor network' : 'Required deployment network'}</small>
                </span>
                {wallet.isCorrectNetwork ? (
                  <Check size={18} />
                ) : wallet.switchingChainId === wallet.requiredChain.id ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <span className="self-start rounded-lg bg-[var(--primary-600)] px-2.5 py-1 text-xs font-bold text-white min-[420px]:self-auto">
                    Switch to {wallet.requiredChain.name}
                  </span>
                )}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {!wallet.isCorrectNetwork ? (
                <button
                  type="button"
                  disabled={wallet.isBusy}
                  onClick={reconnect}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--primary-200)] bg-[var(--primary-50)] px-4 text-sm font-bold text-[var(--primary-700)] transition hover:border-[var(--primary-400)] hover:bg-[var(--primary-100)] disabled:opacity-60"
                >
                  {wallet.isBusy ? (
                    <RefreshCcw className="animate-spin" size={16} />
                  ) : (
                    <RefreshCcw size={16} />
                  )}
                  Reconnect wallet
                </button>
              ) : wallet.chain?.blockExplorers?.default?.url ? (
                <a
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)] hover:text-[var(--primary-700)]"
                  href={`${wallet.chain.blockExplorers.default.url}/address/${wallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} /> View on explorer
                </a>
              ) : null}
              <button
                type="button"
                disabled={wallet.isBusy}
                onClick={disconnect}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
              >
                {wallet.isBusy ? <RefreshCcw className="animate-spin" size={16} /> : <LogOut size={16} />}
                Disconnect wallet
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="rounded-3xl border border-[var(--primary-100)] bg-[var(--primary-50)] p-5">
              <span className="grid size-11 place-items-center rounded-2xl bg-[var(--primary-600)] text-white shadow-sm">
                <ShieldCheck size={22} />
              </span>
              <h3 className="mt-4 mb-1 text-lg font-semibold text-slate-950">Choose a secure wallet</h3>
              <p className="m-0 text-sm leading-6 text-slate-600">
                {isInvestorContext
                  ? 'This wallet becomes your primary investor wallet and will be linked to your investor profile.'
                  : 'This wallet becomes the primary organization wallet and will be used for token creation and future issuer actions.'}
              </p>
              <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--primary-700)] shadow-sm">
                Sepolia testnet only
              </span>
            </div>

            <div className="grid gap-3">
              {connectorOptions.map((connector) => {
                const type = getWalletType(connector);
                const walletConnect = type === 'walletconnect';
                return (
                  <WalletOption
                    key={connector.uid || connector.id}
                    type={type}
                    title={walletConnect ? 'WalletConnect' : 'MetaMask'}
                    description={
                      walletConnect
                        ? 'Connect from a mobile wallet or scan a QR code.'
                        : 'Connect using the MetaMask browser extension. Use WalletConnect for mobile wallets.'
                    }
                    loading={wallet.connectingConnectorId === connector.id}
                    disabled={wallet.isBusy}
                    onClick={() => connectWith(connector)}
                  />
                );
              })}

              {!wallet.walletConnectConfigured ? (
                <WalletOption
                  type="walletconnect"
                  title="WalletConnect"
                  description="Add VITE_WALLETCONNECT_PROJECT_ID in the environment file to enable QR and mobile wallet connections."
                  disabled
                />
              ) : null}
            </div>

            <p className="m-0 text-center text-xs leading-5 text-slate-500">
              Connection requests open in your wallet. T-REX Capital Market never receives or stores private keys.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
