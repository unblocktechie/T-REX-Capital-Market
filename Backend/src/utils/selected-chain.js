const { ApiError } = require('../core/errors/api-error');

const assertSelectedChain = (resource, selectedChain, resourceName = 'Resource') => {
  if (!selectedChain || !resource) return;
  const uidMismatch = resource.chainUid && resource.chainUid !== selectedChain.chainUid;
  const idMismatch = resource.chainId !== undefined && resource.chainId !== null
    && Number(resource.chainId) !== Number(selectedChain.chainId);
  if (uidMismatch || idMismatch) {
    throw new ApiError(
      404,
      `${resourceName} was not found on the selected network.`,
      undefined,
      'RESOURCE_NOT_FOUND_ON_SELECTED_CHAIN',
    );
  }
};

const withSelectedChainId = (query, selectedChain) => (selectedChain
  ? { ...query, chainId: selectedChain.chainId }
  : query);

module.exports = { assertSelectedChain, withSelectedChainId };
