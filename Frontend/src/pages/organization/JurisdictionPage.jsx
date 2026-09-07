import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FormSection } from '@/components/organization/FormSection';
import { OrganizationActionBar } from '@/components/organization/OrganizationActionBar';
import { OrganizationInfoPanel } from '@/components/organization/OrganizationInfoPanel';
import { OrganizationPageLayout } from '@/components/organization/OrganizationPageLayout';
import { getOrganizationStepRoute } from '@/components/organization/OrganizationStepper';
import { DateField, SelectField, TextareaField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import {
  useCountryOptions,
  useOrganizationOptions,
} from '@/hooks/useOrganizationOptions';
import { useOrganizationNavigationGuard } from '@/hooks/useOrganizationNavigationGuard';
import { applyApiFieldErrors, getErrorMessage } from '@/utils/error';
import { jurisdictionSchema } from '@/validations/organization.schemas';

const toFormValues = (jurisdiction) => ({
  countryOfIncorporation: jurisdiction.countryOfIncorporation || '',
  dateOfIncorporation: jurisdiction.dateOfIncorporation || '',
  taxIdentificationNumber: jurisdiction.taxIdentificationNumber || '',
  industry: jurisdiction.industry || '',
  businessActivity: jurisdiction.businessActivity || '',
  website: jurisdiction.website || '',
});

const toJurisdictionModel = (values) => ({
  countryOfIncorporation: values.countryOfIncorporation,
  dateOfIncorporation: values.dateOfIncorporation,
  taxIdentificationNumber: (values.taxIdentificationNumber || '').trim(),
  industry: values.industry,
  businessActivity: values.businessActivity.trim(),
  website: (values.website || '').trim(),
});

const serverFieldMap = {
  countryOfIncorporationUid: 'countryOfIncorporation',
  dateOfIncorporation: 'dateOfIncorporation',
  taxIdentificationNumber: 'taxIdentificationNumber',
  industryUid: 'industry',
  businessActivity: 'businessActivity',
  website: 'website',
};

export default function JurisdictionPage() {
  useDocumentTitle('Institutional Jurisdiction');
  const navigate = useNavigate();
  const { organization, saveJurisdiction } = useOrganization();
  const { industryOptions } = useOrganizationOptions();
  const jurisdictionValues = useMemo(
    () => toFormValues(organization.jurisdiction),
    [organization.jurisdiction],
  );
  const countryFallback = useMemo(
    () => [
      {
        value: organization.jurisdiction.countryOfIncorporation,
        label: organization.jurisdiction.countryOfIncorporationName,
      },
    ],
    [
      organization.jurisdiction.countryOfIncorporation,
      organization.jurisdiction.countryOfIncorporationName,
    ],
  );
  const { options: countryOptions, isPending: countriesLoading } =
    useCountryOptions(countryFallback);
  const [savingAction, setSavingAction] = useState('');
  const form = useForm({
    resolver: zodResolver(jurisdictionSchema),
    defaultValues: jurisdictionValues,
    mode: 'onBlur',
  });
  const countryOfIncorporation = useWatch({
    control: form.control,
    name: 'countryOfIncorporation',
  });
  const dateOfIncorporation = useWatch({
    control: form.control,
    name: 'dateOfIncorporation',
  });
  const industryUid = useWatch({ control: form.control, name: 'industry' });
  const navigateWithoutGuard = useOrganizationNavigationGuard(form.formState.isDirty);

  useEffect(() => {
    if (!form.formState.isDirty) form.reset(jurisdictionValues);
  }, [form, form.formState.isDirty, jurisdictionValues]);

  const persist = async (values, isDraft) => {
    form.clearErrors();
    try {
      const saved = await saveJurisdiction(toJurisdictionModel(values), isDraft);
      form.reset(toFormValues(saved.jurisdiction));
      return saved;
    } catch (error) {
      applyApiFieldErrors(error, form.setError, serverFieldMap);
      toast.error(getErrorMessage(error, 'Unable to save jurisdiction details.'));
      throw error;
    }
  };

  const back = () => {
    navigateWithoutGuard(() => navigate(ROUTES.organizationCompany));
  };

  const next = form.handleSubmit(
    async (values) => {
      setSavingAction('continue');
      try {
        await persist(values, false);
        navigateWithoutGuard(() => navigate(ROUTES.organizationUbo));
      } catch {
        // Backend field errors are rendered on this page.
      } finally {
        setSavingAction('');
      }
    },
    () => toast.error('Complete all required jurisdiction fields before continuing.'),
  );

  const goToStep = (targetStep) => {
    navigateWithoutGuard(() => navigate(getOrganizationStepRoute(targetStep)));
  };

  const errors = form.formState.errors;

  return (
    <OrganizationPageLayout
      step={2}
      title="Institutional Jurisdiction"
      description="Provide the legal and regulatory details regarding your entity’s primary operating territory."
      onStepChange={savingAction ? undefined : goToStep}
      side={
        <OrganizationInfoPanel
          eyebrow="Compliance guide"
          title="Jurisdictional readiness"
          description="Accurate regional information helps determine the regulatory controls required for compliant issuance."
          items={[
            'Legal consistency across company filings',
            'Sanction and restricted-territory screening',
            'Jurisdictional compliance assessment',
            'Regional securities requirements',
          ]}
        />
      }
    >
      <FormSection title="Regulatory details" description="Use current records from the jurisdiction where the entity is incorporated.">
        <form onSubmit={next} noValidate>
          <div className="org-form-grid">
            <SelectField
              label="Country of Incorporation"
              required
              options={countryOptions}
              value={countryOfIncorporation || ''}
              placeholder={countriesLoading ? 'Loading countries…' : 'Select country'}
              disabled={countriesLoading || !countryOptions.length}
              error={errors.countryOfIncorporation?.message}
              {...form.register('countryOfIncorporation')}
            />
            <DateField
              label="Date of Incorporation"
              required
              value={dateOfIncorporation || ''}
              max={new Date().toISOString().split('T')[0]}
              error={errors.dateOfIncorporation?.message}
              {...form.register('dateOfIncorporation')}
            />
            <Input
              label="Tax ID / VAT / GST Number"
              placeholder="Enter tax, VAT, or GST identifier"
              error={errors.taxIdentificationNumber?.message}
              {...form.register('taxIdentificationNumber')}
            />
            <SelectField
              label="Industry"
              required
              options={industryOptions}
              value={industryUid || ''}
              disabled={!industryOptions.length}
              error={errors.industry?.message}
              {...form.register('industry')}
            />
            <TextareaField
              className="org-field--wide"
              label="Business Activity"
              required
              maxLength={5000}
              placeholder="Describe the organization’s principal commercial activity"
              error={errors.businessActivity?.message}
              {...form.register('businessActivity')}
            />
            <Input
              className="org-field--wide"
              label="Website"
              type="url"
              placeholder="https://example.com"
              error={errors.website?.message}
              {...form.register('website')}
            />
          </div>
          <OrganizationActionBar>
            <Button
              type="button"
              variant="ghost"
              icon={ArrowLeft}
              disabled={Boolean(savingAction)}
              onClick={back}
            >
              Back to Company Information
            </Button>
            <span className="org-action-bar__spacer" />
            <Button
              type="submit"
              loading={savingAction === 'continue'}
              disabled={Boolean(savingAction)}
            >
              Continue to UBO Details <ArrowRight size={17} />
            </Button>
          </OrganizationActionBar>
        </form>
      </FormSection>
    </OrganizationPageLayout>
  );
}
