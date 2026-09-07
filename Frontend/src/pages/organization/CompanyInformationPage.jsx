import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FormSection } from '@/components/organization/FormSection';
import { OrganizationActionBar } from '@/components/organization/OrganizationActionBar';
import { OrganizationInfoPanel } from '@/components/organization/OrganizationInfoPanel';
import { OrganizationPageLayout } from '@/components/organization/OrganizationPageLayout';
import { getOrganizationStepRoute } from '@/components/organization/OrganizationStepper';
import { SelectField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import {
  useCityOptions,
  useCountryOptions,
  useOrganizationOptions,
  useStateOptions,
} from '@/hooks/useOrganizationOptions';
import { useOrganizationNavigationGuard } from '@/hooks/useOrganizationNavigationGuard';
import { applyApiFieldErrors, getErrorMessage } from '@/utils/error';
import { companySchema } from '@/validations/organization.schemas';

const toFormValues = (company) => ({
  legalName: company.legalName || '',
  entityType: company.entityType || '',
  registrationNumber: company.registrationNumber || '',
  street: company.address?.street || '',
  country: company.address?.country || '',
  state: company.address?.state || '',
  city: company.address?.city || '',
  postalCode: company.postalCode || '',
});

const toCompanyModel = (values) => ({
  legalName: values.legalName.trim(),
  entityType: values.entityType,
  registrationNumber: values.registrationNumber.trim(),
  postalCode: values.postalCode.trim(),
  address: {
    street: values.street.trim(),
    country: values.country,
    state: values.state,
    city: values.city,
  },
});

const serverFieldMap = {
  legalCompanyName: 'legalName',
  entityTypeUid: 'entityType',
  registrationNumber: 'registrationNumber',
  streetAddress: 'street',
  countryUid: 'country',
  stateUid: 'state',
  cityUid: 'city',
  postalCode: 'postalCode',
};

export default function CompanyInformationPage() {
  useDocumentTitle('Company Information');
  const navigate = useNavigate();
  const { organization, saveCompany } = useOrganization();
  const { entityTypeOptions } = useOrganizationOptions();
  const companyValues = useMemo(
    () => toFormValues(organization.company),
    [organization.company],
  );
  const countryFallback = useMemo(
    () => [
      {
        value: organization.company.address.country,
        label: organization.company.address.countryName,
      },
    ],
    [organization.company.address.country, organization.company.address.countryName],
  );
  const stateFallback = useMemo(
    () => [
      {
        value: organization.company.address.state,
        label: organization.company.address.stateName,
      },
    ],
    [organization.company.address.state, organization.company.address.stateName],
  );
  const cityFallback = useMemo(
    () => [
      {
        value: organization.company.address.city,
        label: organization.company.address.cityName,
      },
    ],
    [organization.company.address.city, organization.company.address.cityName],
  );
  const { options: countryOptions, isPending: countriesLoading } =
    useCountryOptions(countryFallback);
  const [savingAction, setSavingAction] = useState('');
  const form = useForm({
    resolver: zodResolver(companySchema),
    defaultValues: companyValues,
    mode: 'onBlur',
  });

  const entityTypeUid = useWatch({ control: form.control, name: 'entityType' });
  const countryUid = useWatch({ control: form.control, name: 'country' });
  const stateUid = useWatch({ control: form.control, name: 'state' });
  const cityUid = useWatch({ control: form.control, name: 'city' });
  const { options: stateOptions, isPending: statesLoading } = useStateOptions(
    countryUid,
    countryUid === organization.company.address.country ? stateFallback : [],
  );
  const { options: cityOptions, isPending: citiesLoading } = useCityOptions(
    stateUid,
    stateUid === organization.company.address.state ? cityFallback : [],
  );
  const navigateWithoutGuard = useOrganizationNavigationGuard(form.formState.isDirty);

  useEffect(() => {
    if (!form.formState.isDirty) form.reset(companyValues);
  }, [companyValues, form, form.formState.isDirty]);

  const countryField = form.register('country');
  const stateField = form.register('state');

  const persist = async (values, isDraft) => {
    form.clearErrors();
    try {
      const saved = await saveCompany(toCompanyModel(values), isDraft);
      const nextValues = toFormValues(saved.company);
      form.reset(nextValues);
      return saved;
    } catch (error) {
      applyApiFieldErrors(error, form.setError, serverFieldMap);
      toast.error(getErrorMessage(error, 'Unable to save company information.'));
      throw error;
    }
  };

  const continueFlow = form.handleSubmit(
    async (values) => {
      setSavingAction('continue');
      try {
        await persist(values, false);
        navigateWithoutGuard(() => navigate(ROUTES.organizationJurisdiction));
      } catch {
        // Stay on this screen when backend validation fails.
      } finally {
        setSavingAction('');
      }
    },
    () => toast.error('Complete all required company fields before continuing.'),
  );

  const goToStep = (targetStep) => {
    navigateWithoutGuard(() => navigate(getOrganizationStepRoute(targetStep)));
  };

  const errors = form.formState.errors;

  return (
    <OrganizationPageLayout
      step={1}
      title="Company Information"
      description="Provide the official legal details of your organization to begin the institutional onboarding process."
      onStepChange={savingAction ? undefined : goToStep}
      side={
        <OrganizationInfoPanel
          title="Build a verified issuer profile"
          description="These details establish the legal identity used across KYB, compliance, and future token issuance workflows."
          items={[
            'Official registry details remain consistent',
            'Company address supports jurisdiction screening',
            'Entity structure prepares compliance controls',
          ]}
        />
      }
    >
      <FormSection title="Official legal details" description="Enter information exactly as it appears on incorporation records.">
        <form onSubmit={continueFlow} noValidate>
          <div className="org-form-grid">
            <Input
              className="org-field--wide"
              label="Legal Company Name"
              required
              placeholder="Enter the registered legal name"
              autoComplete="organization"
              error={errors.legalName?.message}
              {...form.register('legalName')}
            />
            <SelectField
              label="Entity Type"
              required
              options={entityTypeOptions}
              value={entityTypeUid || ''}
              error={errors.entityType?.message}
              disabled={!entityTypeOptions.length}
              {...form.register('entityType')}
            />
            <Input
              label="Registration Number"
              required
              placeholder="e.g. CIN, CRN or registry ID"
              error={errors.registrationNumber?.message}
              {...form.register('registrationNumber')}
            />
            <Input
              className="org-field--wide"
              label="Street Address"
              required
              placeholder="Registered office street address"
              autoComplete="street-address"
              error={errors.street?.message}
              {...form.register('street')}
            />
            <SelectField
              label="Country"
              required
              options={countryOptions}
              value={countryUid || ''}
              placeholder={countriesLoading ? 'Loading countries…' : 'Select country'}
              error={errors.country?.message}
              disabled={countriesLoading || !countryOptions.length}
              {...countryField}
              onChange={(event) => {
                countryField.onChange(event);
                form.setValue('state', '', { shouldDirty: true, shouldValidate: false });
                form.setValue('city', '', { shouldDirty: true, shouldValidate: false });
              }}
            />
            <SelectField
              label="State / Province"
              required
              options={stateOptions}
              value={stateUid || ''}
              placeholder={statesLoading ? 'Loading states…' : 'Select state / province'}
              error={errors.state?.message}
              disabled={!countryUid || statesLoading || !stateOptions.length}
              {...stateField}
              onChange={(event) => {
                stateField.onChange(event);
                form.setValue('city', '', { shouldDirty: true, shouldValidate: false });
              }}
            />
            <SelectField
              label="City"
              required
              options={cityOptions}
              value={cityUid || ''}
              placeholder={citiesLoading ? 'Loading cities…' : 'Select city'}
              error={errors.city?.message}
              disabled={!stateUid || citiesLoading || !cityOptions.length}
              {...form.register('city')}
            />
            <Input
              label="Postal Code"
              required
              autoComplete="postal-code"
              placeholder="Enter postal code"
              error={errors.postalCode?.message}
              {...form.register('postalCode')}
            />
          </div>
          <OrganizationActionBar>
            <span className="org-action-bar__spacer" />
            <Button
              type="submit"
              loading={savingAction === 'continue'}
              disabled={Boolean(savingAction)}
            >
              Continue to Jurisdiction <ArrowRight size={17} />
            </Button>
          </OrganizationActionBar>
        </form>
      </FormSection>
    </OrganizationPageLayout>
  );
}
