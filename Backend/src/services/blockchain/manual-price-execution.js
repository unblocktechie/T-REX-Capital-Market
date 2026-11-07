const { ethers } = require('ethers');
const { ApiError } = require('../../core/errors/api-error');
const { CONTROLLER_ABI, DELEGATION_MANAGER_ABI, sameAddress } = require('./blockchain-transaction.service');

// Deliberately limited to issuer-originated, single executions. Sponsored/relayer
// envelopes need different authorization and nonce correlation and are NOT accepted.
function decodeManualPriceExecution(tx, { controllerAddress, issuerWalletAddress, chainId,
  transactionDelegationManagerAddresses = [] }) {
  const invalid = () => new ApiError(400,
    'Expected a direct controller call or a supported allowlisted single smart-account price call.',
    { expectedControllerAddress: controllerAddress, actualToAddress: tx.to }, 'INVALID_PRICE_TRANSACTION_TARGET');
  if (!sameAddress(tx.from, issuerWalletAddress) || Number(tx.chainId) !== Number(chainId)) {
    throw ApiError.forbidden('Transaction sender or chain does not match the issuer.');
  }
  let data = tx.data;
  let target = tx.to;
  let executionType = 'DIRECT';
  try {
    if (BigInt(tx.value ?? 0) !== 0n) throw invalid();
    if (!sameAddress(target, controllerAddress)) {
      if (!Array.isArray(transactionDelegationManagerAddresses)
        || !transactionDelegationManagerAddresses.some(address => ethers.isAddress(address) && sameAddress(address, target))) throw invalid();
      const outer = new ethers.Interface(DELEGATION_MANAGER_ABI).parseTransaction({ data });
      if (outer?.name !== 'redeemDelegations' || outer.args[0].length !== 1
        || outer.args[1].length !== 1 || outer.args[2].length !== 1
        || outer.args[1][0] !== ethers.ZeroHash) throw invalid();
      const payload = ethers.getBytes(outer.args[2][0]);
      if (payload.length < 56 || ethers.toBigInt(payload.slice(20, 52)) !== 0n) throw invalid();
      target = ethers.hexlify(payload.slice(0, 20));
      data = ethers.hexlify(payload.slice(52));
      executionType = 'DELEGATED';
    }
    if (!sameAddress(target, controllerAddress)) throw invalid();
    const call = new ethers.Interface(CONTROLLER_ABI).parseTransaction({ data });
    if (call?.name !== 'setPrice') throw invalid();
    return { call, executionType };
  } catch { throw invalid(); }
}

module.exports = { decodeManualPriceExecution };
