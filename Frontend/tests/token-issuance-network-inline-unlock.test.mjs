import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canUnlockNetwork } from '../src/utils/networkMenu.js';

const source = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('only token creation opts into inline Unlock; other shared network selectors are unchanged', async () => {
  const [creation, onboarding, investor] = await Promise.all([
    source('pages/tokens/TokenInformationPage.jsx'),
    source('pages/organization/ReviewSubmissionPage.jsx'),
    source('pages/investors/ReviewSubmitStep.jsx'),
  ]);
  assert.match(creation, /<ChainSelector[\s\S]*?onlyUnlocked[\s\S]*?onUnlock=\{unlockAssetChain\}/);
  assert.match(creation, /canUnlock=\{canUnlockAssetChain\}/);
  assert.doesNotMatch(onboarding, /onUnlock=/);
  assert.doesNotMatch(investor, /onUnlock=/);
});

test('locked rows have separate unlock buttons, never nested in selectable option buttons', async () => {
  const code = await source('components/common/ChainSelector.jsx');
  assert.match(code, /<div key=\{chain\.chainUid\}[\s\S]*?<button[\s\S]*?role="option"/);
  assert.match(code, /<\/button>\s*\{locked && typeof onUnlock === 'function' \? \([\s\S]*?<button[\s\S]*?data-chain-unlock/);
  assert.match(code, /onClick=\{\(\) => onUnlock\(chain\)\}/);
  assert.match(code, /event\.target\.closest\?\.\('\[data-chain-unlock\]'\)/);
  assert.match(code, /disabled=\{unlockDisabled\}/);
});

test('page scrolling closes dropdown, but scrolling inside options is allowed', async () => {
  const code = await source('components/common/ChainSelector.jsx');
  assert.match(code, /const isInsideMenu = \(event\) => menuRef\.current\?\.contains\(event\.target\)/);
  assert.match(code, /if \(!isInsideMenu\(event\)\) setOpen\(false\)/);
  assert.match(code, /window\.addEventListener\('scroll', closeOnPageScroll, true\)/);
  assert.match(code, /document\.addEventListener\('wheel', closeOnScrollIntent/);
  assert.match(code, /document\.addEventListener\('touchmove', closeOnScrollIntent/);
  assert.match(code, /window\.removeEventListener\('scroll', closeOnPageScroll, true\)/);
});

test('Unlock shares existing API and respects token lock, stale access and pending operations', async () => {
  const [creation, network] = await Promise.all([
    source('pages/tokens/TokenInformationPage.jsx'),
    source('hooks/useAppNetwork.js'),
  ]);
  assert.match(creation, /useUnlockChain\(\)/);
  assert.match(creation, /await unlock\.mutateAsync\(chain\.chainUid\)/);
  assert.match(creation, /selectionLocked: isUnlockBlocked \|\| saving/);
  assert.match(creation, /accessLoading: userChains\.isPending/);
  assert.match(creation, /accessError: userChains\.isError/);
  assert.match(network, /isNetworkUnlockBlocked/);
  const locked = { chainUid: 'chain-1', isUnlocked: false, identityStatus: 'LOCKED' };
  assert.equal(canUnlockNetwork(locked), true);
  assert.equal(canUnlockNetwork(locked, { selectionLocked: true }), false);
  assert.equal(canUnlockNetwork(locked, { accessError: true }), false);
  assert.equal(canUnlockNetwork({ ...locked, identityStatus: 'CREATING' }), false);
});

test('unlocking waits for backend state updates without automatically selecting a chain or resetting form data', async () => {
  const code = await source('pages/tokens/TokenInformationPage.jsx');
  assert.match(code, /refetchInterval: \(query\) =>/);
  assert.match(code, /identityStatus === 'CREATING'/);
  assert.match(code, /setPollUnlockUid\(chain\.chainUid\)/);
  assert.match(code, /\['CREATED', 'FAILED'\]\.includes\(chain\.identityStatus\)/);
  const unlockHandler = code.split('const unlockAssetChain = async (chain) => {')[1].split('\n  };')[0];
  assert.doesNotMatch(unlockHandler, /updateSection\(/);
  assert.doesNotMatch(unlockHandler, /chooseChain\(/);
});
