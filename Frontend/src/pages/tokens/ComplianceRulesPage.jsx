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
  HelpDetails,
  ImpactNote,
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
  useDocumentTitle('Investment Rules');

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
      [name]: 'Use a whole number, such as 500 or 2,000.',
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
      toast.success('Investment rules saved.');
      navigate(ROUTES.tokenIssuanceStep('agents'));
    } catch (error) {
      setServerErrors(mapTokenApiFieldErrors(error, COMPLIANCE_FIELD_MAP));
      toast.error('Investment rules were not saved.', {
        description: getTokenApiErrorMessage(
          error,
          'Review the investor limits and blocked countries before trying again.',
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
          <ShieldCheck size={15} aria-hidden="true" /> Automatic checks
        </span>
        <h3 id="compliance-explainer-title">How these rules are applied</h3>
        <ol>
          <li>
            <span>1</span>
            <p><strong>We check the investor.</strong> They must have completed the investor checks you selected.</p>
          </li>
          <li>
            <span>2</span>
            <p><strong>We check your limits.</strong> Their country, holding amount, and investor limit are checked.</p>
          </li>
          <li>
            <span>3</span>
            <p><strong>The transaction can continue.</strong> It proceeds only when every required rule is satisfied.</p>
          </li>
        </ol>
        <HelpDetails className="compliance-technical-details" title="View technical details">
          The same checks are applied automatically before eligible asset transfers are completed.
        </HelpDetails>
      </section>

      <section className="issuance-summary-card compliance-live-summary">
        <span className="issuance-card-icon">
          <ListChecks size={19} />
        </span>
        <h3>Your current rules</h3>
        <div className="compliance-sentence-summary" aria-live="polite">
          <p><strong>{data.maximumInvestors ? `Up to ${formatNumber(data.maximumInvestors)} investors` : 'Investor limit not set'}</strong></p>
          <p><strong>{data.maximumBalance ? `Each investor can hold up to ${formatNumber(data.maximumBalance)} units` : 'Per-investor limit not set'}</strong></p>
          <p><strong>{data.countries.length ? `${data.countries.length} ${data.countries.length === 1 ? 'country' : 'countries'} blocked` : 'No countries blocked'}</strong></p>
        </div>
        <div className="compliance-immutability-note">
          <AlertTriangle size={17} aria-hidden="true" />
          <p>Review these limits carefully. Some rules may be difficult to change after the asset is created.</p>
        </div>
      </section>
    </div>
  );

  return (
    <IssuanceLayout
      stepKey="compliance"
      title="Investment Rules"
      description="Set how many investors can participate, how much one investor can hold, and which countries you want to block."
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
            Set investor limits
          </span>
        )}
        description="These limits control how many investors can hold the asset and the most any one investor can hold."
      >
        <div className="issuance-form-grid compliance-limit-grid">
          <div className="compliance-field-with-impact">
            <FieldWrapper
              label="Maximum number of investors"
              required
              error={fieldError('maximumInvestors')}
              hint="Example: enter 2,000 if you want to allow up to 2,000 investors. Use a whole number."
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
                placeholder="Example: 2000"
                error={fieldError('maximumInvestors')}
                disabled={backend.isLocked}
              />
            </FieldWrapper>
            <ImpactNote title="What happens when this limit is reached">
              A new investor cannot receive the asset until the number of current investors falls below this limit.
            </ImpactNote>
          </div>

          <div className="compliance-field-with-impact">
            <FieldWrapper
              label="Maximum amount one investor can hold"
              required
              error={fieldError('maximumBalance')}
              hint="Example: enter 500 if one investor should never hold more than 500 units. Use a whole number."
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
                placeholder="Example: 500"
                error={fieldError('maximumBalance')}
                disabled={backend.isLocked}
              />
            </FieldWrapper>
            <ImpactNote title="What happens if an investor would go above this amount">
              The investment or transfer will be blocked before the investor goes above the limit.
            </ImpactNote>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        className="compliance-config-card geographic-restrictions-card"
        title={(
          <span className="compliance-section-title">
            <Globe2 size={19} aria-hidden="true" />
            Where can investors participate?
          </span>
        )}
        description="Investors from all countries are allowed unless you block a country below."
      >
        <div className="jurisdiction-preview">
          <div className="jurisdiction-preview__visual" aria-hidden="true">
            <Globe2 size={42} />
          </div>
          <div>
            <span>Country access</span>
            <strong>{data.countries.length ? `${data.countries.length} blocked` : 'All countries currently allowed'}</strong>
            <p>
              {data.countries.length
                ? 'Investors registered in the countries below will not be able to receive this asset.'
                : 'You have not blocked any countries. Investors may participate if they meet your other investor requirements and limits.'}
            </p>
          </div>
        </div>

        <div className="compliance-country-section">
          <h3>Block a country</h3>
          <p className="compliance-section-helper">Only add a country when investors from that country should not be allowed to receive this asset.</p>
          <div className="country-add-row compliance-country-add-row">
            <SelectField
              id="compliance-country"
              label="Country to block"
              value={selectedCountry}
              options={availableCountries}
              placeholder={backend.countryOptions.length ? 'Select a country…' : 'Loading countries…'}
              hint="Choose a country, then select Block Country."
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
              Block Country
            </Button>
          </div>
          {(serverErrors.countries || (submitted ? errors.countries : '')) ? (
            <p className="issuance-section-error" role="alert">
              {serverErrors.countries || errors.countries}
            </p>
          ) : null}
        </div>

        <div className="restricted-country-list-section">
          <h3>Countries currently blocked</h3>
          {data.countries.length ? (
            <div
              className="issuance-chip-list compliance-country-list compliance-country-chip-list"
              aria-label="Blocked countries"
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
              <span>No countries are blocked. All countries are currently allowed.</span>
            </div>
          )}
        </div>
      </SectionCard>
    </IssuanceLayout>
  );
}
