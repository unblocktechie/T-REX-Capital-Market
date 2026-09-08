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
import { SelectField } from '@/components/organization/OrganizationFields';
import {
  FieldWrapper,
  SectionCard,
  SelectionChip,
  TextInput,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { Button } from '@/components/ui/Button';
import { COUNTRY_OPTIONS } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { formatNumber, validateCompliance } from '@/utils/tokenIssuance';

export default function ComplianceRulesPage() {
  const navigate = useNavigate();
  const data = useTokenIssuanceStore((state) => state.compliance);
  const updateSection = useTokenIssuanceStore((state) => state.updateSection);
  const toggleCountry = useTokenIssuanceStore((state) => state.toggleCountry);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const [selectedCountry, setSelectedCountry] = useState('');
  const errors = validateCompliance(data);
  useDocumentTitle('Compliance Rules');

  const availableCountries = useMemo(
    () => COUNTRY_OPTIONS.filter((country) => !data.countries.includes(country)),
    [data.countries],
  );

  const update = (name, value) => updateSection('compliance', { [name]: value });
  const blur = (name) => setTouched((current) => ({ ...current, [name]: true }));
  const fieldError = (name) => (submitted || touched[name] ? errors[name] : undefined);

  const addCountry = () => {
    if (!selectedCountry || data.countries.includes(selectedCountry)) return;
    toggleCountry(selectedCountry);
    setSelectedCountry('');
  };

  const continueStep = () => {
    setSubmitted(true);
    markStepTouched('compliance');
    if (Object.keys(errors).length) return;
    markStepCompleted('compliance');
    navigate(ROUTES.tokenIssuanceStep('agents'));
  };

  const summary = (
    <div className="issuance-sidebar-stack compliance-sidebar-stack">
      <section className="compliance-explainer-card" aria-labelledby="compliance-explainer-title">
        <span className="compliance-explainer-card__eyebrow">
          <ShieldCheck size={15} aria-hidden="true" /> T-REX enforcement
        </span>
        <h3 id="compliance-explainer-title">How on-chain rules work</h3>
        <ol>
          <li>
            <span>1</span>
            <p>When a transfer starts, the smart contract checks the investor identity.</p>
          </li>
          <li>
            <span>2</span>
            <p>Both wallets must hold valid ONCHAINID credentials for the enabled claims.</p>
          </li>
          <li>
            <span>3</span>
            <p>The transfer succeeds only after every configured compliance rule passes.</p>
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
            <dt>Restriction type</dt>
            <dd className="compliance-summary-status">Blocklist only</dd>
          </div>
          <div>
            <dt>Restricted countries</dt>
            <dd>{data.countries.length || 'None'}</dd>
          </div>
        </dl>
        <div className="compliance-immutability-note">
          <AlertTriangle size={17} aria-hidden="true" />
          <p>Compliance rules may require a protocol upgrade to relax after deployment. Review them carefully.</p>
        </div>
      </section>
    </div>
  );

  return (
    <IssuanceLayout
      stepKey="compliance"
      title="Compliance Rules"
      description="Set the investor limits and geographic restrictions enforced by the token."
      sidebar={summary}
      onBack={() => navigate(ROUTES.tokenIssuanceStep('identity-claims'))}
      onContinue={continueStep}
      continueLabel="Save and Continue"
      continueIcon={ArrowRight}
      stepErrors={{ compliance: submitted ? errors : undefined }}
    >
      <SectionCard
        className="compliance-config-card"
        title={(
          <span className="compliance-section-title">
            <SlidersHorizontal size={19} aria-hidden="true" />
            Global Holding Limits
          </span>
        )}
        description="Define the maximum number of investors and the balance allowed per investor."
      >
        <div className="issuance-form-grid compliance-limit-grid">
          <FieldWrapper
            label="Max Investors"
            required
            error={fieldError('maximumInvestors')}
            hint="The absolute maximum number of unique wallets allowed to hold the token."
            htmlFor="maximum-investors"
          >
            <TextInput
              id="maximum-investors"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={data.maximumInvestors}
              onChange={(event) => update('maximumInvestors', event.target.value)}
              onBlur={() => blur('maximumInvestors')}
              onKeyDown={(event) => {
                if (['-', '+', 'e', 'E', '.'].includes(event.key)) event.preventDefault();
              }}
              placeholder="e.g. 2000"
              error={fieldError('maximumInvestors')}
            />
          </FieldWrapper>

          <FieldWrapper
            label="Max Balance per Investor"
            required
            error={fieldError('maximumBalance')}
            hint="Prevents excessive concentration by limiting individual wallet weight."
            htmlFor="maximum-balance"
          >
            <TextInput
              id="maximum-balance"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={data.maximumBalance}
              onChange={(event) => update('maximumBalance', event.target.value)}
              onBlur={() => blur('maximumBalance')}
              onKeyDown={(event) => {
                if (['-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
              }}
              placeholder="e.g. 5.00"
              error={fieldError('maximumBalance')}
            />
          </FieldWrapper>
        </div>
      </SectionCard>

      <SectionCard
        className="compliance-config-card geographic-restrictions-card"
        title={(
          <span className="compliance-section-title">
            <Globe2 size={19} aria-hidden="true" />
            Restricted Jurisdictions
          </span>
        )}
        description="Select the countries whose residents are not eligible to invest in this offering."
      >
        <div className="jurisdiction-preview" aria-hidden="true">
          <div className="jurisdiction-preview__visual">
            <Globe2 size={42} />
          </div>
          <div>
            <span>Restricted jurisdictions</span>
            <strong>{data.countries.length ? `${data.countries.length} restricted` : 'No restricted jurisdictions'}</strong>
            <p>Residents from all countries are currently allowed to invest, subject to identity verification and other compliance rules.</p>
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
              placeholder="Select a country…"
              hint="Select a country to prevent residents of that jurisdiction from investing."
              searchable
              showEmptyOption
              onChange={(event) => setSelectedCountry(event.target.value)}
            />
            <Button
              type="button"
              className="compliance-add-country-button"
              icon={Plus}
              onClick={addCountry}
              disabled={!selectedCountry}
            >
              Add Restriction
            </Button>
          </div>
        </div>

        <div className="restricted-country-list-section">
          <h3>Restricted Countries</h3>
          {data.countries.length ? (
            <div
              className="issuance-chip-list compliance-country-list compliance-country-chip-list"
              aria-label="Restricted countries"
            >
              {data.countries.map((country) => (
                <SelectionChip key={country} onRemove={() => toggleCountry(country)}>
                  {country}
                </SelectionChip>
              ))}
            </div>
          ) : (
            <div className="issuance-empty-inline compliance-country-empty">
              <Globe2 size={18} />
              <span>No restricted jurisdictions configured.</span>
            </div>
          )}
        </div>
      </SectionCard>

    </IssuanceLayout>
  );
}
