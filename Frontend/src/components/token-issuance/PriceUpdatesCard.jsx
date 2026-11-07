import { AlertCircle, Check, Info, Settings2, ShieldCheck, Trash2, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useEffect, useState } from 'react';
import { FieldWrapper, TextInput, Toggle } from '@/components/token-issuance/IssuancePrimitives';
import { ROUTES } from '@/config/routes';

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const Feature = ({ children }) => (
  <li>
    <span className="price-updates-feature__icon" aria-hidden="true">
      <Check size={12} strokeWidth={3} />
    </span>
    <span>{children}</span>
  </li>
);

export function PriceUpdatesCard({
  disabled = false,
  serviceWalletEnabled: controlledServiceWalletEnabled,
  serviceWalletAddress: controlledServiceWalletAddress,
  onServiceWalletEnabledChange,
  onServiceWalletAddressChange,
  serviceWalletAlwaysEnabled = false,
  botConfigurationLink = `${ROUTES.issuerApiKeys}?tab=api-keys`,
  walletFieldId = 'service-wallet-address',
  currentServiceWalletAddress = '',
  serviceWalletSubmitting = false,
  serviceWalletRevoking = false,
  serviceWalletExternalError = '',
  serviceWalletSuccessMessage = '',
  serviceWalletNeedsSync = false,
  serviceWalletNetworkMismatch = false,
  onServiceWalletSubmit,
  onServiceWalletRevoke,
}) {
  const [localServiceWalletEnabled, setLocalServiceWalletEnabled] = useState(false);
  const [localServiceWalletAddress, setLocalServiceWalletAddress] = useState('');
  const [editingServiceWallet, setEditingServiceWallet] = useState(false);
  const serviceWalletEnabled = serviceWalletAlwaysEnabled
    ? true
    : controlledServiceWalletEnabled ?? localServiceWalletEnabled;
  const serviceWalletAddress = controlledServiceWalletAddress ?? localServiceWalletAddress;
  const [serviceWalletTouched, setServiceWalletTouched] = useState(false);

  const trimmedAddress = serviceWalletAddress.trim();
  const localServiceWalletError =
    serviceWalletEnabled &&
    serviceWalletTouched &&
    trimmedAddress &&
    !EVM_ADDRESS_PATTERN.test(trimmedAddress)
      ? 'Enter a valid 0x wallet address (42 characters).'
      : undefined;
  const serviceWalletError = serviceWalletExternalError || localServiceWalletError;
  const normalizedCurrentServiceWallet = String(currentServiceWalletAddress || '').trim().toLowerCase();
  const serviceWalletChanged = Boolean(
    trimmedAddress && normalizedCurrentServiceWallet !== trimmedAddress.toLowerCase(),
  );
  const serviceWalletActionLabel = serviceWalletNeedsSync
    ? 'Sync Service Wallet'
    : currentServiceWalletAddress
      ? 'Save New Service Wallet'
      : 'Register Service Wallet';

  useEffect(() => {
    // Registration and revocation change the authoritative address. Clear the
    // previous input's validation state so an empty post-revocation field is
    // presented as a fresh, untouched field.
    setEditingServiceWallet(false);
    setServiceWalletTouched(false);
  }, [currentServiceWalletAddress]);

  const handleToggle = (enabled) => {
    if (controlledServiceWalletEnabled === undefined) {
      setLocalServiceWalletEnabled(enabled);
    }
    onServiceWalletEnabledChange?.(enabled);
    if (!enabled) setServiceWalletTouched(false);
  };

  const handleAddressChange = (value) => {
    if (!String(value || '').trim()) setServiceWalletTouched(false);
    if (controlledServiceWalletAddress === undefined) {
      setLocalServiceWalletAddress(value);
    }
    onServiceWalletAddressChange?.(value);
  };

  const handleServiceWalletSubmit = () => {
    setServiceWalletTouched(true);
    if (!EVM_ADDRESS_PATTERN.test(trimmedAddress) || serviceWalletSubmitting || serviceWalletRevoking) return;
    onServiceWalletSubmit?.(trimmedAddress);
  };

  const beginServiceWalletChange = () => {
    setServiceWalletTouched(false);
    setEditingServiceWallet(true);
  };

  const cancelServiceWalletChange = () => {
    setServiceWalletTouched(false);
    setEditingServiceWallet(false);
    handleAddressChange(currentServiceWalletAddress || '');
  };

  return (
    <section className={`price-updates-card issuance-field--full${serviceWalletAlwaysEnabled ? ' price-updates-card--asset-settings' : ''}`}
      aria-labelledby={!serviceWalletAlwaysEnabled ? 'price-updates-title' : undefined}
      aria-label={serviceWalletAlwaysEnabled ? 'Automatic price update settings' : undefined}>
      {!serviceWalletAlwaysEnabled ? (
        <header className="price-updates-card__header">
          <span className="price-updates-card__header-icon" aria-hidden="true"><Settings2 size={19} /></span>
          <div>
            <h3 id="price-updates-title">Price Updates</h3>
            <p>Choose how this asset price can be updated. Manual updates always stay available, and automated updates are optional.</p>
          </div>
        </header>
      ) : null}

      <div className="price-updates-card__options">
        <article className="price-update-option price-update-option--manual">
          <div className="price-update-option__summary">
            <span className="price-update-option__icon price-update-option__icon--manual" aria-hidden="true">
              <WalletCards size={19} />
            </span>
            <div>
              <div className="price-update-option__title-row">
                <h4>Manual Updates</h4>
                <span className="price-updates-badge price-updates-badge--success">Always available</span>
              </div>
              <p>
                Update the token price from the platform whenever needed. Each update requires your
                approved organization wallet signature.
              </p>
            </div>
          </div>

          <ul className="price-update-option__features" aria-label="Manual price update benefits">
            <Feature>Available for every token</Feature>
            <Feature>Update the price from the platform</Feature>
            <Feature>Wallet confirmation for each update</Feature>
            <Feature>You remain in full control</Feature>
          </ul>
        </article>

        <article
          className={`price-update-option price-update-option--automated${serviceWalletEnabled ? ' is-enabled' : ''}`}
        >
          <div className="price-update-option__summary price-update-option__summary--automated">
            <span className="price-update-option__icon price-update-option__icon--automated" aria-hidden="true">
              <Settings2 size={19} />
            </span>
            <div>
              <div className="price-update-option__title-row">
                <h4>{serviceWalletAlwaysEnabled ? 'Automatic Price Updates' : 'Automated Price Updates'}</h4>
                <span className="price-updates-badge">
                  {serviceWalletAlwaysEnabled
                    ? currentServiceWalletAddress
                      ? 'Configured'
                      : 'Not configured'
                    : 'Optional'}
                </span>
              </div>
              <p>
                {serviceWalletAlwaysEnabled
                  ? 'Allow your prices to update automatically using an authorized Service Wallet.'
                  : 'Enable a Service Wallet so your backend or pricing system can submit price updates through your API workflow.'}
              </p>

              <div className="price-updates-inline-note">
                <Info size={15} aria-hidden="true" />
                <span>
                  {serviceWalletAlwaysEnabled
                    ? 'You can still update prices manually at any time.'
                    : 'Manual updates remain available even when the Service Wallet option is enabled.'}
                </span>
              </div>
            </div>
          </div>

          <div className="price-update-option__controls">
            {!serviceWalletAlwaysEnabled ? (
              <Toggle
                checked={serviceWalletEnabled}
                onChange={handleToggle}
                label="Enable Service Wallet"
                description="Allow an authorized wallet to support automated price updates."
                disabled={disabled}
              />
            ) : null}

            {!serviceWalletAlwaysEnabled && !serviceWalletEnabled ? (
              <>
                <div className="price-updates-deferred-note" role="note">
                  <Info size={16} aria-hidden="true" />
                  <span>
                    {currentServiceWalletAddress ? (
                      <>
                        <strong>Stop automated authorization?</strong>{' '}
                        Saving with Service Wallet disabled will revoke the on-chain registration. Your issuer API keys remain unchanged.
                      </>
                    ) : (
                      <>
                        <strong>Not ready to automate yet?</strong>{' '}
                        You can enable Service Wallet at any time after token creation.
                      </>
                    )}
                  </span>
                </div>
                {serviceWalletExternalError ? (
                  <div className="price-updates-service-wallet__error-note" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{serviceWalletExternalError}</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {serviceWalletEnabled ? (
              <div className="price-updates-service-wallet is-enabled">
                {serviceWalletAlwaysEnabled && (onServiceWalletSubmit || onServiceWalletRevoke) ? (
                  <div className="price-updates-service-wallet__setup-heading price-updates-service-wallet__setup-heading--simple">
                    <div className="price-updates-service-wallet__step-label">
                      <strong>1. Service Wallet</strong>
                      <span className={`price-updates-service-wallet__status${currentServiceWalletAddress ? '' : ' is-pending'}`}>
                        {currentServiceWalletAddress ? 'Registered' : 'Setup needed'}
                      </span>
                    </div>
                    <p>
                      {currentServiceWalletAddress
                        ? 'This wallet is registered to approve automatic price updates for this token.'
                        : 'Register a wallet to approve automatic price updates for this token.'}
                    </p>
                    {serviceWalletNetworkMismatch ? (
                      <div className="price-updates-service-wallet__mismatch" role="alert">
                        <AlertCircle size={15} aria-hidden="true" />
                        <span>The on-chain wallet and the saved registration do not match. Refresh the registration before using automatic updates.</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <FieldWrapper
                  label="Service wallet address"
                  required
                  error={serviceWalletError}
                  hint={onServiceWalletSubmit
                    ? onServiceWalletRevoke && currentServiceWalletAddress
                      ? 'This address is currently authorized for automatic price updates.'
                      : 'This public address is registered on-chain. Its private key is never sent to the platform.'
                    : 'This wallet would be authorized for automated price-update requests.'}
                  htmlFor={walletFieldId}
                >
                  <TextInput
                    id={walletFieldId}
                    value={serviceWalletAddress}
                    onChange={(event) => handleAddressChange(event.target.value)}
                    onBlur={() => setServiceWalletTouched(true)}
                    placeholder="0x…"
                    spellCheck="false"
                    autoComplete="off"
                    error={serviceWalletError}
                    disabled={
                      disabled ||
                      serviceWalletSubmitting ||
                      serviceWalletRevoking ||
                      (serviceWalletAlwaysEnabled && Boolean(currentServiceWalletAddress) && !editingServiceWallet && !serviceWalletNeedsSync)
                    }
                  />
                </FieldWrapper>
                {(onServiceWalletSubmit || onServiceWalletRevoke) ? (
                  <div className="price-updates-service-wallet__actions">
                    <div className="price-updates-service-wallet__current">
                      {currentServiceWalletAddress ? (
                        editingServiceWallet ? (
                          <span>Current registration: <code>{currentServiceWalletAddress}</code></span>
                        ) : (
                          <span className="price-updates-service-wallet__current-status">
                            <Check size={14} aria-hidden="true" /> Current registration is active on this network.
                          </span>
                        )
                      ) : (
                        <span>No Service Wallet is registered on this network yet.</span>
                      )}
                      {serviceWalletSuccessMessage ? (
                        <span className="price-updates-service-wallet__success" role="status">
                          <Check size={14} aria-hidden="true" /> {serviceWalletSuccessMessage}
                        </span>
                      ) : null}
                    </div>
                    <div className="price-updates-service-wallet__buttons">
                      {onServiceWalletRevoke && currentServiceWalletAddress ? (
                        <Button
                          variant="danger"
                          size="sm"
                          icon={Trash2}
                          onClick={onServiceWalletRevoke}
                          disabled={disabled || serviceWalletSubmitting || serviceWalletRevoking}
                        >
                          Remove Wallet Access
                        </Button>
                      ) : null}
                      {onServiceWalletSubmit ? (
                        currentServiceWalletAddress && !editingServiceWallet && !serviceWalletNeedsSync ? (
                          <Button
                            size="sm"
                            className="price-updates-service-wallet__change-button"
                            onClick={beginServiceWalletChange}
                            disabled={disabled || serviceWalletSubmitting || serviceWalletRevoking}
                          >
                            Change Service Wallet
                          </Button>
                        ) : (
                          <>
                            {currentServiceWalletAddress && editingServiceWallet && !serviceWalletNeedsSync ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={cancelServiceWalletChange}
                                disabled={disabled || serviceWalletSubmitting || serviceWalletRevoking}
                              >
                                Cancel
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              onClick={handleServiceWalletSubmit}
                              loading={serviceWalletSubmitting}
                              disabled={
                                disabled ||
                                serviceWalletSubmitting ||
                                serviceWalletRevoking ||
                                !EVM_ADDRESS_PATTERN.test(trimmedAddress) ||
                                (Boolean(currentServiceWalletAddress) && !serviceWalletChanged && !serviceWalletNeedsSync)
                              }
                            >
                              {serviceWalletActionLabel}
                            </Button>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                ) : null}

              </div>
            ) : null}

            {serviceWalletAlwaysEnabled ? (
              <section className="price-updates-bot-setup" aria-labelledby="price-updates-bot-title">
                <div className="price-updates-bot-setup__heading">
                  <h4 id="price-updates-bot-title">2. Bot Configuration</h4>
                  <span className="price-updates-bot-setup__status">Check setup</span>
                </div>
                <p>Set up API keys and approved IP addresses to run your bots. You can also add optional price limits and update schedules.</p>
                <Link className="button button--primary button--sm price-updates-bot-setup__cta" to={botConfigurationLink}>
                  <Settings2 size={15} aria-hidden="true" /> Configure Bot
                </Link>
              </section>
            ) : null}

            {serviceWalletAlwaysEnabled ? (
              <div className="price-updates-benefits">
                <strong>Benefits</strong>
                <ul className="price-update-option__features price-update-option__features--compact" aria-label="Automatic price update benefits">
                  <Feature>Update prices automatically</Feature>
                  <Feature>Continue updating prices manually</Feature>
                  <Feature>No wallet signature needed for each automatic update</Feature>
                </ul>
              </div>
            ) : (
              <ul className="price-update-option__features price-update-option__features--compact" aria-label="Automated price update benefits">
                <Feature>Designed for backend and pricing-system workflows</Feature>
                <Feature>Manual price updates remain available</Feature>
                <Feature>No MetaMask signature needed for automated requests</Feature>
              </ul>
            )}

            <div className="price-updates-security-note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                Your organization is responsible for securely managing any Service Wallet you use.
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
