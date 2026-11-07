const { ApiError } = require('../core/errors/api-error');
const { asyncHandler } = require('../utils/async-handler');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Every authenticated investor or issuer request in a chain-sensitive router carries the
// currently selected network explicitly. This prevents a stale/default backend network from
// being used after the wallet/UI switches chains. Admin calls keep their existing explicit
// resource/query scoping and are intentionally not affected by this middleware.
const createRequireInvestorChain = (chainRuntimeService) => asyncHandler(async (req, res, next) => {
  if (!['Investor', 'Issuer'].includes(req.user?.roleName)) return next();

  // Server-to-server issuer keys select a public network number, not a platform identifier.
  // Leave existing interactive JWT requests unchanged.
  if (req.auth?.type === 'issuerApiKey') {
    const publicId = String(req.get('X-Chain-Id') || '').trim();
    if (!publicId) {
      throw new ApiError(400, 'Send X-Chain-Id with the public chain ID of your token.',
        [{ field: 'headers.x-chain-id', message: 'X-Chain-Id is required for issuer API-key requests.' }],
        'SELECTED_CHAIN_REQUIRED');
    }
    if (!/^[1-9][0-9]*$/.test(publicId) || !Number.isSafeInteger(Number(publicId))) {
      throw new ApiError(422, 'X-Chain-Id must be a positive decimal integer.',
        [{ field: 'headers.x-chain-id', message: 'For example, use 11155111 for Ethereum Sepolia.' }],
        'INVALID_SELECTED_CHAIN');
    }
    req.selectedChain = await chainRuntimeService.byChainId(Number(publicId));
    const legacyUid = String(req.get('X-Chain-Uid') || '').trim();
    if (legacyUid && legacyUid.toLowerCase() !== req.selectedChain.chainUid.toLowerCase()) {
      throw new ApiError(409, 'The supplied chain headers select different networks.', undefined, 'SELECTED_CHAIN_MISMATCH');
    }
    return next();
  }

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
