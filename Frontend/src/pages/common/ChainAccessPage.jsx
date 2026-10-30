import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, ExternalLink, LoaderCircle, LockKeyhole, Network, RefreshCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/hooks/useAuth';
import { useMyChains, useUnlockChain } from '@/hooks/useChains';
import { useMyToken } from '@/hooks/useMyToken';
import { ROLES } from '@/config/permissions';
import { getErrorMessage } from '@/utils/error';
import { shortenWalletAddress } from '@/utils/wallet';
import { resolveMasterImageUrl } from '@/utils/masterImage';
import { isTokenCreationLocked } from '@/utils/tokenCreationLock';

const statusCopy = {
  LOCKED: { label: 'Locked', tone: 'bg-slate-100 text-slate-700', icon: LockKeyhole },
  CREATING: { label: 'Creation in progress', tone: 'bg-amber-50 text-amber-700', icon: LoaderCircle },
  FAILED: { label: 'Action needed', tone: 'bg-rose-50 text-rose-700', icon: CircleAlert },
  CREATED: { label: 'Unlocked', tone: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
};

export default function ChainAccessPage() {
  useDocumentTitle('Network Access');
  const [activeUid, setActiveUid] = useState('');
  const [pollUnlockUid, setPollUnlockUid] = useState('');
  const { user } = useAuth();
  const isIssuer = user?.role === ROLES.issuer;
  const issuerToken = useMyToken({ enabled: isIssuer });
  const issuerTokenLocksNetworks = Boolean(isIssuer && isTokenCreationLocked(issuerToken.token));
  const hasIssuerChainSelection = Boolean(issuerToken.selectedChainUid);
  const issuerTokenGuardLoading = Boolean(
    isIssuer && hasIssuerChainSelection && issuerToken.isFetching && !issuerToken.token,
  );
  const issuerTokenGuardUnavailable = Boolean(
    isIssuer && hasIssuerChainSelection && issuerToken.isError,
  );
  const issuerNetworkUnlockBlocked = issuerTokenLocksNetworks || issuerTokenGuardLoading || issuerTokenGuardUnavailable;
  const chains = useMyChains({
    refetchInterval: (query) =>
      (query.state.data || []).some((item) => item.identityStatus === 'CREATING') || pollUnlockUid
        ? 4_000
        : false,
  });
  const unlock = useUnlockChain();

  useEffect(() => {
    if (!unlock.isPending) setActiveUid('');
  }, [unlock.isPending]);

  useEffect(() => {
    if (!pollUnlockUid) return;
    const row = (chains.data || []).find((item) => item.chainUid === pollUnlockUid);
    if (row && row.identityStatus !== 'LOCKED' && row.identityStatus !== 'CREATING') {
      setPollUnlockUid('');
    }
  }, [chains.data, pollUnlockUid]);

  const counts = useMemo(() => {
    const rows = chains.data || [];
    return { total: rows.length, unlocked: rows.filter((item) => item.isUnlocked).length };
  }, [chains.data]);

  const unlockChain = async (chain) => {
    if (issuerNetworkUnlockBlocked || unlock.isPending || chain.identityStatus === 'CREATING') return;
    setActiveUid(chain.chainUid);
    try {
      await unlock.mutateAsync(chain.chainUid);
      toast.success(`${chain.chainName} setup started`, { description: 'Your network identity is being created securely by the platform.' });
    } catch (error) {
      const code = String(
        error?.response?.data?.code || error?.response?.data?.error?.code || error?.code || '',
      ).toUpperCase();
      if (code === 'CHAIN_IDENTITY_CREATION_IN_PROGRESS') {
        setPollUnlockUid(chain.chainUid);
        void chains.refetch();
        toast.info('Network identity creation is already in progress', {
          description: 'This page will keep checking automatically. No additional unlock request is needed.',
        });
        return;
      }
      toast.error('Network could not be unlocked', { description: getErrorMessage(error, 'Try again in a moment.') });
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary-50)] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary-700)]"><Network size={14} /> Multichain access</span>
            <h1 className="mb-2 text-2xl font-semibold sm:text-3xl">Your blockchain networks</h1>
            <p className="m-0 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{issuerTokenLocksNetworks ? 'Your token creation has fixed this issuer to its selected blockchain network. Additional networks can no longer be unlocked.' : 'Unlock only the networks you plan to use. Identity creation is handled by the platform; your wallet will not open for this step.'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-64">
            <div className="rounded-2xl bg-slate-50 p-4"><small className="text-slate-500">Available</small><strong className="mt-1 block text-2xl">{counts.total}</strong></div>
            <div className="rounded-2xl bg-emerald-50 p-4"><small className="text-emerald-700">Unlocked</small><strong className="mt-1 block text-2xl text-emerald-800">{counts.unlocked}</strong></div>
          </div>
        </div>
      </section>

      {chains.isError ? (
        <Card className="p-6 text-center"><CircleAlert className="mx-auto mb-3 text-rose-500" /><h2 className="text-lg">Unable to load network access</h2><p className="text-sm text-slate-500">Refresh and try again.</p><Button variant="secondary" icon={RefreshCcw} onClick={() => chains.refetch()}>Retry</Button></Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(chains.data || []).map((chain) => {
          const status = statusCopy[chain.identityStatus] || statusCopy.LOCKED;
          const StatusIcon = status.icon;
          const busy = chain.identityStatus === 'CREATING' || pollUnlockUid === chain.chainUid || (unlock.isPending && activeUid === chain.chainUid);
          const unlockDisabled = busy || issuerNetworkUnlockBlocked;
          const imageUrl = resolveMasterImageUrl(chain);
          return (
            <article key={chain.chainUid} className="flex min-h-72 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white">
                  {imageUrl ? <img src={imageUrl} alt="" className="size-full bg-white object-contain p-1.5" /> : <Network size={22} />}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}><StatusIcon size={13} className={busy ? 'animate-spin' : ''} />{status.label}</span>
              </div>
              <div className="mt-5">
                <h2 className="mb-1 text-lg font-semibold">{chain.chainName}</h2>
                <p className="m-0 text-sm text-slate-500">Chain ID {chain.chainId} · {chain.nativeCurrencySymbol}{chain.isTestnet ? ' · Testnet' : ''}</p>
              </div>
              <div className="mt-4 min-h-14 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                {chain.identityStatus === 'CREATED' ? <><span className="block text-xs text-slate-400">ONCHAINID</span><strong className="mt-1 block font-mono text-xs text-slate-700" title={chain.identityAddress}>{shortenWalletAddress(chain.identityAddress, 9, 9) || 'Created'}</strong></> : null}
                {chain.identityStatus === 'FAILED' ? <span>{chain.identityErrorMessage || 'Identity creation did not complete. You can retry safely.'}</span> : null}
                {chain.identityStatus === 'LOCKED' ? <span>{issuerTokenLocksNetworks ? 'This network cannot be unlocked because token creation has already started for this issuer.' : issuerTokenGuardUnavailable ? 'Network changes are temporarily unavailable because token status could not be verified. Refresh and try again.' : issuerTokenGuardLoading ? 'Checking your token status before allowing network changes…' : 'Unlock this network before creating or managing regulated assets on it.'}</span> : null}
                {chain.identityStatus === 'CREATING' ? <span>Creation is in progress. This page will refresh automatically.</span> : null}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-5">
                {chain.isUnlocked ? <div className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 text-sm font-semibold text-emerald-700"><ShieldCheck size={16} /> Ready</div> : <Button className="button--full" loading={busy} disabled={unlockDisabled} onClick={() => unlockChain(chain)}>{issuerTokenLocksNetworks ? 'Network locked' : issuerTokenGuardLoading ? 'Checking token status' : issuerTokenGuardUnavailable ? 'Unlock unavailable' : chain.identityStatus === 'FAILED' ? 'Retry unlock' : 'Unlock network'}</Button>}
                {chain.explorerUrl ? <a className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" href={chain.explorerUrl} target="_blank" rel="noreferrer" aria-label={`Open ${chain.chainName} explorer`}><ExternalLink size={16} /></a> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
