import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FieldWrapper,
  SectionCard,
  TextareaInput,
  TextInput,
} from '@/components/token-issuance/IssuancePrimitives';
import { SelectField } from '@/components/organization/OrganizationFields';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { validateTokenInformation } from '@/utils/tokenIssuance';

const DECIMAL_OPTIONS = ['2', '6', '8', '18'].map((value) => ({ label: value, value }));
const SUPPORTED_DECIMALS = new Set(DECIMAL_OPTIONS.map((option) => option.value));

const normalizeTokenName = (value) => value.trim();

export default function TokenInformationPage() {
  const navigate = useNavigate();
  const wallet = useWalletConnection();
  const data = useTokenIssuanceStore((state) => state.tokenInformation);
  const supplyPricing = useTokenIssuanceStore((state) => state.supplyPricing);
  const updateSection = useTokenIssuanceStore((state) => state.updateSection);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const errors = validateTokenInformation(data, supplyPricing);
  useDocumentTitle('Token Information');

  useEffect(() => {
    hydrateWalletDefaults(wallet.address);
  }, [hydrateWalletDefaults, wallet.address]);

  useEffect(() => {
    if (supplyPricing.currency !== 'USDT') {
      updateSection('supplyPricing', { currency: 'USDT' });
    }
  }, [supplyPricing.currency, updateSection]);

  useEffect(() => {
    if (!SUPPORTED_DECIMALS.has(String(data.decimals))) {
      updateSection('tokenInformation', { decimals: '18' });
    }
  }, [data.decimals, updateSection]);

  const fieldError = (name) => (submitted || touched[name] ? errors[name] : undefined);
  const updateToken = (name, value) => updateSection('tokenInformation', { [name]: value });
  const blur = (name) => setTouched((current) => ({ ...current, [name]: true }));

  const continueStep = () => {
    setSubmitted(true);
    markStepTouched('token-information');
    if (Object.keys(errors).length) return;
    markStepCompleted('token-information');
    navigate(ROUTES.tokenIssuanceStep('identity-claims'));
  };

  return (
    <IssuanceLayout
      stepKey="token-information"
      title="Token Information"
      description="Enter the essential token details required for the ERC-3643 deployment."
      onBack={() => navigate(ROUTES.createToken)}
      onContinue={continueStep}
      continueLabel="Continue"
      continueIcon={ArrowRight}
      stepErrors={{ 'token-information': submitted ? errors : undefined }}
    >
      <div className="issuance-centered-form issuance-centered-form--wide">
        <SectionCard>
          <div className="issuance-form-grid">
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
                  updateSection('supplyPricing', {
                    initialPrice: nextValue,
                    currency: 'USDT',
                  });
                }}
                onBlur={() => blur('initialPrice')}
                placeholder="0.00"
                error={fieldError('initialPrice')}
              />
            </FieldWrapper>

            <FieldWrapper
              className="issuance-field--full"
              label="Treasury Wallet Address"
              required
              error={fieldError('treasuryWallet')}
              hint="The connected organization wallet is inserted when this field is empty."
              htmlFor="treasury-wallet"
            >
              <TextInput
                id="treasury-wallet"
                value={data.treasuryWallet}
                onChange={(event) => updateToken('treasuryWallet', event.target.value.trim())}
                onBlur={() => blur('treasuryWallet')}
                placeholder="0x…"
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
              />
            </FieldWrapper>
          </div>
        </SectionCard>
      </div>
    </IssuanceLayout>
  );
}
