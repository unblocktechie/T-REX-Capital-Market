const ethers = require('ethers');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { RegistryVerificationError } = require('./blockchain/identity-registry-verifier.service');

const PENDING_VERIFICATION_CODES = new Set([
  'TRANSACTION_NOT_FOUND', 'INSUFFICIENT_CONFIRMATIONS', 'RPC_UNAVAILABLE',
  'REGISTRY_STATE_UNAVAILABLE',
  'CHAIN_REORGANIZATION',
]);

class IdentityRegistryRegistrationService {
  constructor({ repository, interestRepository, verifier, transactionRunner = withTransaction, config = env.blockchain }) {
    this.repository = repository;
    this.interestRepository = interestRepository;
    this.verifier = verifier;
    this.transactionRunner = transactionRunner;
    this.config = config;
  }

  assertIssuer(user) {
    if (user.roleName !== 'Issuer') throw ApiError.forbidden('This action is available only to issuer accounts.');
  }

  present(row) {
    if (!row) return null;
    return {
      registryOperationId: row.registryRegistrationUid,
      subscriptionId: row.interestUid,
      tokenId: row.tokenUid,
      status: row.status,
      chainId: Number(row.chainId),
      identityRegistryAddress: row.identityRegistryAddress,
      investorWalletAddress: row.investorWalletAddress,
      onchainIdentityAddress: row.investorIdentityAddress,
      country: Number(row.countryCode),
      txHash: row.txHash || null,
      blockNumber: row.blockNumber === null ? null : Number(row.blockNumber),
      blockHash: row.blockHash || null,
      verifiedAt: row.verifiedAt || null,
      verification: row.errorCode ? { code: row.errorCode, message: row.errorMessage } : null,
      syncStatus: row.syncStatus,
    };
  }

  async loadOwnedContext(user, interestUid) {
    this.assertIssuer(user);
    const context = await this.repository.findContextByInterest(interestUid);
    if (!context || context.issuerUserUid !== user.userUid) {
      throw new ApiError(404, 'Subscription was not found.', undefined, 'SUBSCRIPTION_NOT_FOUND');
    }
    return context;
  }

  validateContext(context) {
    if (!['claimSubmitted', 'registered'].includes(context.interestStatus)) {
      throw new ApiError(409, 'All required investor claims must be confirmed before registry registration.', undefined, 'CLAIMS_NOT_COMPLETED');
    }
    if (context.tokenStatus !== 'deployed') {
      throw new ApiError(409, 'The subscription token is not deployed.', undefined, 'TOKEN_NOT_DEPLOYED');
    }
    if (context.organizationStatus !== 'approved' || !context.organizationActive) {
      throw new ApiError(409, 'The issuer organization is not approved and active.', undefined, 'ISSUER_ORGANIZATION_NOT_ACTIVE');
    }
    if (context.investorStatus !== 'submitted' || !context.investorActive) {
      throw new ApiError(409, 'Investor onboarding is not complete.', undefined, 'INVESTOR_NOT_VERIFIED');
    }
    const requiredAddresses = [
      ['identityRegistryAddress', context.identityRegistryAddress],
      ['issuerWalletAddress', context.issuerWalletAddress],
      ['identityManagerWalletAddress', context.identityManagerWalletAddress],
      ['investorWalletAddress', context.investorWalletAddress],
      ['investorIdentityAddress', context.investorIdentityAddress],
    ];
    const invalid = requiredAddresses.find(([, value]) => !ethers.isAddress(value));
    if (invalid) {
      throw new ApiError(409, `Required blockchain value ${invalid[0]} is unavailable or invalid.`, undefined, 'REGISTRY_PREREQUISITES_INCOMPLETE');
    }
    if (ethers.getAddress(context.identityManagerWalletAddress) !== ethers.getAddress(context.issuerWalletAddress)) {
      throw new ApiError(409, 'Identity manager does not match the issuer organization wallet.', undefined, 'IDENTITY_MANAGER_MISMATCH');
    }
    const country = Number(context.countryNumericCode);
    if (!context.countryActive || context.countryDeleted || !Number.isInteger(country) || country < 1 || country > 999) {
      throw new ApiError(409, 'Investor verified ISO-3166 numeric country is unavailable.', undefined, 'INVESTOR_COUNTRY_INVALID');
    }
    if (context.countryRestrictionMode === 'allowlist' && !context.countryListed) {
      throw new ApiError(409, 'Investor country is not permitted by this token.', undefined, 'INVESTOR_COUNTRY_NOT_ELIGIBLE');
    }
    if (context.countryRestrictionMode === 'blocklist' && context.countryListed) {
      throw new ApiError(409, 'Investor country is restricted for this token.', undefined, 'INVESTOR_COUNTRY_NOT_ELIGIBLE');
    }
    return country;
  }

  expectedFrom(context, countryCode) {
    return {
      chainId: Number(this.config.chainId),
      identityRegistryAddress: ethers.getAddress(context.identityRegistryAddress),
      issuerWalletAddress: ethers.getAddress(context.issuerWalletAddress),
      investorWalletAddress: ethers.getAddress(context.investorWalletAddress),
      investorIdentityAddress: ethers.getAddress(context.investorIdentityAddress),
      countryCode,
    };
  }

  expectedFromRegistration(row) {
    return {
      chainId: Number(row.chainId),
      identityRegistryAddress: row.identityRegistryAddress,
      issuerWalletAddress: row.issuerWalletAddress,
      investorWalletAddress: row.investorWalletAddress,
      investorIdentityAddress: row.investorIdentityAddress,
      countryCode: Number(row.countryCode),
    };
  }

  async inspectBeforeCreate(expected) {
    try {
      const state = await this.verifier.inspectRegistryState(expected);
      const preparedAtBlock = await this.verifier.getLatestBlockNumber();
      return { state, preparedAtBlock };
    } catch (error) {
      if (!(error instanceof RegistryVerificationError)) throw error;
      throw new ApiError(
        error.transient ? 503 : 422,
        'Identity Registry prerequisites could not be verified.',
        [{ field: 'identityRegistryAddress', message: error.message }],
        error.code || 'REGISTRY_PREREQUISITE_VERIFICATION_FAILED',
      );
    }
  }

  recoveryStartBlock(context, latestBlock) {
    const deployedAtBlock = Number(context.deployedAtBlock || 0);
    if (deployedAtBlock > 0) return deployedAtBlock;
    const lookback = Math.max(1000, Number(this.config.registryRecoveryLookbackBlocks || 200000));
    return Math.max(0, Number(latestBlock) - lookback + 1);
  }

  async findExistingRegistrationEvidence(expected, context, latestBlock) {
    let event;
    try {
      event = await this.repository.findCanonicalEvent(expected);
      if (!event) {
        event = await this.verifier.findRegistrationEvent(expected, {
          fromBlock: this.recoveryStartBlock(context, latestBlock),
        });
      }
      if (!event) {
        throw new RegistryVerificationError(
          'REGISTRY_EVENT_NOT_FOUND',
          'Investor is registered on-chain, but the authoritative IdentityRegistered event is temporarily unavailable.',
          { transient: true },
        );
      }
      const verified = await this.verifier.verifyRegistration({
        txHash: event.txHash,
        blockNumberHint: event.blockNumber,
        ...expected,
      });
      return { event, verified };
    } catch (error) {
      if (!(error instanceof RegistryVerificationError)) throw error;
      if (error.pending || error.transient) {
        throw new ApiError(
          503,
          'Existing registry transaction evidence is temporarily unavailable. Retry this API; do not open MetaMask.',
          [{ field: 'identityRegistryAddress', message: error.message }],
          error.code || 'REGISTRY_EVIDENCE_UNAVAILABLE',
        );
      }
      throw new ApiError(422, 'Existing registry transaction could not be verified.', [
        { field: 'identityRegistryAddress', message: error.message },
      ], error.code || 'REGISTRY_VERIFICATION_FAILED');
    }
  }

  async persistExistingRegistration(user, context, expected, evidence, existing = null) {
    try {
      const finalized = await this.transactionRunner(async (connection) => {
        let registration = existing
          ? await this.repository.findByUidForUpdate(existing.registryRegistrationUid, connection)
          : await this.repository.findByInterest(context.interestUid, connection);
        if (registration?.status === 'CONFIRMED'
          && String(registration.txHash || '').toLowerCase() !== evidence.verified.txHash.toLowerCase()) {
          throw new ApiError(409, 'Registry operation is already confirmed with a different transaction.', undefined, 'REGISTRY_OPERATION_ALREADY_CONFIRMED');
        }
        if (!registration) {
          registration = await this.repository.createConfirmed({
            interestUid: context.interestUid,
            tokenUid: context.tokenUid,
            organizationUid: context.organizationUid,
            investorUid: context.investorUid,
            issuerUserUid: user.userUid,
            ...expected,
            preparedAtBlock: this.recoveryStartBlock(context, evidence.verified.blockNumber),
          }, evidence.verified, connection);
        } else if (registration.status === 'PENDING') {
          const confirmed = await this.repository.confirm(
            registration.registryRegistrationUid,
            evidence.verified,
            connection,
          );
          if (!confirmed) throw new ApiError(409, 'Registry operation changed during synchronization.', undefined, 'REGISTRY_OPERATION_STATE_CHANGED');
          registration = await this.repository.findByUidForUpdate(registration.registryRegistrationUid, connection);
        }

        const interest = await this.interestRepository.findInterestForUpdate(context.interestUid, connection);
        if (!interest || !['claimSubmitted', 'registered'].includes(interest.status)) {
          throw new ApiError(409, 'Subscription is not ready for registry synchronization.', undefined, 'SUBSCRIPTION_NOT_READY_FOR_REGISTRATION');
        }
        const transitioned = await this.interestRepository.transitionInterestStatus(
          context.interestUid,
          'claimSubmitted',
          'registered',
          connection,
        );
        if (transitioned) {
          await this.interestRepository.createHistory({
            interestUid: context.interestUid,
            tokenUid: context.tokenUid,
            organizationUid: context.organizationUid,
            investorUid: context.investorUid,
            eventType: 'registered',
            actorRole: 'issuer',
            actorUserUid: user.userUid,
            note: `Existing Identity Registry registration confirmed in transaction ${evidence.verified.txHash}.`,
          }, connection);
        }
        await this.repository.storeEvents([evidence.event], connection);
        const storedEvent = await this.repository.findCanonicalEvent(expected, connection);
        if (storedEvent) {
          await this.repository.markEvent(
            storedEvent.registryEventUid,
            'MATCHED',
            registration.registryRegistrationUid,
            'Existing on-chain registration independently verified and synchronized.',
            {},
            connection,
          );
        }
        return {
          operation: await this.repository.findByUid(registration.registryRegistrationUid, connection),
          interest: await this.interestRepository.findInterestForUpdate(context.interestUid, connection),
        };
      });
      return {
        operation: { ...this.present(finalized.operation), subscriptionStatus: finalized.interest.status },
        existing: true,
        alreadyRegistered: true,
      };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const raced = await this.repository.findByInterest(context.interestUid);
      if (!raced) throw new ApiError(409, 'Registry transaction is already associated with another operation.', undefined, 'TRANSACTION_ALREADY_USED');
      const finalized = await this.finalizeConfirmedOperation(
        raced.registryRegistrationUid,
        raced.status === 'PENDING' ? evidence.verified : null,
      );
      return {
        operation: { ...this.present(finalized.operation), subscriptionStatus: finalized.interest.status },
        existing: true,
        alreadyRegistered: true,
      };
    }
  }

  async create(user, interestUid) {
    const context = await this.loadOwnedContext(user, interestUid);
    let existing = await this.repository.findByInterest(interestUid);
    if (existing?.status === 'CONFIRMED') {
      const finalized = await this.finalizeConfirmedOperation(existing.registryRegistrationUid);
      return {
        operation: { ...this.present(finalized.operation), subscriptionStatus: finalized.interest.status },
        existing: true,
        alreadyRegistered: true,
      };
    }

    const countryCode = this.validateContext(context);
    const completion = await this.repository.getClaimCompletion(context.interestUid, context.tokenUid);
    if (completion.required < 1 || completion.missing.length) {
      throw new ApiError(409, 'Every token-required claim must be confirmed on-chain before registration.', completion.missing, 'CLAIMS_NOT_COMPLETED');
    }

    const expected = existing ? this.expectedFromRegistration(existing) : this.expectedFrom(context, countryCode);
    const { state, preparedAtBlock } = await this.inspectBeforeCreate(expected);
    if (!state.issuerIsAgent) {
      throw new ApiError(409, 'The issuer wallet is not an agent of this Identity Registry.', undefined, 'ISSUER_NOT_REGISTRY_AGENT');
    }
    if (state.contains) {
      if (!state.matches) {
        throw new ApiError(
          409,
          'Investor registry state does not match the expected ONCHAINID or country.',
          undefined,
          'REGISTRY_STATE_MISMATCH',
        );
      }
      const evidence = await this.findExistingRegistrationEvidence(expected, context, preparedAtBlock);
      return this.persistExistingRegistration(user, context, expected, evidence, existing);
    }
    if (existing) {
      return { operation: this.present(existing), existing: true, alreadyRegistered: false };
    }
    try {
      const created = await this.repository.createPending({
        interestUid: context.interestUid,
        tokenUid: context.tokenUid,
        organizationUid: context.organizationUid,
        investorUid: context.investorUid,
        issuerUserUid: user.userUid,
        ...expected,
        preparedAtBlock,
      });
      return { operation: this.present(created), existing: false, alreadyRegistered: false };
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const raced = await this.repository.findByInterest(interestUid);
      if (!raced) throw error;
      return { operation: this.present(raced), existing: true, alreadyRegistered: raced.status === 'CONFIRMED' };
    }
  }

  async get(user, interestUid) {
    await this.loadOwnedContext(user, interestUid);
    const operation = await this.repository.findByInterest(interestUid);
    if (!operation) throw new ApiError(404, 'Registry operation was not found.', undefined, 'REGISTRY_OPERATION_NOT_FOUND');
    return this.present(operation);
  }

  async loadOwnedOperation(user, interestUid, registryRegistrationUid) {
    const context = await this.loadOwnedContext(user, interestUid);
    const operation = await this.repository.findByUid(registryRegistrationUid);
    if (!operation || operation.interestUid !== interestUid
      || operation.organizationUid !== context.organizationUid || operation.issuerUserUid !== user.userUid) {
      throw new ApiError(404, 'Registry operation was not found.', undefined, 'REGISTRY_OPERATION_NOT_FOUND');
    }
    return operation;
  }

  verificationErrorStatus(error) {
    if (error.transient) return 503;
    if (error.pending) return 202;
    if (error.code === 'INVALID_TX_HASH') return 422;
    return 422;
  }

  // Shared by the HTTP confirmation path and the background reconciler. The registration row,
  // investment status, and timeline event commit atomically. Conditional status transition makes
  // repeated/concurrent calls idempotent and prevents duplicate history entries.
  async finalizeConfirmedOperation(registryRegistrationUid, verified = null) {
    return this.transactionRunner(async (connection) => {
      const registration = await this.repository.findByUidForUpdate(registryRegistrationUid, connection);
      if (!registration) throw new ApiError(404, 'Registry operation was not found.', undefined, 'REGISTRY_OPERATION_NOT_FOUND');
      const interest = await this.interestRepository.findInterestForUpdate(registration.interestUid, connection);
      if (!interest) throw new ApiError(409, 'Subscription no longer exists.', undefined, 'SUBSCRIPTION_NOT_FOUND');
      if (!['claimSubmitted', 'registered'].includes(interest.status)) {
        throw new ApiError(
          409,
          'Subscription is not in a state that can be registered.',
          undefined,
          'SUBSCRIPTION_NOT_READY_FOR_REGISTRATION',
        );
      }

      if (registration.status !== 'CONFIRMED') {
        if (!verified) throw new ApiError(409, 'Verified registry metadata is required.', undefined, 'REGISTRY_VERIFICATION_REQUIRED');
        const confirmed = await this.repository.confirm(registration.registryRegistrationUid, verified, connection);
        if (!confirmed) throw new ApiError(409, 'Registry operation changed during confirmation.', undefined, 'REGISTRY_OPERATION_STATE_CHANGED');
      }

      const transitioned = await this.interestRepository.transitionInterestStatus(
        registration.interestUid,
        'claimSubmitted',
        'registered',
        connection,
      );
      if (transitioned) {
        await this.interestRepository.createHistory({
          interestUid: registration.interestUid,
          tokenUid: registration.tokenUid,
          organizationUid: registration.organizationUid,
          investorUid: registration.investorUid,
          eventType: 'registered',
          actorRole: 'issuer',
          actorUserUid: registration.issuerUserUid,
          note: `Identity Registry registration confirmed${verified?.txHash ? ` in transaction ${verified.txHash}` : ''}.`,
        }, connection);
      }
      return {
        operation: await this.repository.findByUid(registration.registryRegistrationUid, connection),
        interest: await this.interestRepository.findInterestForUpdate(registration.interestUid, connection),
        transitioned,
      };
    });
  }

  async confirm(user, interestUid, registryRegistrationUid, txHash) {
    let operation = await this.loadOwnedOperation(user, interestUid, registryRegistrationUid);
    if (!ethers.isHexString(txHash, 32)) {
      throw new ApiError(422, 'Transaction hash must be a 32-byte hexadecimal value.', undefined, 'INVALID_TX_HASH');
    }
    const normalizedHash = txHash.toLowerCase();
    if (operation.status === 'CONFIRMED') {
      if (String(operation.txHash).toLowerCase() !== normalizedHash) {
        throw new ApiError(409, 'Registry operation is already confirmed with a different transaction.', undefined, 'REGISTRY_OPERATION_ALREADY_CONFIRMED');
      }
      const finalized = await this.finalizeConfirmedOperation(operation.registryRegistrationUid);
      return {
        operation: { ...this.present(finalized.operation), subscriptionStatus: finalized.interest.status },
        idempotent: true,
        pendingVerification: false,
      };
    }

    const used = await this.repository.findByTxHash(normalizedHash);
    if (used && used.registryRegistrationUid !== operation.registryRegistrationUid) {
      throw new ApiError(409, 'Transaction is already associated with another registry operation.', undefined, 'TRANSACTION_ALREADY_USED');
    }
    if (operation.txHash && String(operation.txHash).toLowerCase() !== normalizedHash
      && (!operation.errorCode || PENDING_VERIFICATION_CODES.has(operation.errorCode))) {
      throw new ApiError(409, 'This registry operation is already awaiting verification of another transaction.', undefined, 'REGISTRY_TRANSACTION_ALREADY_ASSIGNED');
    }

    try {
      const allowReplacement = Boolean(operation.txHash
        && String(operation.txHash).toLowerCase() !== normalizedHash
        && operation.errorCode && !PENDING_VERIFICATION_CODES.has(operation.errorCode));
      operation = await this.repository.assignTransaction(
        operation.registryRegistrationUid,
        normalizedHash,
        { allowReplacement },
      );
      if (String(operation.txHash || '').toLowerCase() !== normalizedHash) {
        throw new ApiError(409, 'This registry operation is already awaiting another transaction.', undefined, 'REGISTRY_TRANSACTION_ALREADY_ASSIGNED');
      }
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'Transaction is already associated with another registry operation.', undefined, 'TRANSACTION_ALREADY_USED');
      }
      throw error;
    }

    let verified;
    try {
      verified = await this.verifier.verifyRegistration({
        txHash: normalizedHash,
        ...this.expectedFromRegistration(operation),
      });
    } catch (error) {
      if (!(error instanceof RegistryVerificationError)) throw error;
      const retrySeconds = error.transient || error.pending ? 30 : null;
      await this.repository.recordError(operation.registryRegistrationUid, error.code, error.message, { retrySeconds });
      if (error.pending) {
        operation = await this.repository.findByUid(operation.registryRegistrationUid);
        return {
          operation: this.present(operation),
          idempotent: false,
          pendingVerification: true,
          message: error.message,
        };
      }
      throw new ApiError(this.verificationErrorStatus(error), 'Registry transaction could not be verified.', [
        { field: 'txHash', message: error.message },
      ], error.code || 'REGISTRY_VERIFICATION_FAILED');
    }

    const finalized = await this.finalizeConfirmedOperation(operation.registryRegistrationUid, verified);
    operation = finalized.operation;
    if (operation.status !== 'CONFIRMED') {
      throw new ApiError(409, 'Registry operation changed while it was being verified.', undefined, 'REGISTRY_OPERATION_STATE_CHANGED');
    }
    return {
      operation: { ...this.present(operation), subscriptionStatus: finalized.interest.status },
      idempotent: false,
      pendingVerification: false,
    };
  }
}

module.exports = { IdentityRegistryRegistrationService, PENDING_VERIFICATION_CODES };
