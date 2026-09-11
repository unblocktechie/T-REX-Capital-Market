import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import {
  FieldWrapper,
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
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { mapTokenApiFieldErrors, getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import {
  getDuplicateTokenFieldErrors,
  getDuplicateTokenMessage,
  isDuplicateTokenError,
} from '@/utils/tokenDuplicateProtection';
import { validateTokenInformation } from '@/utils/tokenIssuance';
import { tokenLogoToFile } from '@/utils/tokenLogo';

const DECIMAL_OPTIONS = ['2', '6', '8', '18'].map((value) => ({ label: value, value }));

const normalizeTokenName = (value) => value.trim();

const INFORMATION_FIELD_MAP = {
  tokenName: 'name',
  tokenSymbol: 'symbol',
  decimals: 'decimals',
  initialTokenPrice: 'initialPrice',
  treasuryWalletAddress: 'treasuryWallet',
  tokenDescription: 'description',
  tokenImage: 'logo',
};

export default function TokenInformationPage() {
  const navigate = useNavigate();
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
  const organizationWallet = organization?.walletAddress || '';
  const errors = validateTokenInformation(data, supplyPricing, {
    requiredTreasuryWallet: organizationWallet,
  });
  useDocumentTitle('Token Information');

  useEffect(() => {
    hydrateWalletDefaults(organizationWallet);
  }, [hydrateWalletDefaults, organizationWallet]);

  useEffect(() => {
    if (supplyPricing.currency !== 'USDT') {
      updateSection('supplyPricing', { currency: 'USDT' });
    }
  }, [supplyPricing.currency, updateSection]);

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
    if (saving || backend.isLocked) return;
    setSubmitted(true);
    setServerErrors({});
    markStepTouched('token-information');
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('tokenName', data.name.trim());
      formData.append('tokenSymbol', data.symbol.trim().toUpperCase());
      formData.append('decimals', String(data.decimals));
      formData.append('initialTokenPrice', String(supplyPricing.initialPrice));
      formData.append('treasuryWalletAddress', data.treasuryWallet.trim());
      formData.append('tokenDescription', data.description.trim());
      formData.append('isDraft', 'false');
      formData.append('tokenImage', await tokenLogoToFile(data.logo));

      const response = await tokenApi.saveInformation(formData);
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
        currency: 'USDT',
      });
      recordBackendSave('token-information', response);
      markStepCompleted('token-information');
      toast.success('Token information saved securely.');
      navigate(ROUTES.tokenIssuanceStep('identity-claims'));
    } catch (error) {
      const duplicateConflict =
        isDuplicateTokenError(error) || error?.response?.status === 409;
      const mappedErrors = mapTokenApiFieldErrors(error, INFORMATION_FIELD_MAP);
      const duplicateErrors = getDuplicateTokenFieldErrors(error, {
        assumeDuplicate: duplicateConflict,
      });
      setServerErrors({ ...duplicateErrors, ...mappedErrors });

      if (duplicateConflict) {
        toast.error('Token name or symbol already exists', {
          id: 'duplicate-token-information',
          description: getDuplicateTokenMessage({
            tokenName: data.name,
            tokenSymbol: data.symbol,
          }),
          duration: 8_000,
        });
      } else {
        toast.error('Token information was not saved.', {
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
      title="Token Information"
      description="Enter the essential details investors will see and the settings used to create your token."
      onBack={() => navigate(ROUTES.createToken)}
      onContinue={continueStep}
      continueLabel="Save and Continue"
      continueIcon={ArrowRight}
      continueLoading={saving}
      continueDisabled={organizationLoading || !organizationWallet}
      stepErrors={{ 'token-information': submitted ? { ...errors, ...serverErrors } : undefined }}
    >
      <div className="issuance-centered-form issuance-centered-form--wide">
        <SectionCard>
          <div className="issuance-form-grid">
            <TokenLogoUploader
              value={data.logo}
              onChange={(logo) => updateToken('logo', logo)}
              onInteraction={() => blur('logo')}
              error={fieldError('logo')}
            />

            <FieldWrapper
              label="Token Name"
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
                placeholder="Example: Psephos Token"
                error={fieldError('name')}
                minLength={3}
                maxLength={50}
                disabled={backend.isLocked}
              />
            </FieldWrapper>

            <FieldWrapper
              label="Token Symbol"
              required
              error={fieldError('symbol')}
              hint={`${data.symbol.length}/10 characters`}
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
              label="Decimals"
              required
              options={DECIMAL_OPTIONS}
              value={data.decimals}
              placeholder="Select decimals"
              searchable={false}
              showEmptyOption={false}
              onChange={(event) => updateToken('decimals', event.target.value)}
              onBlur={() => blur('decimals')}
              error={fieldError('decimals')}
              hint="Select the supported token decimal precision."
              disabled={backend.isLocked}
            />

            <FieldWrapper
              label="Initial Token Price (USDT)"
              required
              error={fieldError('initialPrice')}
              hint="Enter a positive price in USDT."
              htmlFor="initial-token-price"
            >
              <TextInput
                id="initial-token-price"
                type="number"
                min="0.00000001"
                step="any"
                inputMode="decimal"
                value={supplyPricing.initialPrice}
                onKeyDown={(event) => {
                  if (['-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
                }}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue !== '' && Number(nextValue) < 0) return;
                  clearServerError('initialPrice');
                  updateSection('supplyPricing', {
                    initialPrice: nextValue,
                    currency: 'USDT',
                  });
                }}
                onBlur={() => blur('initialPrice')}
                placeholder="0.00"
                error={fieldError('initialPrice')}
                disabled={backend.isLocked}
              />
            </FieldWrapper>

            <FieldWrapper
              className="issuance-field--full"
              label="Treasury Wallet Address"
              required
              error={fieldError('treasuryWallet')}
              hint="This is the approved organization wallet registered during onboarding."
              htmlFor="treasury-wallet"
            >
              <TextInput
                id="treasury-wallet"
                value={data.treasuryWallet}
                readOnly
                disabled={organizationLoading || backend.isLocked}
                placeholder="Approved organization wallet"
                spellCheck="false"
                error={fieldError('treasuryWallet')}
              />
            </FieldWrapper>

            <FieldWrapper
              className="issuance-field--full"
              label="Token Description"
              required
              error={fieldError('description')}
              hint="Describe the represented asset and holder rights in clear language."
              htmlFor="token-description"
            >
              <TextareaInput
                id="token-description"
                rows="5"
                value={data.description}
                onChange={(event) => updateToken('description', event.target.value)}
                onBlur={() => blur('description')}
                placeholder="Describe the security token and its intended use."
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
