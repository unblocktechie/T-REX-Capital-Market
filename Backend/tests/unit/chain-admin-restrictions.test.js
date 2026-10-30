const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../../src/schemas/chain.schema');
const { ChainAdminService } = require('../../src/services/chain-admin.service');

test('network update schema permits only operational network fields', () => {
  const valid = schemas.chainUpdate.validate({
    publicRpcUrl: 'https://public.example',
    explorerUrl: 'https://explorer.example',
    fallbackRpcUrls: ['https://fallback.example'],
    isActive: false,
  }, { abortEarly: false });
  assert.equal(valid.error, undefined);

  const invalid = schemas.chainUpdate.validate({ chainName: 'Changed name' }, { abortEarly: false });
  assert.match(invalid.error.message, /chainName.*not allowed/i);
});

test('payment-token capabilities are immutable in update schema', () => {
  const invalid = schemas.paymentTokenUpdate.validate({ supportsPurchase: false }, { abortEarly: false });
  assert.match(invalid.error.message, /supportsPurchase.*not allowed/i);
  assert.equal(schemas.paymentTokenUpdate.validate({ isActive: false }).error, undefined);
});

test('network creation requires the complete deployment contract suite', () => {
  const invalid = schemas.chainCreate.validate({
    chainCode: 'NEW', chainName: 'New Chain', chainId: 123, networkName: 'new',
    nativeCurrencyName: 'Ether', nativeCurrencySymbol: 'ETH', rpcUrl: 'https://rpc.example',
    identityFactoryAddress: '0x0000000000000000000000000000000000000001',
    platformControllerAddress: '0x0000000000000000000000000000000000000002',
    trexFactoryAddress: '0x0000000000000000000000000000000000000003',
    deployerPrivateKey: '1'.repeat(64),
  }, { abortEarly: false });
  assert.match(invalid.error.message, /trexGatewayAddress.*required/i);
  assert.match(invalid.error.message, /paymentTokenAddresses.*required/i);
});

test('network update records an append-only before/after audit', async () => {
  let row = {
    chainUid: '60000000-0000-4000-8000-000000000001',
    chainCode: 'SEPOLIA', chainName: 'Sepolia', chainId: 11155111,
    publicRpcUrl: 'https://old.example', explorerUrl: 'https://explorer.example',
    fallbackRpcUrls: JSON.stringify(['https://fallback.example']), isActive: true,
    deployerPrivateKeyEncrypted: 'encrypted-value', createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const audits = [];
  const repository = {
    findRawByUid: async () => ({ ...row }),
    update: async (chainUid, data) => { row = { ...row, ...data, updatedAt: new Date() }; },
    findByUid: async () => ({ ...row }),
  };
  const service = new ChainAdminService({
    repository,
    auditRepository: { record: async (data) => audits.push(data) },
    runtimeService: {},
    imageService: {},
    transactionRunner: async (work) => work({}),
  });

  await service.update(row.chainUid, { publicRpcUrl: 'https://new.example' }, { userUid: 'admin-1' });
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].changedFields, ['publicRpcUrl']);
  assert.equal(audits[0].beforeData.publicRpcUrl, 'https://old.example');
  assert.equal(audits[0].afterData.publicRpcUrl, 'https://new.example');
  assert.equal(audits[0].afterData.hasDeployerPrivateKey, true);
  assert.equal(Object.prototype.hasOwnProperty.call(audits[0].afterData, 'deployerPrivateKeyEncrypted'), false);
});

test('network service rejects immutable fields even without request validation', async () => {
  const service = new ChainAdminService({
    repository: { findRawByUid: async () => ({ chainUid: 'chain-1' }) },
    auditRepository: {}, runtimeService: {}, imageService: {},
  });
  await assert.rejects(
    () => service.update('chain-1', { confirmations: 10 }, { userUid: 'admin-1' }),
    (error) => error.code === 'IMMUTABLE_NETWORK_FIELD',
  );
});

test('network contract validation requires the exact Platform Controller payment-token set', async () => {
  const provider = { getCode: async () => '0x1234', destroy: () => {} };
  const service = new ChainAdminService({
    repository: {}, auditRepository: {}, runtimeService: {}, imageService: {},
    dependencies: {
      providerFactory: () => provider,
      contractFactory: () => ({
        paymentTokens: async () => ['0x0000000000000000000000000000000000000020'],
      }),
    },
  });
  await assert.rejects(
    () => service.inspectContractSuite({
      rpcUrl: 'https://rpc.example',
      platformControllerAddress: '0x0000000000000000000000000000000000000006',
      paymentTokenAddresses: ['0x0000000000000000000000000000000000000018'],
    }),
    (error) => error.code === 'PAYMENT_TOKEN_REGISTRY_MISMATCH',
  );
});
