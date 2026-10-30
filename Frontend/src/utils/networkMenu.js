/** Network-menu rules shared by the row buttons and their click handlers. */
export const isNetworkUnlocked = (chain) => Boolean(
  chain?.isUnlocked || chain?.identityStatus === 'CREATED',
);

export const getNetworkMenuChoices = (myChains = [], selectableChains = [], activeChain = null) => {
  // /chains/me is authoritative for lock/unlock status. In particular, do not
  // filter it through the locked-token selection list (which has one chain).
  if (myChains.length) return myChains;
  if (selectableChains.length) return selectableChains;
  return activeChain ? [activeChain] : [];
};

export const canSelectNetwork = (chain, selectionLocked = false) =>
  Boolean(chain && !selectionLocked && isNetworkUnlocked(chain));

export const canUnlockNetwork = (chain, {
  selectionLocked = false,
  unlockBlocked = false,
  accessLoading = false,
  accessError = false,
  mutationPending = false,
  pollingUid = '',
} = {}) => Boolean(
  chain?.chainUid &&
  !selectionLocked &&
  !unlockBlocked &&
  !accessLoading &&
  !accessError &&
  !mutationPending &&
  !isNetworkUnlocked(chain) &&
  chain.identityStatus !== 'CREATING' &&
  chain.chainUid !== pollingUid
);
