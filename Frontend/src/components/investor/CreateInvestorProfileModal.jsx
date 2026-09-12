import {
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { shortenWalletAddress } from '@/utils/wallet';

export function CreateInvestorProfileModal({
  open,
  onClose,
  onConfirm,
  loading,
  loadingMessage,
  error,
  walletAddress,
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
      title="Create your investor profile"
      className="investor-profile-dialog sm:max-w-2xl"
      trapFocus
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={onConfirm}
            loading={loading}
            disabled={!walletAddress || !confirmed || !ready}
          >
            {profileCreated ? 'Complete profile setup' : 'Create my profile'}
          </Button>
        </>
      }
    >
      <div className="investor-profile-modal">
        <div className="investor-profile-modal__intro investor-profile-modal__intro--stacked">
          <span><ShieldCheck size={22} /></span>
          <div>
            <p>We’ll create your investor profile and link it to your Privy secure account.</p>
            <p>Your Privy account is already linked to your T-REX profile and is ready to use.</p>

            <h3>What happens next?</h3>
            <ul>
              <li>Your investor profile will be created and linked to your Privy secure account.</li>
              <li>You will use your Privy secure account to review and confirm investments.</li>
              <li>Your basic profile information will be locked to maintain a consistent investor identity.</li>
              <li>You can upload or update your verification documents at any time.</li>
              <li>Each issuer reviews and approves verification documents independently before allowing you to invest.</li>
            </ul>
          </div>
        </div>

        <section className="investor-profile-modal__section" aria-labelledby="investor-primary-wallet-heading">
          <h3 id="investor-primary-wallet-heading">Privy secure account</h3>
          <div className="investor-profile-wallet">
            <div className="investor-profile-wallet__title">
              <span><WalletCards size={21} /></span>
              <div>
                <small>Securely managed by Privy</small>
                <strong>Your Privy account is linked to your T-REX profile</strong>
              </div>
              <em><CheckCircle2 size={14} /> Ready</em>
            </div>
            <p className="investor-profile-wallet__notice">
              You do not need to connect another account. Your Privy secure account is already set up and ready to use.
            </p>
            <details className="investor-profile-wallet__notice">
              <summary>View Privy wallet details</summary>
              <span className="mt-2 block break-all font-mono text-xs" title={walletAddress}>
                {shortenWalletAddress(walletAddress, 9, 9)}
              </span>
            </details>
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
              <strong>I confirm that I want to create my investor profile and link it to my Privy secure account.</strong>{' '}
              I understand that I will use this secure account to review and confirm investments in T-REX.
            </span>
          </label>
        </section>

        <section className="investor-profile-modal__good-to-know" aria-labelledby="investor-good-to-know-heading">
          <span><Info size={19} /></span>
          <div>
            <h3 id="investor-good-to-know-heading">Good to Know</h3>
            <p>You do not need to connect another account for this step.</p>
            <p>
              Privy helps keep your secure account protected while you use T-REX. When an investment or other important action needs your approval, you will be asked to review and confirm it.
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
