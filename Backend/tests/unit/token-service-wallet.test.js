const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { CONTROLLER_ABI } = require('../../src/services/blockchain/blockchain-transaction.service');
const { TokenPriceIndexerService } = require('../../src/services/blockchain/token-price-indexer.service');
const address = n => `0x${n.repeat(40)}`;
test('new service-wallet event stores wallet for event token, not executor organization', async () => {
  const iface = new ethers.Interface(CONTROLLER_ABI);
  const event = iface.encodeEventLog(iface.getEvent('ServiceWalletUpdated'),
    [address('1'), address('2'), ethers.ZeroAddress, address('3')]);
  const parsed = iface.parseLog(event);
  assert.equal(parsed.args.executor, address('1'));
  assert.equal(parsed.args.token, address('2'));
  let saved;
  const service = new TokenPriceIndexerService({ config: { chainUid: 'chain', chainId: 1, platformControllerAddress: address('4') },
    tokenRepository: { findDeployedByAddress: async (token, chain) => {
      assert.equal(token, address('2')); assert.equal(chain, 'chain');
      return { tokenUid: 'token', tokenAddress: token, organizationUid: 'org', issuerWalletAddress: address('5') };
    } }, organizationRepository: { upsertServiceWallet: async data => { saved = data; return data; } } });
  assert.equal(await service.processServiceWalletEvent({ blockNumber: 7, index: 1 }, parsed, address('4'), {}), true);
  assert.equal(saved.tokenUid, 'token'); assert.equal(saved.mainWalletAddress, address('5'));
  assert.equal(saved.serviceWalletAddress, address('3'));
  assert.equal(await service.processServiceWalletEvent({}, parsed, address('6'), {}), false);
});
