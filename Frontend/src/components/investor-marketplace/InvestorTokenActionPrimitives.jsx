import { ArrowLeft, CheckCircle2, LockKeyhole, Network, RefreshCcw, ShieldAlert, ShieldCheck, WalletCards } from 'lucide-react';
import { MarketplaceTokenImage } from './MarketplaceTokenImage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CompactAddress } from '@/components/common/CompactAddress';
import { WalletControl } from '@/components/wallet/WalletControl';
import { toast } from 'sonner';
import { getWalletErrorMessage } from '@/utils/wallet';

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
          <p>{token?.issuer ? `Issued by ${token.issuer}` : 'Approved investment'}</p>
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
      {onBack ? <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>{backLabel}</Button> : null}
    </Card>
  );
}


export function RegisteredInvestorWalletGate({ guard, actionLabel = 'continue' }) {
  const {
    wallet,
    hasRegisteredWallet,
    targetChainId,
    isRegisteredWalletConnected,
    isCorrectNetwork,
    isSupportedNetwork,
    switchToRequiredNetwork,
  } = guard;

  const handleSwitchNetwork = async () => {
    try {
      await switchToRequiredNetwork();
      toast.success('Your Privy secure account is ready to use.');
    } catch (error) {
      toast.error('Unable to prepare your Privy secure account', {
        description: getWalletErrorMessage(error),
      });
    }
  };

  if (!hasRegisteredWallet) {
    return (
      <div className="investor-token-wallet-gate is-warning">
        <ShieldAlert size={18} />
        <div>
          <strong>We could not load your Privy secure account</strong>
          <p>Refresh this page before you {actionLabel}. Your secure account is required to protect this action.</p>
        </div>
      </div>
    );
  }

  if (!wallet.isConnected) {
    return (
      <div className="investor-token-wallet-gate is-warning">
        <WalletCards size={18} />
        <div className="investor-token-wallet-gate__content">
          <strong>Your Privy secure account is not ready</strong>
          <p>Open your secure account below to restore access before you {actionLabel}.</p>
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
          <strong>Your approved secure account is required</strong>
          <p>The active account does not match the Privy secure account approved for this investment. Open your account details below to continue safely.</p>
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
          <strong>This investment is temporarily unavailable</strong>
          <p>Your Privy secure account cannot be prepared for this action right now. Please try again later or contact support.</p>
        </div>
      </div>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <div className="investor-token-wallet-gate is-warning">
        <Network size={18} />
        <div className="investor-token-wallet-gate__content">
          <strong>Your secure account needs a quick setup check</strong>
          <p>Prepare your Privy secure account before you {actionLabel}. This does not move funds or submit an investment.</p>
          <Button
            variant="secondary"
            className="investor-token-wallet-gate__switch"
            icon={wallet.switchingChainId === targetChainId ? RefreshCcw : Network}
            loading={wallet.switchingChainId === targetChainId}
            disabled={wallet.isBusy}
            onClick={handleSwitchNetwork}
          >
            Prepare secure account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="investor-token-wallet-gate is-success">
      <CheckCircle2 size={18} />
      <div className="investor-token-wallet-gate__content">
        <strong>Privy secure account ready</strong>
        <p>Your secure account is linked to your T-REX profile and ready for this action.</p>
        <div className="investor-token-wallet-gate__control">
          <WalletControl expanded context="investor" purpose="registered-action" />
        </div>
      </div>
    </div>
  );
}
