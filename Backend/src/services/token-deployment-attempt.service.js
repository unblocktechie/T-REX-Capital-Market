const ethers = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { env } = require('../core/config/env');
const { withTransaction } = require('../database/connection');
const { logger } = require('./common/log.service');
const {
  DEPLOYMENT_ATTEMPT_STATUS,
  ACTIVE_DEPLOYMENT_ATTEMPT_STATUSES,
} = require('../config/constants');

const S = DEPLOYMENT_ATTEMPT_STATUS;

const checksum = (value) => {
  try {
    return ethers.getAddress(value);
  } catch {
    return value || null;
  }
};

class TokenDeploymentAttemptService {
  constructor({
    attemptRepository,
    tokenRepository,
    organizationRepository,
    tokenService,
    deploymentReceiptService,
    config = env.blockchain,
    transactionRunner = withTransaction,
  }) {
    this.attemptRepository = attemptRepository;
    this.tokenRepository = tokenRepository;
    this.organizationRepository = organizationRepository;
    this.tokenService = tokenService;
    this.deploymentReceiptService = deploymentReceiptService;
    this.config = config;
    this.transactionRunner = transactionRunner;
  }

  // Can we independently check the chain for a matching deployment (salt reconcile)?
  canReconcile() {
    return Boolean(
      this.deploymentReceiptService
      && typeof this.deploymentReceiptService.reconcileBySalt === 'function'
      && this.config
      && this.config.sepoliaRpcUrl
      && this.config.trexFactoryAddress
      && ethers.isAddress(this.config.trexFactoryAddress),
    );
  }

  // Finalize a token the chain reports as already deployed (recovered via salt reconcile).
  async finalizeReconciled(user, token, attempt, reconcile, connection) {
    const locked = await this.tokenRepository.findForUpdateByUserUid(user.userUid, connection);
    if (locked && locked.status === 'deployed') {
      return this.tokenRepository.findByUserUid(user.userUid, connection);
    }
    if (this.tokenRepository.findByTokenAddressExcept) {
      const other = await this.tokenRepository.findByTokenAddressExcept(reconcile.tokenAddress, token.tokenUid, connection);
      if (other) {
        throw new ApiError(409, 'The on-chain contract address is already assigned to another token.', {
          tokenAddress: reconcile.tokenAddress,
        }, 'CONTRACT_ADDRESS_CONFLICT');
      }
    }
    const d = reconcile.deployment;
    const fields = {
      platformAgentWallet: d && d.platformAgentWallet ? d.platformAgentWallet : null,
      tokenAddress: reconcile.tokenAddress,
      identityRegistryAddress: d ? d.identityRegistryAddress : null,
      identityRegistryStorageAddress: d ? d.identityRegistryStorageAddress : null,
      trustedIssuersRegistryAddress: d ? d.trustedIssuersRegistryAddress : null,
      claimTopicsRegistryAddress: d ? d.claimTopicsRegistryAddress : null,
      modularComplianceAddress: d ? d.modularComplianceAddress : null,
      deployTxHash: reconcile.transactionHash || null,
      deploymentSalt: reconcile.saltHash,
      deployedAtBlock: d && Number.isFinite(d.deployedAtBlock) ? d.deployedAtBlock : null,
      deployedAt: d && d.deployedAt ? d.deployedAt : new Date(),
      contractAddress: reconcile.tokenAddress,
      contractTxnHash: reconcile.transactionHash || null,
      contractTxnMessage: 'Recovered on-chain during deployment-fail reconcile; the token was already deployed.',
      currentStep: 'deployed',
      isDraft: false,
      status: 'deployed',
    };
    const deployedToken = await this.tokenRepository.updateDeploymentByUserUid(user.userUid, fields, connection);
    if (!deployedToken) {
      const current = await this.tokenRepository.findByUserUid(user.userUid, connection);
      if (!current || current.status !== 'deployed') {
        throw ApiError.conflict('The token deployment status changed during reconcile finalization.');
      }
    }
    await this.attemptRepository.update(attempt.deploymentAttemptUid, {
      status: S.CONFIRMED,
      transactionHash: reconcile.transactionHash || null,
      contractAddress: reconcile.tokenAddress,
      blockNumber: fields.deployedAtBlock,
      confirmedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    }, connection);
    return deployedToken || this.tokenRepository.findByUserUid(user.userUid, connection);
  }

  conflictData(attempt) {
    return {
      deploymentAttemptUid: attempt.deploymentAttemptUid,
      status: attempt.status,
      transactionHash: attempt.transactionHash || null,
    };
  }

  // Public projection returned to the frontend. No server secrets exist on the row,
  // but wallet/contract addresses are returned checksummed per project convention.
  publicAttempt(attempt) {
    const notExpired = !attempt.expiresAt || new Date(attempt.expiresAt).getTime() > Date.now();
    return {
      deploymentAttemptUid: attempt.deploymentAttemptUid,
      tokenUid: attempt.tokenUid,
      status: attempt.status,
      chainId: Number(attempt.chainId),
      networkName: attempt.networkName || null,
      walletAddress: checksum(attempt.walletAddress),
      transactionHash: attempt.transactionHash || null,
      contractAddress: attempt.contractAddress ? checksum(attempt.contractAddress) : null,
      blockNumber: attempt.blockNumber !== undefined && attempt.blockNumber !== null
        ? Number(attempt.blockNumber) : null,
      errorCode: attempt.errorCode || null,
      errorMessage: attempt.errorMessage || null,
      expiresAt: attempt.expiresAt || null,
      submittedAt: attempt.submittedAt || null,
      confirmedAt: attempt.confirmedAt || null,
      failedAt: attempt.failedAt || null,
      canInitiateTransaction: attempt.status === S.PENDING && notExpired,
    };
  }

  assertAttemptContext(attempt, user, token) {
    if (!attempt) throw new ApiError(404, 'Deployment attempt was not found.', undefined, 'DEPLOYMENT_ATTEMPT_NOT_FOUND');
    if (attempt.userUid !== user.userUid) {
      throw new ApiError(403, 'You are not permitted to access this deployment attempt.', undefined, 'FORBIDDEN');
    }
    if (attempt.tokenUid !== token.tokenUid) {
      throw new ApiError(404, 'The deployment attempt does not belong to this token.', undefined, 'DEPLOYMENT_ATTEMPT_NOT_FOUND');
    }
  }

  isExpiredPending(attempt) {
    return attempt.status === S.PENDING
      && attempt.expiresAt
      && new Date(attempt.expiresAt).getTime() < Date.now();
  }

  async createDeploymentAttempt({ user, chainId, walletAddress, idempotencyKey, networkName, metadata }) {
    const numericChainId = Number(chainId);
    const normalizedWallet = String(walletAddress).toLowerCase();
    if (!ethers.isAddress(walletAddress)) {
      throw ApiError.badRequest('walletAddress must be a valid EVM wallet address.');
    }
    if (!this.config.supportedChainIds.includes(numericChainId)) {
      throw new ApiError(400, `Chain ${numericChainId} is not supported for deployment.`, {
        supportedChainIds: this.config.supportedChainIds,
      }, 'UNSUPPORTED_CHAIN');
    }

    return this.transactionRunner(async (connection) => {
      // Serialize concurrent create/finalize for this token by locking its row.
      const lockedToken = await this.tokenRepository.findForUpdateByUserUid(user.userUid, connection);
      if (!lockedToken) throw ApiError.badRequest('Create and configure a token before requesting deployment.');

      const organization = await this.tokenService.approvedOrganization(user, connection);
      const token = await this.tokenRepository.findByUserUid(user.userUid, connection);

      if (token.status === 'deployed') {
        throw new ApiError(409, 'The token has already been deployed.', {
          tokenUid: token.tokenUid,
          status: token.status,
          transactionHash: token.deployTxHash || null,
        }, 'TOKEN_ALREADY_DEPLOYED');
      }

      // Reuse the exact final-submit eligibility rules; surface missing config as 422.
      try {
        await this.tokenService.assertTokenReadyForDeployment(token, organization);
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 400) {
          throw new ApiError(422, error.message, error.details, 'TOKEN_NOT_READY_FOR_DEPLOYMENT');
        }
        throw error;
      }

      if (normalizedWallet !== organization.walletAddress.toLowerCase()) {
        throw new ApiError(403, 'walletAddress must match the approved organization deployer wallet.', undefined, 'INVALID_DEPLOYER_WALLET');
      }

      // Retire stale pending attempts before evaluating active/idempotent state.
      await this.attemptRepository.expireStalePending(token.tokenUid, connection);

      const byKey = await this.attemptRepository.findByIdempotencyKey(token.tokenUid, idempotencyKey, connection);
      if (byKey) {
        if (ACTIVE_DEPLOYMENT_ATTEMPT_STATUSES.includes(byKey.status)) {
          logger.info('Duplicate deployment attempt returned by idempotency key', {
            userUid: user.userUid, tokenUid: token.tokenUid, deploymentAttemptUid: byKey.deploymentAttemptUid,
          });
          return { attempt: byKey, created: false };
        }
        if (byKey.status === S.CONFIRMED) {
          throw new ApiError(409, 'A deployment for this token is already confirmed.', this.conflictData(byKey), 'DEPLOYMENT_ALREADY_IN_PROGRESS');
        }
        throw new ApiError(409, 'This idempotency key was already used by a closed attempt. Retry with a new idempotencyKey.', this.conflictData(byKey), 'DEPLOYMENT_ATTEMPT_EXPIRED');
      }

      const active = await this.attemptRepository.findActiveByToken(token.tokenUid, connection);
      if (active) {
        if (active.status === S.PENDING
          && active.userUid === user.userUid
          && String(active.walletAddress).toLowerCase() === normalizedWallet) {
          logger.info('Existing pending deployment attempt returned', {
            userUid: user.userUid, tokenUid: token.tokenUid, deploymentAttemptUid: active.deploymentAttemptUid,
          });
          return { attempt: active, created: false };
        }
        throw new ApiError(409, active.transactionHash
          ? 'A deployment transaction is already in progress for this token.'
          : 'A deployment attempt is already in progress for this token.',
        this.conflictData(active), 'DEPLOYMENT_ALREADY_IN_PROGRESS');
      }

      const expiresAt = new Date(Date.now() + this.config.deploymentAttemptTtlMinutes * 60 * 1000);
      const attempt = await this.attemptRepository.create({
        tokenUid: token.tokenUid,
        organizationUid: token.organizationUid,
        userUid: user.userUid,
        walletAddress: normalizedWallet,
        chainId: numericChainId,
        networkName: networkName || this.config.networkName,
        status: S.PENDING,
        idempotencyKey,
        expiresAt,
        metadata: metadata || null,
      }, connection);

      // Move the permanent token status into the in-progress state.
      await this.tokenRepository.updateByUserUid(user.userUid, {
        status: 'deploymentPending',
        currentStep: 'review',
      }, connection);

      logger.info('Token deployment attempt created', {
        userUid: user.userUid, tokenUid: token.tokenUid, deploymentAttemptUid: attempt.deploymentAttemptUid,
      });
      return { attempt, created: true };
    });
  }

  async markDeploymentSubmitted({ user, deploymentAttemptUid, transactionHash, walletAddress, chainId }) {
    const normalizedHash = String(transactionHash).toLowerCase();
    const normalizedWallet = String(walletAddress).toLowerCase();

    return this.transactionRunner(async (connection) => {
      const lockedToken = await this.tokenRepository.findForUpdateByUserUid(user.userUid, connection);
      if (!lockedToken) throw ApiError.notFound('Token was not found.');
      const attempt = await this.attemptRepository.findByUid(deploymentAttemptUid, connection);
      this.assertAttemptContext(attempt, user, lockedToken);

      if (this.isExpiredPending(attempt)) {
        await this.attemptRepository.update(attempt.deploymentAttemptUid, { status: S.EXPIRED }, connection);
        throw new ApiError(409, 'The deployment attempt has expired. Create a new attempt.', {
          ...this.conflictData(attempt), status: S.EXPIRED,
        }, 'DEPLOYMENT_ATTEMPT_EXPIRED');
      }
      if (![S.PENDING, S.SUBMITTED, S.CONFIRMING].includes(attempt.status)) {
        throw new ApiError(409, 'The deployment attempt can no longer accept a transaction hash.', this.conflictData(attempt), 'DEPLOYMENT_ATTEMPT_NOT_ACTIVE');
      }
      if (Number(chainId) !== Number(attempt.chainId)) {
        throw new ApiError(400, 'chainId does not match the deployment attempt.', { expected: Number(attempt.chainId) }, 'UNSUPPORTED_CHAIN');
      }
      if (normalizedWallet !== String(attempt.walletAddress).toLowerCase()) {
        throw new ApiError(403, 'walletAddress does not match the deployment attempt.', undefined, 'INVALID_DEPLOYER_WALLET');
      }

      // Idempotent: same hash returns success; a different hash conflicts.
      if (attempt.transactionHash) {
        if (attempt.transactionHash.toLowerCase() === normalizedHash) return attempt;
        throw new ApiError(409, 'A different transaction hash is already recorded for this attempt.', this.conflictData(attempt), 'TRANSACTION_HASH_CONFLICT');
      }

      const otherAttempt = await this.attemptRepository.findByTransactionHash(normalizedHash, connection);
      if (otherAttempt && otherAttempt.deploymentAttemptUid !== attempt.deploymentAttemptUid) {
        throw new ApiError(409, 'This transaction hash is already recorded for another deployment.', undefined, 'TRANSACTION_HASH_CONFLICT');
      }
      if (this.tokenRepository.findByDeployTxHashExcept) {
        const tokenOwner = await this.tokenRepository.findByDeployTxHashExcept(normalizedHash, lockedToken.tokenUid, connection);
        if (tokenOwner) {
          throw new ApiError(409, 'This transaction hash is already linked to another token.', undefined, 'TRANSACTION_HASH_CONFLICT');
        }
      }

      const updated = await this.attemptRepository.update(attempt.deploymentAttemptUid, {
        transactionHash: normalizedHash,
        status: S.SUBMITTED,
        submittedAt: new Date(),
      }, connection);
      logger.info('Token deployment transaction recorded', {
        userUid: user.userUid, tokenUid: lockedToken.tokenUid, deploymentAttemptUid: attempt.deploymentAttemptUid,
      });
      return updated;
    });
  }

  async markDeploymentAttemptFailed({ user, deploymentAttemptUid, status, errorCode, errorMessage }) {
    // Phase 1 (no lock): load + validate. RPC reconcile must not run while holding row locks.
    const token = await this.tokenRepository.findByUserUid(user.userUid);
    if (!token) throw ApiError.notFound('Token was not found.');
    const attempt = await this.attemptRepository.findByUid(deploymentAttemptUid);
    this.assertAttemptContext(attempt, user, token);

    // Idempotent: already in the requested terminal state.
    if (attempt.status === status) return attempt;

    // A broadcast transaction must continue through submitted/failed/confirmed and
    // cannot be closed as wallet_rejected/cancelled/failed by the frontend.
    if (attempt.transactionHash) {
      throw new ApiError(409, 'This attempt already has a broadcast transaction and must be verified, not closed.', this.conflictData(attempt), 'TRANSACTION_ALREADY_BROADCAST');
    }
    if (![S.PENDING, S.CONFIRMING].includes(attempt.status)) {
      throw new ApiError(409, 'The deployment attempt is already closed.', this.conflictData(attempt), 'DEPLOYMENT_ATTEMPT_NOT_ACTIVE');
    }

    // Reconcile-before-revert: a token in deploymentPending may already be deployed
    // on-chain even though the frontend (which lost its state) is trying to fail it.
    // The transaction hash was never recorded, so the DB alone cannot tell — ask the chain.
    const tokenInProgress = token.status === 'deploymentPending';
    let reconcile = null;
    let reconcileErrored = false;
    if (tokenInProgress && this.canReconcile()) {
      try {
        reconcile = await this.deploymentReceiptService.reconcileBySalt({
          owner: token.organizationWalletAddress,
          tokenName: token.tokenName,
          fromBlock: Number(this.config.trexFactoryStartBlock || 0),
        });
      } catch (error) {
        reconcileErrored = true;
        logger.warn('Deployment-fail reconcile could not reach the chain; keeping token deploymentPending', {
          userUid: user.userUid, tokenUid: token.tokenUid, error: error.message,
        });
      }
    }

    // Case A: the token is genuinely deployed on-chain. Finalize it and reject the fail.
    if (reconcile && reconcile.deployed) {
      await this.transactionRunner(async (connection) => this.finalizeReconciled(user, token, attempt, reconcile, connection));
      logger.info('Deployment-fail reconcile recovered an on-chain deployment; token finalized', {
        userUid: user.userUid, tokenUid: token.tokenUid, tokenAddress: reconcile.tokenAddress,
      });
      throw new ApiError(409, 'The token is already deployed on-chain; the deployment attempt cannot be failed.', {
        status: 'deployed',
        tokenAddress: reconcile.tokenAddress,
        transactionHash: reconcile.transactionHash || null,
      }, 'TOKEN_ALREADY_DEPLOYED');
    }

    // Case B/C: close the attempt; revert the token to draft ONLY when it is safe.
    return this.transactionRunner(async (connection) => {
      const lockedToken = await this.tokenRepository.findForUpdateByUserUid(user.userUid, connection);
      if (!lockedToken) throw ApiError.notFound('Token was not found.');
      const current = await this.attemptRepository.findByUid(attempt.deploymentAttemptUid, connection);
      if (current && current.status === status) return current;
      if (current && current.transactionHash) {
        throw new ApiError(409, 'This attempt already has a broadcast transaction and must be verified, not closed.', this.conflictData(current), 'TRANSACTION_ALREADY_BROADCAST');
      }

      const updated = await this.attemptRepository.update(attempt.deploymentAttemptUid, {
        status,
        errorCode: errorCode ? String(errorCode).slice(0, 80) : null,
        errorMessage: errorMessage ? String(errorMessage).slice(0, 1000) : null,
        failedAt: new Date(),
      }, connection);

      if (lockedToken.status === 'deploymentPending') {
        // Safe to revert only when the chain confirmed NOTHING is deployed. If we could
        // not reconcile (RPC error, or reconciliation unavailable in this environment we
        // trust to be configured), keep the token in deploymentPending so it can never be
        // edited/re-deployed; the background sync will finalize it if it was deployed.
        const safeToRevert = this.canReconcile()
          ? (reconcile !== null && reconcile.deployed === false)
          : true;
        if (safeToRevert) {
          await this.tokenRepository.updateByUserUid(user.userUid, { status: 'draft', currentStep: 'review' }, connection);
        } else {
          logger.info('Deployment-fail: keeping token deploymentPending pending on-chain reconciliation', {
            userUid: user.userUid, tokenUid: lockedToken.tokenUid, reconcileErrored,
          });
        }
      }
      logger.info('Token deployment attempt closed by client', {
        userUid: user.userUid, tokenUid: lockedToken.tokenUid, deploymentAttemptUid: attempt.deploymentAttemptUid, status,
      });
      return updated;
    });
  }

  async getActiveDeploymentAttempt({ user }) {
    const token = await this.tokenRepository.findByUserUid(user.userUid);
    if (!token) {
      return { tokenUid: null, tokenStatus: null, tokenDeployed: false, canCreateNew: false, attempt: null };
    }
    await this.attemptRepository.expireStalePending(token.tokenUid);
    const active = await this.attemptRepository.findActiveByToken(token.tokenUid);
    const latest = active || await this.attemptRepository.findLatestByToken(token.tokenUid);
    return {
      tokenUid: token.tokenUid,
      tokenStatus: token.status,
      tokenDeployed: token.status === 'deployed',
      deployTransactionHash: token.deployTxHash || null,
      canCreateNew: token.status !== 'deployed' && !active,
      attempt: latest ? this.publicAttempt(latest) : null,
    };
  }
}

module.exports = { TokenDeploymentAttemptService };
