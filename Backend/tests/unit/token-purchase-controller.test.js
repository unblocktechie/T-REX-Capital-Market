const test = require('node:test');
const assert = require('node:assert/strict');
const { createTokenPurchaseController } = require('../../src/api/v1/controllers/token-purchase.controller');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('confirm returns HTTP 200 when verification remains pending', async () => {
  const controller = createTokenPurchaseController({
    confirm: async () => ({
      pendingVerification: true,
      purchase: { purchaseUid: 'purchase-1', status: 'PENDING_PAYMENT' },
    }),
  });
  const res = response();
  await controller.confirm({ id: 'request-1', user: {}, params: { purchaseUid: 'purchase-1' }, body: { txHash: '0xhash' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'PENDING_PAYMENT');
});

test('confirm returns HTTP 200 with the current expired state', async () => {
  const controller = createTokenPurchaseController({
    confirm: async () => ({ expired: true, purchase: { purchaseUid: 'purchase-1', status: 'EXPIRED' } }),
  });
  const res = response();
  await controller.confirm({ id: 'request-1', user: {}, params: { purchaseUid: 'purchase-1' }, body: { txHash: '0xhash' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'EXPIRED');
  assert.match(res.body.message, /expired/i);
});
