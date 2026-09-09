import {
  AlertCircle,
  CheckCircle2,
  Info,
  Network,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function CreateInvestorProfileModal({
  open,
  onClose,
  onConfirm,
  loading,
  loadingMessage,
  error,
  wallet,
  ready,
  profileCreated,
}) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={() => { if (!loading) onClose(); }}
      title="Create Your Investor Profile"
      className="investor-profile-dialog sm:max-w-2xl"
      trapFocus
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={onConfirm}
            loading={loading}
            disabled={!wallet.isConnected || !wallet.isCorrectNetwork || !confirmed || !ready}
          >
            {profileCreated ? 'Complete Profile Setup' : 'Create Investor Profile'}
          </Button>
        </>
      }
    >
      <div className="investor-profile-modal">
        <div className="investor-profile-modal__intro investor-profile-modal__intro--stacked">
          <span><ShieldCheck size={22} /></span>
          <div>
            <p>You're about to create your investor profile and your on-chain identity (ONCHAINID).</p>
            <p>Your primary wallet will be linked to your investor profile and used whenever you participate in token offerings.</p>

            <h3>What happens after creation?</h3>
            <ul>
              <li>Your investor profile and ONCHAINID will be created.</li>
              <li>Your primary wallet will be permanently linked to this investor profile.</li>
              <li>Your basic profile information will be locked to maintain a consistent investor identity.</li>
              <li>You can upload or update your verification documents at any time.</li>
              <li>Each issuer reviews and approves verification documents independently before allowing you to invest.</li>
            </ul>
          </div>
        </div>

        <section className="investor-profile-modal__section" aria-labelledby="investor-primary-wallet-heading">
          <h3 id="investor-primary-wallet-heading">Primary Wallet</h3>
          <div className="investor-profile-wallet">
            <div className="investor-profile-wallet__title">
              <span><WalletCards size={21} /></span>
              <div>
                <small>Wallet</small>
                <strong title={wallet.address}>{wallet.displayAddress || wallet.address || 'Wallet unavailable'}</strong>
              </div>
              <em><CheckCircle2 size={14} /> Connected</em>
            </div>
            <dl>
              <div><dt>Wallet</dt><dd title={wallet.address}>{wallet.address || 'Unavailable'}</dd></div>
              <div><dt>Balance</dt><dd>{wallet.balance || 'Unavailable'}</dd></div>
              <div><dt><Network size={14} /> Network</dt><dd>{wallet.network || 'Unavailable'}</dd></div>
            </dl>
            <p className="investor-profile-wallet__notice">
              Make sure you control this wallet. It will represent your investor identity and be used for future token subscriptions.
            </p>
          </div>
        </section>

        <section className="investor-profile-modal__section" aria-labelledby="investor-confirmation-heading">
          <h3 id="investor-confirmation-heading">Confirmation</h3>
          <label className="investor-confirmation-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={loading}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              <strong>I confirm that I own and control this wallet.</strong>{' '}
              I understand it will be permanently linked to my investor profile and ONCHAINID.
            </span>
          </label>
        </section>

        <section className="investor-profile-modal__good-to-know" aria-labelledby="investor-good-to-know-heading">
          <span><Info size={19} /></span>
          <div>
            <h3 id="investor-good-to-know-heading">Good to Know</h3>
            <p>You don't need to complete verification today.</p>
            <p>
              After creating your profile, you can return anytime to upload or update verification documents. Your documents are securely stored and can be reused when applying to invest, subject to each issuer's approval requirements.
            </p>
          </div>
        </section>

        {error ? (
          <div className="investor-modal-error" role="alert">
            <AlertCircle size={19} />
            <div><strong>Action could not be completed</strong><p>{error}</p></div>
          </div>
        ) : null}

        {loadingMessage ? <p className="investor-modal-live" role="status" aria-live="polite">{loadingMessage}</p> : null}
      </div>
    </Modal>
  );
}
