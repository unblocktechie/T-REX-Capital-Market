import { AlertCircle, CheckCircle2, Network, ShieldCheck, WalletCards } from 'lucide-react';
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
      title="Create Investor Profile"
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
        <div className="investor-profile-modal__intro">
          <span><ShieldCheck size={22} /></span>
          <div>
            <p>Your verified identity details and connected wallet will be linked to the investor profile.</p>
            <ul>
              <li>An ONCHAINID-style identity reference will be created for this frontend flow.</li>
              <li>Uploaded documents are saved with your completed investor profile.</li>
              <li>Your investor dashboard becomes available as soon as the profile is created.</li>
            </ul>
          </div>
        </div>

        <div className="investor-profile-wallet">
          <div className="investor-profile-wallet__title">
            <span><WalletCards size={21} /></span>
            <div>
              <small>Primary investor wallet</small>
              <strong title={wallet.address}>{wallet.displayAddress || wallet.address || 'Wallet unavailable'}</strong>
            </div>
            <em><CheckCircle2 size={14} /> Verified</em>
          </div>
          <p>This wallet will be used as the ownership reference for the investor profile.</p>
          <dl>
            <div><dt>Wallet Address</dt><dd title={wallet.address}>{wallet.address || 'Unavailable'}</dd></div>
            <div><dt><Network size={14} /> Network</dt><dd>{wallet.network || 'Unavailable'}</dd></div>
            <div><dt>Available Balance</dt><dd>{wallet.balance || 'Unavailable'}</dd></div>
          </dl>
        </div>

        {error ? (
          <div className="investor-modal-error" role="alert">
            <AlertCircle size={19} />
            <div><strong>Action could not be completed</strong><p>{error}</p></div>
          </div>
        ) : null}

        {loadingMessage ? <p className="investor-modal-live" role="status" aria-live="polite">{loadingMessage}</p> : null}

        <label className="investor-confirmation-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={loading}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>I confirm that I own and control this wallet and understand that it will be linked to my investor profile.</span>
        </label>
      </div>
    </Modal>
  );
}
