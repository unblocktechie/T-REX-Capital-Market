export const INVESTOR_DRAFT_STORAGE_KEY = 'trex.investor-onboarding-draft.v1';
export const INVESTOR_FAILURE_STORAGE_KEY = 'trex.investor-onboarding-next-failure.v1';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const INVESTOR_FLOW_VERSION = 2;

export const INVESTOR_STEPS = Object.freeze([
  { number: 1, title: 'Identity Details', mobileTitle: 'Identity' },
  { number: 2, title: 'Identity Documents', mobileTitle: 'Docs' },
  { number: 3, title: 'Compliance Questionnaire', mobileTitle: 'Compliance' },
  { number: 4, title: 'Review and Submit', mobileTitle: 'Review' },
  { number: 5, title: 'Create Investor Profile', mobileTitle: 'Profile' },
  { number: 6, title: 'Request Submitted', mobileTitle: 'Submitted' },
]);

export const COUNTRY_OPTIONS = [
  'Australia',
  'Canada',
  'France',
  'Germany',
  'India',
  'Italy',
  'Japan',
  'Singapore',
  'Switzerland',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
].map((value) => ({ value, label: value }));

export const NATIONALITY_OPTIONS = [
  'Australian',
  'Canadian',
  'French',
  'German',
  'Indian',
  'Italian',
  'Japanese',
  'Singaporean',
  'Swiss',
  'Emirati',
  'British',
  'American',
].map((value) => ({ value, label: value }));

export const IDENTITY_DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport', description: 'Government-issued passport photo page.' },
  { value: 'national_id', label: 'National ID', description: 'Valid national identity card.' },
  { value: 'drivers_license', label: 'Driver’s License', description: 'Current government-issued driver’s license.' },
];

export const SOURCE_OF_WEALTH_OPTIONS = [
  'Employment / Salary',
  'Business Ownership',
  'Professional Income',
  'Investment Income',
  'Real Estate',
  'Inheritance',
  'Retirement Income',
  'Other',
].map((value) => ({ value, label: value }));

export const NET_WORTH_OPTIONS = [
  'Below $100,000',
  '$100,000 – $500,000',
  '$500,000 – $1,000,000',
  '$1,000,000 – $5,000,000',
  'Above $5,000,000',
].map((value) => ({ value, label: value }));

export const INVESTMENT_CAPACITY_OPTIONS = [
  'Below $10,000',
  '$10,000 – $50,000',
  '$50,000 – $100,000',
  '$100,000 – $500,000',
  '$500,000 – $1,000,000',
  'Above $1,000,000',
].map((value) => ({ value, label: value }));

export const INVESTMENT_CATEGORIES = [
  { value: 'public_markets', label: 'Public Equities and Bonds' },
  { value: 'private_markets', label: 'Private Equity / Venture Capital' },
  { value: 'real_estate', label: 'Commercial Real Estate' },
  { value: 'digital_assets', label: 'Digital Assets and DeFi' },
];

export const ACCREDITATION_DOCUMENT_TYPE_OPTIONS = [
  'Bank Reference Letter',
  'Investment Portfolio Statement',
  'Net Worth Statement',
  'Income Certificate',
  'Tax Return',
  'Accountant or CPA Certification',
  'Accredited Investor Certificate',
].map((value) => ({ value, label: value }));

export const ACCREDITATION_OPTIONS = [
  {
    value: 'individual',
    label: 'Individual Accreditation',
    description: 'Net worth above $1 million excluding the primary residence, or qualifying annual income according to applicable requirements.',
  },
  {
    value: 'institutional',
    label: 'Institutional Accreditation',
    description: 'An entity meeting the required asset threshold or operating as a regulated institution.',
  },
  {
    value: 'qualified_professional',
    label: 'Qualified Professional',
    description: 'A person holding relevant professional certifications, licenses, or qualifying investment experience.',
  },
];

export const INITIAL_INVESTOR_STATE = Object.freeze({
  flowVersion: INVESTOR_FLOW_VERSION,
  currentStep: 1,
  highestStepReached: 1,
  identity: {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    streetAddress: '',
    city: '',
    cityName: '',
    stateProvince: '',
    stateProvinceName: '',
    countryOfResidence: '',
    countryOfResidenceName: '',
  },
  documents: {
    identityDocuments: [],
  },
  compliance: {
    sourceOfWealth: '',
    estimatedNetWorth: '',
    annualInvestmentCapacity: '',
    investmentCategories: [],
    yearsOfExperience: '',
    previousRwaExperience: '',
    rwaExperienceDescription: '',
    accreditationType: '',
    accreditationDocuments: [],
  },
  wallet: {
    isConnected: false,
    address: '',
    network: '',
    balance: '',
  },
  investorProfile: {
    profileId: '',
    onchainId: '',
    status: '',
  },
  investmentRequest: {
    requestId: '',
    assetName: '',
    requestedAmount: '',
    submissionDate: '',
    status: '',
  },
  lastUpdated: '',
});
