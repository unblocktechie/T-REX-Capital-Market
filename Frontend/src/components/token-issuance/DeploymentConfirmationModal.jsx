import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AddressDisplay, HelpDetails, InfoCallout } from './IssuancePrimitives';

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

  const requiredChecks = (data.identityClaims?.claimTopics || [])
    .filter((topic) => topic.enabled)
    .map((topic) => {
      if (topic.id === 'kyc') return 'Identity verification';
      if (topic.id === 'accredited') return 'Accredited investor status';
      return topic.shortName || topic.name;
    })
    .filter(Boolean);

  const blockedCountries = (data.compliance?.countries || [])
    .map((country) => country?.countryName || country?.label || String(country || ''))
    .filter(Boolean);
  const requiresPriceConfirmation = Boolean(String(data.supplyPricing?.initialPrice || '').trim());
  const walletActionCount = requiresPriceConfirmation ? 3 : 2;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create your investment asset"
      className="issuance-confirmation-modal"
      bodyClassName="issuance-confirmation-modal__body"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            icon={ArrowRight}
            onClick={onConfirm}
            disabled={!acknowledged}
            loading={loading}
          >
            Confirm securely with Privy
          </Button>
        </>
      }
    >
      <div className="issuance-modal-stack">
        <InfoCallout title="You are creating one asset" tone="warning" icon={AlertTriangle}>
          Privy will ask you to confirm {walletActionCount} setup actions, one at a time. These actions create one asset. Review any fee shown before you confirm each action.
        </InfoCallout>

        <div className="issuance-wallet-transactions" aria-label="Actions you will approve">
          <strong>What will happen next</strong>
          <ol>
            <li>
              <span aria-hidden="true">1</span>
              <div>
                <b>Create the asset</b>
                <p>
                  Creates the asset using the investor requirements and investment rules you reviewed.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">2</span>
              <div>
                <b>Turn on approved transfers</b>
                <p>
                  Allows approved investors to receive and transfer the asset according to your rules.
                </p>
              </div>
            </li>
            {requiresPriceConfirmation ? (
              <li>
                <span aria-hidden="true">3</span>
                <div>
                  <b>Confirm the asset price</b>
                  <p>
                    Makes the price you reviewed available for purchases and redemptions.
                  </p>
                </div>
              </li>
            ) : null}
          </ol>
        </div>

        <section className="issuance-confirmation-summary" aria-label="Asset summary">
          <div>
            <small>Asset</small>
            <strong>
              {data.tokenInformation.name || '—'} ({data.tokenInformation.symbol || '—'})
            </strong>
          </div>
          <div>
            <small>Investor checks</small>
            <strong>{requiredChecks.length ? requiredChecks.join(', ') : 'None selected'}</strong>
          </div>
          <div>
            <small>Maximum investors</small>
            <strong>{data.compliance.maximumInvestors || 'Not configured'}</strong>
          </div>
          <div>
            <small>Maximum amount per investor</small>
            <strong>
              {data.compliance.maximumBalance
                ? `${data.compliance.maximumBalance} units`
                : 'Not configured'}
            </strong>
          </div>
          <div>
            <small>Countries blocked</small>
            <strong>{blockedCountries.length ? blockedCountries.join(', ') : 'None'}</strong>
          </div>
        </section>

        <HelpDetails title="View technical details">
          <dl className="issuance-review-list issuance-review-list--technical">
            <div>
              <dt>Network</dt>
              <dd>{wallet.chain?.name || data.tokenInformation.network || '—'}</dd>
            </div>
            <div>
              <dt>Decimal places</dt>
              <dd>{data.tokenInformation.decimals || '—'}</dd>
            </div>
          </dl>
          <AddressDisplay
            label="Approved organization account"
            address={data.tokenInformation.treasuryWallet}
          />
          <AddressDisplay label="Connected account" address={wallet.address} />
        </HelpDetails>

        <label className="issuance-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            <strong>I have reviewed these settings and confirm this is the approved organization secure account.</strong>
            <small>
              Privy will ask me to confirm {walletActionCount} setup actions. I can review any fee before I confirm each action.
            </small>
          </span>
        </label>

        <div className="issuance-confirmation-security-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Each step is recorded only after it is securely confirmed.</span>
        </div>
      </div>
    </Modal>
  );
}
