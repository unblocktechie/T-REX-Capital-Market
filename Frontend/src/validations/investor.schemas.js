import { z } from 'zod';

const namePattern = /^[\p{L}][\p{L}\s'’-]*$/u;
const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const calculateAge = (dateString) => {
  const birthDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return -1;
  const current = today();
  let age = current.getFullYear() - birthDate.getFullYear();
  const monthDifference = current.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && current.getDate() < birthDate.getDate())) age -= 1;
  return age;
};

const personName = (label) =>
  z
    .string()
    .trim()
    .min(2, `${label} must contain at least 2 characters.`)
    .max(50, `${label} must not exceed 50 characters.`)
    .regex(namePattern, `${label} may contain letters, spaces, apostrophes, and hyphens only.`);

const uploadedFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  status: z.string(),
});

const typedDocumentSchema = uploadedFileSchema.extend({
  documentType: z.string().min(1, 'Select a document type for every uploaded file.'),
  documentTypeLabel: z.string().optional(),
});

export const identityDetailsSchema = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required.')
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), 'Enter a valid date of birth.')
    .refine((value) => new Date(`${value}T00:00:00`) <= today(), 'Date of birth cannot be in the future.')
    .refine((value) => calculateAge(value) >= 18, 'You must be at least 18 years old.'),
  gender: z.string().min(1, 'Gender is required.'),
  streetAddress: z
    .string()
    .trim()
    .min(5, 'Street address must contain at least 5 characters.')
    .max(150, 'Street address must not exceed 150 characters.'),
  city: z.string().optional().default(''),
  stateProvince: z.string().min(1, 'State or province is required.'),
  countryOfResidence: z.string().min(1, 'Country of residence is required.'),
});

export const complianceSchema = z.object({
  sourceOfWealth: z.string().min(1, 'Primary source of wealth is required.'),
  estimatedNetWorth: z.string().min(1, 'Estimated net worth is required.'),
  annualInvestmentCapacity: z.string().min(1, 'Annual investment capacity is required.'),
  investmentCategories: z.array(z.string()).min(1, 'Select at least one investment category.'),
  yearsOfExperience: z
    .string()
    .trim()
    .min(1, 'Years of investment experience is required.')
    .regex(/^\d+$/, 'Enter a whole number from 0 to 80.')
    .refine((value) => Number(value) >= 0 && Number(value) <= 80, 'Enter a whole number from 0 to 80.'),
  previousRwaExperience: z.enum(['yes', 'no'], { error: 'Select whether you have previous RWA experience.' }),
  rwaExperienceDescription: z.string().trim().max(600, 'Description must not exceed 600 characters.').optional(),
  accreditationType: z.string().min(1, 'Select an accreditation status.'),
  accreditationDocuments: z
    .array(typedDocumentSchema)
    .min(1, 'Upload at least one accreditation document.')
    .refine(
      (files) => files.every((file) => file.status === 'success' || file.status === 'verified'),
      'Wait for every accreditation document to finish uploading or remove failed files.',
    ),
});

export const documentsSchema = z.object({
  identityDocuments: z
    .array(typedDocumentSchema)
    .min(1, 'Upload at least one identity document.')
    .refine(
      (files) => files.every((file) => file.status === 'success' || file.status === 'verified'),
      'Wait for every identity document to finish uploading or remove failed files.',
    )
    .refine(
      (files) => new Set(files.map((file) => file.documentType)).size === files.length,
      'Each identity document type can only be added once.',
    ),
});

export const isInvestorOnboardingReady = (state) =>
  identityDetailsSchema.safeParse(state.identity).success &&
  documentsSchema.safeParse(state.documents).success &&
  complianceSchema.safeParse({
    ...state.compliance,
    accreditationDocuments: state.compliance.accreditationDocuments.filter(
      (file) => file.status === 'success' || file.status === 'verified',
    ),
  }).success;
