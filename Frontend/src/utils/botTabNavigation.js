/** Keep the user's draft intact until they explicitly discard it. */
export function shouldConfirmBotTabSwitch(currentTab, nextTab, { apiKeyDirty = false, policyDirty = false, unsavedPolicySections = {} } = {}) {
  if (currentTab === nextTab) return false;
  return Boolean(apiKeyDirty || policyDirty || Object.values(unsavedPolicySections).some(Boolean));
}
