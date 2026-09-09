import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { RadioCardGroup } from '@/components/investor/ChoiceCards';
import { InvestorLayout, InvestorSecurityCard } from '@/components/investor/InvestorLayout';
import { InvestorActionBar, InvestorFormCard } from '@/components/investor/InvestorPrimitives';
import { DateField, SelectField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import {
  useCityOptions,
  useCountryOptions,
  useStateOptions,
} from '@/hooks/useLocationOptions';
import { applyApiFieldErrors, getErrorMessage } from '@/utils/error';
import { scrollToFirstInvalid } from '@/utils/investor';
import { identityDetailsSchema } from '@/validations/investor.schemas';

const eighteenYearsAgo = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
};

const optionLabel = (options, value, fallback = '') =>
  options.find((option) => String(option.value) === String(value))?.label || fallback || '';

const locationFallback = (value, label) =>
  value ? [{ value, label: label || value }] : [];

const isLocationUid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  );

const resolveLegacyLocationValue = (options, value, label) => {
  if (!value || !options.length) return value || '';
  const exact = options.find((option) => String(option.value) === String(value));
  if (exact && isLocationUid(exact.value)) return exact.value;

  const targetLabel = String(label || value).trim().toLowerCase();
  const labelMatches = options.filter(
    (option) => String(option.label || '').trim().toLowerCase() === targetLabel,
  );
  const canonicalMatch = labelMatches.find((option) => isLocationUid(option.value));
  return canonicalMatch?.value || exact?.value || value;
};

const serverFieldMap = {
  countryUid: 'countryOfResidence',
  countryOfResidenceUid: 'countryOfResidence',
  countryOfResidence: 'countryOfResidence',
  stateUid: 'stateProvince',
  stateProvinceUid: 'stateProvince',
  stateProvince: 'stateProvince',
  cityUid: 'city',
  city: 'city',
};

export default function IdentityDetailsStep() {
  const { state, options, updateSection, setStep, saveIdentity, savingIdentity } = useInvestorOnboarding();
  const form = useForm({
    resolver: zodResolver(identityDetailsSchema),
    defaultValues: state.identity,
    mode: 'onBlur',
  });

  const countryFallback = useMemo(
    () => locationFallback(state.identity.countryOfResidence, state.identity.countryOfResidenceName),
    [state.identity.countryOfResidence, state.identity.countryOfResidenceName],
  );
  const stateFallback = useMemo(
    () => locationFallback(state.identity.stateProvince, state.identity.stateProvinceName),
    [state.identity.stateProvince, state.identity.stateProvinceName],
  );
  const cityFallback = useMemo(
    () => locationFallback(state.identity.city, state.identity.cityName),
    [state.identity.city, state.identity.cityName],
  );

  const { options: countryOptions, isPending: countriesLoading } = useCountryOptions(countryFallback);
  const countryUid = useWatch({ control: form.control, name: 'countryOfResidence' });
  const stateUid = useWatch({ control: form.control, name: 'stateProvince' });
  const cityUid = useWatch({ control: form.control, name: 'city' });
  const resolvedCountryUid = resolveLegacyLocationValue(
    countryOptions,
    countryUid,
    state.identity.countryOfResidenceName,
  );
  const stateCountryUid = isLocationUid(resolvedCountryUid) ? resolvedCountryUid : '';

  const { options: stateOptions, isPending: statesLoading } = useStateOptions(
    stateCountryUid,
    countryUid === state.identity.countryOfResidence ? stateFallback : [],
  );
  const resolvedStateUid = resolveLegacyLocationValue(
    stateOptions,
    stateUid,
    state.identity.stateProvinceName,
  );
  const cityStateUid = isLocationUid(resolvedStateUid) ? resolvedStateUid : '';
  const {
    options: cityOptions,
    isFetching: citiesLoading,
    isError: citiesError,
    isFetched: citiesFetched,
  } = useCityOptions(
    cityStateUid,
    stateUid === state.identity.stateProvince ? cityFallback : [],
  );
  const cityLookupUnavailable = Boolean(
    cityStateUid &&
      !citiesLoading &&
      (citiesError || (citiesFetched && cityOptions.length === 0)),
  );

  useEffect(() => {
    const subscription = form.watch((values) => updateSection('identity', values));
    return () => subscription.unsubscribe();
  }, [form, updateSection]);

  // Migrate older browser/backend drafts that stored location names instead of location UIDs.
  useEffect(() => {
    if (countriesLoading || !countryUid) return;
    if (resolvedCountryUid !== countryUid) {
      form.setValue('countryOfResidence', resolvedCountryUid, { shouldDirty: false, shouldValidate: false });
    }
  }, [countriesLoading, countryUid, form, resolvedCountryUid]);

  useEffect(() => {
    if (statesLoading || !stateUid) return;
    if (resolvedStateUid !== stateUid) {
      form.setValue('stateProvince', resolvedStateUid, { shouldDirty: false, shouldValidate: false });
    }
  }, [form, resolvedStateUid, stateUid, statesLoading]);

  useEffect(() => {
    if (citiesLoading || !cityUid) return;
    const resolved = resolveLegacyLocationValue(cityOptions, cityUid, state.identity.cityName);
    if (resolved !== cityUid) {
      form.setValue('city', resolved, { shouldDirty: false, shouldValidate: false });
    }
  }, [citiesLoading, cityOptions, cityUid, form, state.identity.cityName]);

  const persistValues = (values) => {
    const normalized = {
      ...values,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      streetAddress: values.streetAddress.trim(),
      countryOfResidenceName: optionLabel(
        countryOptions,
        values.countryOfResidence,
        state.identity.countryOfResidenceName,
      ),
      stateProvinceName: optionLabel(
        stateOptions,
        values.stateProvince,
        state.identity.stateProvinceName,
      ),
      cityName: optionLabel(cityOptions, values.city, state.identity.cityName),
    };
    updateSection('identity', normalized);
    return normalized;
  };

  const continueFlow = form.handleSubmit(
    async (values) => {
      const normalized = persistValues(values);
      const validGender = options.genders.some((option) => String(option.value) === String(normalized.gender));
      const validCountry = isLocationUid(normalized.countryOfResidence) && countryOptions.some(
        (option) => String(option.value) === String(normalized.countryOfResidence),
      );
      const validState = isLocationUid(normalized.stateProvince) && stateOptions.some(
        (option) => String(option.value) === String(normalized.stateProvince),
      );
      const validCity = cityLookupUnavailable || (
        isLocationUid(normalized.city) && cityOptions.some(
          (option) => String(option.value) === String(normalized.city),
        )
      );

      if (!validGender || !validCountry || !validState || !validCity) {
        if (!validGender) form.setError('gender', { type: 'validate', message: 'Select a supported gender option.' });
        if (!validCountry) {
          form.setError('countryOfResidence', {
            type: 'validate',
            message: 'Select a supported country of residence.',
          });
        }
        if (!validState) {
          form.setError('stateProvince', {
            type: 'validate',
            message: 'Select a state or province for the selected country.',
          });
        }
        if (!validCity) {
          form.setError('city', {
            type: 'validate',
            message: 'Select a city for the selected state or province.',
          });
        }
        toast.error('Select location values supported by the current location master data.');
        window.requestAnimationFrame(() =>
          scrollToFirstInvalid(document.getElementById('investor-identity-form')),
        );
        return;
      }
      try {
        await saveIdentity(normalized, false);
        setStep(2);
      } catch (error) {
        const hasFieldErrors = applyApiFieldErrors(error, form.setError, serverFieldMap);
        toast.error(getErrorMessage(error, 'Unable to save identity details.'));
        if (hasFieldErrors) {
          window.requestAnimationFrame(() =>
            scrollToFirstInvalid(document.getElementById('investor-identity-form')),
          );
        }
      }
    },
    () => {
      toast.error('Complete all required identity fields before continuing.');
      scrollToFirstInvalid(document.getElementById('investor-identity-form'));
    },
  );

  const errors = form.formState.errors;
  const countryField = form.register('countryOfResidence');
  const stateField = form.register('stateProvince');
  const cityField = form.register('city');

  return (
    <InvestorLayout
      title="Identity Details"
      description="Enter your personal and residential information exactly as it appears on your official documents."
      side={<InvestorSecurityCard title="Secure investor onboarding" description="Identity details are validated in the browser and saved to the authenticated T-REX investor onboarding API." />}
    >
      <form id="investor-identity-form" onSubmit={continueFlow} noValidate>
        <InvestorFormCard title="Personal Information" description="These details establish the legal identity connected to your investor profile.">
          <div className="org-form-grid">
            <Input label="First Name" required autoComplete="given-name" maxLength={50} placeholder="Enter first name" error={errors.firstName?.message} {...form.register('firstName')} />
            <Input label="Last Name" required autoComplete="family-name" maxLength={50} placeholder="Enter last name" error={errors.lastName?.message} {...form.register('lastName')} />
            <DateField label="Date of Birth" required max={eighteenYearsAgo()} min="1900-01-01" error={errors.dateOfBirth?.message} {...form.register('dateOfBirth')} />
            <div className="org-field--wide">
              <Controller
                name="gender"
                control={form.control}
                render={({ field }) => (
                  <RadioCardGroup
                    legend="Gender"
                    required
                    name="gender"
                    columns={Math.min(3, Math.max(1, options.genders.length))}
                    compact
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.gender?.message}
                    options={options.genders}
                  />
                )}
              />
            </div>
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="Permanent Address" description="Provide your current primary residential address." className="investor-form-card--spaced">
          <div className="org-form-grid">
            <Input className="org-field--wide" label="Street Address" required autoComplete="street-address" maxLength={150} placeholder="House number, street, building" error={errors.streetAddress?.message} {...form.register('streetAddress')} />
            <SelectField
              label="Country of Residence"
              required
              options={countryOptions}
              value={countryUid || ''}
              searchable
              placeholder={countriesLoading ? 'Loading countries…' : 'Select country'}
              error={errors.countryOfResidence?.message}
              disabled={countriesLoading || !countryOptions.length}
              {...countryField}
              onChange={(event) => {
                countryField.onChange(event);
                const nextCountryUid = event.target.value;
                updateSection('identity', {
                  countryOfResidence: nextCountryUid,
                  countryOfResidenceName: optionLabel(countryOptions, nextCountryUid),
                  stateProvince: '',
                  stateProvinceName: '',
                  city: '',
                  cityName: '',
                });
                form.setValue('stateProvince', '', { shouldDirty: true, shouldValidate: false });
                form.setValue('city', '', { shouldDirty: true, shouldValidate: false });
              }}
            />
            <SelectField
              label="State / Province"
              required
              options={stateOptions}
              value={stateUid || ''}
              searchable
              placeholder={statesLoading ? 'Loading states…' : 'Select state / province'}
              error={errors.stateProvince?.message}
              disabled={!countryUid || statesLoading || !stateOptions.length}
              {...stateField}
              onChange={(event) => {
                stateField.onChange(event);
                const nextStateUid = event.target.value;
                updateSection('identity', {
                  stateProvince: nextStateUid,
                  stateProvinceName: optionLabel(stateOptions, nextStateUid),
                  city: '',
                  cityName: '',
                });
                form.setValue('city', '', { shouldDirty: true, shouldValidate: false });
              }}
            />
            <SelectField
              className="org-field--wide"
              label="City"
              required={!cityLookupUnavailable}
              options={cityOptions}
              value={cityUid || ''}
              searchable
              placeholder="Select city"
              error={errors.city?.message}
              hint={
                cityLookupUnavailable
                  ? "While we're unable to retrieve the city from the selected state, you can continue to the next step."
                  : undefined
              }
              disabled={!cityStateUid || citiesLoading || cityLookupUnavailable || !cityOptions.length}
              {...cityField}
              onChange={(event) => {
                cityField.onChange(event);
                const nextCityUid = event.target.value;
                updateSection('identity', {
                  city: nextCityUid,
                  cityName: optionLabel(cityOptions, nextCityUid),
                });
              }}
            />
          </div>
        </InvestorFormCard>

        <InvestorActionBar>
          <span className="investor-action-bar__spacer" />
          <Button type="submit" icon={ArrowRight} loading={savingIdentity}>Continue to Documents</Button>
        </InvestorActionBar>
      </form>
    </InvestorLayout>
  );
}
