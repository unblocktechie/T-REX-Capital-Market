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
      title="Confirm token creation"
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
            Start Wallet Confirmations
          </Button>
        </>
      }
    >
      <div className="issuance-modal-stack">
        <InfoCallout title="Two MetaMask confirmations are required" tone="warning" icon={AlertTriangle}>
          These are two separate blockchain actions. MetaMask will show one confirmation at a time,
          and each confirmed transaction has its own Sepolia gas fee.
        </InfoCallout>
        <div className="issuance-wallet-transactions" aria-label="Required wallet transactions">
          <strong>What you will approve</strong>
          <ol>
            <li>
              <span aria-hidden="true">1</span>
              <div>
                <b>Create your security token</b>
                <p>
                  Creates the token and the compliance, identity, and registry contracts needed for
                  your regulated offering.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">2</span>
              <div>
                <b>Activate token transfers</b>
                <p>
                  Unpauses the new token so eligible investors can receive and transfer it after
                  deployment.
                </p>
              </div>
            </li>
          </ol>
        </div>
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
        <label className="issuance-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I confirm the connected wallet is the approved issuer wallet and understand that
            MetaMask will request two separate transaction approvals.
          </span>
        </label>
      </div>
    </Modal>
  );
}
