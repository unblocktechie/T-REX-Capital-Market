import { z } from 'zod';

const requiredText = (label) => z.string().trim().min(1, `${label} is required.`);
const today = new Date();
today.setHours(23, 59, 59, 999);

const isAdult = (value) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const adultDate = new Date();
  adultDate.setFullYear(adultDate.getFullYear() - 18);
  adultDate.setHours(23, 59, 59, 999);
  return date <= adultDate;
};

export const companySchema = z.object({
  legalName: requiredText('Legal Company Name'),
  entityType: requiredText('Entity Type'),
  registrationNumber: requiredText('Registration Number'),
  street: requiredText('Street Address'),
  country: requiredText('Country'),
  state: requiredText('State / Province'),
  city: requiredText('City'),
  postalCode: requiredText('Postal Code'),
});

export const jurisdictionSchema = z.object({
  countryOfIncorporation: requiredText('Country of Incorporation'),
  dateOfIncorporation: requiredText('Date of Incorporation').refine(
    (value) => new Date(`${value}T00:00:00`) <= today,
    'Date of Incorporation cannot be in the future.',
  ),
  taxIdentificationNumber: z.string().trim().optional().default(''),
  industry: requiredText('Industry'),
  businessActivity: requiredText('Business Activity').max(
    5000,
    'Business Activity cannot exceed 5,000 characters.',
  ),
  website: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^https?:\/\/[^\s]+$/i.test(value),
      'Enter a valid website URL, including https://.',
    )
    .optional()
    .default(''),
});

export const beneficialOwnerSchema = z.object({
  id: z.string(),
  beneficialOwnerUid: z.string().optional().default(''),
  fullName: requiredText('Full Name'),
  dateOfBirth: requiredText('Date of Birth')
    .refine(
      (value) => new Date(`${value}T00:00:00`) <= today,
      'Date of Birth cannot be in the future.',
    )
    .refine(isAdult, 'A beneficial owner must be at least 18 years old.'),
  nationality: requiredText('Nationality'),
  nationalityName: z.string().optional().default(''),
  ownershipPercentage: z
    .union([z.string().trim().min(1, 'Ownership Percentage is required.'), z.number()])
    .transform((value) => Number(value))
    .pipe(
      z
        .number()
        .min(25, 'Each declared beneficial owner must hold at least 25%.')
        .max(100, 'Ownership Percentage cannot exceed 100%.'),
    ),
  relationship: z.string().trim().optional().default(''),
  isPrimary: z.boolean().optional().default(false),
});

export const beneficialOwnersSchema = z
  .object({
    beneficialOwners: z
      .array(beneficialOwnerSchema)
      .min(1, 'At least one UBO is required.')
      .max(20, 'A maximum of 20 beneficial owners can be added.'),
  })
  .superRefine((data, context) => {
    const owners = data.beneficialOwners || [];
    if (!owners.length) return;

    const totalOwnership = owners.reduce(
      (total, owner) => total + Number(owner.ownershipPercentage || 0),
      0,
    );

    if (Math.abs(totalOwnership - 100) < 0.001) return;

    const fieldIndex = Math.max(0, owners.length - 1);
    let message;

    if (owners.length === 1) {
      message = 'A single UBO must hold 100% ownership. Enter 100% to continue.';
    } else if (totalOwnership < 100) {
      const remaining = 100 - totalOwnership;
      message = `Combined ownership is ${totalOwnership.toFixed(2)}%. Add the remaining ${remaining.toFixed(2)}% so the total equals 100%.`;
    } else {
      const excess = totalOwnership - 100;
      message = `Combined ownership is ${totalOwnership.toFixed(2)}%. Reduce ownership by ${excess.toFixed(2)}% so the total equals 100%.`;
    }

    context.addIssue({
      code: 'custom',
      path: ['beneficialOwners', fieldIndex, 'ownershipPercentage'],
      message,
    });
  });

export const isOrganizationReadyForSubmission = (organization) => {
  const company = organization.company || {};
  const address = company.address || {};
  const companyResult = companySchema.safeParse({
    legalName: company.legalName,
    entityType: company.entityType,
    registrationNumber: company.registrationNumber,
    street: address.street,
    country: address.country,
    state: address.state,
    city: address.city,
    postalCode: company.postalCode,
  });
  const jurisdictionResult = jurisdictionSchema.safeParse(organization.jurisdiction || {});
  const ownersResult = beneficialOwnersSchema.safeParse({
    beneficialOwners: organization.beneficialOwners || [],
  });
  // This onboarding flow requires at least one successfully uploaded legal
  // document before review/submission. The backend remains responsible for any
  // additional document-policy checks configured for a specific deployment.
  const documentsComplete = (organization.documents || []).length > 0;

  return (
    companyResult.success &&
    jurisdictionResult.success &&
    ownersResult.success &&
    documentsComplete
  );
};
