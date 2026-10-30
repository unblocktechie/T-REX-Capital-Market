import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deploymentSource = await readFile(
  new URL('../src/services/trexDeployment.service.js', import.meta.url),
  'utf8',
);
const controllerSource = await readFile(
  new URL('../src/services/blockchain/trexPlatformController.service.js', import.meta.url),
  'utf8',
);

test('deployment transactions never silently fall back to the default chain', () => {
  assert.doesNotMatch(
    deploymentSource,
    /getChainById\(chainId\)\s*\|\|\s*web3Config\.requiredChain/,
  );
  assert.match(deploymentSource, /code = 'DEPLOYMENT_CHAIN_REQUIRED'/);
});

test('automatic transfer activation is pinned to transaction 1 chain', () => {
  const automaticActivation = deploymentSource.match(
    /const unpause = await activateTrexTransfers\(\{[\s\S]*?\n\s*\}\);/,
  );
  assert.ok(automaticActivation, 'automatic activateTrexTransfers call was not found');
  assert.match(automaticActivation[0], /chainId:\s*target\.chain\.id/);
});

test('token deployment rejects conflicting token/config chain ids before wallet writes', () => {
  assert.match(deploymentSource, /code = 'DEPLOYMENT_CHAIN_MISMATCH'/);
});

test('price transaction requires an explicit chain id instead of using the default network', () => {
  const functionStart = controllerSource.indexOf('export async function setPlatformTokenPrice');
  assert.notEqual(functionStart, -1);
  const functionSlice = controllerSource.slice(functionStart, functionStart + 1_200);
  assert.doesNotMatch(functionSlice, /chainId\s*=\s*web3Config\.requiredChain\.id/);
  assert.match(functionSlice, /code = 'TOKEN_PRICE_CHAIN_REQUIRED'/);
});
