import {
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { PrivyMark, PrivyTrustBadge } from '@/components/branding/PrivyBrand';
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
            Create my profile
          </Button>
        </>
      }
    >
      <div className="investor-profile-modal">
        <div className="investor-profile-modal__intro investor-profile-modal__intro--stacked">
          <span><ShieldCheck size={22} /></span>
          <div>
            <p>Your Privy secure account is ready. It is linked to your T-REX account and helps keep your investments safe.</p>

            <h3>What happens next?</h3>
            <ul>
              <li>We’ll set up your investor profile.</li>
              <li>You’ll use your Privy account to confirm investments securely.</li>
              <li>Your basic profile details will stay linked to your account for your protection.</li>
              <li>You can add or update your documents at any time.</li>
              <li>Each investment provider will review your documents before you can invest.</li>
            </ul>
          </div>
        </div>

        <section className="investor-profile-modal__section" aria-labelledby="investor-primary-wallet-heading">
          <h3 id="investor-primary-wallet-heading">Your Privy secure account</h3>
          <PrivyTrustBadge compact tone="soft" label="Investor embedded wallet" className="mb-3" />
          <div className="investor-profile-wallet">
            <div className="investor-profile-wallet__title">
              <span><PrivyMark size={22} /></span>
              <div>
                <small>PRIVY SECURE ACCOUNT</small>
                <strong className="break-all font-mono" title={walletAddress}>
                  {shortenWalletAddress(walletAddress, 9, 9)}
                </strong>
              </div>
              <em><CheckCircle2 size={14} /> Verified</em>
            </div>
            <p className="investor-profile-wallet__notice">
              You do not need to connect another account. This secure account was set up when you confirmed your email.
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
              <strong>I understand that my Privy secure account will be used to confirm my investments.</strong>
            </span>
          </label>
        </section>

        <section className="investor-profile-modal__good-to-know" aria-labelledby="investor-good-to-know-heading">
          <span><Info size={19} /></span>
          <div>
            <h3 id="investor-good-to-know-heading">Good to know</h3>
            <p>
              Privy helps protect your account. When you choose to invest, Privy will ask you to review and confirm the details.
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
