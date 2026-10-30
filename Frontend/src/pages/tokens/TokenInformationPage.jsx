import { isTokenCreationLocked } from '@/utils/tokenCreationLock';
import { PaymentTokenSelect } from '@/components/token-issuance/PaymentTokenSelect';
import { usePaymentTokens } from '@/hooks/usePaymentTokens';
import { supportsPaymentAction, paymentContextOf } from '@/config/payment-tokens';
import { web3Config } from '@/config/web3';
import { ChainSelector } from '@/components/common/ChainSelector';
import { useMyChains } from '@/hooks/useChains';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import { TokenIcon } from '@/components/common/TokenIcon';
import { resolveMasterImageUrl } from '@/utils/masterImage';
import {
  FieldWrapper,
  HelpDetails,
  ImpactNote,
  SectionCard,
  TextareaInput,
  TextInput,
} from '@/components/token-issuance/IssuancePrimitives';
import { TokenLogoUploader } from '@/components/token-issuance/TokenLogoUploader';
import { SelectField } from '@/components/organization/OrganizationFields';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useAppNetwork } from '@/hooks/useAppNetwork';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { mapTokenApiFieldErrors, getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import {
  getDuplicateTokenFieldErrors,
  getDuplicateTokenMessage,
  isDuplicateTokenError,
} from '@/utils/tokenDuplicateProtection';
import {
  decimalStepFor,
  isDecimalInputWithinPrecision,
  normalizePaymentTokenDecimals,
  validateTokenInformation,
} from '@/utils/tokenIssuance';
import { tokenLogoToFile } from '@/utils/tokenLogo';
import { buildTokenIssuanceNetworkMismatchMessage } from '@/utils/tokenIssuanceNetwork';

const DECIMAL_OPTIONS = ['2', '6', '8', '18'].map((value) => ({ label: value, value }));

const normalizeTokenName = (value) => value.trim();

const INFORMATION_FIELD_MAP = {
  chainUid: 'chainUid',
  tokenName: 'name',
  tokenSymbol: 'symbol',
  decimals: 'decimals',
  initialTokenPrice: 'initialPrice',
  paymentTokenAddress: 'paymentTokenAddress',
  treasuryWalletAddress: 'treasuryWallet',
  tokenDescription: 'description',
  tokenImage: 'logo',
};

export default function TokenInformationPage() {
  const navigate = useNavigate();
  const appNetwork = useAppNetwork();
  const activeChainId = appNetwork.activeChainId;
  const { organization, isLoading: organizationLoading } = useOrganization();
  const data = useTokenIssuanceStore((state) => state.tokenInformation);
  const supplyPricing = useTokenIssuanceStore((state) => state.supplyPricing);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const updateSection = useTokenIssuanceStore((state) => state.updateSection);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const recordBackendSave = useTokenIssuanceStore((state) => state.recordBackendSave);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const userChains = useMyChains();
  const selectedChain = (userChains.data || []).find((item) => item.chainUid === data.chainUid) || web3Config.getChainRecordByUid(data.chainUid);
  const selectedAppChain = appNetwork.activeChain;
  const assetNetworkMismatch = Boolean(
    selectedChain?.chainUid &&
    appNetwork.activeChainUid &&
    selectedChain.chainUid !== appNetwork.activeChainUid,
  );
  const assetNetworkName = selectedChain?.chainName || data.network || 'the asset network';
  const appNetworkName = selectedAppChain?.chainName || 'the network selected in the navbar';
  const networkMismatchMessage = buildTokenIssuanceNetworkMismatchMessage({
    assetNetworkName,
    appNetworkName,
  });
  const catalogue = usePaymentTokens({ chainUid: data.chainUid, action: 'purchase', enabled: Boolean(data.chainUid) });
  const paymentOptions = (catalogue.data || []).filter((item) => supportsPaymentAction(item, 'create'));
  const selectedPayment = (catalogue.data || []).find((item) => item.contractAddress.toLowerCase() === String(supplyPricing.paymentTokenAddress || '').toLowerCase());
  const paymentSymbol = selectedPayment?.symbol || supplyPricing.currency || 'payment token';
  const paymentTokenImageUrl = resolveMasterImageUrl(selectedPayment);
  const paymentTokenDecimals = normalizePaymentTokenDecimals(
    selectedPayment?.decimals ?? supplyPricing.paymentTokenDecimals,
  );
  const priceStep = decimalStepFor(paymentTokenDecimals);
  const pricePrecisionHint = paymentTokenDecimals === 0
    ? 'Use whole numbers only.'
    : `Use at most ${paymentTokenDecimals} decimal place${paymentTokenDecimals === 1 ? '' : 's'}.`;
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const creationLocked = isTokenCreationLocked(backend, deployment);
  const paymentLocked = Boolean(supplyPricing.paymentTokenLocked || creationLocked);
  const organizationWallet = organization?.walletAddress || '';
  const errors = validateTokenInformation(data, supplyPricing, {
    requiredTreasuryWallet: organizationWallet,
    imageAvailable: backend.imageAvailable,
    paymentTokenDecimals,
  });
  useDocumentTitle('Asset Details');

  useEffect(() => {
    hydrateWalletDefaults(organizationWallet);
  }, [hydrateWalletDefaults, organizationWallet]);

  useEffect(() => {
    // Before the backend finishes hydrating a new setup, align the initial form
    // value with the application network. After hydration, the form selection is
    // intentionally independent so the issuer can choose a target network first.
    if (backend.hydrated || backend.tokenUid || creationLocked || !activeChainId || userChains.isPending) return;
    const preferred = (userChains.data || []).find(
      (chain) => chain.chainId === Number(activeChainId) && chain.isUnlocked,
    );
    if (!preferred || preferred.chainUid === data.chainUid) return;
    updateSection('tokenInformation', {
      chainUid: preferred.chainUid,
      chainId: preferred.chainId,
      network: preferred.chainName,
    });
    updateSection('supplyPricing', {
      paymentTokenAddress: '',
      paymentTokenDecimals: null,
      controllerAddress: preferred.platformControllerAddress || '',
      currency: '',
    });
  }, [activeChainId, backend.hydrated, backend.tokenUid, creationLocked, data.chainUid, updateSection, userChains.data, userChains.isPending]);

  useEffect(() => {
    if (organizationWallet && data.treasuryWallet !== organizationWallet) {
      updateSection('tokenInformation', { treasuryWallet: organizationWallet });
    }
  }, [data.treasuryWallet, organizationWallet, updateSection]);

  const fieldError = (name) =>
    serverErrors[name] || (submitted || touched[name] ? errors[name] : undefined);
  const clearServerError = (name) =>
    setServerErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  const updateToken = (name, value) => {
    clearServerError(name);
    updateSection('tokenInformation', { [name]: value });
  };
  const blur = (name) => setTouched((current) => ({ ...current, [name]: true }));

  const continueStep = async () => {
    if (saving || creationLocked) return;
    setSubmitted(true);
    setServerErrors({});
    markStepTouched('token-information');
    if (!selectedChain?.isUnlocked) {
      setServerErrors({ chainUid: 'Select an unlocked network before continuing.' });
      return;
    }
    if (assetNetworkMismatch) {
      setServerErrors({ chainUid: networkMismatchMessage });
      toast.error('Network selections do not match', {
        id: 'token-issuance-network-mismatch',
        description: networkMismatchMessage,
        duration: 10_000,
      });
      return;
    }
    if (!selectedPayment || !paymentOptions.includes(selectedPayment)) {
      setServerErrors({ paymentTokenAddress: 'Select an active payment token from the catalogue.' });
      return;
    }
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('chainUid', data.chainUid);
      formData.append('tokenName', data.name.trim());
      formData.append('tokenSymbol', data.symbol.trim().toUpperCase());
      formData.append('decimals', String(data.decimals));
      formData.append('initialTokenPrice', String(supplyPricing.initialPrice));
      formData.append('paymentTokenAddress', selectedPayment.contractAddress);
      formData.append('treasuryWalletAddress', data.treasuryWallet.trim());
      formData.append('tokenDescription', data.description.trim());
      formData.append('isDraft', 'false');
      if (data.logo?.dataUrl) {
        formData.append('tokenImage', await tokenLogoToFile(data.logo));
      } else if (!backend.imageAvailable) {
        throw new Error('Please upload a token logo.');
      }

      const response = await tokenApi.saveInformation(formData);
      const savedPayment = paymentContextOf(response);
      if (savedPayment.paymentTokenAddress.toLowerCase() !== selectedPayment.contractAddress.toLowerCase()) {
        throw new Error('The server did not confirm the selected payment token. Refresh before continuing.');
      }
      updateSection('tokenInformation', {
        name: response?.tokenName || data.name.trim(),
        symbol: String(response?.tokenSymbol || data.symbol).toUpperCase(),
        decimals: String(response?.decimals ?? data.decimals),
        treasuryWallet:
          response?.treasuryWalletAddress || data.treasuryWallet.trim(),
        description: response?.tokenDescription || data.description.trim(),
      });
      updateSection('supplyPricing', {
        initialPrice: String(response?.initialTokenPrice ?? supplyPricing.initialPrice),
        currency: selectedPayment.symbol,
        paymentTokenAddress: selectedPayment.contractAddress,
        paymentTokenDecimals: selectedPayment.decimals,
        controllerAddress:
          savedPayment.controllerAddress ||
          selectedPayment.controllerAddress ||
          selectedChain?.platformControllerAddress || '',
        paymentTokenLocked: isTokenCreationLocked(response),
      });
      recordBackendSave('token-information', response);
      markStepCompleted('token-information');
      toast.success('Asset details saved securely.');
      navigate(ROUTES.tokenIssuanceStep('identity-claims'));
    } catch (error) {
      const duplicateConflict =
        isDuplicateTokenError(error) || error?.response?.status === 409;
      const mappedErrors = mapTokenApiFieldErrors(error, INFORMATION_FIELD_MAP);
      const duplicateErrors = getDuplicateTokenFieldErrors(error, {
        assumeDuplicate: duplicateConflict,
      });
      setServerErrors({ ...duplicateErrors, ...mappedErrors });

      const errorCode = String(
        error?.response?.data?.error?.code || error?.response?.data?.code || error?.code || '',
      ).trim().toUpperCase();

      if (duplicateConflict) {
        toast.error('Asset name or symbol already exists', {
          id: 'duplicate-token-information',
          description: getDuplicateTokenMessage({
            tokenName: data.name,
            tokenSymbol: data.symbol,
          }),
          duration: 8_000,
        });
      } else if (errorCode === 'SELECTED_CHAIN_MISMATCH') {
        setServerErrors((current) => ({ ...current, chainUid: networkMismatchMessage }));
        toast.error('Network selections do not match', {
          id: 'token-issuance-network-mismatch',
          description: networkMismatchMessage,
          duration: 10_000,
        });
      } else {
        toast.error('Asset details were not saved.', {
          description: getTokenApiErrorMessage(
            error,
            'Review the highlighted fields and try again.',
          ),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <IssuanceLayout
      stepKey="token-information"
      title="Asset Details"
      description="Add the basic information that identifies your asset and helps investors understand what they are investing in."
      onBack={() => navigate(ROUTES.createToken)}
      onContinue={continueStep}
      continueLabel="Save and Continue"
      continueIcon={ArrowRight}
      continueLoading={saving}
      continueDisabled={organizationLoading || userChains.isPending || !organizationWallet || !selectedChain?.isUnlocked || assetNetworkMismatch}
      footerExtra={assetNetworkMismatch ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-amber-700" role="status">
          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0">Asset and navbar networks must match before saving.</span>
        </span>
      ) : null}
      stepErrors={{ 'token-information': submitted ? { ...errors, ...serverErrors } : undefined }}
    >
      <div className="issuance-centered-form issuance-centered-form--wide">
        <SectionCard>
          <div className="issuance-form-grid">
            <div className="issuance-field--full">
              <ChainSelector
                id="token-chain"
                chains={userChains.data || []}
                value={data.chainUid || ''}
                onlyUnlocked
                disabled={creationLocked || saving || userChains.isPending}
                label="Asset network"
                description={
                  creationLocked
                    ? 'This network is fixed because final asset creation has started.'
                    : backend.tokenUid
                      ? 'You can still change the network while this asset is a draft. Changing it clears the payment-token selection and restarts the remaining setup steps.'
                      : 'Choose an unlocked network for this asset. Payment tokens and wallet actions will follow this selection.'
                }
                error={
                  fieldError('chainUid') ||
                  (userChains.isError
                    ? 'Unable to load your network access.'
                    : !selectedChain?.isUnlocked
                      ? 'Unlock this network from Network Access before creating an asset.'
                      : '')
                }
                onChange={(event) => {
                  const chain = (userChains.data || []).find((item) => item.chainUid === event.target.value);
                  if (!chain || !chain.isUnlocked || creationLocked) return;
                  if (chain.chainUid === data.chainUid) return;

                  updateSection('tokenInformation', {
                    chainUid: chain.chainUid,
                    chainId: chain.chainId,
                    network: chain.chainName,
                  });
                  updateSection('supplyPricing', {
                    paymentTokenAddress: '',
                    paymentTokenDecimals: null,
                    controllerAddress: chain.platformControllerAddress || '',
                    currency: '',
                    paymentTokenLocked: false,
                  });
                  setSubmitted(false);
                  setTouched({});
                  setServerErrors({});

                  const requiresAppNetworkSwitch = Boolean(
                    appNetwork.activeChainUid && chain.chainUid !== appNetwork.activeChainUid,
                  );
                  toast.info(`Asset network changed to ${chain.chainName}.`, {
                    description: requiresAppNetworkSwitch
                      ? buildTokenIssuanceNetworkMismatchMessage({
                          assetNetworkName: chain.chainName,
                          appNetworkName,
                        })
                      : 'Choose a payment token for this network and continue from Step 1. Later setup steps must be reviewed again before creation.',
                  });
                }}
              />

              {assetNetworkMismatch ? (
                <div
                  className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950"
                  role="status"
                  aria-live="polite"
                >
                  <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={17} aria-hidden="true" />
                  <div className="min-w-0">
                    <strong className="block text-sm font-semibold">Network selections do not match</strong>
                    <p className="mt-1 mb-0 text-xs leading-5 text-amber-800 sm:text-sm">
                      {networkMismatchMessage}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <TokenLogoUploader
              value={data.logo}
              onChange={(logo) => updateToken('logo', logo)}
              onInteraction={() => blur('logo')}
              error={fieldError('logo')}
            />

            <FieldWrapper
              label="Asset name"
              required
              error={fieldError('name')}
              htmlFor="token-name"
            >
              <TextInput
                id="token-name"
                value={data.name}
                onChange={(event) => updateToken('name', event.target.value)}
                onBlur={() => {
                  updateToken('name', normalizeTokenName(data.name));
                  blur('name');
                }}
                placeholder="Example: Psephos Growth Fund"
                error={fieldError('name')}
                minLength={3}
                maxLength={50}
                disabled={backend.isLocked}
              />
            </FieldWrapper>

            <FieldWrapper
              label="Short symbol"
              required
              error={fieldError('symbol')}
              hint={`Use 2–10 letters or numbers. Example: TRXF. ${data.symbol.length}/10 characters`}
              htmlFor="token-symbol"
            >
              <TextInput
                id="token-symbol"
                value={data.symbol}
                onChange={(event) =>
                  updateToken(
                    'symbol',
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 10),
                  )
                }
                onBlur={() => blur('symbol')}
                placeholder="TRXF"
                error={fieldError('symbol')}
                maxLength={10}
                autoCapitalize="characters"
                disabled={backend.isLocked}
              />
            </FieldWrapper>

            <SelectField
              id="token-decimals"
              className="issuance-decimals-select"
              label="Decimal places"
              required
              options={DECIMAL_OPTIONS}
              value={data.decimals}
              placeholder="Choose decimal places"
              searchable={false}
              showEmptyOption={false}
              onChange={(event) => updateToken('decimals', event.target.value)}
              onBlur={() => blur('decimals')}
              error={fieldError('decimals')}
              hint="This controls how finely one unit can be divided. If your product or legal team has not specified a value, 6 is a practical default for many assets."
              disabled={backend.isLocked}
            />

            <HelpDetails className="issuance-form-grid__full-help" title="What do decimal places change?">
              Decimal places do not change the total value of the asset. They only decide how small a fraction of one unit can be represented. For example, 6 decimal places allows quantities smaller than one whole unit.
            </HelpDetails>

            <PaymentTokenSelect
              id="asset-payment-token"
              label="Payment token"
              required
              compact
              networkLabel={selectedChain?.chainName || data.network || 'Selected network'}
              value={supplyPricing.paymentTokenAddress || ''}
              items={paymentLocked && selectedPayment && !paymentOptions.includes(selectedPayment) ? [selectedPayment, ...paymentOptions] : paymentOptions}
              placeholder={catalogue.isPending ? 'Loading payment tokens…' : 'Select payment token'}
              searchable={false}
              disabled={backend.isLocked || saving || paymentLocked || catalogue.isPending}
              error={fieldError('paymentTokenAddress') || (catalogue.isError ? 'Unable to load payment tokens. Refresh and try again.' : undefined)}
              hint={paymentLocked ? 'Payment token is fixed. You can update the numeric price after deployment.' : 'You can change this during setup. It becomes fixed when you create the token.'}
              onChange={(event) => {
                const selected = paymentOptions.find((item) => item.contractAddress === event.target.value);
                clearServerError('paymentTokenAddress');
                clearServerError('initialPrice');
                if (selected && supplyPricing.initialPrice
                  && !isDecimalInputWithinPrecision(supplyPricing.initialPrice, selected.decimals)) {
                  setTouched((current) => ({ ...current, initialPrice: true }));
                }
                updateSection('supplyPricing', {
                  paymentTokenAddress: selected?.contractAddress || '',
                  paymentTokenDecimals: selected?.decimals ?? null,
                  controllerAddress: selected
                    ? selected.controllerAddress || selectedChain?.platformControllerAddress || ''
                    : '',
                  currency: selected?.symbol || '',
                });
              }}
            />

            <FieldWrapper
              label={`Starting price per unit (${paymentSymbol})`}
              required
              error={fieldError('initialPrice')}
              hint={`Price for one asset unit in ${paymentSymbol}. ${pricePrecisionHint}`}
              htmlFor="initial-token-price"
            >
              <div className="issuance-currency-input">
                <span className="issuance-currency-input__icon" aria-hidden="true">
                  <TokenIcon
                    key={`${selectedPayment?.contractAddress || paymentSymbol}:${paymentTokenImageUrl}`}
                    symbol={paymentSymbol}
                    name={selectedPayment?.name}
                    imageUrl={paymentTokenImageUrl}
                    size="sm"
                  />
                </span>
                <TextInput
                  id="initial-token-price"
                  className="issuance-currency-input__control"
                  type="number"
                  min={priceStep}
                  step={priceStep}
                  inputMode="decimal"
                  value={supplyPricing.initialPrice}
                  onKeyDown={(event) => {
                    if (['-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
                  }}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (!isDecimalInputWithinPrecision(nextValue, paymentTokenDecimals)) return;
                    if (nextValue !== '' && Number(nextValue) < 0) return;
                    clearServerError('initialPrice');
                    updateSection('supplyPricing', {
                      initialPrice: nextValue,

                    });
                  }}
                  onBlur={() => blur('initialPrice')}
                  placeholder="0.00"
                  error={fieldError('initialPrice')}
                  disabled={backend.isLocked}
                />
              </div>
            </FieldWrapper>

            <FieldWrapper
              className="issuance-field--full"
              label="Approved organization account"
              required
              error={fieldError('treasuryWallet')}
              hint="This account was approved during organization onboarding and is filled in automatically."
              htmlFor="treasury-wallet"
            >
              <TextInput
                id="treasury-wallet"
                value={data.treasuryWallet}
                readOnly
                disabled={organizationLoading || backend.isLocked}
                placeholder="Approved organization secure account"
                spellCheck="false"
                error={fieldError('treasuryWallet')}
              />
            </FieldWrapper>

            <ImpactNote className="issuance-form-grid__full-help" title="What happens to this account" tone="positive">
              This approved organization account is used for the asset setup and management permissions. You do not need to type or change the address here.
            </ImpactNote>

            <FieldWrapper
              className="issuance-field--full"
              label="Investor-facing description"
              required
              error={fieldError('description')}
              hint="Explain what the asset represents, what investors receive, and any key rights in clear business language."
              htmlFor="token-description"
            >
              <TextareaInput
                id="token-description"
                rows="5"
                value={data.description}
                onChange={(event) => updateToken('description', event.target.value)}
                onBlur={() => blur('description')}
                placeholder="Example: This asset represents units in our investment offering and gives approved investors the rights described in the offering documents."
                error={fieldError('description')}
                maxLength={600}
                disabled={backend.isLocked}
              />
            </FieldWrapper>
          </div>
        </SectionCard>
      </div>
    </IssuanceLayout>
  );
}
