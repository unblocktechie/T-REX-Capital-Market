import { Trash2, UserRound } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/Input';
import { DateField, SelectField } from './OrganizationFields';

const initialsFor = (name) =>
  name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || null;

export function BeneficialOwnerCard({
  index,
  register,
  control,
  errors,
  name,
  onDelete,
  canDelete,
  countryOptions = [],
}) {
  const initials = initialsFor(name);
  const dateOfBirth = useWatch({
    control,
    name: `beneficialOwners.${index}.dateOfBirth`,
  });
  const nationality = useWatch({
    control,
    name: `beneficialOwners.${index}.nationality`,
  });

  return (
    <section className="org-ubo-card">
      <header>
        <div className="org-ubo-card__identity">
          <span className="org-ubo-card__avatar">
            {initials || <UserRound size={19} aria-hidden="true" />}
          </span>
          <div>
            <small>Beneficial owner</small>
            <strong>UBO {index + 1}</strong>
          </div>
        </div>
        <button
          type="button"
          className="icon-button org-ubo-card__delete"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={`Delete UBO ${index + 1}`}
          title={canDelete ? 'Delete beneficial owner' : 'At least one UBO is required'}
        >
          <Trash2 size={18} />
        </button>
      </header>
      <div className="org-form-grid">
        <Input
          label="Full Name"
          required
          placeholder="Enter legal full name"
          error={errors?.fullName?.message}
          {...register(`beneficialOwners.${index}.fullName`)}
        />
        <DateField
          label="Date of Birth"
          required
          value={dateOfBirth || ''}
          max={new Date().toISOString().split('T')[0]}
          error={errors?.dateOfBirth?.message}
          {...register(`beneficialOwners.${index}.dateOfBirth`)}
        />
        <SelectField
          label="Nationality"
          required
          options={countryOptions}
          value={nationality || ''}
          error={errors?.nationality?.message}
          {...register(`beneficialOwners.${index}.nationality`)}
        />
        <Input
          label="Percentage of Ownership"
          required
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="0"
          onWheel={(event) => event.currentTarget.blur()}
          trailing={<span className="org-input-suffix">%</span>}
          error={errors?.ownershipPercentage?.message}
          {...register(`beneficialOwners.${index}.ownershipPercentage`)}
        />
        <Input
          className="org-field--wide"
          label="Designation or relationship (optional)"
          placeholder="Director, founder, controlling shareholder…"
          error={errors?.relationship?.message}
          {...register(`beneficialOwners.${index}.relationship`)}
        />
      </div>
    </section>
  );
}
