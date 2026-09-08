const { execute } = require('../database/connection');

// Allowed option sets for the investor onboarding form. Kept in one place so the
// options endpoint and the service-layer validation stay in sync. Values mirror the
// frontend constants (src/constants/investor.js).
// Country / state / city are selected from the shared location master (countryMaster,
// stateMaster, cityMaster) via the /locations reference endpoints — not enumerated here.
const GENDERS = ['male', 'female', 'other'];

const SOURCES_OF_WEALTH = [
  'Employment / Salary', 'Business Ownership', 'Professional Income', 'Investment Income',
  'Real Estate', 'Inheritance', 'Retirement Income', 'Other',
];

const NET_WORTH_RANGES = [
  'Below $100,000', '$100,000 – $500,000', '$500,000 – $1,000,000',
  '$1,000,000 – $5,000,000', 'Above $5,000,000',
];

const INVESTMENT_CAPACITIES = [
  'Below $10,000', '$10,000 – $50,000', '$50,000 – $100,000',
  '$100,000 – $500,000', '$500,000 – $1,000,000', 'Above $1,000,000',
];

const INVESTMENT_CATEGORIES = [
  { value: 'public_markets', label: 'Public Equities and Bonds' },
  { value: 'private_markets', label: 'Private Equity / Venture Capital' },
  { value: 'real_estate', label: 'Commercial Real Estate' },
  { value: 'digital_assets', label: 'Digital Assets and DeFi' },
];

const ACCREDITATION_TYPES = [
  { value: 'individual', label: 'Individual Accreditation' },
  { value: 'institutional', label: 'Institutional Accreditation' },
  { value: 'qualified_professional', label: 'Qualified Professional' },
];

const INVESTMENT_CATEGORY_CODES = INVESTMENT_CATEGORIES.map((item) => item.value);
const ACCREDITATION_TYPE_CODES = ACCREDITATION_TYPES.map((item) => item.value);
const DOCUMENT_CATEGORIES = ['kyc', 'accredited'];

class InvestorOptionRepository {
  async listDocumentTypes(category, executor) {
    return execute(
      `SELECT \`documentTypeUid\`, \`documentTypeCode\`, \`documentTypeName\`, \`documentCategory\`, \`description\`, \`isRequired\`
       FROM \`investorDocumentTypeMaster\`
       WHERE \`documentCategory\` = ? AND \`isActive\` = 1 AND \`isDeleted\` = 0
       ORDER BY \`displayOrder\`, \`documentTypeName\``,
      [category],
      executor,
    );
  }

  async findDocumentType(documentTypeUid, executor) {
    const rows = await execute(
      `SELECT \`documentTypeUid\`, \`documentTypeCode\`, \`documentTypeName\`, \`documentCategory\`
       FROM \`investorDocumentTypeMaster\`
       WHERE \`documentTypeUid\` = ? AND \`isActive\` = 1 AND \`isDeleted\` = 0 LIMIT 1`,
      [documentTypeUid],
      executor,
    );
    return rows[0] || null;
  }

  async listAll() {
    const [identityDocumentTypes, accreditationDocumentTypes] = await Promise.all([
      this.listDocumentTypes('kyc'),
      this.listDocumentTypes('accredited'),
    ]);
    return {
      identityDocumentTypes,
      accreditationDocumentTypes,
      genders: GENDERS,
      sourcesOfWealth: SOURCES_OF_WEALTH.map((value) => ({ value, label: value })),
      netWorthRanges: NET_WORTH_RANGES.map((value) => ({ value, label: value })),
      investmentCapacities: INVESTMENT_CAPACITIES.map((value) => ({ value, label: value })),
      investmentCategories: INVESTMENT_CATEGORIES,
      accreditationTypes: ACCREDITATION_TYPES,
      previousRwaExperienceOptions: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    };
  }
}

module.exports = {
  InvestorOptionRepository,
  GENDERS,
  SOURCES_OF_WEALTH,
  NET_WORTH_RANGES,
  INVESTMENT_CAPACITIES,
  INVESTMENT_CATEGORY_CODES,
  ACCREDITATION_TYPE_CODES,
  DOCUMENT_CATEGORIES,
};
