import { CheckCircle2, Network, WalletCards } from 'lucide-react';
import { WalletControl } from '@/components/wallet/WalletControl';

export function WalletCard({ wallet }) {
  if (!wallet.isConnected) {
    return (
      <div className="investor-wallet-card investor-wallet-card--empty">
        <span><WalletCards size={23} /></span>
        <div>
          <strong>Connect your primary investor wallet</strong>
          <p>The connected wallet will be verified and linked to the investor profile.</p>
        </div>
        <WalletControl context="investor" prominent expanded />
      </div>
    );
  }

  return (
    <div className="investor-wallet-card investor-wallet-card--connected">
      <div className="investor-wallet-card__heading">
        <span><WalletCards size={21} /></span>
        <div>
          <small>Primary investor wallet</small>
          <strong title={wallet.address}>{wallet.displayAddress}</strong>
        </div>
        <em className={wallet.isCorrectNetwork ? 'is-ready' : 'is-warning'}>
          <CheckCircle2 size={14} />
          {wallet.isCorrectNetwork ? 'Ready' : 'Switch network'}
        </em>
      </div>

      <dl>
        <div>
          <dt><Network size={14} /> Network</dt>
          <dd>{wallet.network}</dd>
        </div>
        <div>
          <dt>Available balance</dt>
          <dd>{wallet.balance}</dd>
        </div>
      </dl>

      <p className="investor-wallet-card__note">
        {wallet.isCorrectNetwork
          ? 'Wallet ownership is confirmed and ready for investor profile creation.'
          : 'Open the wallet control in the header and switch to the required network before continuing.'}
      </p>
    </div>
  );
}
