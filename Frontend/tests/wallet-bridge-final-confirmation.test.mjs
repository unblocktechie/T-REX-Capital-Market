import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bridgeTransactionHash,
  isBridgeStepEventComplete,
  isUsdcBridgeResultComplete,
  normalizeBridgeStepName,
} from '../src/services/wallet/usdcBridgeLifecycle.js';

test('top-level success does not complete the bridge before the destination mint exists', () => {
  assert.equal(isUsdcBridgeResultComplete({
    state: 'success',
    steps: [
      { name: 'approve', state: 'success', txHash: '0xapprove' },
      { name: 'burn', state: 'success', txHash: '0xburn' },
      { name: 'fetchAttestation', state: 'success', data: { attestation: '0xattestation' } },
    ],
  }), false);
});

test('mint must be successful and submitted before the bridge can close', () => {
  const base = {
    state: 'success',
    steps: [
      { name: 'approve', state: 'success', txHash: '0xapprove' },
      { name: 'burn', state: 'success', txHash: '0xburn' },
      { name: 'fetchAttestation', state: 'success', data: { attestation: '0xattestation' } },
    ],
  };
  assert.equal(isUsdcBridgeResultComplete({ ...base, steps: [...base.steps, { name: 'mint', state: 'pending' }] }), false);
  assert.equal(isUsdcBridgeResultComplete({ ...base, steps: [...base.steps, { name: 'mint', state: 'success' }] }), false);
  assert.equal(isUsdcBridgeResultComplete({ ...base, steps: [...base.steps, { name: 'mint', state: 'success', txHash: '0xmint' }] }), true);
});

test('mint progress event is complete only after wallet submission produces a hash', () => {
  const pending = { method: 'bridge.mint', values: { status: 'pending' } };
  const submitted = { method: 'bridge.mint', values: { txHash: '0xmint' } };
  assert.equal(normalizeBridgeStepName(pending), 'mint');
  assert.equal(isBridgeStepEventComplete(pending), false);
  assert.equal(isBridgeStepEventComplete(submitted), true);
  assert.equal(bridgeTransactionHash(submitted), '0xmint');
});
