import { CheckCircle2, Network, WalletCards } from 'lucide-react';
import { WalletControl } from '@/components/wallet/WalletControl';

export function WalletCard({ wallet }) {
  if (!wallet.isConnected) {
    return (
      <div className="investor-wallet-card investor-wallet-card--empty">
        <span><WalletCards size={23} /></span>
        <div>
          <strong>Prepare your Privy secure account</strong>
          <p>Privy securely manages this account and links it to your investor profile.</p>
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
          <small>Privy secure account</small>
          <strong>Securely managed by Privy</strong>
        </div>
        <em className={wallet.isCorrectNetwork ? 'is-ready' : 'is-warning'}>
          <CheckCircle2 size={14} />
          {wallet.isCorrectNetwork ? 'Ready' : 'Needs attention'}
        </em>
      </div>

      <dl>
        <div>
          <dt>Available balance</dt>
          <dd>{wallet.balance}</dd>
        </div>
      </dl>

      <p className="investor-wallet-card__note">
        {wallet.isCorrectNetwork
          ? 'Your Privy secure account is ready for investor profile creation.'
          : 'Open your Privy secure account in the header and follow the prompt before continuing.'}
      </p>

      <details className="investor-technical-details">
        <summary>View account details</summary>
        <dl>
          <div>
            <dt>Privy wallet address</dt>
            <dd title={wallet.address}>{wallet.displayAddress}</dd>
          </div>
          <div>
            <dt><Network size={14} /> Network</dt>
            <dd>{wallet.network}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
