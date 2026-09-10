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
        ownershipPercentage: 100,
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
    walletOwnershipRepository: {
      findInvestorOwner: async () => null,
      findIssuerOwner: async () => null,
    },
  });
  const walletAddress = '0x1111111111111111111111111111111111111111';

  const result = await service.submit(
    { userUid: 'user-1', roleName: 'Issuer' },
    { walletAddress },
  );

  assert.equal(update.fields.walletAddress, walletAddress);
  assert.equal(update.fields.rejectionReason, null);
  assert.equal(update.fields.canResubmit, false);
  assert.equal(result.walletAddress, walletAddress);
  assert.equal(result.status, 'submitted');
});

test('organization submission rejects a wallet assigned to an investor', async () => {
  let updateCalled = false;
  const service = new OrganizationService({
    repository: {
      findByUserUid: async () => ({ organizationUid: 'organization-1', status: 'draft' }),
      updateByUserUid: async () => { updateCalled = true; },
    },
    walletOwnershipRepository: {
      findInvestorOwner: async () => ({ investorUid: 'investor-1', userUid: 'investor-user-1', roleName: 'Investor' }),
    },
  });

  await assert.rejects(
    service.submit(
      { userUid: 'issuer-user-1', roleName: 'Issuer' },
      { walletAddress: `0x${'A'.repeat(40)}` },
    ),
    (error) => error.statusCode === 409 && error.code === 'WALLET_ALREADY_ASSIGNED_TO_INVESTOR',
  );
  assert.equal(updateCalled, false);
});

test('organization submission rejects a wallet registered to another issuer email', async () => {
  let updateCalled = false;
  const service = new OrganizationService({
    repository: {
      findByUserUid: async () => ({ organizationUid: 'organization-new', status: 'draft' }),
      updateByUserUid: async () => { updateCalled = true; },
    },
    walletOwnershipRepository: {
      findInvestorOwner: async () => null,
      findIssuerOwner: async (_wallet, excludedOrganizationUid) => {
        assert.equal(excludedOrganizationUid, 'organization-new');
        return { organizationUid: 'organization-existing', userUid: 'another-issuer', roleName: 'Issuer' };
      },
    },
  });

  await assert.rejects(
    service.submit(
      { userUid: 'new-issuer-user', roleName: 'Issuer' },
      { walletAddress: '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859' },
    ),
    (error) => error.statusCode === 409 && error.code === 'ISSUER_WALLET_ALREADY_REGISTERED',
  );
  assert.equal(updateCalled, false);
});

test('organization submission translates a concurrent issuer-wallet unique conflict', async () => {
  const organization = {
    organizationUid: 'organization-new', status: 'draft', legalCompanyName: 'Acme', entityTypeUid: 'entity-1',
    registrationNumber: 'REG-1', streetAddress: 'Street', countryUid: 'country-1', stateUid: 'state-1', cityUid: 'city-1',
    postalCode: '10001', countryOfIncorporationUid: 'country-1', dateOfIncorporation: '2020-01-01',
    taxIdentificationNumber: 'TAX-1', industryUid: 'industry-1', businessActivity: 'Tokenization',
  };
  const service = new OrganizationService({
    repository: {
      findByUserUid: async () => organization,
      listBeneficialOwners: async () => [{ fullName: 'Owner', dateOfBirth: '1980-01-01', nationalityCountryUid: 'country-1', ownershipPercentage: 100 }],
      listDocuments: async () => [],
      updateByUserUid: async () => {
        const error = new Error("Duplicate entry for key 'ukOrganizationMasterRegisteredWallet'");
        error.code = 'ER_DUP_ENTRY'; error.sqlMessage = error.message; throw error;
      },
    },
    optionRepository: {
      findEntityType: async () => ({}), findIndustry: async () => ({}), listRequiredDocumentTypes: async () => [],
    },
    locationService: { validateHierarchy: async () => {}, repository: { findCountry: async () => ({}) } },
    walletOwnershipRepository: { findInvestorOwner: async () => null, findIssuerOwner: async () => null },
  });

  await assert.rejects(
    service.submit(
      { userUid: 'new-issuer-user', roleName: 'Issuer' },
      { walletAddress: '0xDbBdcA99d568B54feaAb6c6D34e8f0093c509859' },
    ),
    (error) => error.statusCode === 409 && error.code === 'ISSUER_WALLET_ALREADY_REGISTERED',
  );
});

test('individual beneficial owners may hold less than 25 percent when total ownership is 100 percent', () => {
  const schemaResult = schemas.beneficialOwners.validate({
    owners: [
      {
        fullName: 'Owner One',
        dateOfBirth: '1980-01-01',
        nationalityCountryUid: '00000000-0000-4000-8000-000000000001',
        ownershipPercentage: 90,
      },
      {
        fullName: 'Owner Two',
        dateOfBirth: '1985-01-01',
        nationalityCountryUid: '00000000-0000-4000-8000-000000000002',
        ownershipPercentage: 10,
      },
    ],
    isDraft: false,
  });
  assert.equal(schemaResult.error, undefined);

  const service = new OrganizationService({});
  assert.doesNotThrow(() => service.validateOwners(schemaResult.value.owners, false));
});

test('completed beneficial ownership must equal 100 percent', () => {
  const service = new OrganizationService({});
  assert.throws(
    () => service.validateOwners([
      { fullName: 'Owner One', dateOfBirth: '1980-01-01', nationalityCountryUid: 'country-1', ownershipPercentage: 60 },
      { fullName: 'Owner Two', dateOfBirth: '1985-01-01', nationalityCountryUid: 'country-2', ownershipPercentage: 30 },
    ], false),
    /must equal 100%/,
  );
});

test('beneficial-owner drafts may be incomplete but cannot exceed 100 percent', () => {
  const service = new OrganizationService({});
  assert.doesNotThrow(() => service.validateOwners([
    { ownershipPercentage: 10 },
  ], true));
  assert.throws(
    () => service.validateOwners([
      { ownershipPercentage: 60 },
      { ownershipPercentage: 50 },
    ], true),
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
