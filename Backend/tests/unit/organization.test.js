const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../../src/schemas/organization.schema');
const { OrganizationService } = require('../../src/services/organization.service');
const { LocationService } = require('../../src/services/location.service');

test('company-information draft accepts partial form data', () => {
  const { error, value } = schemas.companyInformation.validate({ legalCompanyName: 'Acme Holdings', isDraft: true });
  assert.equal(error, undefined);
  assert.equal(value.isDraft, true);
});

test('completed company step rejects missing required fields', async () => {
  const service = new OrganizationService({
    repository: { findByUserUid: async () => null },
    optionRepository: {},
    locationService: {},
  });
  await assert.rejects(
    service.saveCompanyInformation({ userUid: 'user-1', roleName: 'Issuer' }, { legalCompanyName: 'Acme', isDraft: false }),
    (error) => error.statusCode === 400 && /incomplete/.test(error.message),
  );
});

test('organization onboarding rejects non-issuer roles', async () => {
  const service = new OrganizationService({ repository: {}, optionRepository: {}, locationService: {} });
  await assert.rejects(
    service.getFullForm({ userUid: 'user-1', roleName: 'Investor' }),
    (error) => error.statusCode === 403,
  );
});

test('mark user notified sets isUserNotified to true', async () => {
  let update;
  const service = new OrganizationService({
    repository: {
      findByUserUid: async () => ({ organizationUid: 'organization-1' }),
      updateByUserUid: async (userUid, fields) => {
        update = { userUid, fields };
        return { organizationUid: 'organization-1', isUserNotified: true };
      },
    },
  });

  const result = await service.markUserNotified({ userUid: 'user-1', roleName: 'Issuer' });
  assert.deepEqual(update, { userUid: 'user-1', fields: { isUserNotified: true } });
  assert.equal(result.isUserNotified, true);
});

test('mark user notified rejects an issuer without an organization', async () => {
  const service = new OrganizationService({
    repository: { findByUserUid: async () => null },
  });

  await assert.rejects(
    service.markUserNotified({ userUid: 'user-1', roleName: 'Issuer' }),
    (error) => error.statusCode === 404,
  );
});

test('organization submission requires a valid EVM wallet address', () => {
  const valid = schemas.submitOrganization.validate({
    walletAddress: '0x1111111111111111111111111111111111111111',
  });
  assert.equal(valid.error, undefined);

  const missing = schemas.submitOrganization.validate({});
  assert.ok(missing.error);

  const invalid = schemas.submitOrganization.validate({ walletAddress: 'not-a-wallet' });
  assert.match(invalid.error.message, /valid EVM wallet address/);
});

test('organization submission persists the wallet address', async () => {
  let update;
  const organization = {
    organizationUid: 'organization-1',
    legalCompanyName: 'Acme',
    entityTypeUid: 'entity-1',
    registrationNumber: 'REG-1',
    streetAddress: '123 Main Street',
    countryUid: 'country-1',
    stateUid: 'state-1',
    cityUid: 'city-1',
    postalCode: '10001',
    countryOfIncorporationUid: 'country-1',
    dateOfIncorporation: '2020-01-01',
    taxIdentificationNumber: 'TAX-1',
    industryUid: 'industry-1',
    businessActivity: 'Asset tokenization',
    status: 'draft',
  };
  const service = new OrganizationService({
    repository: {
      findByUserUid: async () => organization,
      listBeneficialOwners: async () => [{
        fullName: 'Jane Doe',
        dateOfBirth: '1980-01-01',
        nationalityCountryUid: 'country-1',
        ownershipPercentage: 50,
      }],
      listDocuments: async () => [{ documentTypeUid: 'document-type-1' }],
      updateByUserUid: async (userUid, fields) => {
        update = { userUid, fields };
        return { ...organization, ...fields };
      },
    },
    optionRepository: {
      findEntityType: async () => ({}),
      findIndustry: async () => ({}),
      listRequiredDocumentTypes: async () => [{ documentTypeUid: 'document-type-1' }],
    },
    locationService: {
      validateHierarchy: async () => {},
      repository: { findCountry: async () => ({}) },
    },
  });
  const walletAddress = '0x1111111111111111111111111111111111111111';

  const result = await service.submit(
    { userUid: 'user-1', roleName: 'Issuer' },
    { walletAddress },
  );

  assert.equal(update.fields.walletAddress, walletAddress);
  assert.equal(result.walletAddress, walletAddress);
  assert.equal(result.status, 'submitted');
});

test('beneficial ownership cannot exceed 100 percent', () => {
  const service = new OrganizationService({});
  assert.throws(
    () => service.validateOwners([
      { fullName: 'Owner One', dateOfBirth: '1980-01-01', nationalityCountryUid: 'country-1', ownershipPercentage: 60 },
      { fullName: 'Owner Two', dateOfBirth: '1985-01-01', nationalityCountryUid: 'country-2', ownershipPercentage: 50 },
    ], false),
    /cannot exceed 100%/,
  );
});

test('location hierarchy rejects a state from another country', async () => {
  const service = new LocationService({
    findCountry: async () => ({ countryUid: 'country-1' }),
    findState: async () => ({ stateUid: 'state-1', countryUid: 'country-2' }),
  });
  await assert.rejects(
    service.validateHierarchy('country-1', 'state-1'),
    /does not belong to the selected country/,
  );
});
