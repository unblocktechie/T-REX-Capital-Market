import { AlertTriangle, Check, ChevronDown, ChevronRight, Lock, Network, RefreshCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '@/config/routes';
import { useUnlockChain } from '@/hooks/useChains';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/error';
import { getWalletErrorMessage } from '@/utils/wallet';
import { resolveMasterImageUrl } from '@/utils/masterImage';
import { canSelectNetwork, canUnlockNetwork, getNetworkMenuChoices, isNetworkUnlocked } from '@/utils/networkMenu';
import { buildTokenIssuanceNetworkMismatchMessage } from '@/utils/tokenIssuanceNetwork';

export function AppNetworkSwitcher({ pathname = '', onboardingOnly = false, network }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [switchingChainId, setSwitchingChainId] = useState(null);
  const [unlockingChainUid, setUnlockingChainUid] = useState('');
  const [pollUnlockUid, setPollUnlockUid] = useState('');
  const unlock = useUnlockChain();
  const wallet = useWalletConnection(network.activeChainId);
  const assetChainUid = useTokenIssuanceStore((state) => state.tokenInformation.chainUid);
  const assetNetworkNameFromForm = useTokenIssuanceStore((state) => state.tokenInformation.network);
  const activeChain = network.activeChain;
  // /chains/me includes locked, creating, failed and unlocked networks.
  // Keep the existing eligible choices as a fallback during the initial load.
  const choices = getNetworkMenuChoices(network.myChains, network.selectableChains, network.activeChain);
  const deploymentNetworkPinned = pathname === ROUTES.tokenDeploying;
  const switchingRestricted =
    network.isNetworkLocked || network.isNetworkLockLoading || deploymentNetworkPinned;
  const isTokenIssuanceRoute =
    pathname.startsWith(`${ROUTES.createToken}/`) && pathname !== ROUTES.tokenDeploying;
  const assetTargetChain = isTokenIssuanceRoute && assetChainUid
    ? [...network.selectableChains, ...network.publicChains].find((chain) => chain.chainUid === assetChainUid) || null
    : null;
  const assetTargetNetworkName = assetTargetChain?.chainName || assetNetworkNameFromForm || 'the asset network';
  const assetNetworkNeedsSwitch = Boolean(
    isTokenIssuanceRoute &&
    assetChainUid &&
    network.activeChainUid &&
    assetChainUid !== network.activeChainUid &&
    !network.isNetworkLocked,
  );

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!pollUnlockUid) return;
    const chain = network.myChains.find((row) => row.chainUid === pollUnlockUid);
    if (chain && (chain.isUnlocked || ['CREATED', 'FAILED'].includes(chain.identityStatus))) {
      setPollUnlockUid('');
    }
  }, [network.myChains, pollUnlockUid]);

  useEffect(() => {
    if (!pollUnlockUid) return undefined;
    const intervalId = window.setInterval(() => {
      void network.refetchMyChains();
    }, 4_000);
    return () => window.clearInterval(intervalId);
  }, [network.refetchMyChains, pollUnlockUid]);

  if (!activeChain || !network.hasEstablishedNetwork) return null;

  const activeImage = resolveMasterImageUrl(activeChain);
  const walletNeedsSwitch = Boolean(wallet.isConnected && wallet.chainId !== activeChain.chainId);
  const showAttentionDot = assetNetworkNeedsSwitch || walletNeedsSwitch;
  const mismatchMessage = buildTokenIssuanceNetworkMismatchMessage({
    assetNetworkName: assetTargetNetworkName,
    appNetworkName: activeChain.chainName,
  });
  const attentionTitle = assetNetworkNeedsSwitch
    ? mismatchMessage
    : walletNeedsSwitch
      ? `Wallet is not on ${activeChain.chainName}`
      : '';
  const choose = async (chain) => {
    if (!canSelectNetwork(chain, switchingRestricted)) return;

    const changesApplicationNetwork = chain.chainId !== activeChain.chainId;
    let applicationNetworkSelected = !changesApplicationNetwork;
    setSwitchingChainId(chain.chainId);
    try {
      if (changesApplicationNetwork) {
        const selected = await network.chooseChain(chain.chainId);
        if (!selected) return;
        applicationNetworkSelected = true;
      }
      setOpen(false);

      // Clicking the already-selected application network is also a valid retry
      // when the wallet itself is on another chain. This makes the navbar selector
      // double as the expected "switch wallet to selected network" control.
      if (!wallet.isConnected || wallet.chainId === chain.chainId) return;

      await wallet.switchChain(chain.chainId);
      toast.success(`Switched to ${chain.chainName}`, {
        description: 'The wallet and application network are now aligned.',
      });
    } catch (error) {
      const paymentRegistryUnavailable =
        error?.response?.status === 503 &&
        String(error?.response?.data?.code || error?.response?.data?.error?.code || '') ===
          'PAYMENT_TOKEN_REGISTRY_UNAVAILABLE';
      if (paymentRegistryUnavailable) {
        toast.warning(`${chain.chainName} is temporarily unavailable`, {
          description: 'Payment-token registry data could not be loaded. No local contract or token list was used.',
        });
      } else if (!applicationNetworkSelected) {
        toast.error(`Could not select ${chain.chainName}`, {
          description: getErrorMessage(error, 'The network configuration could not be loaded.'),
        });
      } else {
        toast.warning(`${chain.chainName} selected`, {
          description: `${getWalletErrorMessage(error)} Open the wallet control to retry the network switch.`,
        });
      }
    } finally {
      setSwitchingChainId(null);
    }
  };

  const unlockChain = async (chain) => {
    if (!canUnlockNetwork(chain, {
      selectionLocked: switchingRestricted,
      unlockBlocked: network.isNetworkUnlockBlocked,
      accessLoading: network.isNetworkAccessLoading,
      accessError: network.isNetworkAccessError,
      mutationPending: unlock.isPending,
      pollingUid: pollUnlockUid,
    })) return;

    setUnlockingChainUid(chain.chainUid);
    try {
      await unlock.mutateAsync(chain.chainUid);
      setPollUnlockUid(chain.chainUid);
      toast.success(`${chain.chainName} setup started`, {
        description: 'Your network identity is being created securely by the platform.',
      });
    } catch (error) {
      const code = String(
        error?.response?.data?.code || error?.response?.data?.error?.code || error?.code || '',
      ).toUpperCase();
      if (code === 'CHAIN_IDENTITY_CREATION_IN_PROGRESS') {
        setPollUnlockUid(chain.chainUid);
        void network.refetchMyChains();
        toast.info('Network setup is already in progress', {
          description: 'The network list will refresh automatically. No second request is needed.',
        });
      } else {
        toast.error(`Could not unlock ${chain.chainName}`, {
          description: getErrorMessage(error, 'Try again in a moment.'),
        });
      }
    } finally {
      setUnlockingChainUid('');
    }
  };

  return (
    <div ref={rootRef} className="app-network-switcher relative min-w-0 shrink-0">
      <button
        type="button"
        className={cn(
          'flex min-h-10 max-w-[190px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition',
          'hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 sm:max-w-[230px] sm:px-3',
          open && 'border-slate-300 bg-slate-50',
        )}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Application network: ${activeChain.chainName}${network.isNetworkLocked ? '; network selection locked because token creation has started' : ''}${deploymentNetworkPinned ? '; network temporarily pinned while token creation is in progress' : ''}${assetNetworkNeedsSwitch ? `; asset network ${assetTargetNetworkName} does not match the current application network` : ''}${walletNeedsSwitch ? '; wallet switch required' : ''}`}
        title={
          network.isNetworkLocked
            ? `${activeChain.chainName} is locked because token creation has started on this network. Click to review network access.`
            : deploymentNetworkPinned
              ? `${activeChain.chainName} is temporarily pinned while the token creation transactions are being completed.`
              : network.isNetworkLockLoading
                ? 'Checking whether the issuer network is locked.'
                : assetNetworkNeedsSwitch
                  ? attentionTitle
                  : undefined
        }
      >
        <span className="app-network-switcher__icon grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
          {activeImage ? <img src={activeImage} alt="" className="size-full object-contain p-0.5" /> : <Network size={15} />}
        </span>
        <span className="app-network-switcher__label min-w-0 flex-1">
          <small className="hidden text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:block">
            {network.isNetworkLocked || deploymentNetworkPinned ? 'Network locked' : 'Network'}
          </small>
          <strong className="block truncate text-xs font-semibold text-slate-900 sm:text-[13px]">{activeChain.chainName}</strong>
        </span>
        {showAttentionDot ? (
          <span
            className="app-network-switcher__attention size-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]"
            title={attentionTitle}
            aria-hidden="true"
          />
        ) : null}
        {switchingRestricted ? <Lock className="app-network-switcher__status-icon app-network-switcher__status-icon--lock shrink-0 text-slate-400" size={13} aria-hidden="true" /> : null}
        <ChevronDown className={cn('app-network-switcher__status-icon app-network-switcher__status-icon--chevron shrink-0 text-slate-400 transition', open && 'rotate-180')} size={15} />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-[1700] mt-2 w-[min(375px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.22)]"
          role="menu"
          aria-label="Application networks"
        >
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <strong className="block text-sm font-semibold text-slate-950">{switchingRestricted ? 'Network selection locked' : 'Switch network'}</strong>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              {network.isNetworkLocked
                ? `Your token's network is now fixed. Other networks can be viewed but not unlocked.`
                : deploymentNetworkPinned
                  ? 'Network switching is paused during token creation. You can still review network access.'
                  : network.isNetworkLockLoading
                    ? 'Checking token status. You can review networks while switching is unavailable.'
                    : 'Select an unlocked network or unlock another network to use it.'}
            </span>
          </div>
          {assetNetworkNeedsSwitch ? (
            <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950" role="status">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={16} aria-hidden="true" />
              <div className="min-w-0">
                <strong className="block text-xs font-semibold">Network selections do not match</strong>
                <span className="mt-0.5 block text-xs leading-5 text-amber-800">
                  {mismatchMessage}
                </span>
              </div>
            </div>
          ) : null}
          {network.isNetworkAccessError ? (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800" role="status">
              Network status could not be refreshed. Unlock actions are temporarily unavailable.
            </div>
          ) : null}
          <div className="max-h-[310px] overflow-y-auto p-1.5">
            {network.isNetworkAccessLoading && !network.myChains.length ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-500" role="status">
                <RefreshCcw size={14} className="animate-spin" /> Loading network access…
              </div>
            ) : choices.map((chain) => {
              const image = resolveMasterImageUrl(chain);
              const selected = chain.chainId === activeChain.chainId;
              const switching = switchingChainId === chain.chainId;
              const requiredByAsset = assetNetworkNeedsSwitch && chain.chainUid === assetChainUid;
              const isUnlocked = isNetworkUnlocked(chain);
              const isCreating = chain.identityStatus === 'CREATING' || pollUnlockUid === chain.chainUid;
              const isUnlocking = unlockingChainUid === chain.chainUid;
              const unlockDisabled = !canUnlockNetwork(chain, {
                selectionLocked: switchingRestricted,
                unlockBlocked: network.isNetworkUnlockBlocked,
                accessLoading: network.isNetworkAccessLoading,
                accessError: network.isNetworkAccessError,
                mutationPending: unlock.isPending,
                pollingUid: pollUnlockUid,
              });
              return (
                <div
                  key={chain.chainUid || chain.chainId}
                  className={cn(
                    'flex min-w-0 items-center gap-1 rounded-xl pr-2 transition hover:bg-slate-50',
                    selected && 'bg-blue-50/80',
                    requiredByAsset && !selected && 'bg-amber-50/70',
                  )}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    aria-label={`${chain.chainName}, ${isUnlocked ? 'unlocked' : isCreating ? 'setup in progress' : 'locked'}${selected ? ', selected' : ''}`}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      !isUnlocked || switchingRestricted ? 'cursor-not-allowed' : 'hover:bg-slate-100/70',
                    )}
                    onClick={() => void choose(chain)}
                    disabled={Boolean(switchingChainId) || !canSelectNetwork(chain, switchingRestricted)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-500">
                      {image ? <img src={image} alt="" className="size-full object-contain p-1" /> : <Network size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="truncate text-[13px] font-semibold text-slate-950">{chain.chainName}</strong>
                        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', chain.isTestnet ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
                          {chain.isTestnet ? 'Testnet' : 'Mainnet'}
                        </span>
                      </span>
                      {requiredByAsset ? (
                        <small className="mt-0.5 block text-[11px] font-medium text-amber-700">Asset network in Step 1</small>
                      ) : wallet.isConnected && wallet.chainId !== chain.chainId && selected ? (
                        <small className="mt-0.5 block text-[11px] text-amber-700">Wallet switch required</small>
                      ) : (
                        <small className={cn('mt-0.5 flex items-center gap-1 text-[11px]', isUnlocked ? 'text-emerald-700' : 'text-slate-500')}>
                          {isCreating ? <RefreshCcw size={11} className="animate-spin" /> : !isUnlocked ? <Lock size={11} /> : null}
                          {isCreating ? 'Setting up' : isUnlocked ? 'Unlocked' : chain.identityStatus === 'FAILED' ? 'Setup failed' : 'Locked'}
                        </small>
                      )}
                    </span>
                    {switching ? <RefreshCcw className="shrink-0 animate-spin text-blue-600" size={16} /> : selected ? <Check className="shrink-0 text-blue-600" size={17} /> : null}
                  </button>
                  {!isUnlocked ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="min-h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void unlockChain(chain)}
                      disabled={unlockDisabled}
                      aria-label={`${chain.identityStatus === 'FAILED' ? 'Retry unlocking' : 'Unlock'} ${chain.chainName}`}
                      title={switchingRestricted ? 'Network changes are locked during token creation' : undefined}
                    >
                      {isUnlocking || isCreating ? <RefreshCcw size={13} className="mx-auto animate-spin" /> : chain.identityStatus === 'FAILED' ? 'Retry' : 'Unlock'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {!onboardingOnly ? (
            <div className="border-t border-slate-100 p-2">
              <Link
                to={ROUTES.chainAccess}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
              >
                <span>Manage network access</span>
                <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
