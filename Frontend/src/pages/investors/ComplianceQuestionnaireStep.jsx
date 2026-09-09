import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { CheckboxCardGroup, RadioCardGroup } from '@/components/investor/ChoiceCards';
import { TypedDocumentUploader } from '@/components/investor/TypedDocumentUploader';
import { InvestorLayout, InvestorSecurityCard } from '@/components/investor/InvestorLayout';
import { InvestorActionBar, InvestorFormCard } from '@/components/investor/InvestorPrimitives';
import { SelectField, TextareaField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { applyApiFieldErrors, getErrorMessage } from '@/utils/error';
import { scrollToFirstInvalid } from '@/utils/investor';
import { complianceSchema } from '@/validations/investor.schemas';

export default function ComplianceQuestionnaireStep() {
  const {
    state,
    options,
    updateSection,
    setStep,
    saveCompliance,
    savingCompliance,
    uploadDocument,
    deleteDocument,
  } = useInvestorOnboarding();
  const [selectedAccreditationDocumentType, setSelectedAccreditationDocumentType] = useState('');
  const form = useForm({
    resolver: zodResolver(complianceSchema),
    defaultValues: state.compliance,
    mode: 'onBlur',
  });
  const previousRwaExperience = useWatch({ control: form.control, name: 'previousRwaExperience' });

  useEffect(() => {
    const subscription = form.watch((values) => updateSection('compliance', values));
    return () => subscription.unsubscribe();
  }, [form, updateSection]);

  useEffect(() => {
    if (previousRwaExperience === 'no' && form.getValues('rwaExperienceDescription')) {
      form.setValue('rwaExperienceDescription', '');
    }
  }, [form, previousRwaExperience]);

  const persist = (values) => {
    const normalized = {
      ...values,
      yearsOfExperience: values.yearsOfExperience.trim(),
      rwaExperienceDescription: values.rwaExperienceDescription?.trim() || '',
    };
    updateSection('compliance', normalized);
    return normalized;
  };

  const continueFlow = form.handleSubmit(
    async (values) => {
      const normalized = persist(values);
      const isAllowed = (rows, value) =>
        rows.some((option) => String(option.value) === String(value));
      const invalidFields = [];
      if (!isAllowed(options.sourceOfWealth, normalized.sourceOfWealth)) {
        invalidFields.push(['sourceOfWealth', 'Select a supported source of wealth.']);
      }
      if (!isAllowed(options.netWorthRanges, normalized.estimatedNetWorth)) {
        invalidFields.push(['estimatedNetWorth', 'Select a supported net worth range.']);
      }
      if (!isAllowed(options.investmentCapacities, normalized.annualInvestmentCapacity)) {
        invalidFields.push(['annualInvestmentCapacity', 'Select a supported investment capacity.']);
      }
      if (!isAllowed(options.accreditationTypes, normalized.accreditationType)) {
        invalidFields.push(['accreditationType', 'Select a supported accreditation category.']);
      }
      const invalidCategories = normalized.investmentCategories.filter(
        (category) => !isAllowed(options.investmentCategories, category),
      );
      if (invalidCategories.length) {
        invalidFields.push(['investmentCategories', 'Select only supported investment categories.']);
      }
      if (invalidFields.length) {
        invalidFields.forEach(([field, message]) => form.setError(field, { type: 'validate', message }));
        toast.error('Some questionnaire values are no longer supported. Review the highlighted fields.');
        window.requestAnimationFrame(() =>
          scrollToFirstInvalid(document.getElementById('investor-compliance-form')),
        );
        return;
      }
      try {
        await saveCompliance(normalized, false);
        setStep(4);
      } catch (error) {
        const hasFieldErrors = applyApiFieldErrors(error, form.setError);
        toast.error(getErrorMessage(error, 'Unable to save the compliance questionnaire.'));
        if (hasFieldErrors) {
          window.requestAnimationFrame(() =>
            scrollToFirstInvalid(document.getElementById('investor-compliance-form')),
          );
        }
      }
    },
    () => {
      toast.error('Complete all required compliance and accreditation fields.');
      scrollToFirstInvalid(document.getElementById('investor-compliance-form'));
    },
  );

  const errors = form.formState.errors;

  return (
    <InvestorLayout
      title="Compliance Questionnaire"
      description="Provide investment background and accreditation information required for investor onboarding."
      side={<InvestorSecurityCard title="Backend-validated compliance" description="The available values come from the investor options endpoint, and completed answers are validated again by the authenticated backend before review." />}
    >
      <form id="investor-compliance-form" onSubmit={continueFlow} noValidate>
        <InvestorFormCard title="A. Source of Wealth" description="Tell us about the primary source and estimated scale of your wealth.">
          <div className="org-form-grid">
            <SelectField label="Primary Source of Income / Wealth" required options={options.sourceOfWealth} error={errors.sourceOfWealth?.message} {...form.register('sourceOfWealth')} />
            <SelectField label="Estimated Net Worth in USD" required options={options.netWorthRanges} error={errors.estimatedNetWorth?.message} {...form.register('estimatedNetWorth')} />
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="B. Investment Profile" description="Provide your expected annual capacity and real-world-asset experience." className="investor-form-card--spaced">
          <div className="org-form-grid">
            <SelectField className="org-field--wide" label="Estimated Annual Investment Capacity" required options={options.investmentCapacities} error={errors.annualInvestmentCapacity?.message} {...form.register('annualInvestmentCapacity')} />
            <div className="org-field--wide">
              <Controller
                name="previousRwaExperience"
                control={form.control}
                render={({ field }) => (
                  <RadioCardGroup
                    legend="Previous experience with tokenized real-world assets"
                    required
                    name="previousRwaExperience"
                    columns={2}
                    compact
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.previousRwaExperience?.message}
                    options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                  />
                )}
              />
            </div>
            {previousRwaExperience === 'yes' ? (
              <TextareaField className="org-field--wide" label="Describe your previous RWA experience (optional)" maxLength={600} hint="This optional note is retained in the frontend draft because it is not part of the supplied backend compliance payload." error={errors.rwaExperienceDescription?.message} {...form.register('rwaExperienceDescription')} />
            ) : null}
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="C. Investment Experience" description="Select all categories that reflect your prior investing experience." className="investor-form-card--spaced">
          <div className="investor-compliance-stack">
            <Controller
              name="investmentCategories"
              control={form.control}
              render={({ field }) => (
                <CheckboxCardGroup legend="Investment Categories" required compact options={options.investmentCategories} value={field.value} onChange={field.onChange} error={errors.investmentCategories?.message} />
              )}
            />
            <Input label="Years of Investment Experience" required type="number" inputMode="numeric" min="0" max="80" step="1" placeholder="e.g. 5" hint="Enter a whole number from 0 to 80." error={errors.yearsOfExperience?.message} {...form.register('yearsOfExperience')} />
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="D. Accreditation Status" description="Select the accreditation category that applies to this investor profile." className="investor-form-card--spaced">
          <div className="investor-info-banner"><Info size={19} /><p>The available accreditation categories are loaded from the backend investor options endpoint and validated again when this step is saved.</p></div>
          <Controller
            name="accreditationType"
            control={form.control}
            render={({ field }) => (
              <RadioCardGroup legend="Select one accreditation category" required name="accreditationType" options={options.accreditationTypes} value={field.value} onChange={field.onChange} error={errors.accreditationType?.message} />
            )}
          />
        </InvestorFormCard>

        <InvestorFormCard title="E. Accreditation Documents" description="Upload one or more documents supporting the selected accreditation category." className="investor-form-card--spaced">
          <Controller
            name="accreditationDocuments"
            control={form.control}
            render={({ field }) => (
              <TypedDocumentUploader
                documentTypeLabel="Supporting Document Type"
                documentTypeOptions={options.accreditationDocumentTypes}
                documentTypeValue={selectedAccreditationDocumentType}
                onDocumentTypeChange={setSelectedAccreditationDocumentType}
                value={field.value}
                onChange={field.onChange}
                onUpload={uploadDocument}
                onDelete={deleteDocument}
                error={errors.accreditationDocuments?.message}
                selectionHint="Select an accreditation document type and upload the matching file. Re-uploading the same type replaces the previously stored file."
              />
            )}
          />
        </InvestorFormCard>

        <InvestorActionBar>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(2, { markReached: false })}>Back</Button>
          <span className="investor-action-bar__spacer" />
          <Button type="submit" icon={ArrowRight} loading={savingCompliance}>Continue to Review</Button>
        </InvestorActionBar>
      </form>
    </InvestorLayout>
  );
}
