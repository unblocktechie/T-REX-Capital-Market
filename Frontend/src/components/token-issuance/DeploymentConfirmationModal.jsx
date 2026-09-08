import { AlertTriangle, Rocket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AddressDisplay, InfoCallout } from './IssuancePrimitives';

export function DeploymentConfirmationModal({ open, onClose, onConfirm, data, wallet, loading }) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) setAcknowledged(false);
  }, [open]);

  const close = () => {
    if (loading) return;
    setAcknowledged(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Confirm T-REX deployment"
      className="issuance-confirmation-modal"
      bodyClassName="issuance-confirmation-modal__body"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            icon={Rocket}
            onClick={onConfirm}
            disabled={!acknowledged}
            loading={loading}
          >
            Continue to Wallet
          </Button>
        </>
      }
    >
      <div className="issuance-modal-stack">
        <InfoCallout title="Wallet signature required" tone="warning" icon={AlertTriangle}>
          Your connected issuer wallet will open to sign the T-REX Gateway transaction and pay the
          Sepolia gas fee. The backend submit API is called only after Sepolia confirms the
          transaction and returns a valid transaction hash.
        </InfoCallout>
        <dl className="issuance-review-list">
          <div>
            <dt>Token</dt>
            <dd>
              {data.tokenInformation.name || '—'} ({data.tokenInformation.symbol || '—'})
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{wallet.chain?.name || data.tokenInformation.network || '—'}</dd>
          </div>
          <div>
            <dt>Decimals</dt>
            <dd>{data.tokenInformation.decimals || '—'}</dd>
          </div>
          <div>
            <dt>Maximum holder balance</dt>
            <dd>
              {data.compliance.maximumBalance
                ? `${data.compliance.maximumBalance} tokens (${data.tokenInformation.decimals || 0} decimals)`
                : 'Not configured'}
            </dd>
          </div>
        </dl>
        <AddressDisplay
          label="Approved organization wallet"
          address={data.tokenInformation.treasuryWallet}
        />
        <AddressDisplay label="Connected wallet" address={wallet.address} />
        <div className="issuance-immutable-list">
          <strong>On-chain deployment creates</strong>
          <ul>
            <li>ERC-3643 token and identity registry contracts</li>
            <li>Claim topic and trusted issuer registries</li>
            <li>Modular compliance with the selected restrictions</li>
          </ul>
        </div>
        <label className="issuance-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I confirm the connected wallet is the approved issuer wallet and understand the
            deployment settings become immutable after the transaction is confirmed.
          </span>
        </label>
      </div>
    </Modal>
  );
}
