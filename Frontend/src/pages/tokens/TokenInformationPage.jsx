import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
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
  useDocumentTitle('Asset Details');

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

      if (duplicateConflict) {
        toast.error('Asset name or symbol already exists', {
          id: 'duplicate-token-information',
          description: getDuplicateTokenMessage({
            tokenName: data.name,
            tokenSymbol: data.symbol,
          }),
          duration: 8_000,
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

            <FieldWrapper
              label="Starting price per unit (USDT)"
              required
              error={fieldError('initialPrice')}
              hint="Enter the starting price for one unit of the asset. Example: 10 means one unit starts at 10 USDT."
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
