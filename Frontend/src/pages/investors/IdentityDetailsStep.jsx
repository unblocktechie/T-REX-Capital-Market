import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DateField, SelectField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { COUNTRY_OPTIONS } from '@/constants/investor';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { identityDetailsSchema } from '@/validations/investor.schemas';
import { RadioCardGroup } from '@/components/investor/ChoiceCards';
import { InvestorLayout, InvestorSecurityCard } from '@/components/investor/InvestorLayout';
import { InvestorActionBar, InvestorFormCard } from '@/components/investor/InvestorPrimitives';
import { scrollToFirstInvalid } from '@/utils/investor';

const eighteenYearsAgo = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
};

export default function IdentityDetailsStep() {
  const { state, updateSection, setStep } = useInvestorOnboarding();
  const form = useForm({
    resolver: zodResolver(identityDetailsSchema),
    defaultValues: state.identity,
    mode: 'onBlur',
  });

  useEffect(() => {
    const subscription = form.watch((values) => updateSection('identity', values));
    return () => subscription.unsubscribe();
  }, [form, updateSection]);

  const persistValues = (values) => {
    const normalized = {
      ...values,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      streetAddress: values.streetAddress.trim(),
      city: values.city.trim(),
      stateProvince: values.stateProvince.trim(),
    };
    updateSection('identity', normalized);
    return normalized;
  };

  const continueFlow = form.handleSubmit(
    (values) => {
      persistValues(values);
      setStep(2);
    },
    () => {
      toast.error('Complete all required identity fields before continuing.');
      scrollToFirstInvalid(document.getElementById('investor-identity-form'));
    },
  );


  const errors = form.formState.errors;

  return (
    <InvestorLayout
      title="Identity Details"
      description="Enter your personal and residential information exactly as it appears on your official documents."
      side={<InvestorSecurityCard />}
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
                    legend="Gender (optional)"
                    name="gender"
                    columns={3}
                    compact
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                )}
              />
            </div>
          </div>
        </InvestorFormCard>

        <InvestorFormCard title="Permanent Address" description="Provide your current primary residential address." className="investor-form-card--spaced">
          <div className="org-form-grid">
            <Input className="org-field--wide" label="Street Address" required autoComplete="street-address" maxLength={150} placeholder="House number, street, building" error={errors.streetAddress?.message} {...form.register('streetAddress')} />
            <Input label="City" required autoComplete="address-level2" maxLength={80} placeholder="Enter city" error={errors.city?.message} {...form.register('city')} />
            <Input label="State / Province" required autoComplete="address-level1" maxLength={80} placeholder="Enter state or province" error={errors.stateProvince?.message} {...form.register('stateProvince')} />
            <SelectField className="org-field--wide" label="Country of Residence" required options={COUNTRY_OPTIONS} searchable error={errors.countryOfResidence?.message} {...form.register('countryOfResidence')} />
          </div>
        </InvestorFormCard>

        <InvestorActionBar>
          <span className="investor-action-bar__spacer" />
          <Button type="submit" icon={ArrowRight}>Continue to Documents</Button>
        </InvestorActionBar>
      </form>
    </InvestorLayout>
  );
}
