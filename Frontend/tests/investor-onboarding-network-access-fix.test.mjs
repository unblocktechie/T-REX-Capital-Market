import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canUnlockNetwork,
  isNetworkUnlocked,
  isSubmittedInvestorNetwork,
} from '../src/utils/networkMenu.js';

const readSource = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
const arc = { chainUid: 'arc-uid', chainId: 5042002, identityStatus: 'LOCKED', isUnlocked: false };
const arbitrum = { chainUid: 'arb-uid', chainId: 421614, identityStatus: 'LOCKED', isUnlocked: false };

test('submitted investor onboarding chain does not offer redundant Unlock while server access refreshes', () => {
  assert.equal(isSubmittedInvestorNetwork(arc, 'arc-uid'), true);
  assert.equal(isNetworkUnlocked(arc), false, 'pending access must not be treated as unlocked');
  assert.equal(canUnlockNetwork(arc), true, 'underlying access rule must not change');
});

test('other locked networks and an arbitrary selected chain retain their normal Unlock action', () => {
  assert.equal(isSubmittedInvestorNetwork(arbitrum, 'arc-uid'), false);
  assert.equal(isSubmittedInvestorNetwork(arc, ''), false);
  assert.equal(isSubmittedInvestorNetwork(arc, 'arb-uid'), false);
});

test('unlocked/creating/failed onboarding networks retain their existing state behavior', () => {
  assert.equal(isSubmittedInvestorNetwork({ ...arc, isUnlocked: true, identityStatus: 'CREATED' }, 'arc-uid'), false);
  assert.equal(isSubmittedInvestorNetwork({ ...arc, identityStatus: 'CREATING' }, 'arc-uid'), false);
  assert.equal(isSubmittedInvestorNetwork({ ...arc, identityStatus: 'FAILED' }, 'arc-uid'), false);
  assert.equal(canUnlockNetwork({ ...arc, identityStatus: 'FAILED' }), true, 'retry remains available after failure');
});

test('successful onboarding submission refreshes network and profile caches before leaving the flow', async () => {
  const source = await readSource('context/InvestorOnboardingProvider.jsx');
  const submission = source.split('const submitInvestor = useCallback(')[1].split('// Kept for the legacy hidden selfie step')[0];
  assert.match(submission, /await investorApi\.submit\(\{ walletAddress, chainUid \}\)/);
  assert.match(submission, /await refreshFromServer\(\)/);
  assert.match(submission, /queryClient\.invalidateQueries\(\{ queryKey: myChainsQueryKey \}\)/);
  assert.match(submission, /queryClient\.invalidateQueries\(\{ queryKey: \['investor', 'profile-data'\] \}\)/);
  assert.doesNotMatch(submission, /chainsApi\.unlock|unlock\.mutateAsync/, 'submission must not silently create another on-chain identity');
});

test('navbar guard applies only to backend-confirmed submitted/approved investor onboarding chain', async () => {
  const hook = await readSource('hooks/useAppNetwork.js');
  const switcher = await readSource('components/common/AppNetworkSwitcher.jsx');
  assert.match(hook, /\['SUBMITTED', 'APPROVED'\]\.includes\(String\(investorProfile\.state\?\.backendStatus/);
  assert.match(hook, /investorOnboardingChainUid/);
  assert.match(switcher, /isSubmittedInvestorNetwork\(chain, network\.investorOnboardingChainUid\)/);
  assert.match(switcher, /!isUnlocked && !onboardingAccessPending/);
  assert.match(switcher, /if \(open\) void network\.refetchMyChains\(\)/);
  assert.match(switcher, /open && onboardingAccessUnconfirmed/);
  assert.match(switcher, /onboardingAccessPending \? 'Onboarding network · access pending'/);
});
