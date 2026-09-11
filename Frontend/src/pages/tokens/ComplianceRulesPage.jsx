import {
  AlertTriangle,
  ArrowRight,
  Globe2,
  ListChecks,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import { toCompliancePayload } from '@/api/tokens/token.mapper';
import { SelectField } from '@/components/organization/OrganizationFields';
import {
  FieldWrapper,
  SectionCard,
  SelectionChip,
  TextInput,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { mapTokenApiFieldErrors, getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import { formatNumber, validateCompliance } from '@/utils/tokenIssuance';

const COMPLIANCE_FIELD_MAP = {
  maxInvestors: 'maximumInvestors',
  maxBalancePerInvestor: 'maximumBalance',
  countryRestrictionMode: 'countries',
  countryUids: 'countries',
};

const countryKey = (country) => country?.countryUid || country?.countryName || '';
const countryName = (country) => country?.countryName || country?.label || String(country || '');

export default function ComplianceRulesPage() {
  const navigate = useNavigate();
  const data = useTokenIssuanceStore((state) => state.compliance);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const updateSection = useTokenIssuanceStore((state) => state.updateSection);
  const toggleCountry = useTokenIssuanceStore((state) => state.toggleCountry);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const recordBackendSave = useTokenIssuanceStore((state) => state.recordBackendSave);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const [selectedCountry, setSelectedCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const errors = validateCompliance(data);
  useDocumentTitle('Transfer Rules');

  const countryOptions = useMemo(
    () =>
      backend.countryOptions.map((country) => ({
        label: country.countryName,
        value: country.countryUid,
      })),
    [backend.countryOptions],
  );

  const selectedKeys = useMemo(
    () => new Set(data.countries.map(countryKey)),
    [data.countries],
  );

  const availableCountries = useMemo(
    () => countryOptions.filter((country) => !selectedKeys.has(country.value)),
    [countryOptions, selectedKeys],
  );

  const clearServerError = (name) =>
    setServerErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  const update = (name, value) => {
    clearServerError(name);
    updateSection('compliance', { [name]: value });
  };
  const updateWholeNumber = (name, value) => {
    if (value === '' || /^\d+$/.test(value)) {
      update(name, value);
      return;
    }

    setTouched((current) => ({ ...current, [name]: true }));
    setServerErrors((current) => ({
      ...current,
      [name]: 'Enter a positive whole number. Decimal values are not allowed.',
    }));
  };
  const blur = (name) => setTouched((current) => ({ ...current, [name]: true }));
  const fieldError = (name) =>
    serverErrors[name] || (submitted || touched[name] ? errors[name] : undefined);

  const addCountry = () => {
    if (!selectedCountry || selectedKeys.has(selectedCountry)) return;
    const country = backend.countryOptions.find((item) => item.countryUid === selectedCountry);
    if (!country) {
      setServerErrors((current) => ({
        ...current,
        countries: 'The selected country is no longer available. Reload the page and try again.',
      }));
      return;
    }
    clearServerError('countries');
    toggleCountry(country);
    setSelectedCountry('');
  };

  const continueStep = async () => {
    if (saving || backend.isLocked) return;
    setSubmitted(true);
    setServerErrors({});
    markStepTouched('compliance');
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const response = await tokenApi.saveCompliance(toCompliancePayload(data, false));
      recordBackendSave('compliance', response);
      markStepCompleted('compliance');
      toast.success('Transfer rules saved.');
      navigate(ROUTES.tokenIssuanceStep('agents'));
    } catch (error) {
      setServerErrors(mapTokenApiFieldErrors(error, COMPLIANCE_FIELD_MAP));
      toast.error('Transfer rules were not saved.', {
        description: getTokenApiErrorMessage(
          error,
          'Review the investor limits and restricted countries before retrying.',
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const summary = (
    <div className="issuance-sidebar-stack compliance-sidebar-stack">
      <section className="compliance-explainer-card" aria-labelledby="compliance-explainer-title">
        <span className="compliance-explainer-card__eyebrow">
          <ShieldCheck size={15} aria-hidden="true" /> Automatic transfer checks
        </span>
        <h3 id="compliance-explainer-title">What happens when tokens move</h3>
        <ol>
          <li>
            <span>1</span>
            <p>Before a transfer, the token checks whether the sender and recipient are approved investors.</p>
          </li>
          <li>
            <span>2</span>
            <p>It checks the required verification, country rules and holding limits for both wallets.</p>
          </li>
          <li>
            <span>3</span>
            <p>The transfer proceeds only when all of your configured rules are satisfied.</p>
          </li>
        </ol>
      </section>

      <section className="issuance-summary-card compliance-live-summary">
        <span className="issuance-card-icon">
          <ListChecks size={19} />
        </span>
        <h3>Configuration Summary</h3>
        <dl className="issuance-summary-list">
          <div>
            <dt>Investor limit</dt>
            <dd>{data.maximumInvestors ? formatNumber(data.maximumInvestors) : 'Not set'}</dd>
          </div>
          <div>
            <dt>Individual balance cap</dt>
            <dd>{data.maximumBalance ? formatNumber(data.maximumBalance) : 'Not set'}</dd>
          </div>
          <div>
            <dt>Country rule</dt>
            <dd className="compliance-summary-status">Block selected countries</dd>
          </div>
          <div>
            <dt>Restricted countries</dt>
            <dd>{data.countries.length || 'None'}</dd>
          </div>
        </dl>
        <div className="compliance-immutability-note">
          <AlertTriangle size={17} aria-hidden="true" />
          <p>Some transfer rules can be difficult to relax after token creation. Review them carefully before launch.</p>
        </div>
      </section>
    </div>
  );

  return (
    <IssuanceLayout
      stepKey="compliance"
      title="Transfer Rules"
      description="Set holding limits and country restrictions that automatically apply when tokens are transferred."
      sidebar={summary}
      onBack={() => navigate(ROUTES.tokenIssuanceStep('identity-claims'))}
      onContinue={continueStep}
      continueLabel="Save and Continue"
      continueIcon={ArrowRight}
      continueLoading={saving}
      continueDisabled={!backend.countryOptions.length}
      stepErrors={{ compliance: submitted ? { ...errors, ...serverErrors } : undefined }}
    >
      <SectionCard
        className="compliance-config-card"
        title={(
          <span className="compliance-section-title">
            <SlidersHorizontal size={19} aria-hidden="true" />
            Holding Limits
          </span>
        )}
        description="Define the maximum number of investors and the balance allowed per investor."
      >
        <div className="issuance-form-grid compliance-limit-grid">
          <FieldWrapper
            label="Maximum Investors"
            required
            error={fieldError('maximumInvestors')}
            hint="Enter a positive whole number only. Decimals are not allowed."
            htmlFor="maximum-investors"
          >
            <TextInput
              id="maximum-investors"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={data.maximumInvestors}
              onChange={(event) => updateWholeNumber('maximumInvestors', event.target.value)}
              onBlur={() => blur('maximumInvestors')}
              onKeyDown={(event) => {
                if (['-', '+', 'e', 'E', '.', ','].includes(event.key)) event.preventDefault();
              }}
              placeholder="e.g. 2000"
              error={fieldError('maximumInvestors')}
              disabled={backend.isLocked}
            />
          </FieldWrapper>

          <FieldWrapper
            label="Maximum Holding per Investor"
            required
            error={fieldError('maximumBalance')}
            hint="Enter a positive whole number only. Decimals are not allowed."
            htmlFor="maximum-balance"
          >
            <TextInput
              id="maximum-balance"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={data.maximumBalance}
              onChange={(event) => updateWholeNumber('maximumBalance', event.target.value)}
              onBlur={() => blur('maximumBalance')}
              onKeyDown={(event) => {
                if (['-', '+', 'e', 'E', '.', ','].includes(event.key)) event.preventDefault();
              }}
              placeholder="e.g. 5"
              error={fieldError('maximumBalance')}
              disabled={backend.isLocked}
            />
          </FieldWrapper>
        </div>
      </SectionCard>

      <SectionCard
        className="compliance-config-card geographic-restrictions-card"
        title={(
          <span className="compliance-section-title">
            <Globe2 size={19} aria-hidden="true" />
            Restricted Countries
          </span>
        )}
        description="Select the countries whose residents are not eligible to invest in this offering."
      >
        <div className="jurisdiction-preview" aria-hidden="true">
          <div className="jurisdiction-preview__visual">
            <Globe2 size={42} />
          </div>
          <div>
            <span>Restricted countries</span>
            <strong>{data.countries.length ? `${data.countries.length} restricted` : 'No restricted countries'}</strong>
            <p>
              {data.countries.length
                ? 'Investors who reside in the selected countries will not be able to receive this token.'
                : 'Investors from all countries are currently allowed, as long as they meet the verification and holding rules above.'}
            </p>
          </div>
        </div>

        <div className="compliance-country-section">
          <h3>Add Restricted Country</h3>
          <div className="country-add-row compliance-country-add-row">
            <SelectField
              id="compliance-country"
              label="Country"
              value={selectedCountry}
              options={availableCountries}
              placeholder={backend.countryOptions.length ? 'Select a country…' : 'Loading countries…'}
              hint="Choose a country to prevent residents there from receiving this token."
              searchable
              showEmptyOption
              disabled={!backend.countryOptions.length || backend.isLocked}
              onChange={(event) => setSelectedCountry(event.target.value)}
            />
            <Button
              type="button"
              className="compliance-add-country-button"
              icon={Plus}
              onClick={addCountry}
              disabled={!selectedCountry || backend.isLocked}
            >
              Add Restriction
            </Button>
          </div>
          {(serverErrors.countries || (submitted ? errors.countries : '')) ? (
            <p className="issuance-section-error" role="alert">
              {serverErrors.countries || errors.countries}
            </p>
          ) : null}
        </div>

        <div className="restricted-country-list-section">
          <h3>Restricted Countries</h3>
          {data.countries.length ? (
            <div
              className="issuance-chip-list compliance-country-list compliance-country-chip-list"
              aria-label="Restricted countries"
            >
              {data.countries.map((country) => (
                <SelectionChip
                  key={countryKey(country)}
                  onRemove={backend.isLocked ? undefined : () => toggleCountry(country)}
                >
                  {countryName(country)}
                </SelectionChip>
              ))}
            </div>
          ) : (
            <div className="issuance-empty-inline compliance-country-empty">
              <Globe2 size={18} />
              <span>No restricted countries configured.</span>
            </div>
          )}
        </div>
      </SectionCard>
    </IssuanceLayout>
  );
}
