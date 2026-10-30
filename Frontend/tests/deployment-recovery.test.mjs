import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout } from 'node:timers';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DeploymentProcessingPage from '../src/pages/tokens/DeploymentProcessingPage.jsx';
import { TokenCreationAccessGuard } from '../src/components/token-issuance/TokenCreationAccessGuard.jsx';
import { pendingDeploymentService } from '../src/services/pendingDeployment.service.js';
import { setup, asset, pay, controller, issuer, hash } from './controller-fixture.mjs';

function setupDeployment({ price = 0n, metadata = {} } = {}) {
  const chain = setup({ account: issuer });
  chain.price = price;
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  globalThis.window = { localStorage, sessionStorage: localStorage, setTimeout };
  const state = {
    asset, user: { userUid: 'issuer-1' },
    organization: { walletAddress: issuer, organizationUid: 'organization-1' },
    wallet: { connector: chain.connector, address: issuer, requiredChain: { id: 11155111, name: 'Sepolia' } },
    tokenRecord: { token: { tokenUid: 'token-1', controllerAddress: controller, paymentTokenAddress: pay }, tokenUid: 'token-1', userKey: 'issuer-1' },
    buttons: [], navigations: [], submissions: [], pathname: '/app/tokens/new/deploying',
    store: {
      tokenInformation: { treasuryWallet: issuer, chainUid: 'sepolia', chainId: 11155111, network: 'Sepolia' }, supplyPricing: { initialPrice: '1.5', paymentTokenAddress: pay },
      backend: { tokenUid: 'token-1', hydrated: true },
      deployment: { status: 'error', retryMode: 'price-confirmation', canRetry: true, transactionHash: hash },
      setDeployment: values => Object.assign(state.store.deployment, values),
      setBackendState: values => Object.assign(state.store.backend, values),
      markStepCompleted: () => {},
    },
  };
  globalThis.__deploymentTest = state;
  pendingDeploymentService.saveConfirmed({ transactionHash: hash, user: state.user, issuerWallet: issuer, tokenUid: 'token-1', metadata });
  return { state, chain };
}

async function retryPrice(state) {
  state.buttons = [];
  renderToStaticMarkup(createElement(DeploymentProcessingPage));
  const button = state.buttons.find(item => item.children === 'Retry price confirmation');
  assert.ok(button, 'The price retry must be available');
  await button.onClick();
}

test('retry after two confirmed steps requests the missing price transaction and finalizes without refresh', async () => {
  const { state, chain } = setupDeployment();
  await retryPrice(state);
  assert.equal(chain.writes.length, 1);
  assert.equal(chain.writes[0].functionName, 'setPrice');
  assert.deepEqual(chain.writes[0].args, [asset, 1500000n]);
  assert.equal(state.submissions.length, 1);
  assert.equal(state.store.deployment.status, 'success');
  assert.deepEqual(state.navigations, ['/app/tokens/token-1/success']);
});

test('retry skips a price already confirmed on-chain', async () => {
  const { state, chain } = setupDeployment({ price: 1500000n });
  await retryPrice(state);
  assert.equal(chain.writes.length, 0);
  assert.equal(state.store.deployment.status, 'success');
});

test('receipt RPC failure after the third transaction is reconciled automatically from live state', async () => {
  const { state, chain } = setupDeployment();
  let recordedHash;
  chain.publicClient.waitForTransactionReceipt = async () => {
    recordedHash = pendingDeploymentService.getForUser(state.user)?.metadata.priceSetup.transactionHash;
    throw new Error('Receipt temporarily unavailable');
  };
  await retryPrice(state);
  assert.equal(recordedHash, hash);
  assert.equal(chain.writes.length, 1);
  assert.equal(state.store.deployment.status, 'success');
  assert.equal(state.submissions.length, 1);
});

test('retry with a pending price hash never resubmits or finalizes', async () => {
  const { state, chain } = setupDeployment({ metadata: { priceSetup: { status: 'pending', transactionHash: hash } } });
  chain.publicClient.waitForTransactionReceipt = async () => { throw new Error('Receipt unavailable'); };
  await retryPrice(state);
  assert.equal(chain.writes.length, 0);
  assert.equal(state.submissions.length, 0);
  assert.equal(state.store.deployment.status, 'error');
  assert.equal(pendingDeploymentService.getForUser(state.user).metadata.priceSetup.transactionHash, hash);
});

test('refresh on deploying route reaches recovery even if backend already labels token deployed', () => {
  const { state } = setupDeployment();
  state.store.deployment.status = 'idle';
  state.tokenRecord.isDeployed = true;
  renderToStaticMarkup(createElement(TokenCreationAccessGuard));
  assert.equal(state.redirect, undefined);
});

test('completed tokens still redirect away from ordinary creation steps', () => {
  const { state } = setupDeployment();
  state.pathname = '/app/tokens/new/token-information';
  state.store.deployment.status = 'idle';
  state.tokenRecord.isDeployed = true;
  renderToStaticMarkup(createElement(TokenCreationAccessGuard));
  assert.equal(state.redirect, '/app/tokens/token-1');
});


test('post-confirmation RPC failure preserves the third hash for recovery', async () => {
  const { state, chain } = setupDeployment();
  const read = chain.publicClient.readContract;
  chain.publicClient.readContract = async request => {
    if (chain.writes.length && request.functionName === 'tokenPrice') throw new Error('RPC unavailable');
    return read(request);
  };
  await retryPrice(state);
  assert.equal(chain.writes.length, 1);
  assert.equal(state.submissions.length, 0);
  assert.equal(pendingDeploymentService.getForUser(state.user).metadata.priceSetup.transactionHash, hash);
  chain.publicClient.readContract = read;
  await retryPrice(state);
  assert.equal(chain.writes.length, 1);
  assert.equal(state.store.deployment.status, 'success');
});

test('rejecting the third wallet confirmation does not finalize and remains retryable', async () => {
  const { state, chain } = setupDeployment();
  chain.walletClient.writeContract = async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }); };
  await retryPrice(state);
  assert.equal(state.submissions.length, 0);
  assert.equal(state.store.deployment.status, 'error');
  assert.equal(state.store.deployment.canRetry, true);
  assert.equal(state.store.deployment.retryMode, 'price-confirmation');
});
