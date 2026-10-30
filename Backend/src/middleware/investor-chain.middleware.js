const { ApiError } = require('../core/errors/api-error');
const { asyncHandler } = require('../utils/async-handler');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Every authenticated investor or issuer request in a chain-sensitive router carries the
// currently selected network explicitly. This prevents a stale/default backend network from
// being used after the wallet/UI switches chains. Admin calls keep their existing explicit
// resource/query scoping and are intentionally not affected by this middleware.
const createRequireInvestorChain = (chainRuntimeService) => asyncHandler(async (req, res, next) => {
  if (!['Investor', 'Issuer'].includes(req.user?.roleName)) return next();

  const chainUid = String(req.get('X-Chain-Uid') || '').trim();
  if (!chainUid) {
    throw new ApiError(
      400,
      'Select a blockchain network before using chain-specific APIs.',
      [{ field: 'headers.x-chain-uid', message: 'X-Chain-Uid is required for investor and issuer requests.' }],
      'SELECTED_CHAIN_REQUIRED',
    );
  }
  if (!UUID_PATTERN.test(chainUid)) {
    throw new ApiError(
      422,
      'The selected blockchain network is invalid.',
      [{ field: 'headers.x-chain-uid', message: 'X-Chain-Uid must be a valid UUID.' }],
      'INVALID_SELECTED_CHAIN',
    );
  }

  req.selectedChain = await chainRuntimeService.byUid(chainUid);
  return next();
});

module.exports = { createRequireInvestorChain };
