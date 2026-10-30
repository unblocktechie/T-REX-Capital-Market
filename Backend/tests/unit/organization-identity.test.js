const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  OrganizationIdentityService,
} = require('../../src/services/blockchain/organization-identity.service');

const config = {
  sepoliaRpcUrl: 'https://example.invalid',
  deployerPrivateKey: 'test-private-key',
  deployerAddress: '0x3333333333333333333333333333333333333333',
  identityFactoryAddress: '0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15',
  idFactoryAccessManagerAddress: '0x2222222222222222222222222222222222222222',
  confirmations: 1,
  transactionTimeoutMs: 120000,
};

const dependencies = (contractFactory) => ({
  providerFactory: () => ({ destroy() {} }),
  walletFactory: () => ({ address: config.deployerAddress }),
  contractFactory,
});

test('organization identity service returns an existing factory identity without a transaction', async () => {
  const identityAddress = '0x4444444444444444444444444444444444444444';
  const calledAddresses = [];
  const service = new OrganizationIdentityService(config, dependencies((address) => {
    calledAddresses.push(address);
    return { getIdentity: async () => identityAddress };
  }));

  const result = await service.createOrganizationIdentity(
    '0x1111111111111111111111111111111111111111',
    'org-organization-1',
  );

  assert.deepEqual(result, {
    identityAddress,
    txHash: null,
    alreadyExisted: true,
  });
  assert.deepEqual(calledAddresses, [config.identityFactoryAddress]);
});

test('organization identity service waits for confirmation and returns the deployed identity', async () => {
  const identityAddress = '0x4444444444444444444444444444444444444444';
  const transactionHash = `0x${'a'.repeat(64)}`;
  let lookupCount = 0;
  const calledAddresses = [];
  const identityFactory = {
    getIdentity: async () => {
      lookupCount += 1;
      return lookupCount === 1 ? ethers.ZeroAddress : identityAddress;
    },
  };
  const accessManager = {
    createIdentity: async (walletAddress, salt) => {
      assert.equal(walletAddress, '0x1111111111111111111111111111111111111111');
      assert.equal(salt, 'org-organization-1');
      return {
        hash: transactionHash,
        wait: async (confirmations, timeout) => {
          assert.equal(confirmations, 1);
          assert.equal(timeout, 120000);
          return { status: 1, hash: transactionHash };
        },
      };
    },
  };
  const service = new OrganizationIdentityService(config, dependencies((address) => {
    calledAddresses.push(address);
    return address.toLowerCase() === config.identityFactoryAddress.toLowerCase()
      ? identityFactory
      : accessManager;
  }));

  const result = await service.createOrganizationIdentity(
    '0x1111111111111111111111111111111111111111',
    'org-organization-1',
  );

  assert.deepEqual(result, {
    identityAddress,
    txHash: transactionHash,
    blockNumber: null,
    blockHash: null,
    alreadyExisted: false,
  });
  assert.deepEqual(calledAddresses, [
    config.identityFactoryAddress,
    config.idFactoryAccessManagerAddress,
  ]);
});

test('organization identity service requires a chain access manager', async () => {
  const service = new OrganizationIdentityService(
    { ...config, idFactoryAccessManagerAddress: null },
    dependencies(() => ({})),
  );
  await assert.rejects(
    service.createOrganizationIdentity(
      '0x1111111111111111111111111111111111111111',
      'org-organization-1',
    ),
    /ID_FACTORY_ACCESS_MANAGER_ADDRESS/,
  );
});
