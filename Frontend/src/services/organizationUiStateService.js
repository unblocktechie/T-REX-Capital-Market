const UI_STATE_KEY = 'trex_organization_ui_state_v2';
const DEFAULT_CONFIRMATIONS = Object.freeze({
  ownershipAccurate: false,
  processingTimeAccepted: false,
  authorizedSubmitter: false,
});

const canUseWindow = () => typeof window !== 'undefined';

const read = () => {
  if (!canUseWindow()) return { confirmations: {}, highestSteps: {} };
  try {
    return {
      confirmations: {},
      highestSteps: {},
      ...(JSON.parse(window.localStorage.getItem(UI_STATE_KEY)) || {}),
    };
  } catch {
    return { confirmations: {}, highestSteps: {} };
  }
};

const write = (next) => {
  if (canUseWindow()) window.localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
  return next;
};

const keyFor = (organizationUid) => organizationUid || 'new';
const clampStep = (step) => Math.min(5, Math.max(1, Number(step) || 1));

export const organizationUiStateService = Object.freeze({
  getConfirmations(organizationUid) {
    return {
      ...DEFAULT_CONFIRMATIONS,
      ...(read().confirmations?.[keyFor(organizationUid)] || {}),
    };
  },
  setConfirmations(organizationUid, confirmations) {
    const current = read();
    write({
      ...current,
      confirmations: {
        ...current.confirmations,
        [keyFor(organizationUid)]: { ...DEFAULT_CONFIRMATIONS, ...confirmations },
      },
    });
    return { ...DEFAULT_CONFIRMATIONS, ...confirmations };
  },
  getHighestStepReached(organizationUid) {
    return clampStep(read().highestSteps?.[keyFor(organizationUid)] || 1);
  },
  setHighestStepReached(organizationUid, step) {
    const current = read();
    const key = keyFor(organizationUid);
    const highestStep = Math.max(
      clampStep(current.highestSteps?.[key] || 1),
      clampStep(step),
    );
    write({
      ...current,
      highestSteps: {
        ...current.highestSteps,
        [key]: highestStep,
      },
    });
    return highestStep;
  },
  transferHighestStep(fromOrganizationUid, toOrganizationUid) {
    if (!toOrganizationUid) return;
    const current = read();
    const sourceKey = keyFor(fromOrganizationUid);
    const targetKey = keyFor(toOrganizationUid);
    const highestStep = Math.max(
      clampStep(current.highestSteps?.[sourceKey] || 1),
      clampStep(current.highestSteps?.[targetKey] || 1),
    );
    const highestSteps = {
      ...current.highestSteps,
      [targetKey]: highestStep,
    };
    if (sourceKey === 'new' && targetKey !== 'new') delete highestSteps.new;
    write({ ...current, highestSteps });
  },
  clearOrganization(organizationUid) {
    if (!organizationUid) return;
    const current = read();
    const confirmations = { ...current.confirmations };
    const highestSteps = { ...current.highestSteps };
    delete confirmations[organizationUid];
    delete highestSteps[organizationUid];
    write({ ...current, confirmations, highestSteps });
  },
});
