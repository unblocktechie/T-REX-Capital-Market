import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { CheckboxCardGroup, RadioCardGroup } from '@/components/investor/ChoiceCards';
import { TypedDocumentUploader } from '@/components/investor/TypedDocumentUploader';
import { InvestorLayout, InvestorSecurityCard } from '@/components/investor/InvestorLayout';
import { InvestorActionBar, InvestorFormCard } from '@/components/investor/InvestorPrimitives';
import { scrollToFirstInvalid } from '@/utils/investor';
import { SelectField, TextareaField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ACCREDITATION_DOCUMENT_TYPE_OPTIONS,
  ACCREDITATION_OPTIONS,
  INVESTMENT_CAPACITY_OPTIONS,
  INVESTMENT_CATEGORIES,
  NET_WORTH_OPTIONS,
  SOURCE_OF_WEALTH_OPTIONS,
} from '@/constants/investor';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { complianceSchema } from '@/validations/investor.schemas';

export default function ComplianceQuestionnaireStep() {
  const { state, updateSection, setStep } = useInvestorOnboarding();
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
    (values) => {
      persist(values);
      setStep(4);
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
      description="Provide investment background and accreditation information used to simulate an eligibility review."
      side={<InvestorSecurityCard title="Compliance-ready structure" description="These frontend fields are organized so a regulated KYC or accreditation provider can replace the mock services later." />}
    >
      <form id="investor-compliance-form" onSubmit={continueFlow} noValidate>
        <InvestorFormCard title="A. Source of Wealth" description="Tell us about the primary source and estimated scale of your wealth.">
          <div className="org-form-grid">
            <SelectField label="Primary Source of Income / Wealth" required options={SOURCE_OF_WEALTH_OPTIONS} error={errors.sourceOfWealth?.message} {...form.register('sourceOfWealth')} />
            <SelectField label="Estimated Net Worth in USD" required options={NET_WORTH_OPTIONS} error={errors.estimatedNetWorth?.message} {...form.register('estimatedNetWorth')} />
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="B. Investment Profile" description="Provide your expected annual capacity and real-world-asset experience." className="investor-form-card--spaced">
          <div className="org-form-grid">
            <SelectField className="org-field--wide" label="Estimated Annual Investment Capacity" required options={INVESTMENT_CAPACITY_OPTIONS} error={errors.annualInvestmentCapacity?.message} {...form.register('annualInvestmentCapacity')} />
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
              <TextareaField className="org-field--wide" label="Describe your previous RWA experience (optional)" maxLength={600} hint="Include the asset class, platform, or approximate experience level. Maximum 600 characters." error={errors.rwaExperienceDescription?.message} {...form.register('rwaExperienceDescription')} />
            ) : null}
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="C. Investment Experience" description="Select all categories that reflect your prior investing experience." className="investor-form-card--spaced">
          <div className="investor-compliance-stack">
            <Controller
              name="investmentCategories"
              control={form.control}
              render={({ field }) => (
                <CheckboxCardGroup legend="Investment Categories" required compact options={INVESTMENT_CATEGORIES} value={field.value} onChange={field.onChange} error={errors.investmentCategories?.message} />
              )}
            />
            <Input label="Years of Investment Experience" required type="number" inputMode="numeric" min="0" max="80" step="1" placeholder="e.g. 5" hint="Enter a whole number from 0 to 80." error={errors.yearsOfExperience?.message} {...form.register('yearsOfExperience')} />
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="D. Accreditation Status" description="Accreditation may be required before access to certain regulated investments." className="investor-form-card--spaced">
          <div className="investor-info-banner"><Info size={19} /><p>This selection is collected for a simulated eligibility assessment. Final criteria depend on the applicable issuer, jurisdiction, and regulatory requirements.</p></div>
          <Controller
            name="accreditationType"
            control={form.control}
            render={({ field }) => (
              <RadioCardGroup legend="Select one accreditation category" required name="accreditationType" options={ACCREDITATION_OPTIONS} value={field.value} onChange={field.onChange} error={errors.accreditationType?.message} />
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
                documentTypeOptions={ACCREDITATION_DOCUMENT_TYPE_OPTIONS}
                documentTypeValue={selectedAccreditationDocumentType}
                onDocumentTypeChange={setSelectedAccreditationDocumentType}
                value={field.value}
                onChange={field.onChange}
                error={errors.accreditationDocuments?.message}
              />
            )}
          />
        </InvestorFormCard>

        <InvestorActionBar>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(2, { markReached: false })}>Back</Button>
          <span className="investor-action-bar__spacer" />
          <Button type="submit" icon={ArrowRight}>Continue to Review</Button>
        </InvestorActionBar>
      </form>
    </InvestorLayout>
  );
}
