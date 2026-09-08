import { AlertTriangle, Rocket } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AddressDisplay, InfoCallout } from './IssuancePrimitives';

export function DeploymentConfirmationModal({ open, onClose, onConfirm, data, wallet, loading }) {
  const [acknowledged, setAcknowledged] = useState(false);

  const close = () => {
    if (loading) return;
    setAcknowledged(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Confirm token deployment"
      className="issuance-confirmation-modal"
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
            Confirm and Deploy
          </Button>
        </>
      }
    >
      <div className="issuance-modal-stack">
        <InfoCallout title="Final authorization" tone="warning" icon={AlertTriangle}>
          Review the immutable settings below. Your wallet will be asked to authorize the
          deployment.
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
            <dt>Estimated fee</dt>
            <dd>
              {wallet.isConnected
                ? 'Calculated by the wallet before confirmation'
                : 'Available after wallet connection'}
            </dd>
          </div>
        </dl>
        <AddressDisplay
          label="Treasury wallet"
          address={data.tokenInformation.treasuryWallet}
        />
        <AddressDisplay label="Connected wallet" address={wallet.address} />
        <div className="issuance-immutable-list">
          <strong>Important immutable settings</strong>
          <ul>
            <li>Token name, symbol and decimals</li>
            <li>Initial identity and compliance infrastructure</li>
            <li>Selected deployment network</li>
          </ul>
        </div>
        <label className="issuance-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I understand that certain token parameters cannot be changed after deployment.
          </span>
        </label>
      </div>
    </Modal>
  );
}
