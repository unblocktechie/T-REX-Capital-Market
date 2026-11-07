const { ethers } = require('ethers');
const { ApiError } = require('../core/errors/api-error');
const { withTransaction } = require('../database/connection');
const { CONTROLLER_ABI, sameAddress } = require('./blockchain/blockchain-transaction.service');
const { decodeManualPriceExecution } = require('./blockchain/manual-price-execution');

const TYPES = Object.freeze({
  SetPrice: [
    { name: 'token', type: 'address' },
    { name: 'newPrice', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
});

const DEFAULTS = Object.freeze({ signatureTtlSeconds: 600, rateLimitCount: 10, rateLimitWindowSeconds: 60 });
const SETTING_KEYS = Object.freeze({
  signatureTtlSeconds: 'TokenPriceRelaySignatureTtlSeconds',
  rateLimitCount: 'TokenPriceRelayRateLimitCount',
  rateLimitWindowSeconds: 'TokenPriceRelayRateLimitWindowSeconds',
});

const chainLocks = new Map();
const withChainLock = async (chainId, work) => {
  const key = String(chainId);
  const previous = chainLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  chainLocks.set(key, queued);
  await previous;
  try { return await work(); } finally {
    release();
    if (chainLocks.get(key) === queued) chainLocks.delete(key);
  }
};

const cleanBlockchainError = (error) => String(
  error?.revert?.name || error?.reason || error?.shortMessage || error?.message || 'Blockchain request failed.',
).replace(/\s+/g, ' ').slice(0, 2000);

class TokenPriceUpdateService {
  constructor({ tokenRepository, organizationRepository, investmentRepository, repository, chainRuntimeService, settingRepository, policyService,
    transactionRunner = withTransaction, dependencies = {} }) {
    this.tokenRepository = tokenRepository;
    this.investmentRepository = investmentRepository;
    this.organizationRepository = organizationRepository;
    this.repository = repository;
    this.chainRuntimeService = chainRuntimeService;
    this.settingRepository = settingRepository;
    this.policyService = policyService;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url));
    this.walletFactory = dependencies.walletFactory || ((privateKey, provider) => new ethers.Wallet(privateKey, provider));
    this.contractFactory = dependencies.contractFactory || ((address, runner) => new ethers.Contract(address, CONTROLLER_ABI, runner));
  }

  async numberSetting(key, fallback) {
    const value = Number((await this.settingRepository.findByKey(key))?.settingValue);
    return Number.isFinite(value) ? value : fallback;
  }

  async context(user, selectedChain) {
    if (user.roleName !== 'Issuer') throw ApiError.forbidden('Only issuers can manage token prices.');
    if (!selectedChain) throw new ApiError(400, 'Select a blockchain network.', undefined, 'SELECTED_CHAIN_REQUIRED');
    const [organization, token] = await Promise.all([
      this.organizationRepository.findByUserUid(user.userUid),
      this.tokenRepository.findByUserUid(user.userUid),
    ]);
    if (!organization || organization.status !== 'approved') throw ApiError.forbidden('An approved issuer organization is required.');
    if (!token || token.status !== 'deployed' || !ethers.isAddress(token.tokenAddress || '')) {
      throw ApiError.conflict('A deployed platform token is required.');
    }
    if (token.chainUid !== selectedChain.chainUid) {
      throw new ApiError(409, 'The token belongs to another blockchain network.', undefined, 'SELECTED_CHAIN_MISMATCH');
    }
    if (!ethers.isAddress(selectedChain.platformControllerAddress || '')) {
      throw new ApiError(503, 'The selected chain Platform Controller is not configured.', undefined, 'PLATFORM_CONTROLLER_NOT_CONFIGURED');
    }
    return { organization, token, config: selectedChain };
  }

  async onchainContext(provider, context) {
    const { organization, token, config } = context;
    const controllerAddress = ethers.getAddress(token.tokenAgentWalletAddress || config.platformControllerAddress);
    const controller = this.contractFactory(controllerAddress, provider);
    const [network, tokenInfo, serviceWalletRaw, priceDecimalsRaw, domainRaw] = await Promise.all([
      provider.getNetwork(),
      controller.getTokenInfo(token.tokenAddress),
      controller.serviceWalletOf(token.tokenAddress),
      controller.PRICE_DECIMALS(),
      controller.eip712Domain(),
    ]);
    if (Number(network.chainId) !== Number(config.chainId)) {
      throw new ApiError(503, 'The configured RPC is connected to another chain.', undefined, 'RPC_CHAIN_MISMATCH');
    }
    if (!sameAddress(tokenInfo.issuer, organization.walletAddress)) {
      throw new ApiError(422, 'The deployed token owner does not match this organization.', undefined, 'TOKEN_OWNER_MISMATCH');
    }
    const serviceWallet = ethers.getAddress(serviceWalletRaw);
    if (serviceWallet === ethers.ZeroAddress) {
      throw new ApiError(409, 'Register a service wallet on the selected Platform Controller first.', undefined, 'SERVICE_WALLET_NOT_REGISTERED');
    }
    const domain = {
      name: String(domainRaw.name || domainRaw[1]),
      version: String(domainRaw.version || domainRaw[2]),
      chainId: Number(domainRaw.chainId || domainRaw[3]),
      verifyingContract: ethers.getAddress(domainRaw.verifyingContract || domainRaw[4]),
    };
    if (domain.chainId !== Number(config.chainId) || !sameAddress(domain.verifyingContract, controllerAddress)) {
      throw new ApiError(503, 'The Platform Controller EIP-712 domain does not match the selected chain.', undefined, 'EIP712_DOMAIN_MISMATCH');
    }
    return { controller, controllerAddress, serviceWallet, priceDecimals: Number(priceDecimalsRaw), domain };
  }

  async syncServiceWallet(context, onchain) {
    return this.transactionRunner(async (connection) => {
      const record = await this.organizationRepository.upsertServiceWallet({
        tokenUid: context.token.tokenUid,
        tokenAddress: context.token.tokenAddress,
        organizationUid: context.organization.organizationUid,
        chainUid: context.config.chainUid,
        chainId: context.config.chainId,
        controllerAddress: onchain.controllerAddress,
        mainWalletAddress: ethers.getAddress(context.organization.walletAddress),
        serviceWalletAddress: onchain.serviceWallet,
      }, connection);
      return record;
    });
  }

  async prepare(user, { price }, selectedChain) {
    const context = await this.context(user, selectedChain);
    const provider = this.providerFactory(context.config.rpcUrl);
    try {
      const onchain = await this.onchainContext(provider, context);
      let newPrice;
      try { newPrice = ethers.parseUnits(String(price), onchain.priceDecimals); } catch {
        throw new ApiError(422, `price supports at most ${onchain.priceDecimals} decimal places.`, undefined, 'INVALID_TOKEN_PRICE');
      }
      if (newPrice <= 0n) throw new ApiError(422, 'price must be greater than zero.', undefined, 'INVALID_TOKEN_PRICE');
      const maxPrice = ethers.parseUnits('999999999999999999', onchain.priceDecimals);
      if (newPrice > maxPrice) throw new ApiError(422, 'price exceeds the supported database range.', undefined, 'INVALID_TOKEN_PRICE');
      const nonce = await onchain.controller.nonces(onchain.serviceWallet);
      const ttl = Math.max(60, await this.numberSetting(SETTING_KEYS.signatureTtlSeconds, DEFAULTS.signatureTtlSeconds));
      const deadline = Math.floor(Date.now() / 1000) + ttl;
      const message = {
        token: ethers.getAddress(context.token.tokenAddress),
        newPrice: newPrice.toString(),
        nonce: nonce.toString(),
        deadline,
      };
      await this.syncServiceWallet(context, onchain);
      return {
        tokenUid: context.token.tokenUid,
        tokenAddress: message.token,
        price: ethers.formatUnits(newPrice, onchain.priceDecimals),
        newPriceRaw: message.newPrice,
        priceDecimals: onchain.priceDecimals,
        nonce: message.nonce,
        deadline,
        expiresAt: new Date(deadline * 1000).toISOString(),
        chainUid: context.config.chainUid,
        chainId: context.config.chainId,
        controllerAddress: onchain.controllerAddress,
        issuerWalletAddress: ethers.getAddress(context.organization.walletAddress),
        serviceWalletAddress: onchain.serviceWallet,
        typedData: { domain: onchain.domain, types: TYPES, primaryType: 'SetPrice', message },
      };
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async submit(user, input, selectedChain, auth) {
    const context = await this.context(user, selectedChain);
    const deadline = Number(input.deadline);
    if (!Number.isSafeInteger(deadline)) throw new ApiError(422, 'deadline is invalid.', undefined, 'INVALID_PRICE_DEADLINE');
    const release = this.policyService ? await this.policyService.acquire(context.token.tokenUid) : null;
    try { return await withChainLock(context.config.chainId, async () => {
      const provider = this.providerFactory(context.config.rpcUrl);
      let record;
      try {
        const onchain = await this.onchainContext(provider, context);
        const tokenAddress = ethers.getAddress(input.tokenAddress);
        if (!sameAddress(tokenAddress, context.token.tokenAddress)) {
          throw new ApiError(422, 'tokenAddress does not match the issuer token.', undefined, 'TOKEN_ADDRESS_MISMATCH');
        }
        const newPrice = BigInt(input.newPriceRaw);
        if (newPrice <= 0n) throw new ApiError(422, 'newPriceRaw must be greater than zero.', undefined, 'INVALID_TOKEN_PRICE');
        const maxPrice = ethers.parseUnits('999999999999999999', onchain.priceDecimals);
        if (newPrice > maxPrice) throw new ApiError(422, 'newPriceRaw exceeds the supported database range.', undefined, 'INVALID_TOKEN_PRICE');
        const requestedNonce = BigInt(input.nonce);
        const currentNonce = await onchain.controller.nonces(onchain.serviceWallet);
        const message = {
          token: tokenAddress,
          newPrice: newPrice.toString(),
          nonce: requestedNonce.toString(),
          deadline,
        };
        let signature;
        try {
          signature = ethers.Signature.from({ v: Number(input.v), r: input.r, s: input.s });
        } catch {
          throw new ApiError(422, 'The EIP-712 signature is malformed.', undefined, 'INVALID_PRICE_SIGNATURE');
        }
        const recovered = ethers.verifyTypedData(onchain.domain, TYPES, message, signature);
        if (!sameAddress(recovered, onchain.serviceWallet)) {
          throw new ApiError(422, 'The signature was not produced by the registered service wallet.', undefined, 'INVALID_PRICE_SIGNATURE');
        }

        const existing = await this.repository.findBySignerNonce(
          context.config.chainId, onchain.serviceWallet, requestedNonce.toString(),
        );
        if (existing) {
          const sameRequest = sameAddress(existing.tokenAddress, tokenAddress)
            && String(existing.newPriceRaw) === newPrice.toString()
            && Number(existing.signatureDeadline) === deadline
            && String(existing.signatureR).toLowerCase() === String(signature.r).toLowerCase()
            && String(existing.signatureS).toLowerCase() === String(signature.s).toLowerCase();
          if (!sameRequest) {
            throw new ApiError(409, 'This service-wallet nonce is already attached to another request.', undefined, 'PRICE_NONCE_ALREADY_USED');
          }
          if (['SUBMITTED', 'CONFIRMED'].includes(existing.status)) return this.repository.findByUid(existing.priceUpdateUid);
          if (existing.status === 'PENDING') record = await this.repository.findByUid(existing.priceUpdateUid);
          else if (existing.status === 'FAILED' && !existing.transactionHash) record = existing;
          else throw new ApiError(409, 'This signed price request cannot be submitted again.', undefined, 'PRICE_REQUEST_NOT_RETRYABLE');
        }
        if (deadline <= Math.floor(Date.now() / 1000)) {
          throw new ApiError(422, 'The price signature has expired. Prepare and sign a new update.', undefined, 'PRICE_SIGNATURE_EXPIRED');
        }
        if (currentNonce.toString() !== requestedNonce.toString()) {
          throw new ApiError(409, 'The service-wallet nonce changed. Prepare and sign a new update.', undefined, 'PRICE_NONCE_CHANGED');
        }
        if (record?.status === 'FAILED') record = await this.repository.resetFailed(record.priceUpdateUid);

        const limit = Math.max(1, await this.numberSetting(SETTING_KEYS.rateLimitCount, DEFAULTS.rateLimitCount));
        const windowSeconds = Math.max(1, await this.numberSetting(
          SETTING_KEYS.rateLimitWindowSeconds, DEFAULTS.rateLimitWindowSeconds,
        ));
        if (!record && await this.repository.countRecent(context.config.chainId, onchain.serviceWallet, windowSeconds) >= limit) {
          throw new ApiError(429, 'Too many price updates. Please slow down.', undefined, 'PRICE_UPDATE_RATE_LIMITED');
        }

        this.chainRuntimeService.requireSigner(context.config);
        const signer = this.walletFactory(context.config.deployerPrivateKey, provider);
        const controller = this.contractFactory(onchain.controllerAddress, signer);
        try {
          await controller.setPriceOnBehalfOf.staticCall(
            tokenAddress, newPrice, deadline, signature.v, signature.r, signature.s,
          );
        } catch (error) {
          throw new ApiError(422, `Price update would revert: ${cleanBlockchainError(error)}`, undefined, 'PRICE_UPDATE_DRY_RUN_FAILED');
        }
        const oldPriceRaw = await controller.tokenPrice(tokenAddress);
        if (this.policyService && auth?.type === 'issuerApiKey') {
          await this.policyService.check(auth.issuerApiKeyUid, context.token, oldPriceRaw, newPrice, onchain.priceDecimals);
        }
        if (!record) {
          record = await this.repository.createPending({
            chainUid: context.config.chainUid,
            chainId: context.config.chainId,
            tokenUid: context.token.tokenUid,
            organizationUid: context.organization.organizationUid,
            issuerUserUid: user.userUid,
            controllerAddress: onchain.controllerAddress,
            tokenAddress,
            issuerWalletAddress: ethers.getAddress(context.organization.walletAddress),
            serviceWalletAddress: onchain.serviceWallet,
            priceDecimals: onchain.priceDecimals,
            oldPriceRaw: oldPriceRaw.toString(),
            newPriceRaw: newPrice.toString(),
            newPriceFormatted: ethers.formatUnits(newPrice, onchain.priceDecimals),
            signerNonce: requestedNonce.toString(),
            signatureDeadline: deadline,
            signatureV: signature.v,
            signatureR: signature.r,
            signatureS: signature.s,
          });
        }
        try {
          const transaction = await controller.setPriceOnBehalfOf(
            tokenAddress, newPrice, deadline, signature.v, signature.r, signature.s,
          );
          return this.repository.markSubmitted(record.priceUpdateUid, transaction.hash);
        } catch (error) {
          const possiblySubmittedHash = error?.transactionHash || error?.transaction?.hash || error?.receipt?.hash;
          if (ethers.isHexString(possiblySubmittedHash || '', 32)) {
            return this.repository.markSubmitted(record.priceUpdateUid, possiblySubmittedHash);
          }
          await this.repository.markFailed(record.priceUpdateUid, 'PRICE_TRANSACTION_SUBMISSION_FAILED', cleanBlockchainError(error));
          throw new ApiError(502, `Price transaction could not be submitted: ${cleanBlockchainError(error)}`, undefined,
            'PRICE_TRANSACTION_SUBMISSION_FAILED');
        }
      } finally {
        if (typeof provider.destroy === 'function') provider.destroy();
      }
    }); } finally { if (release) await release(); }
  }

  async get(user, priceUpdateUid, selectedChain) {
    const context = await this.context(user, selectedChain);
    const record = await this.repository.findByUid(priceUpdateUid);
    if (!record || record.organizationUid !== context.organization.organizationUid
      || record.chainUid !== context.config.chainUid) {
      throw ApiError.notFound('Price update request was not found.');
    }
    return record;
  }

  async prepareDirect(user, input, selectedChain) {
    const { token, organization, config } = await this.context(user, selectedChain);
    if (token.isActive === false || token.organizationUid !== organization.organizationUid) throw ApiError.forbidden('An active owned token is required.');
    const controllerAddress = token.tokenAgentWalletAddress || config.platformControllerAddress;
    const provider = this.providerFactory(config.rpcUrl);
    try {
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== Number(config.chainId)) throw new ApiError(503, 'RPC chain mismatch.', undefined, 'RPC_CHAIN_MISMATCH');
      const controller = this.contractFactory(controllerAddress, provider);
      const [decimals, info, nonce, block, oldPriceRaw] = await Promise.all([controller.PRICE_DECIMALS(),
        controller.getTokenInfo(token.tokenAddress), provider.getTransactionCount(organization.walletAddress, 'pending'),
        provider.getBlockNumber(), controller.tokenPrice(token.tokenAddress)]);
      if (!sameAddress(info.issuer, organization.walletAddress)) throw ApiError.forbidden('On-chain token issuer does not match this organization.');
      let raw;
      try { raw = ethers.parseUnits(String(input.currentTokenPrice), Number(decimals)); } catch { throw ApiError.badRequest('Price has invalid precision.'); }
      if (raw <= 0n) throw ApiError.badRequest('Price must be positive.');
      const record = await this.transactionRunner(connection => this.repository.prepareDirect({
        chainUid: config.chainUid, chainId: config.chainId, tokenUid: token.tokenUid,
        organizationUid: organization.organizationUid, issuerUserUid: user.userUid, controllerAddress,
        tokenAddress: token.tokenAddress, issuerWalletAddress: organization.walletAddress,
        priceDecimals: Number(decimals), newPriceRaw: raw.toString(), newPriceFormatted: ethers.formatUnits(raw, decimals),
        oldPriceRaw: oldPriceRaw.toString(), oldPriceFormatted: ethers.formatUnits(oldPriceRaw, decimals),
        directTransactionNonce: nonce, preparedAtBlock: block,
      }, connection));
      return { priceUpdateUid: record.priceUpdateUid, status: record.status, updateType: 'Manual',
        txHash: record.transactionHash || null, chainId: Number(record.chainId), tokenUid: record.tokenUid,
        currentTokenPrice: String(record.newPriceFormatted), newPriceRaw: record.newPriceRaw,
        controllerAddress: record.controllerAddress, tokenAddress: record.tokenAddress,
        issuerWalletAddress: record.issuerWalletAddress, priceDecimals: Number(record.priceDecimals),
        transactionRequest: { to: record.controllerAddress, from: record.issuerWalletAddress,
          chainId: Number(record.chainId), nonce: Number(record.directTransactionNonce), value: '0',
          data: new ethers.Interface(CONTROLLER_ABI).encodeFunctionData('setPrice', [record.tokenAddress, record.newPriceRaw]) } };
    } finally { if (typeof provider.destroy === 'function') provider.destroy(); }
  }

  /* Disabled user-facing retry flow. Kept for reference; recovery now belongs to the indexer.
  async recoverDirect(user, priceUpdateUid, selectedChain, input = {}, cancel = false) {
    const context = await this.context(user, selectedChain);
    const record = await this.repository.findByUid(priceUpdateUid);
    if (!record || record.organizationUid !== context.organization.organizationUid || record.tokenUid !== context.token.tokenUid
      || record.chainUid !== context.config.chainUid || record.submissionMode !== 'DIRECT'
      || record.directTransactionNonce == null) throw ApiError.notFound('Price request was not found.');
    const result = (row, recoveryStatus) => ({ priceUpdateUid: row.priceUpdateUid, status: row.status,
      txHash: row.transactionHash || null, recoveryStatus, canSign: false,
      errorCode: row.errorCode || null });
    if (record.status === 'CONFIRMED' && record.isCanonical) return result(record, 'CONFIRMED');
    const hash = input.txHash || record.transactionHash;
    if (hash) {
      const verified = await this.confirmDirect(user, { priceUpdateUid, txHash: hash,
        currentTokenPrice: ethers.formatUnits(record.newPriceRaw, Number(record.priceDecimals)) }, selectedChain);
      return result(await this.repository.findByUid(priceUpdateUid), verified.pending ? 'SYNCING' : 'CONFIRMED');
    }
    if (record.status === 'CANCELLED') return result(record, 'CANCELLED');
    // No standard RPC proves that an unobserved transaction was never broadcast.
    // Nonce consumption only tells us to reconcile, never what transaction won.
    const provider = this.providerFactory(context.config.rpcUrl);
    try {
      if (Number((await provider.getNetwork()).chainId) !== Number(context.config.chainId)) {
        throw new Error('RPC chain mismatch');
      }
      const [latest, pending] = await Promise.all([
        provider.getTransactionCount(record.issuerWalletAddress, 'latest'),
        provider.getTransactionCount(record.issuerWalletAddress, 'pending'),
      ]);
      const nonce = Number(record.directTransactionNonce);
      if (latest !== nonce || pending !== nonce || record.status !== 'PENDING') return result(record, 'SYNCING');
      if (!cancel || input.confirmNotBroadcast !== true) return result(record, 'BROADCAST_STATUS_UNKNOWN');
      // Explicit abandonment only. This is not an on-chain cancellation; any
      // later successful matching event still overrides CANCELLED in the indexer.
      const updated = await this.transactionRunner(connection => this.repository.cancelDirect(record, connection));
      return result(updated, 'CANCELLED');
    } catch (error) {
      if (error.statusCode) throw error;
      return result(record, 'SYNCING');
    } finally { if (typeof provider.destroy === 'function') provider.destroy(); }
  }

  */
  async cancelDirect(user, priceUpdateUid, selectedChain, input = {}) {
    const context = await this.context(user, selectedChain);
    const record = await this.repository.findByUid(priceUpdateUid);
    if (!record || record.organizationUid !== context.organization.organizationUid || record.tokenUid !== context.token.tokenUid
      || record.chainUid !== context.config.chainUid || record.submissionMode !== 'DIRECT') throw ApiError.notFound('Price request was not found.');
    if (input.txHash || record.transactionHash) throw ApiError.conflict('A broadcast transaction cannot be cancelled as an unsigned request.');
    const updated = await this.transactionRunner(connection => this.repository.cancelDirect(record, connection));
    return { priceUpdateUid: updated.priceUpdateUid, status: updated.status, errorCode: updated.errorCode };
  }

  // A direct wallet transaction is already broadcast by the frontend. Never sign or relay here.
  async confirmDirect(user, input, selectedChain) {
    const context = await this.context(user, selectedChain);
    if (!ethers.isHexString(input.txHash || '', 32)) throw ApiError.badRequest('A valid txHash is required.');
    const { token, organization, config } = context;
    if (token.isActive === false || token.organizationUid !== organization.organizationUid) {
      throw ApiError.forbidden('An active token owned by this issuer is required.');
    }
    let intent = await this.repository.findByUid(input.priceUpdateUid);
    if (!intent || intent.tokenUid !== token.tokenUid || intent.organizationUid !== organization.organizationUid
      || intent.chainUid !== config.chainUid || intent.submissionMode !== 'DIRECT' || intent.directTransactionNonce == null) {
      throw ApiError.notFound('Prepared manual price update was not found. Call price/prepare first.');
    }
    if (intent.status === 'CONFIRMED' && intent.isCanonical
      && intent.transactionHash?.toLowerCase() === input.txHash.toLowerCase()) {
      return { pending: false, data: await this.tokenRepository.findByUserUid(user.userUid) };
    }
    const controllerAddress = intent.controllerAddress;
    const provider = this.providerFactory(config.rpcUrl);
    const pending = () => ({ pending: true, data: { priceUpdateUid: intent.priceUpdateUid,
      status: intent.status, txHash: intent.transactionHash || null, tokenUid: token.tokenUid } });
    try {
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== Number(config.chainId)) {
        throw new ApiError(503, 'RPC chain does not match the selected chain.', undefined, 'RPC_CHAIN_MISMATCH');
      }
      const [tx, receipt] = await Promise.all([provider.getTransaction(input.txHash), provider.getTransactionReceipt(input.txHash)]);
      if (!tx) return pending();
      const { call } = decodeManualPriceExecution(tx, { ...config, controllerAddress,
        issuerWalletAddress: intent.issuerWalletAddress });
      const iface = new ethers.Interface(CONTROLLER_ABI);
      const controller = this.contractFactory(controllerAddress, provider);
      const decimals = Number(await controller.PRICE_DECIMALS());
      let expectedPrice;
      try { expectedPrice = ethers.parseUnits(String(input.currentTokenPrice), decimals); } catch {
        throw ApiError.badRequest('Price has invalid precision.');
      }
      if (BigInt(tx.value || 0) !== 0n || Number(tx.nonce) !== Number(intent.directTransactionNonce) || expectedPrice.toString() !== intent.newPriceRaw
        || expectedPrice <= 0n || call?.name !== 'setPrice' || !sameAddress(call.args.token, intent.tokenAddress)
        || call.args.newPrice !== expectedPrice) throw ApiError.badRequest('Transaction price or token does not match the request.');
      intent = await this.transactionRunner(connection => this.repository.recordDirectHash({ tokenUid: token.tokenUid,
        priceUpdateUid: intent.priceUpdateUid, transactionHash: input.txHash }, connection));
      if (!receipt) return pending();
      if (Number(receipt.status) !== 1) {
        await this.repository.markFailed(intent.priceUpdateUid, 'TRANSACTION_FAILED', 'Price transaction failed on-chain.');
        throw new ApiError(422, 'Price transaction failed on-chain.', undefined, 'TRANSACTION_FAILED');
      }
      const [latest, block] = await Promise.all([provider.getBlockNumber(), provider.getBlock(receipt.blockNumber)]);
      if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) return pending();
      if (latest - receipt.blockNumber + 1 < Math.max(1, Number(config.confirmations || 2))) return pending();
      const matches = receipt.logs.flatMap((log) => {
        if (!sameAddress(log.address, controllerAddress)) return [];
        try {
          const parsed = iface.parseLog(log);
          return parsed?.name === 'TokenPriceUpdated' && sameAddress(parsed.args.token, token.tokenAddress)
            && parsed.args.newPrice === expectedPrice ? [{ log, parsed }] : [];
        } catch { return []; }
      });
      if (matches.length !== 1) throw ApiError.badRequest('Expected TokenPriceUpdated event was not found uniquely.');
      const { log, parsed } = matches[0];
      await this.transactionRunner(async (connection) => this.repository.confirmEvent({
        chainUid: config.chainUid, chainId: config.chainId, tokenUid: token.tokenUid,
        organizationUid: organization.organizationUid, issuerUserUid: user.userUid,
        controllerAddress, tokenAddress: token.tokenAddress, issuerWalletAddress: tx.from,
        submissionMode: 'DIRECT', priceDecimals: decimals, oldPriceRaw: parsed.args.oldPrice.toString(),
        matchedPriceUpdateUid: intent.priceUpdateUid, directTransactionNonce: Number(tx.nonce),
        newPriceRaw: expectedPrice.toString(), newPriceFormatted: ethers.formatUnits(expectedPrice, decimals),
        transactionHash: input.txHash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        transactionIndex: receipt.index, logIndex: log.index, gasUsed: receipt.gasUsed?.toString(),
        effectiveGasPrice: receipt.gasPrice?.toString(), confirmedAt: new Date(Number(block.timestamp) * 1000),
      }, connection));
      return { pending: false, data: await this.tokenRepository.findByUserUid(user.userUid) };
    } finally { if (typeof provider.destroy === 'function') provider.destroy(); }
  }

  async history(user, options, selectedChain) {
    let context;
    if (user.roleName === 'Investor') {
      if (!selectedChain) throw new ApiError(400, 'Select a blockchain network.', undefined, 'SELECTED_CHAIN_REQUIRED');
      if (!options.tokenUid) throw ApiError.badRequest('tokenUid is required when an investor requests price history.');
      const token = await this.investmentRepository.findMarketplaceTokenByUid(options.tokenUid, selectedChain.chainUid);
      if (!token || token.status !== 'deployed' || token.chainUid !== selectedChain.chainUid) {
        throw ApiError.notFound('Deployed token was not found on the selected chain.');
      }
      context = { token, organization: { organizationUid: token.organizationUid }, config: selectedChain };
    } else {
      context = await this.context(user, selectedChain);
      if (options.tokenUid && options.tokenUid !== context.token.tokenUid) {
        throw ApiError.forbidden('You can only view price history for your own token.');
      }
    }
    return this.historyForToken({ ...context.token,
      organizationUid: context.organization.organizationUid, chainUid: context.config.chainUid }, options);
  }

  // Caller must first authorize access to this token (issuer/investor or admin).
  async historyForToken(token, options) {
    const result = await this.repository.listHistory(token.tokenUid, token.organizationUid,
      token.chainUid, options);
    result.rows = result.rows.map((row) => ({ ...row,
      isLegacyUpdate: Boolean(row.isLegacyUpdate), isOnchainUpdate: Boolean(row.isOnchainUpdate),
      oldPriceFormatted: row.oldPriceFormatted ?? (row.oldPriceRaw != null && row.priceDecimals != null
        ? ethers.formatUnits(row.oldPriceRaw, Number(row.priceDecimals)) : null),
    }));
    return result;
  }
}

module.exports = { TokenPriceUpdateService, TYPES, DEFAULTS, SETTING_KEYS, cleanBlockchainError };
