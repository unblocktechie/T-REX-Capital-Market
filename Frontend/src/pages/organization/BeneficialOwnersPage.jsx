import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BeneficialOwnerCard } from '@/components/organization/BeneficialOwnerCard';
import { FormSection } from '@/components/organization/FormSection';
import { OrganizationActionBar } from '@/components/organization/OrganizationActionBar';
import { OrganizationInfoPanel } from '@/components/organization/OrganizationInfoPanel';
import { OrganizationPageLayout } from '@/components/organization/OrganizationPageLayout';
import { getOrganizationStepRoute } from '@/components/organization/OrganizationStepper';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useCountryOptions } from '@/hooks/useOrganizationOptions';
import { useOrganizationNavigationGuard } from '@/hooks/useOrganizationNavigationGuard';
import { createLocalId } from '@/utils/createLocalId';
import { applyApiFieldErrors, getErrorMessage } from '@/utils/error';
import { beneficialOwnersSchema } from '@/validations/organization.schemas';

const newOwner = () => ({
  id: createLocalId('ubo'),
  beneficialOwnerUid: '',
  fullName: '',
  dateOfBirth: '',
  nationality: '',
  nationalityName: '',
  ownershipPercentage: '',
  relationship: '',
  isPrimary: false,
});

const cleanOwners = (owners) =>
  owners.map((owner, index) => ({
    ...owner,
    fullName: owner.fullName?.trim() || '',
    ownershipPercentage:
      owner.ownershipPercentage === '' || owner.ownershipPercentage == null
        ? ''
        : Number(owner.ownershipPercentage),
    relationship: owner.relationship?.trim() || '',
    isPrimary: index === 0,
  }));

export default function BeneficialOwnersPage() {
  useDocumentTitle('Ultimate Beneficial Owners');
  const navigate = useNavigate();
  const { organization, saveBeneficialOwners } = useOrganization();
  const ownerValues = useMemo(
    () => ({
      beneficialOwners: organization.beneficialOwners.length
        ? organization.beneficialOwners
        : [newOwner()],
    }),
    [organization.beneficialOwners],
  );
  const nationalityFallbacks = useMemo(
    () =>
      organization.beneficialOwners.map((owner) => ({
        value: owner.nationality,
        label: owner.nationalityName,
      })),
    [organization.beneficialOwners],
  );
  const { options: countryOptions, isPending: countriesLoading } =
    useCountryOptions(nationalityFallbacks);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [savingAction, setSavingAction] = useState('');
  const form = useForm({
    resolver: zodResolver(beneficialOwnersSchema),
    defaultValues: ownerValues,
    mode: 'onBlur',
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: 'beneficialOwners',
    keyName: 'fieldKey',
  });
  const owners = useWatch({ control: form.control, name: 'beneficialOwners' }) || [];
  const ownershipTotal = owners.reduce(
    (total, owner) => total + (Number(owner?.ownershipPercentage) || 0),
    0,
  );

  const navigateWithoutGuard = useOrganizationNavigationGuard(form.formState.isDirty);

  useEffect(() => {
    if (!form.formState.isDirty) form.reset(ownerValues);
  }, [form, form.formState.isDirty, ownerValues]);

  const persist = async (values, isDraft) => {
    const cleaned = cleanOwners(values.beneficialOwners || []);
    form.clearErrors();
    try {
      const saved = await saveBeneficialOwners(cleaned, isDraft);
      const serverOwners = saved.beneficialOwners.length ? saved.beneficialOwners : cleaned;
      form.reset({ beneficialOwners: serverOwners });
      return saved;
    } catch (error) {
      applyApiFieldErrors(error, form.setError);
      toast.error(getErrorMessage(error, 'Unable to save beneficial ownership details.'));
      throw error;
    }
  };

  const back = () => {
    navigateWithoutGuard(() => navigate(ROUTES.organizationJurisdiction));
  };

  const next = form.handleSubmit(
    async (values) => {
      setSavingAction('continue');
      try {
        await persist(values, false);
        navigateWithoutGuard(() => navigate(ROUTES.organizationDocuments));
      } catch {
        // Field-level backend errors remain visible.
      } finally {
        setSavingAction('');
      }
    },
    () => toast.error('Complete all required UBO details before continuing.'),
  );

  const goToStep = (targetStep) => {
    navigateWithoutGuard(() => navigate(getOrganizationStepRoute(targetStep)));
  };

  return (
    <OrganizationPageLayout
      step={3}
      title="Ultimate Beneficial Owners"
      description="Add all individuals who own part of the company or exercise significant control."
      onStepChange={savingAction ? undefined : goToStep}
      side={
        <OrganizationInfoPanel
          eyebrow="Compliance registry"
          title="Transparent beneficial ownership"
          description="UBO disclosure is required to identify controlling persons and activate institutional identity checks."
          items={[
            'AML and financial crime compliance',
            'Sanctions and politically exposed person screening',
            'Investor eligibility and approved-investor rules',
            'Mandatory control-person disclosure',
          ]}
        />
      }
    >
      <FormSection title="Beneficial ownership registry" description="Create one record for every qualifying owner or controlling individual.">
        <form onSubmit={next} noValidate>
          <div className="org-ubo-toolbar">
            <div>
              <span>Total disclosed ownership</span>
              <strong className={ownershipTotal > 100 ? 'is-error' : ''}>
                {ownershipTotal.toFixed(2)}%
              </strong>
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={Plus}
              disabled={fieldArray.fields.length >= 20 || Boolean(savingAction)}
              onClick={() => fieldArray.append(newOwner())}
            >
              Add New UBO
            </Button>
          </div>

          <div className="org-ubo-list">
            {fieldArray.fields.map((field, index) => (
              <BeneficialOwnerCard
                key={field.fieldKey}
                index={index}
                register={form.register}
                control={form.control}
                errors={form.formState.errors.beneficialOwners?.[index]}
                name={owners[index]?.fullName}
                countryOptions={countryOptions}
                canDelete={fieldArray.fields.length > 1 && !savingAction}
                onDelete={() => setDeleteIndex(index)}
              />
            ))}
          </div>
          {countriesLoading ? (
            <p className="org-field__hint">Loading nationality options…</p>
          ) : null}
          <OrganizationActionBar>
            <Button
              type="button"
              variant="ghost"
              icon={ArrowLeft}
              disabled={Boolean(savingAction)}
              onClick={back}
            >
              Back to Jurisdiction
            </Button>
            <span className="org-action-bar__spacer" />
            <Button
              type="submit"
              loading={savingAction === 'continue'}
              disabled={Boolean(savingAction)}
            >
              Continue to Documentation <ArrowRight size={17} />
            </Button>
          </OrganizationActionBar>
        </form>
      </FormSection>

      <Modal
        open={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        title="Delete beneficial owner?"
        footer={
          <div className="org-modal-actions">
            <Button variant="secondary" onClick={() => setDeleteIndex(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                fieldArray.remove(deleteIndex);
                setDeleteIndex(null);
              }}
            >
              Delete UBO
            </Button>
          </div>
        }
      >
        <p>This removes the entered UBO record from the form. Continue to save your changes.</p>
      </Modal>
    </OrganizationPageLayout>
  );
}
