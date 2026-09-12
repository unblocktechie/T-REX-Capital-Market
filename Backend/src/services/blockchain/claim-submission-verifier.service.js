const ethers = require('ethers');
const { env } = require('../../core/config/env');
const { logger } = require('../common/log.service');

// ONCHAINID Identity claim events. Identity.addClaim(topic, scheme, issuer, signature, data, uri)
// emits ClaimAdded when the claim is new, but ClaimChanged when a claim for the same
// (issuer, topic) already exists and is being updated. Both prove the expected claim is present
// on the identity, so we accept either. They share the same parameter layout.
const IDENTITY_ABI = [
  'event ClaimAdded(bytes32 indexed claimId, uint256 indexed topic, uint256 scheme, address indexed issuer, bytes signature, bytes data, string uri)',
  'event ClaimChanged(bytes32 indexed claimId, uint256 indexed topic, uint256 scheme, address indexed issuer, bytes signature, bytes data, string uri)',
];
const CLAIM_EVENT_NAMES = new Set(['ClaimAdded', 'ClaimChanged']);

// A verification error carrying a stable machine code (see the spec's failure enum). `transient`
// marks retryable infrastructure problems (RPC down) that must NOT be recorded as FAILED.
class ClaimVerificationError extends Error {
  constructor(code, message, { transient = false } = {}) {
    super(message);
    this.name = 'ClaimVerificationError';
    this.code = code;
    this.transient = transient;
  }
}

const hexEqual = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

class ClaimSubmissionVerifierService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory
      || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.identityInterface = dependencies.identityInterface || new ethers.Interface(IDENTITY_ABI);
  }

  supportedChainIds() {
    const list = Array.isArray(this.config.supportedChainIds) && this.config.supportedChainIds.length
      ? this.config.supportedChainIds
      : [this.config.chainId];
    return list.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  }

  // Independently verifies that `txHash` is a successful transaction on the expected chain that
  // added the exact expected claim (topic + issuer + data + signature) to the expected investor
  // ONCHAINID contract. Returns { blockNumber, transactionIndex, logIndex } on success; throws a
  // ClaimVerificationError (with a stable `code`) otherwise.
  async verifyClaimSubmission({ txHash, investorIdentityAddress, issuerIdentityAddress, claimTopic, data, signature }) {
    if (!ethers.isHexString(txHash, 32)) {
      throw new ClaimVerificationError('INVALID_TX_HASH', 'The transaction hash is not a valid 32-byte hash.');
    }
    if (!this.config.sepoliaRpcUrl) {
      throw new ClaimVerificationError('RPC_UNAVAILABLE', 'Blockchain RPC is not configured.', { transient: true });
    }
    if (!ethers.isAddress(investorIdentityAddress)) {
      throw new ClaimVerificationError('INVALID_INVESTOR_IDENTITY', 'The investor identity address is invalid.');
    }

    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    try {
      // Network / chain.
      let chainId;
      try {
        const network = await provider.getNetwork();
        chainId = Number(network.chainId);
      } catch (error) {
        throw new ClaimVerificationError('RPC_UNAVAILABLE', 'Could not reach the blockchain RPC provider.', { transient: true });
      }
      if (!this.supportedChainIds().includes(chainId)) {
        throw new ClaimVerificationError('WRONG_CHAIN', `Transaction is on chain ${chainId}, which is not supported.`);
      }

      // Receipt / status.
      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(txHash);
      } catch (error) {
        throw new ClaimVerificationError('RPC_UNAVAILABLE', 'Could not fetch the transaction receipt.', { transient: true });
      }
      if (!receipt) {
        throw new ClaimVerificationError('TRANSACTION_NOT_FOUND', 'The transaction was not found or is not yet mined.');
      }
      if (Number(receipt.status) !== 1) {
        throw new ClaimVerificationError('TRANSACTION_FAILED', 'The transaction did not execute successfully.');
      }
      const requiredConfirmations = Math.max(1, Number(this.config.confirmations || 1));
      if (requiredConfirmations > 1 && typeof receipt.confirmations === 'function') {
        const confirmations = Number(await receipt.confirmations());
        if (confirmations < requiredConfirmations) {
          throw new ClaimVerificationError(
            'INSUFFICIENT_CONFIRMATIONS',
            `The transaction has ${confirmations} confirmation(s); ${requiredConfirmations} are required.`,
          );
        }
      }

      // Parse claim events (ClaimAdded / ClaimChanged) from the receipt logs.
      const claimEvents = [];
      for (const log of receipt.logs) {
        let parsed;
        try {
          parsed = this.identityInterface.parseLog({ topics: [...log.topics], data: log.data });
        } catch {
          continue; // not a claim event
        }
        if (parsed && CLAIM_EVENT_NAMES.has(parsed.name)) claimEvents.push({ log, parsed });
      }

      // The claim must have been added to the EXPECTED investor identity contract.
      const onInvestorIdentity = claimEvents.filter((c) => hexEqual(c.log.address, investorIdentityAddress));
      if (!onInvestorIdentity.length) {
        logger.warn('Claim verification: no claim event on expected investor identity', {
          txHash,
          expectedInvestorIdentity: investorIdentityAddress,
          transactionTo: receipt.to || null,
          // Where claim events actually landed (helps spot an identity-address mismatch)...
          claimEventAddresses: claimEvents.map((c) => c.log.address),
          // ...and, if there were none, the raw event signatures present (helps spot an ABI/event mismatch).
          logEventTopics: claimEvents.length ? undefined : receipt.logs.map((l) => ({ address: l.address, topic0: l.topics && l.topics[0] })),
        });
        throw new ClaimVerificationError(
          'WRONG_IDENTITY_CONTRACT',
          'The transaction did not add a claim to the expected investor ONCHAINID contract.',
        );
      }

      // The claim must match topic + issuer + data + signature exactly.
      const match = onInvestorIdentity.find((c) => Number(c.parsed.args.topic) === Number(claimTopic)
        && Number(c.parsed.args.scheme) === 1
        && hexEqual(c.parsed.args.issuer, issuerIdentityAddress)
        && hexEqual(c.parsed.args.signature, signature)
        && hexEqual(c.parsed.args.data, data));
      if (!match) {
        logger.warn('Claim verification: claim event found but fields do not match', {
          txHash,
          expected: { claimTopic: Number(claimTopic), issuer: issuerIdentityAddress, data, signature },
          found: onInvestorIdentity.map((c) => ({
            eventName: c.parsed.name,
            claimTopic: Number(c.parsed.args.topic),
            issuer: c.parsed.args.issuer,
            data: c.parsed.args.data,
            signature: c.parsed.args.signature,
          })),
        });
        throw new ClaimVerificationError('CLAIM_MISMATCH', 'The transaction does not contain the expected claim.');
      }

      return {
        blockNumber: Number(receipt.blockNumber),
        transactionIndex: Number(receipt.index),
        logIndex: Number(match.log.index),
      };
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }
}

module.exports = { ClaimSubmissionVerifierService, ClaimVerificationError, IDENTITY_ABI, CLAIM_EVENT_NAMES };
