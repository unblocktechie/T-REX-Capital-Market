import { ArrowLeft, CheckCircle2, LockKeyhole, Network, RefreshCcw, ShieldAlert, ShieldCheck, WalletCards } from 'lucide-react';
import { MarketplaceTokenImage } from './MarketplaceTokenImage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CompactAddress } from '@/components/common/CompactAddress';
import { WalletControl } from '@/components/wallet/WalletControl';
import { toast } from 'sonner';
import { getWalletErrorMessage, shortenWalletAddress } from '@/utils/wallet';

export function InvestorTokenActionHeader({ eyebrow, title, description, onBack, backLabel = 'Back to Application' }) {
  return (
    <>
      {onBack ? (
        <button type="button" className="investor-token-action-back" onClick={onBack}>
          <ArrowLeft size={15} /> {backLabel}
        </button>
      ) : null}
      <header className="investor-token-action-header">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
    </>
  );
}

export function InvestorTokenIdentityCard({ token, readyLabel = 'Registered investor' }) {
  return (
    <Card className="investor-token-action-identity-card">
      <div className="investor-token-action-identity-card__main">
        <MarketplaceTokenImage token={token} size="md" />
        <div>
          <h2>{token?.name || 'Token'}{token?.symbol ? ` (${token.symbol})` : ''}</h2>
          <p>{[token?.issuer, token?.standard || 'ERC-3643'].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <span className="investor-token-action-ready"><CheckCircle2 size={15} /> {readyLabel}</span>
    </Card>
  );
}

export function LockedAddressField({ label, value, emptyLabel = 'Available when configured' }) {
  return (
    <div className="investor-token-action-locked-field">
      <span>{label}</span>
      <div>
        {value ? <CompactAddress value={value} label={label} leading={7} trailing={6} /> : <strong>{emptyLabel}</strong>}
        <LockKeyhole size={15} aria-hidden="true" />
      </div>
    </div>
  );
}

export function TokenActionCheck({ icon: Icon = ShieldCheck, label, detail, status = 'Ready', tone = 'success' }) {
  return (
    <div className={`investor-token-action-check is-${tone}`}>
      <span className="investor-token-action-check__icon"><Icon size={16} /></span>
      <div>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      <span className="investor-token-action-check__status">{status}</span>
    </div>
  );
}

export function TokenActionUnavailable({ title, description, onBack, backLabel = 'Back to My Applications' }) {
  return (
    <Card className="investor-token-action-state-card">
      <ShieldCheck size={30} />
      <h1>{title}</h1>
      <p>{description}</p>
      <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>{backLabel}</Button>
    </Card>
  );
}


export function RegisteredInvestorWalletGate({ guard, actionLabel = 'continue' }) {
  const {
    wallet,
    registeredAddress,
    hasRegisteredWallet,
    targetChainId,
    targetNetworkLabel,
    isRegisteredWalletConnected,
    isCorrectNetwork,
    isSupportedNetwork,
    switchToRequiredNetwork,
  } = guard;

  const handleSwitchNetwork = async () => {
    try {
      await switchToRequiredNetwork();
      toast.success(`Switched to ${targetNetworkLabel}.`);
    } catch (error) {
      toast.error('Unable to switch network', {
        description: getWalletErrorMessage(error),
      });
    }
  };

  if (!hasRegisteredWallet) {
    return (
      <div className="investor-token-wallet-gate is-warning">
        <ShieldAlert size={18} />
        <div>
          <strong>Registered wallet unavailable</strong>
          <p>Your registered investment wallet could not be loaded. Refresh the application before you {actionLabel}.</p>
        </div>
      </div>
    );
  }

  if (!wallet.isConnected) {
    return (
      <div className="investor-token-wallet-gate is-warning">
        <WalletCards size={18} />
        <div className="investor-token-wallet-gate__content">
          <strong>Connect your registered wallet</strong>
          <p>Use the wallet registered for this investment ({shortenWalletAddress(registeredAddress, 6, 5)}) to {actionLabel}.</p>
          <div className="investor-token-wallet-gate__control">
            <WalletControl prominent expanded context="investor" purpose="registered-action" />
          </div>
        </div>
      </div>
    );
  }

  if (!isRegisteredWalletConnected) {
    return (
      <div className="investor-token-wallet-gate is-error">
        <ShieldAlert size={18} />
        <div className="investor-token-wallet-gate__content">
          <strong>Switch to your registered wallet</strong>
          <p>The connected wallet does not match {shortenWalletAddress(registeredAddress, 6, 5)}. Open the wallet control below to reconnect with the registered investor wallet.</p>
          <div className="investor-token-wallet-gate__control">
            <WalletControl expanded context="investor" purpose="registered-action" />
          </div>
        </div>
      </div>
    );
  }

  if (!isSupportedNetwork) {
    return (
      <div className="investor-token-wallet-gate is-error">
        <Network size={18} />
        <div>
          <strong>Required network is unavailable</strong>
          <p>{targetNetworkLabel} is not configured in this application. You cannot {actionLabel} until the network is supported.</p>
        </div>
      </div>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <div className="investor-token-wallet-gate is-warning">
        <Network size={18} />
        <div className="investor-token-wallet-gate__content">
          <strong>Switch network to continue</strong>
          <p>Your registered wallet is connected. Switch it to {targetNetworkLabel} before you {actionLabel}.</p>
          <Button
            variant="secondary"
            className="investor-token-wallet-gate__switch"
            icon={wallet.switchingChainId === targetChainId ? RefreshCcw : Network}
            loading={wallet.switchingChainId === targetChainId}
            disabled={wallet.isBusy}
            onClick={handleSwitchNetwork}
          >
            Switch Network
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="investor-token-wallet-gate is-success">
      <CheckCircle2 size={18} />
      <div className="investor-token-wallet-gate__content">
        <strong>Registered wallet ready</strong>
        <p>{shortenWalletAddress(wallet.address, 6, 5)} is connected on {targetNetworkLabel}.</p>
        <div className="investor-token-wallet-gate__control">
          <WalletControl expanded context="investor" purpose="registered-action" />
        </div>
      </div>
    </div>
  );
}
