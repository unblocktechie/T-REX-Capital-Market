const { ethers } = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { logger } = require('./common/log.service');

class UserChainIdentityService {
  constructor({ repository, chainRuntimeService, identityService, organizationRepository, investorRepository }) {
    this.repository = repository;
    this.chainRuntimeService = chainRuntimeService;
    this.identityService = identityService;
    this.organizationRepository = organizationRepository;
    this.investorRepository = investorRepository;
  }

  assertRole(user) {
    if (!['Issuer', 'Investor'].includes(user.roleName)) {
      throw ApiError.forbidden('Only issuer and investor accounts can unlock blockchain networks.');
    }
  }

  async walletForUser(user) {
    this.assertRole(user);
    const profile = user.roleName === 'Issuer'
      ? await this.organizationRepository.findByUserUid(user.userUid)
      : await this.investorRepository.findByUserUid(user.userUid);
    const requiredStatus = user.roleName === 'Issuer' ? 'approved' : 'submitted';
    if (!profile || profile.status !== requiredStatus || !ethers.isAddress(profile.walletAddress || '')) {
      throw new ApiError(409, `Complete ${user.roleName.toLowerCase()} onboarding before unlocking another chain.`, undefined, 'ONBOARDING_NOT_COMPLETE');
    }
    return { walletAddress: ethers.getAddress(profile.walletAddress), sourceUid: profile.organizationUid || profile.investorUid };
  }

  safeFailure(error, config) {
    let message = String(error.shortMessage || error.reason || error.message || 'Unknown blockchain error.');
    for (const secret of [config.deployerPrivateKey, config.sepoliaRpcUrl, ...(config.sepoliaFallbackRpcUrls || [])].filter(Boolean)) {
      message = message.split(secret).join('[REDACTED]');
    }
    return message.slice(0, 2000);
  }

  async syncOnboardingIdentity(user, chainUid, identity) {
    const profileRepository = user.roleName === 'Issuer'
      ? this.organizationRepository : this.investorRepository;
    const profile = await profileRepository.findByUserUid(user.userUid);
    if (!profile || profile.onboardingChainUid !== chainUid) return;
    const transactionHash = identity.creationTxHash || null;
    const update = {
      contractAddress: identity.identityAddress,
      contractTxnHash: transactionHash,
      contractTxnMessage: transactionHash
        ? 'On-chain identity recreated successfully for the current chain deployment.'
        : 'Existing on-chain identity verified for the current chain deployment.',
    };
    if (user.roleName === 'Investor') update.onchainIdReference = identity.identityAddress;
    await profileRepository.updateByUserUid(user.userUid, update);
  }

  async createOrGet({ user, chainUid, walletAddress = null, sourceUid = null }) {
    this.assertRole(user);
    const config = this.chainRuntimeService.requireSigner(await this.chainRuntimeService.byUid(chainUid));
    const wallet = walletAddress ? ethers.getAddress(walletAddress) : (await this.walletForUser(user)).walletAddress;
    let existing = await this.repository.find(user.userUid, chainUid);
    if (existing?.identityFactoryAddress
      && existing.identityFactoryAddress.toLowerCase() !== config.identityFactoryAddress.toLowerCase()) {
      existing = await this.repository.invalidateForFactoryChange(
        user.userUid, chainUid, config.identityFactoryAddress,
      );
    }
    if (existing?.status === 'CREATED' && existing.isUnlocked) {
      if (existing.walletAddress.toLowerCase() !== wallet.toLowerCase()) {
        throw new ApiError(409, 'This chain identity belongs to a different wallet.', undefined, 'CHAIN_IDENTITY_WALLET_MISMATCH');
      }
      await this.syncOnboardingIdentity(user, chainUid, existing);
      return existing;
    }
    const reservation = await this.repository.reserve({
      userUid: user.userUid,
      chainUid,
      roleName: user.roleName,
      walletAddress: wallet,
      identityFactoryAddress: config.identityFactoryAddress,
    });
    if (!reservation.reservationAcquired) {
      if (reservation.record?.status === 'CREATED') return reservation.record;
      throw new ApiError(409, 'ONCHAINID creation is already in progress for this chain.', {
        chainUid,
        status: reservation.record?.status || 'CREATING',
      }, 'CHAIN_IDENTITY_CREATION_IN_PROGRESS');
    }
    const saltPrefix = user.roleName === 'Issuer' ? 'org' : 'investor';
    const stableUid = sourceUid || user.userUid;
    try {
      const result = await this.identityService.createOrganizationIdentity(wallet, `${saltPrefix}-${stableUid}`, config);
      const identity = await this.repository.markCreated(user.userUid, chainUid, result);
      await this.syncOnboardingIdentity(user, chainUid, identity);
      return identity;
    } catch (error) {
      const safe = this.safeFailure(error, config);
      await this.repository.markFailed(user.userUid, chainUid, error.code || 'IDENTITY_CREATION_FAILED', safe, error.transactionHash);
      logger.warn('Per-chain ONCHAINID creation failed', { userUid: user.userUid, chainUid, error: safe });
      throw new ApiError(502, `ONCHAINID creation failed on ${config.chainName}: ${safe}`, undefined, 'CHAIN_IDENTITY_CREATION_FAILED');
    }
  }

  async unlock(user, chainUid) {
    const profile = await this.walletForUser(user);
    return this.createOrGet({ user, chainUid, ...profile });
  }

  async getForUser(user, chainUid) {
    this.assertRole(user);
    const config = await this.chainRuntimeService.byUid(chainUid);
    const identity = await this.repository.find(user.userUid, chainUid);
    return {
      chainUid: config.chainUid,
      chainId: config.chainId,
      chainName: config.chainName,
      networkName: config.networkName,
      isUnlocked: Boolean(identity?.isUnlocked && identity.status === 'CREATED'),
      identityStatus: identity?.status || 'LOCKED',
      identityAddress: identity?.identityAddress || null,
      identityTransactionHash: identity?.creationTxHash || null,
      identityErrorCode: identity?.errorCode || null,
      identityErrorMessage: identity?.errorMessage || null,
    };
  }

  async listForUser(user) {
    this.assertRole(user);
    const [chains, identities] = await Promise.all([
      this.chainRuntimeService.listPublic(),
      this.repository.listByUser(user.userUid),
    ]);
    const byChain = new Map(identities.map((identity) => [identity.chainUid, identity]));
    return chains.map((chain) => {
      const identity = byChain.get(chain.chainUid);
      return {
        ...chain,
        isUnlocked: Boolean(identity?.isUnlocked && identity.status === 'CREATED'),
        identityStatus: identity?.status || 'LOCKED',
        identityAddress: identity?.identityAddress || null,
        identityTransactionHash: identity?.creationTxHash || null,
        identityErrorCode: identity?.errorCode || null,
        identityErrorMessage: identity?.errorMessage || null,
      };
    });
  }
}

module.exports = { UserChainIdentityService };
