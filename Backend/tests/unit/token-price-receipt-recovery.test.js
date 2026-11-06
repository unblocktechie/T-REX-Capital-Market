const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { TokenPriceIndexerService } = require('../../src/services/blockchain/token-price-indexer.service');
const { CONTROLLER_ABI } = require('../../src/services/blockchain/blockchain-transaction.service');
const iface = new ethers.Interface(CONTROLLER_ABI);
const address = n => `0x${n.repeat(40)}`;
function fixture() {
  const record = { priceUpdateUid: 'p', chainId: 1, submissionMode: 'RELAYED',
    controllerAddress: address('1'), tokenAddress: address('2'), newPriceRaw: '15000000',
    priceDecimals: 6, signatureDeadline: 100, signatureV: 27,
    signatureR: ethers.ZeroHash, signatureS: ethers.ZeroHash, transactionHash: ethers.ZeroHash };
  const event = iface.encodeEventLog(iface.getEvent('TokenPriceUpdated'), [record.tokenAddress, 1000000n, 15000000n]);
  const state = { saved: [], failed: [], block: { hash: ethers.ZeroHash, timestamp: 1 },
    tx: { chainId: 1, to: record.controllerAddress, value: 0n,
      data: iface.encodeFunctionData('setPriceOnBehalfOf', [record.tokenAddress, 15000000n, 100, 27, ethers.ZeroHash, ethers.ZeroHash]) },
    receipt: { blockNumber: 1000, blockHash: ethers.ZeroHash, status: 1,
      logs: [{ ...event, address: record.controllerAddress, index: 0 }] } };
  const service = new TokenPriceIndexerService({ config: { chainId: 1 },
    priceRepository: { expireUnsignedPending: async () => {}, listSubmitted: async () => [record],
      confirmEvent: async data => state.saved.push(data), markFailed: async (...args) => state.failed.push(args) },
    transactionRunner: work => work({}) });
  const provider = { getTransactionReceipt: async () => state.receipt, getTransaction: async () => state.tx,
    getBlock: async () => state.block };
  return { state, run: (safe = 1001) => service.reconcileSubmitted(provider, safe, { eventsApplied: 0, failed: 0 }) };
}
test('known bot receipt confirms independently of historical checkpoint', async () => {
  const { state, run } = fixture(); await run();
  assert.equal(state.saved[0].matchedPriceUpdateUid, 'p');
  assert.equal(state.saved[0].newPriceFormatted, '15.0');
  assert.equal(state.saved[0].blockNumber, 1000);
});
test('unmined, unconfirmed, noncanonical, wrong-chain and unrelated calls cannot confirm', async () => {
  for (const mutate of [s => { s.receipt = null; }, s => { s.block = null; },
    s => { s.block.hash = '0x123'; }, s => { s.tx.chainId = 2; }, s => { s.tx.to = address('3'); },
    s => { s.tx.data = '0x'; }]) {
    const { state, run } = fixture(); mutate(state); await run(); assert.equal(state.saved.length, 0);
  }
  const { state, run } = fixture(); await run(999); assert.equal(state.saved.length, 0);
});
test('canonical reverted receipt and missing event fail rather than confirm', async () => {
  for (const mutate of [s => { s.receipt.status = 0; }, s => { s.receipt.logs = []; }]) {
    const { state, run } = fixture(); mutate(state); await run();
    assert.equal(state.saved.length, 0); assert.equal(state.failed.length, 1);
  }
});
