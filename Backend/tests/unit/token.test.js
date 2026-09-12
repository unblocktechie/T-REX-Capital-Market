const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const ethers = require('ethers');
const schemas = require('../../src/schemas/token.schema');
const { TokenService } = require('../../src/services/token.service');
const { TokenImageService } = require('../../src/services/common/token-image.service');
const {
  TokenDeploymentReceiptService,
  trexFactoryEventAbi,
} = require('../../src/services/blockchain/token-deployment-receipt.service');

const organization = {
  organizationUid: 'organization-1',
  status: 'approved',
  walletAddress: '0x1111111111111111111111111111111111111111',
};
const issuer = { userUid: 'user-1', roleName: 'Issuer' };
const PLATFORM_CONTROLLER = '0x40e81FAA4e6D54ae0632DF146939bB5858359271';
const LEGACY_PLATFORM_CONTROLLER = '0x9BEFDF75Dc94bbB36532c5d7A74daab28714f579';

test('token information trims names, uppercases symbols, and accepts only supported decimals', () => {
  const valid = schemas.tokenInformation.validate({
    tokenName: '  Acme Security Token  ',
    tokenSymbol: 'acme1',
    decimals: 18,
    initialTokenPrice: 1,
    treasuryWalletAddress: organization.walletAddress,
    tokenDescription: 'Institutional token',
    isDraft: false,
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.tokenName, 'Acme Security Token');
  assert.equal(valid.value.tokenSymbol, 'ACME1');

  assert.ok(schemas.tokenInformation.validate({
    tokenName: 'Acme  Token',
    tokenSymbol: 'ACME',
    decimals: 12,
    isDraft: true,
  }).error);
});

test('maximum balance per investor accepts an absolute token amount above 100', () => {
  const result = schemas.tokenCompliance.validate({
    maxInvestors: 2000,
    maxBalancePerInvestor: 10000,
    countryRestrictionMode: 'allowlist',
    countryUids: ['00000000-0000-4000-8000-000000000840'],
    isDraft: false,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.maxBalancePerInvestor, 10000);
});

test('current token price update accepts a positive value with up to 18 decimals', () => {
  assert.equal(schemas.tokenPriceUpdate.validate({ currentTokenPrice: '12.345678' }).error, undefined);
  assert.ok(schemas.tokenPriceUpdate.validate({ currentTokenPrice: 0 }).error);
  assert.ok(schemas.tokenPriceUpdate.validate({ currentTokenPrice: -1 }).error);
});

test('saving the launch price initializes the current token price to the same value', async () => {
  let savedFields;
  const service = new TokenService({
    repository: {
      findByUserUid: async () => ({
        tokenUid: 'token-1', status: 'draft', tokenAgentWalletAddress: PLATFORM_CONTROLLER,
      }),
      updateByUserUid: async (_userUid, fields) => { savedFields = fields; return fields; },
    },
    organizationRepository: { findByUserUid: async () => organization },
  });

  await service.saveInformation(issuer, { initialTokenPrice: 4.25, isDraft: true });
  assert.equal(savedFields.initialTokenPrice, 4.25);
  assert.equal(savedFields.currentTokenPrice, 4.25);
  assert.equal(savedFields.tokenAgentWalletAddress, PLATFORM_CONTROLLER);
});

test('creating a token draft assigns the Platform Controller before any wizard step is saved', async () => {
  let creationData;
  const service = new TokenService({
    repository: {
      findByUserUid: async () => null,
      createForOrganization: async (_organization, _userUid, data) => {
        creationData = data;
        return { tokenUid: 'token-1', ...data };
      },
    },
  });

  const result = await service.getOrCreate(issuer, organization);
  assert.equal(creationData.tokenAgentWalletAddress, PLATFORM_CONTROLLER);
  assert.equal(result.tokenAgentWalletAddress, PLATFORM_CONTROLLER);
});

test('only the owning issuer can update a deployed token current price without changing launch price', async () => {
  const token = {
    tokenUid: 'token-1', organizationUid: organization.organizationUid,
    status: 'deployed', isActive: true, initialTokenPrice: '1.00', currentTokenPrice: '1.00',
  };
  let update;
  const service = new TokenService({
    repository: {
      findByUserUid: async () => token,
      updateCurrentPriceByOwner: async (userUid, tokenUid, currentTokenPrice) => {
        update = { userUid, tokenUid, currentTokenPrice };
        return { ...token, currentTokenPrice };
      },
    },
    organizationRepository: { findByUserUid: async () => organization },
  });

  const result = await service.updateCurrentPrice(issuer, { currentTokenPrice: 2.75 });
  assert.deepEqual(update, { userUid: issuer.userUid, tokenUid: token.tokenUid, currentTokenPrice: 2.75 });
  assert.equal(result.initialTokenPrice, '1.00');
  assert.equal(result.currentTokenPrice, 2.75);
});

test('current price cannot be updated for another organization token', async () => {
  const service = new TokenService({
    repository: {
      findByUserUid: async () => ({
        tokenUid: 'token-2', organizationUid: 'another-organization', status: 'deployed', isActive: true,
      }),
    },
    organizationRepository: { findByUserUid: async () => organization },
  });
  await assert.rejects(
    service.updateCurrentPrice(issuer, { currentTokenPrice: 2 }),
    (error) => error.code === 'TOKEN_NOT_FOUND' && error.statusCode === 404,
  );
});

test('token submission requires a 32-byte EVM transaction hash', () => {
  assert.equal(schemas.tokenSubmit.validate({ transactionHash: `0x${'a'.repeat(64)}` }).error, undefined);
  assert.ok(schemas.tokenSubmit.validate({ transactionHash: '0x1234' }).error);
});

test('completed claims require at least one active claim topic and trusted issuer consent', async () => {
  const service = new TokenService({
    repository: {
      findByUserUid: async () => ({ tokenUid: 'token-1', status: 'draft', currentStep: 'claims' }),
    },
    organizationRepository: { findByUserUid: async () => organization },
    optionRepository: { findClaimTopics: async () => [] },
  });

  await assert.rejects(
    service.saveClaims(issuer, {
      claimTopicUids: [],
      organizationActsAsTrustedClaimIssuer: true,
      isDraft: false,
    }),
    /At least one claim topic/i,
  );
});

test('a new token keeps its assigned Platform Controller while identity manager follows the organization wallet', async () => {
  const repository = {
    findByUserUid: async () => ({
      tokenUid: 'token-1', status: 'draft', currentStep: 'governance',
      tokenAgentWalletAddress: PLATFORM_CONTROLLER,
    }),
    updateByUserUid: async (userUid, fields) => ({ userUid, ...fields }),
  };
  const service = new TokenService({
    repository,
    organizationRepository: { findByUserUid: async () => organization },
  });

  const result = await service.saveGovernance(issuer, {
    // Legacy frontend values are ignored; the backend owns the Token Agent value.
    tokenAgentWalletAddress: organization.walletAddress,
    identityManagerWalletAddress: organization.walletAddress,
    isDraft: false,
  });
  assert.equal(result.currentStep, 'review');
  assert.equal(result.tokenAgentWalletAddress, PLATFORM_CONTROLLER);

  await assert.rejects(
    service.saveGovernance(issuer, {
      identityManagerWalletAddress: '0x2222222222222222222222222222222222222222',
      isDraft: false,
    }),
    /must match the approved organization walletAddress/,
  );
});

test('editing an existing token preserves the Platform Controller assigned at creation', async () => {
  let savedFields;
  const existing = {
    tokenUid: 'legacy-token', status: 'draft', currentStep: 'tokenInformation',
    tokenAgentWalletAddress: LEGACY_PLATFORM_CONTROLLER,
  };
  const service = new TokenService({
    repository: {
      findByUserUid: async () => existing,
      updateByUserUid: async (_userUid, fields) => { savedFields = fields; return { ...existing, ...fields }; },
    },
    organizationRepository: { findByUserUid: async () => organization },
  });

  const result = await service.saveInformation(issuer, { tokenName: 'Legacy Token', isDraft: true });
  assert.equal(savedFields.tokenAgentWalletAddress, LEGACY_PLATFORM_CONTROLLER);
  assert.equal(result.tokenAgentWalletAddress, LEGACY_PLATFORM_CONTROLLER);
});

test('deployed or ready-to-deploy token cannot be edited into another token', () => {
  const service = new TokenService({});
  assert.throws(() => service.assertEditable({ status: 'deployed' }), /cannot be edited/i);
  assert.throws(() => service.assertEditable({ status: 'readyToDeploy' }), /cannot be edited/i);
});

test('compliance restrictions persist ISO 3166-1 numeric codes from country master', async () => {
  let persistedCountries;
  const repository = {
    findByUserUid: async () => ({ tokenUid: 'token-1', status: 'draft', currentStep: 'compliance' }),
    replaceCountryRestrictions: async (tokenUid, countries) => {
      persistedCountries = countries;
      return countries.map((country) => ({
        countryUid: country.countryUid,
        iso3166NumericCode: country.numericCode,
      }));
    },
    updateByUserUid: async (userUid, fields) => ({ userUid, ...fields }),
  };
  const service = new TokenService({
    repository,
    organizationRepository: { findByUserUid: async () => organization },
    locationRepository: {
      findCountries: async () => [{
        countryUid: '00000000-0000-4000-8000-000000000840',
        countryCode: 'US',
        numericCode: '840',
        countryName: 'United States',
      }],
    },
    transactionRunner: (callback) => callback({ transaction: true }),
  });

  const result = await service.saveCompliance(issuer, {
    maxInvestors: 2000,
    maxBalancePerInvestor: 10000,
    countryRestrictionMode: 'allowlist',
    countryUids: ['00000000-0000-4000-8000-000000000840'],
    isDraft: false,
  });

  assert.equal(persistedCountries[0].numericCode, '840');
  assert.equal(result.countryRestrictions[0].iso3166NumericCode, '840');
  assert.equal(result.token.currentStep, 'governance');
});

test('final token submission verifies the frontend transaction and marks the only token deployed', async () => {
  let update;
  const token = {
    tokenUid: 'token-1',
    status: 'draft',
    tokenName: 'Acme Security Token',
    tokenSymbol: 'ACME',
    decimals: 18,
    initialTokenPrice: 1,
    treasuryWalletAddress: organization.walletAddress,
    imageStorageKey: 'token.webp',
    trustedClaimIssuerWalletAddress: organization.walletAddress,
    maxInvestors: 2000,
    maxBalancePerInvestor: 10000,
    countryRestrictionMode: 'allowlist',
    tokenAgentWalletAddress: PLATFORM_CONTROLLER,
    identityManagerWalletAddress: organization.walletAddress,
  };
  const service = new TokenService({
    repository: {
      findByUserUid: async () => token,
      listClaimTopics: async () => [{ claimTopicUid: 'claim-1', value: 1 }],
      listCountryRestrictions: async () => [{ countryUid: 'country-1', iso3166NumericCode: '840' }],
      updateDeploymentByUserUid: async (userUid, fields) => {
        update = { userUid, fields };
        return { ...token, ...fields };
      },
    },
    organizationRepository: { findByUserUid: async () => organization },
    imageService: { resolve: () => __filename },
    deploymentReceiptService: {
      verify: async () => ({
        platformAgentWallet: organization.walletAddress,
        tokenAddress: '0x2222222222222222222222222222222222222222',
        identityRegistryAddress: '0x3333333333333333333333333333333333333333',
        identityRegistryStorageAddress: '0x4444444444444444444444444444444444444444',
        trustedIssuersRegistryAddress: '0x5555555555555555555555555555555555555555',
        claimTopicsRegistryAddress: '0x6666666666666666666666666666666666666666',
        modularComplianceAddress: '0x7777777777777777777777777777777777777777',
        deployTxHash: `0x${'a'.repeat(64)}`,
        deployedAtBlock: 9000000,
        deployedAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    },
  });

  const result = await service.submit(issuer, { transactionHash: `0x${'a'.repeat(64)}` });
  assert.equal(update.fields.status, 'deployed');
  assert.equal(update.fields.currentStep, 'deployed');
  assert.equal(update.fields.contractAddress, '0x2222222222222222222222222222222222222222');
  assert.equal(update.fields.isDraft, false);
  assert.equal(result.status, 'deployed');
});

test('TREX deployment receipt decoder extracts all suite addresses and block metadata', async () => {
  const factoryAddress = '0x8888888888888888888888888888888888888888';
  const transactionHash = `0x${'a'.repeat(64)}`;
  const factoryInterface = new ethers.Interface(trexFactoryEventAbi);
  const event = factoryInterface.encodeEventLog(
    factoryInterface.getEvent('TREXSuiteDeployed'),
    [
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555',
      '0x6666666666666666666666666666666666666666',
      '0x7777777777777777777777777777777777777777',
      'token-1',
    ],
  );
  const service = new TokenDeploymentReceiptService({
    sepoliaRpcUrl: 'https://sepolia.example.test',
    trexFactoryAddress: factoryAddress,
    confirmations: 1,
    transactionTimeoutMs: 30000,
  }, {
    providerFactory: () => ({
      waitForTransaction: async () => ({
        hash: transactionHash,
        from: organization.walletAddress,
        status: 1,
        blockNumber: 9000000,
        logs: [{ address: factoryAddress, topics: event.topics, data: event.data }],
      }),
      getBlock: async () => ({ timestamp: 1785456000 }),
      destroy: () => {},
    }),
  });

  const result = await service.verify(transactionHash);
  assert.equal(result.tokenAddress, '0x2222222222222222222222222222222222222222');
  assert.equal(result.identityRegistryAddress, '0x3333333333333333333333333333333333333333');
  assert.equal(result.identityRegistryStorageAddress, '0x4444444444444444444444444444444444444444');
  assert.equal(result.trustedIssuersRegistryAddress, '0x5555555555555555555555555555555555555555');
  assert.equal(result.claimTopicsRegistryAddress, '0x6666666666666666666666666666666666666666');
  assert.equal(result.modularComplianceAddress, '0x7777777777777777777777777777777777777777');
  assert.equal(result.deployTxHash, transactionHash);
  assert.equal(result.deployedAtBlock, 9000000);
  assert.equal(result.deployedAt.toISOString(), '2026-07-31T00:00:00.000Z');
});

test('TREX deployment receipt decoder rejects a mined failed transaction', async () => {
  const transactionHash = `0x${'c'.repeat(64)}`;
  const service = new TokenDeploymentReceiptService({
    sepoliaRpcUrl: 'https://sepolia.example.test',
    trexFactoryAddress: '0x8888888888888888888888888888888888888888',
    confirmations: 1,
    transactionTimeoutMs: 30000,
  }, {
    providerFactory: () => ({
      waitForTransaction: async () => ({
        hash: transactionHash,
        from: organization.walletAddress,
        status: 0,
        blockNumber: 9000000,
        logs: [],
      }),
      destroy: () => {},
    }),
  });

  await assert.rejects(
    service.verify(transactionHash),
    (error) => error.deployTxHash === transactionHash
      && error.platformAgentWallet === organization.walletAddress
      && /failed on-chain/i.test(error.message),
  );
});

test('failed TREX receipt extraction persists deploymentFailed and a diagnostic message', async () => {
  let update;
  const token = {
    tokenUid: 'token-1',
    status: 'draft',
    tokenName: 'Acme Security Token',
    tokenSymbol: 'ACME',
    decimals: 18,
    initialTokenPrice: 1,
    treasuryWalletAddress: organization.walletAddress,
    imageStorageKey: 'token.webp',
    trustedClaimIssuerWalletAddress: organization.walletAddress,
    maxInvestors: 2000,
    maxBalancePerInvestor: 10000,
    countryRestrictionMode: 'allowlist',
    tokenAgentWalletAddress: PLATFORM_CONTROLLER,
    identityManagerWalletAddress: organization.walletAddress,
  };
  const transactionHash = `0x${'b'.repeat(64)}`;
  const service = new TokenService({
    repository: {
      findByUserUid: async () => token,
      listClaimTopics: async () => [{ claimTopicUid: 'claim-1', value: 1 }],
      listCountryRestrictions: async () => [{ countryUid: 'country-1', iso3166NumericCode: '840' }],
      updateDeploymentByUserUid: async (userUid, fields) => {
        update = fields;
        return { ...token, ...fields };
      },
    },
    organizationRepository: { findByUserUid: async () => organization },
    imageService: { resolve: () => __filename },
    deploymentReceiptService: {
      verify: async () => {
        const error = new Error('TREXSuiteDeployed event was not found in the transaction receipt.');
        error.deployTxHash = transactionHash;
        throw error;
      },
    },
  });

  await assert.rejects(
    service.submit(issuer, { transactionHash }),
    (error) => error.code === 'TOKEN_DEPLOYMENT_VERIFICATION_FAILED' && error.statusCode === 422,
  );
  assert.equal(update.status, 'deploymentFailed');
  assert.equal(update.deployTxHash, transactionHash);
  assert.match(update.contractTxnMessage, /TREXSuiteDeployed event was not found/i);
});

test('token image verifies decoded format and produces an optimized metadata-free WebP', async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'trex-token-image-test-'));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const imageService = new TokenImageService({
    directory,
    maxFileSizeBytes: 2 * 1024 * 1024,
    minDimension: 256,
    maxDimension: 4096,
    optimizedMaxDimension: 1024,
    virusScannerPath: null,
    virusScanTimeoutMs: 30000,
  });
  const png = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 30, g: 80, b: 150, alpha: 1 },
    },
  }).png().withMetadata({ orientation: 1 }).toBuffer();

  await assert.rejects(
    imageService.process({
      buffer: png,
      originalname: 'spoofed.jpg',
      mimetype: 'image/jpeg',
    }),
    (error) => error.code === 'TOKEN_IMAGE_SIGNATURE_MISMATCH',
  );

  const result = await imageService.process({
    buffer: png,
    originalname: 'token-logo.png',
    mimetype: 'image/png',
  });
  const output = await sharp(await fs.promises.readFile(result.filePath)).metadata();
  assert.equal(output.format, 'webp');
  assert.equal(output.width, 512);
  assert.equal(output.height, 512);
  assert.equal(output.exif, undefined);
  assert.equal(result.fields.imageVirusScanStatus, 'notConfigured');
});

test('token image rejects dimensions below 256 by 256', async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'trex-token-image-small-'));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const imageService = new TokenImageService({
    directory,
    maxFileSizeBytes: 2 * 1024 * 1024,
    minDimension: 256,
    maxDimension: 4096,
    optimizedMaxDimension: 1024,
    virusScannerPath: null,
    virusScanTimeoutMs: 30000,
  });
  const png = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 3,
      background: 'black',
    },
  }).png().toBuffer();

  await assert.rejects(
    imageService.process({ buffer: png, originalname: 'small.png', mimetype: 'image/png' }),
    (error) => error.code === 'TOKEN_IMAGE_TOO_SMALL',
  );
});

test('reconcileBySalt recovers the full deployment (all suite addresses + sender + tx) from the event', async () => {
  const owner = '0x1111111111111111111111111111111111111111';
  const tokenAddress = '0x2222222222222222222222222222222222222222';
  const factoryAddr = '0xe221247C52ece62027eb7D01D0f522d7363Fe875';
  const txHash = `0x${'d'.repeat(64)}`;
  const iface = new ethers.Interface(trexFactoryEventAbi);
  const enc = iface.encodeEventLog(iface.getEvent('TREXSuiteDeployed'), [
    tokenAddress,
    '0x3333333333333333333333333333333333333333',
    '0x4444444444444444444444444444444444444444',
    '0x5555555555555555555555555555555555555555',
    '0x6666666666666666666666666666666666666666',
    '0x7777777777777777777777777777777777777777',
    `${owner}My Token`,
  ]);
  const log = { address: factoryAddr, topics: enc.topics, data: enc.data, transactionHash: txHash, blockNumber: 9000000 };
  const service = new TokenDeploymentReceiptService(
    { sepoliaRpcUrl: 'https://sepolia.example.test', trexFactoryAddress: factoryAddr, confirmations: 1, transactionTimeoutMs: 30000 },
    {
      providerFactory: () => ({
        getBlockNumber: async () => 9000005,
        getLogs: async () => [log],
        getTransaction: async () => ({ from: owner }),
        getBlock: async () => ({ timestamp: 1785456000 }),
        destroy() {},
      }),
      factoryReaderFactory: () => ({ getToken: async () => tokenAddress }),
    },
  );

  const r = await service.reconcileBySalt({ owner, tokenName: 'My Token' });
  assert.equal(r.deployed, true);
  assert.equal(r.tokenAddress, tokenAddress);
  assert.equal(r.transactionHash, txHash);
  assert.equal(r.deployment.platformAgentWallet, owner);
  assert.equal(r.deployment.identityRegistryAddress, '0x3333333333333333333333333333333333333333');
  assert.equal(r.deployment.identityRegistryStorageAddress, '0x4444444444444444444444444444444444444444');
  assert.equal(r.deployment.trustedIssuersRegistryAddress, '0x5555555555555555555555555555555555555555');
  assert.equal(r.deployment.claimTopicsRegistryAddress, '0x6666666666666666666666666666666666666666');
  assert.equal(r.deployment.modularComplianceAddress, '0x7777777777777777777777777777777777777777');
  assert.equal(r.deployment.deployTxHash, txHash);
  assert.equal(r.deployment.deployedAtBlock, 9000000);
});

test('reconcileBySalt reports not-deployed when the factory has no token for the salt', async () => {
  const service = new TokenDeploymentReceiptService(
    { sepoliaRpcUrl: 'https://sepolia.example.test', trexFactoryAddress: '0xe221247C52ece62027eb7D01D0f522d7363Fe875', confirmations: 1, transactionTimeoutMs: 30000 },
    {
      providerFactory: () => ({ getBlockNumber: async () => 100, getLogs: async () => [], destroy() {} }),
      factoryReaderFactory: () => ({ getToken: async () => ethers.ZeroAddress }),
    },
  );
  const r = await service.reconcileBySalt({ owner: '0x1111111111111111111111111111111111111111', tokenName: 'My Token' });
  assert.equal(r.deployed, false);
  assert.equal(r.tokenAddress, null);
});
