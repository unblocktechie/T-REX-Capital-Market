const { ethers } = require('ethers');
const { env } = require('../../core/config/env');
const { ApiError } = require('../../core/errors/api-error');
const { withTransaction } = require('../../database/connection');

const ZERO_ADDRESS = ethers.ZeroAddress;
const ACTIONS = new Set(['INVEST', 'TRANSFER', 'REDEMPTION']);
const CONTROLLER_ABI = [
  'function buy(address token,uint256 tokenAmount)',
  'function redeem(address token,uint256 tokenAmount)',
  'function redeem(address investor,address token,uint256 tokenAmount)',
  'function paymentToken() view returns (address)',
  'function getTokenInfo(address token) view returns (address issuer,uint8 tokenDecimals,uint256 price,bool controllerIsAgent)',
  'function quoteBuy(address token,uint256 tokenAmount) view returns (uint256 paymentAmount,uint256 price,uint8 tokenDecimals,address issuer)',
  'function quoteRedeem(address token,uint256 tokenAmount) view returns (uint256 paymentAmount,uint256 price,uint8 tokenDecimals,address issuer)',
  'event TokensRedeemed(address indexed investor,address indexed token,address indexed issuer,uint256 tokenAmount,uint256 paymentAmount,uint256 price)',
];
const TOKEN_ABI = [
  'function transfer(address to,uint256 amount) returns (bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
];
const PAYMENT_ABI = [
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
];
const DELEGATION_MANAGER_ABI = [
  'function redeemDelegations(bytes[] _permissionContexts,bytes32[] _modes,bytes[] _executionCallDatas)',
];
const SINGLE_EXECUTION_MODE = ethers.ZeroHash;

const sameAddress = (left, right) => Boolean(left && right)
  && String(left).toLowerCase() === String(right).toLowerCase();

const confirmationsAt = (latestBlock, receiptBlock) => Math.max(
  0,
  Number(latestBlock) - Number(receiptBlock) + 1,
);

class BlockchainTransactionService {
  constructor({ repository, config = env.blockchain, transactionRunner = withTransaction, dependencies = {} }) {
    this.repository = repository;
    this.config = config;
    this.transactionRunner = transactionRunner;
    this.providerFactory = dependencies.providerFactory || ((url) => new ethers.JsonRpcProvider(url));
    this.contractFactory = dependencies.contractFactory || ((address, abi, runner) => new ethers.Contract(address, abi, runner));
    this.controllerInterface = dependencies.controllerInterface || new ethers.Interface(CONTROLLER_ABI);
    this.tokenInterface = dependencies.tokenInterface || new ethers.Interface(TOKEN_ABI);
    this.paymentInterface = dependencies.paymentInterface || new ethers.Interface(PAYMENT_ABI);
    this.delegationInterface = dependencies.delegationInterface || new ethers.Interface(DELEGATION_MANAGER_ABI);
  }

  requiredConfirmations() {
    return Math.max(1, Number(this.config.transactionIndexerConfirmations || this.config.confirmations || 2));
  }

  provider() {
    if (!this.config.sepoliaRpcUrl) throw new ApiError(503, 'Blockchain RPC is not configured.', undefined, 'RPC_UNAVAILABLE');
    return this.providerFactory(this.config.sepoliaRpcUrl);
  }

  controllerAddress(storedAddress = null) {
    const address = storedAddress || this.config.platformControllerAddress;
    if (!ethers.isAddress(address || '')) {
      throw new ApiError(500, 'Platform Controller is not configured.', undefined, 'PLATFORM_CONTROLLER_NOT_CONFIGURED');
    }
    return ethers.getAddress(address);
  }

  paymentAddress() {
    const address = this.config.purchaseUsdtAddress || this.config.redemptionUsdtAddress;
    if (!ethers.isAddress(address || '')) {
      throw new ApiError(500, 'Payment token is not configured.', undefined, 'PAYMENT_TOKEN_NOT_CONFIGURED');
    }
    return ethers.getAddress(address);
  }

  delegationManagerAddresses() {
    const configured = Array.isArray(this.config.transactionDelegationManagerAddresses)
      ? this.config.transactionDelegationManagerAddresses : [];
    return new Set(configured.filter(ethers.isAddress).map((address) => ethers.getAddress(address)));
  }

  decodeSingleDelegatedExecution(payload) {
    let bytes;
    try { bytes = ethers.getBytes(payload); } catch {
      throw new ApiError(422, 'Delegated transaction payload is invalid.', undefined, 'INVALID_DELEGATED_TRANSACTION');
    }
    if (bytes.length < 56) {
      throw new ApiError(422, 'Delegated transaction payload is incomplete.', undefined, 'INVALID_DELEGATED_TRANSACTION');
    }
    return {
      target: ethers.getAddress(ethers.hexlify(bytes.slice(0, 20))),
      value: ethers.toBigInt(ethers.hexlify(bytes.slice(20, 52))),
      data: ethers.hexlify(bytes.slice(52)),
    };
  }

  decodeSupportedCall(tx) {
    let target = tx.to;
    let data = tx.data;
    let executionType = 'DIRECT';
    let value;
    try { value = BigInt(tx.value ?? 0); } catch {
      throw new ApiError(422, 'Transaction native value is invalid.', undefined, 'INVALID_TRANSACTION_VALUE');
    }
    if (value !== 0n) throw new ApiError(422, 'Transaction must not send native currency.', undefined, 'INVALID_TRANSACTION_VALUE');

    const managers = this.delegationManagerAddresses();
    if (ethers.isAddress(target || '') && managers.has(ethers.getAddress(target))) {
      let outer;
      try { outer = this.delegationInterface.parseTransaction({ data, value }); } catch {
        throw new ApiError(422, 'Delegated transaction calldata is invalid.', undefined, 'INVALID_DELEGATED_TRANSACTION');
      }
      const contexts = outer?.args?._permissionContexts ?? outer?.args?.permissionContexts ?? outer?.args?.[0];
      const modes = outer?.args?._modes ?? outer?.args?.modes ?? outer?.args?.[1];
      const payloads = outer?.args?._executionCallDatas ?? outer?.args?.executionCallDatas ?? outer?.args?.[2];
      if (outer?.name !== 'redeemDelegations' || contexts?.length !== 1 || modes?.length !== 1
        || payloads?.length !== 1 || String(modes[0]).toLowerCase() !== SINGLE_EXECUTION_MODE.toLowerCase()) {
        throw new ApiError(422, 'Only one allowlisted delegated execution is supported.', undefined, 'UNSUPPORTED_DELEGATED_TRANSACTION');
      }
      const execution = this.decodeSingleDelegatedExecution(payloads[0]);
      if (execution.value !== 0n) {
        throw new ApiError(422, 'Delegated transaction must not send native currency.', undefined, 'INVALID_TRANSACTION_VALUE');
      }
      target = execution.target;
      data = execution.data;
      executionType = 'DELEGATED';
    }

    // Decode the selector first, then verify the target against the token's stored Controller
    // after the token has been loaded. This keeps older tokens bound to their original Controller.
    let controllerDecoded;
    try { controllerDecoded = this.controllerInterface.parseTransaction({ data, value: 0 }); } catch {}
    const controllerAction = controllerDecoded?.name === 'buy'
      ? 'INVEST' : controllerDecoded?.name === 'redeem' ? 'REDEMPTION' : null;
    if (controllerAction) return {
      action: controllerAction, decoded: controllerDecoded, target, executionType,
    };
    let decoded;
    try { decoded = this.tokenInterface.parseTransaction({ data, value: 0 }); } catch {
      throw new ApiError(422, 'Transaction does not call a supported Platform Controller or token function.', undefined, 'INVALID_TRANSACTION_CONTRACT');
    }
    return { action: decoded?.name === 'transfer' ? 'TRANSFER' : null, decoded, target, executionType };
  }

  controllerCall(action, decoded, transactionSender) {
    if (action === 'INVEST') {
      return {
        tokenAddress: decoded.args[0],
        tokenAmountRaw: decoded.args[1].toString(),
        investorWallet: ethers.getAddress(transactionSender),
        issuerExecuted: false,
      };
    }
    const issuerExecuted = Number(decoded.fragment?.inputs?.length || 0) === 3;
    return {
      tokenAddress: decoded.args[issuerExecuted ? 1 : 0],
      tokenAmountRaw: decoded.args[issuerExecuted ? 2 : 1].toString(),
      investorWallet: issuerExecuted
        ? ethers.getAddress(decoded.args[0])
        : ethers.getAddress(transactionSender),
      issuerExecuted,
    };
  }

  async assertNetwork(provider, chainId) {
    let network;
    try { network = await provider.getNetwork(); } catch {
      throw new ApiError(503, 'Blockchain RPC is unavailable.', undefined, 'RPC_UNAVAILABLE');
    }
    if (Number(network.chainId) !== Number(chainId) || Number(chainId) !== Number(this.config.chainId)) {
      throw new ApiError(422, 'Transaction belongs to an unsupported chain.', undefined, 'WRONG_TRANSACTION_CHAIN');
    }
  }

  parseTransferLog(log, contractAddress, expected = {}) {
    if (!sameAddress(log.address, contractAddress)) return null;
    let parsed;
    try { parsed = this.tokenInterface.parseLog(log); } catch { return null; }
    if (parsed?.name !== 'Transfer') return null;
    const from = ethers.getAddress(parsed.args[0]);
    const to = ethers.getAddress(parsed.args[1]);
    const amountRaw = parsed.args[2].toString();
    if (expected.from && !sameAddress(from, expected.from)) return null;
    if (expected.to && !sameAddress(to, expected.to)) return null;
    if (expected.amountRaw && amountRaw !== String(expected.amountRaw)) return null;
    return { log, from, to, amountRaw };
  }

  paymentTransferLog(log, expected = {}) {
    if (!sameAddress(log.address, this.paymentAddress())) return null;
    let parsed;
    try { parsed = this.paymentInterface.parseLog(log); } catch { return null; }
    if (parsed?.name !== 'Transfer') return null;
    const from = ethers.getAddress(parsed.args[0]);
    const to = ethers.getAddress(parsed.args[1]);
    const amountRaw = parsed.args[2].toString();
    if (expected.from && !sameAddress(from, expected.from)) return null;
    if (expected.to && !sameAddress(to, expected.to)) return null;
    return { log, from, to, amountRaw };
  }

  redemptionEventLog(log, controllerAddress, expected = {}) {
    if (!sameAddress(log.address, controllerAddress)) return null;
    let parsed;
    try { parsed = this.controllerInterface.parseLog(log); } catch { return null; }
    if (parsed?.name !== 'TokensRedeemed') return null;
    const investor = ethers.getAddress(parsed.args[0]);
    const token = ethers.getAddress(parsed.args[1]);
    const issuer = ethers.getAddress(parsed.args[2]);
    const tokenAmountRaw = parsed.args[3].toString();
    const paymentAmountRaw = parsed.args[4].toString();
    const priceRaw = parsed.args[5].toString();
    if (expected.investor && !sameAddress(investor, expected.investor)) return null;
    if (expected.token && !sameAddress(token, expected.token)) return null;
    if (expected.issuer && !sameAddress(issuer, expected.issuer)) return null;
    if (expected.tokenAmountRaw && tokenAmountRaw !== String(expected.tokenAmountRaw)) return null;
    return { log, investor, token, issuer, tokenAmountRaw, paymentAmountRaw, priceRaw };
  }

  receiptFields(receipt, anchor, block, confirmationCount) {
    return {
      blockNumber: Number(receipt.blockNumber),
      blockHash: receipt.blockHash,
      transactionIndex: Number(receipt.index ?? receipt.transactionIndex ?? 0),
      logIndex: Number(anchor.log.index ?? anchor.log.logIndex ?? 0),
      gasUsed: receipt.gasUsed?.toString?.() || null,
      effectiveGasPrice: (receipt.gasPrice || receipt.effectiveGasPrice)?.toString?.() || null,
      confirmationCount,
      blockTimestamp: new Date(Number(block.timestamp) * 1000),
    };
  }

  async controllerRecord({ provider, tx, receipt, token, controllerAddress, action, call, executionType, userUid, confirmationCount, block }) {
    const investorWallet = call.investorWallet;
    const tokenAmountRaw = call.tokenAmountRaw;
    if (BigInt(tokenAmountRaw) <= 0n) {
      throw new ApiError(422, 'Transaction token amount must be greater than zero.', undefined, 'INVALID_TRANSACTION_AMOUNT');
    }
    const issuerWallet = ethers.getAddress(token.issuerWalletAddress);
    if (action === 'REDEMPTION' && call.issuerExecuted && !sameAddress(tx.from, issuerWallet)) {
      throw new ApiError(403, 'Redemption transaction sender is not the token issuer wallet.', undefined, 'TRANSACTION_SENDER_MISMATCH');
    }
    const tokenEvent = (receipt.logs || []).map((log) => this.parseTransferLog(
      log,
      token.tokenAddress,
      action === 'INVEST'
        ? { from: ZERO_ADDRESS, to: investorWallet, amountRaw: tokenAmountRaw }
        : { from: investorWallet, to: ZERO_ADDRESS, amountRaw: tokenAmountRaw },
    )).find(Boolean);
    if (!tokenEvent) {
      throw new ApiError(422, `Expected token ${action === 'INVEST' ? 'issuance' : 'burn'} event is missing.`, undefined,
        action === 'INVEST' ? 'TOKEN_ISSUE_EVENT_MISSING' : 'TOKEN_BURN_EVENT_MISSING');
    }
    const paymentEvent = (receipt.logs || []).map((log) => this.paymentTransferLog(
      log,
      action === 'INVEST'
        ? { from: investorWallet, to: issuerWallet }
        : { from: issuerWallet, to: investorWallet },
    )).find(Boolean);
    if (!paymentEvent || BigInt(paymentEvent.amountRaw) <= 0n) {
      throw new ApiError(422, 'Expected USDT settlement event is missing.', undefined, 'PAYMENT_EVENT_MISSING');
    }

    const redemptionEvent = action === 'REDEMPTION'
      ? (receipt.logs || []).map((log) => this.redemptionEventLog(log, controllerAddress, {
        investor: investorWallet,
        token: token.tokenAddress,
        issuer: issuerWallet,
        tokenAmountRaw,
      })).find(Boolean)
      : null;
    if (action === 'REDEMPTION' && !redemptionEvent) {
      throw new ApiError(422, 'Expected TokensRedeemed event is missing or does not match the request.', undefined, 'REDEMPTION_EVENT_MISSING');
    }

    const controller = this.contractFactory(controllerAddress, CONTROLLER_ABI, provider);
    const paymentToken = await controller.paymentToken({ blockTag: receipt.blockNumber });
    if (!sameAddress(paymentToken, this.paymentAddress())) {
      throw new ApiError(422, 'Controller payment token does not match backend configuration.', undefined, 'PAYMENT_TOKEN_MISMATCH');
    }
    const tokenInfo = await controller.getTokenInfo(token.tokenAddress, { blockTag: receipt.blockNumber });
    if (!sameAddress(tokenInfo[0], issuerWallet) || Number(tokenInfo[1]) !== Number(token.decimals)) {
      throw new ApiError(422, 'Controller token configuration does not match backend token metadata.', undefined, 'TOKEN_CONFIGURATION_MISMATCH');
    }
    const quoteMethod = action === 'INVEST' ? 'quoteBuy' : 'quoteRedeem';
    const quote = await controller[quoteMethod](token.tokenAddress, tokenAmountRaw, { blockTag: receipt.blockNumber });
    if (BigInt(quote[0]) !== BigInt(paymentEvent.amountRaw)
      || !sameAddress(quote[3], issuerWallet)
      || Number(quote[2]) !== Number(token.decimals)
      || BigInt(quote[1]) !== BigInt(tokenInfo[2])) {
      throw new ApiError(422, 'USDT settlement does not match the authoritative controller quote.', undefined, 'PAYMENT_AMOUNT_MISMATCH');
    }
    if (redemptionEvent && (BigInt(redemptionEvent.paymentAmountRaw) !== BigInt(quote[0])
      || BigInt(redemptionEvent.priceRaw) !== BigInt(quote[1]))) {
      throw new ApiError(422, 'TokensRedeemed event does not match the authoritative controller quote.', undefined, 'REDEMPTION_EVENT_MISMATCH');
    }

    const payment = this.contractFactory(this.paymentAddress(), PAYMENT_ABI, provider);
    const usdtDecimals = Number(await payment.decimals({ blockTag: receipt.blockNumber }));
    return {
      chainId: Number(this.config.chainId), tokenUid: token.tokenUid, organizationUid: token.organizationUid,
      tokenAddress: ethers.getAddress(token.tokenAddress), controllerAddress,
      transactionHash: tx.hash.toLowerCase(), type: action, executionType, initiatedByUserUid: userUid || null,
      initiatedByWallet: ethers.getAddress(tx.from), fromWallet: paymentEvent.from, toWallet: paymentEvent.to,
      tokenAmountRaw, tokenAmountFormatted: ethers.formatUnits(tokenAmountRaw, Number(token.decimals)),
      usdtAmountRaw: paymentEvent.amountRaw,
      usdtAmountFormatted: ethers.formatUnits(paymentEvent.amountRaw, usdtDecimals),
      tokenSymbol: token.tokenSymbol, status: 'CONFIRMED', confirmedAt: new Date(), isCanonical: true,
      ...this.receiptFields(receipt, redemptionEvent || paymentEvent, block, confirmationCount),
    };
  }

  transferRecord({ tx, receipt, token, decoded, executionType, userUid, confirmationCount, block }) {
    const sender = ethers.getAddress(tx.from);
    const recipient = ethers.getAddress(decoded.args[0]);
    const tokenAmountRaw = decoded.args[1].toString();
    const transferEvent = (receipt.logs || []).map((log) => this.parseTransferLog(log, token.tokenAddress, {
      from: sender, to: recipient, amountRaw: tokenAmountRaw,
    })).find(Boolean);
    if (!transferEvent) throw new ApiError(422, 'Expected token Transfer event is missing.', undefined, 'TRANSFER_EVENT_MISSING');
    return {
      chainId: Number(this.config.chainId), tokenUid: token.tokenUid, organizationUid: token.organizationUid,
      tokenAddress: ethers.getAddress(token.tokenAddress), controllerAddress: null,
      transactionHash: tx.hash.toLowerCase(), type: 'TRANSFER', executionType, initiatedByUserUid: userUid || null,
      initiatedByWallet: sender, fromWallet: sender, toWallet: recipient,
      tokenAmountRaw, tokenAmountFormatted: ethers.formatUnits(tokenAmountRaw, Number(token.decimals)),
      usdtAmountRaw: null, usdtAmountFormatted: null, tokenSymbol: token.tokenSymbol,
      status: 'CONFIRMED', confirmedAt: new Date(), isCanonical: true,
      ...this.receiptFields(receipt, transferEvent, block, confirmationCount),
    };
  }

  submittedRecord({ tx, token, controllerAddress, action, call, decoded, executionType, userUid }) {
    const sender = ethers.getAddress(tx.from);
    const transfer = action === 'TRANSFER';
    const tokenAmountRaw = transfer ? decoded.args[1].toString() : call.tokenAmountRaw;
    const destination = transfer
      ? ethers.getAddress(decoded.args[0])
      : action === 'REDEMPTION' ? call.investorWallet : controllerAddress;
    return {
      chainId: Number(this.config.chainId), tokenUid: token.tokenUid, organizationUid: token.organizationUid,
      tokenAddress: ethers.getAddress(token.tokenAddress), controllerAddress: transfer ? null : controllerAddress,
      transactionHash: tx.hash.toLowerCase(), type: action, executionType, initiatedByUserUid: userUid || null,
      initiatedByWallet: sender, fromWallet: sender,
      toWallet: destination,
      tokenAmountRaw, tokenAmountFormatted: ethers.formatUnits(tokenAmountRaw, Number(token.decimals)),
      usdtAmountRaw: null, usdtAmountFormatted: null, tokenSymbol: token.tokenSymbol,
      status: 'SUBMITTED', confirmationCount: 0, confirmedAt: null, isCanonical: true,
    };
  }

  async verify({ user = null, chainId, txHash, tokenUid = null, expectedAction = null }) {
    const normalizedAction = expectedAction ? String(expectedAction).toUpperCase() : null;
    if (normalizedAction && !ACTIONS.has(normalizedAction)) throw ApiError.badRequest('expectedAction is invalid.');
    if (!ethers.isHexString(txHash, 32)) throw ApiError.badRequest('txHash is invalid.');
    const provider = this.provider();
    try {
      await this.assertNetwork(provider, chainId);
      let tx; let receipt;
      try { [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]); } catch {
        throw new ApiError(503, 'Transaction could not be read from the blockchain.', undefined, 'RPC_UNAVAILABLE');
      }
      if (!tx) return {
        chainId: Number(chainId), tokenUid, type: normalizedAction, status: 'SUBMITTED',
        transactionHash: txHash.toLowerCase(), confirmationCount: 0,
        requiredConfirmations: this.requiredConfirmations(),
      };
      if (tx.chainId !== null && tx.chainId !== undefined && Number(tx.chainId) !== Number(chainId)) {
        throw new ApiError(422, 'Transaction declares a different chain.', undefined, 'WRONG_TRANSACTION_CHAIN');
      }

      const { action, decoded, target: effectiveTarget, executionType } = this.decodeSupportedCall(tx);
      if (!action || (normalizedAction && action !== normalizedAction)) {
        throw new ApiError(422, 'Blockchain action does not match expectedAction.', undefined, 'TRANSACTION_ACTION_MISMATCH');
      }
      const call = action === 'TRANSFER' ? null : this.controllerCall(action, decoded, tx.from);
      const transactionTokenAddress = action === 'TRANSFER' ? effectiveTarget : call.tokenAddress;
      const token = tokenUid
        ? await this.repository.findTokenByUid(tokenUid)
        : await this.repository.findTokenByAddress(transactionTokenAddress);
      if (!token || !sameAddress(token.tokenAddress, transactionTokenAddress)) {
        throw new ApiError(422, 'Transaction token is not a deployed platform token.', undefined, 'INVALID_TRANSACTION_TOKEN');
      }
      const expectedControllerAddress = action === 'TRANSFER'
        ? null : this.controllerAddress(token.tokenAgentWalletAddress);
      if (expectedControllerAddress && !sameAddress(effectiveTarget, expectedControllerAddress)) {
        throw new ApiError(
          422,
          'Transaction was not sent to the Platform Controller assigned to this token.',
          undefined,
          'INVALID_TRANSACTION_CONTRACT',
        );
      }

      let actor = null;
      if (user) {
        if (action === 'REDEMPTION' && call.issuerExecuted) {
          if (user.roleName !== 'Issuer') throw ApiError.forbidden('Only the token issuer can confirm this redemption transaction.');
          if (token.issuerUserUid !== user.userUid || !sameAddress(token.issuerWalletAddress, tx.from)) {
            throw new ApiError(403, 'Transaction sender does not match the token issuer wallet.', undefined, 'TRANSACTION_SENDER_MISMATCH');
          }
          actor = { userUid: user.userUid, walletAddress: token.issuerWalletAddress };
        } else {
          if (user.roleName !== 'Investor') throw ApiError.forbidden('Only an investor can confirm this wallet transaction.');
          actor = await this.repository.findInvestorByUserUid(user.userUid);
          if (!actor || !sameAddress(actor.walletAddress, tx.from)) {
            throw new ApiError(403, 'Transaction sender does not match your registered investor wallet.', undefined, 'TRANSACTION_SENDER_MISMATCH');
          }
        }
      } else {
        actor = action === 'REDEMPTION' && call.issuerExecuted
          ? await this.repository.findIssuerByWallet(tx.from)
          : await this.repository.findUserByWallet(tx.from);
      }

      if (!receipt) {
        const pending = this.submittedRecord({
          tx, token, controllerAddress: expectedControllerAddress, action, call, decoded, executionType,
          userUid: actor?.userUid || user?.userUid,
        });
        const saved = await this.transactionRunner((connection) => this.repository.upsert(pending, connection));
        return { ...saved, requiredConfirmations: this.requiredConfirmations() };
      }
      let canonicalBlock;
      try { canonicalBlock = await provider.getBlock(receipt.blockNumber); } catch {
        throw new ApiError(503, 'Transaction block could not be verified.', undefined, 'RPC_UNAVAILABLE');
      }
      if (!canonicalBlock || !receipt.blockHash || !sameAddress(canonicalBlock.hash, receipt.blockHash)) {
        throw new ApiError(409, 'Transaction block is no longer canonical.', undefined, 'CHAIN_REORGANIZATION');
      }
      if (Number(receipt.status) !== 1) {
        const failed = {
          chainId: Number(chainId), tokenUid: token.tokenUid, organizationUid: token.organizationUid,
          tokenAddress: ethers.getAddress(token.tokenAddress), controllerAddress: expectedControllerAddress,
          transactionHash: tx.hash.toLowerCase(), type: action, executionType,
          initiatedByUserUid: actor?.userUid || user?.userUid || null,
          initiatedByWallet: ethers.getAddress(tx.from), fromWallet: ethers.getAddress(tx.from), toWallet: tx.to ? ethers.getAddress(tx.to) : null,
          tokenSymbol: token.tokenSymbol, status: 'FAILED', confirmationCount: 0, blockNumber: Number(receipt.blockNumber),
          blockHash: receipt.blockHash, transactionIndex: Number(receipt.index ?? 0), logIndex: null,
          gasUsed: receipt.gasUsed?.toString?.() || null,
          effectiveGasPrice: (receipt.gasPrice || receipt.effectiveGasPrice)?.toString?.() || null,
          blockTimestamp: new Date(Number(canonicalBlock.timestamp) * 1000), confirmedAt: null,
          errorCode: 'TRANSACTION_REVERTED', errorMessage: 'Blockchain transaction reverted.', isCanonical: true,
        };
        return this.transactionRunner((connection) => this.repository.upsert(failed, connection));
      }

      const latestBlock = await provider.getBlockNumber();
      const confirmationCount = confirmationsAt(latestBlock, receipt.blockNumber);
      const record = action === 'TRANSFER'
        ? this.transferRecord({ tx, receipt, token, decoded, executionType, userUid: actor?.userUid || user?.userUid, confirmationCount, block: canonicalBlock })
        : await this.controllerRecord({
          provider, tx, receipt, token, controllerAddress: expectedControllerAddress,
          action, call, executionType, userUid: actor?.userUid || user?.userUid,
          confirmationCount, block: canonicalBlock,
        });
      if (confirmationCount < this.requiredConfirmations()) {
        record.status = 'SUBMITTED';
        record.confirmedAt = null;
      }
      const saved = await this.transactionRunner(async (connection) => {
        const row = await this.repository.upsert(record, connection);
        await this.repository.synchronizeLegacy(record, connection);
        return row;
      });
      return { ...saved, requiredConfirmations: this.requiredConfirmations() };
    } finally {
      if (typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async confirm(user, input) {
    return this.verify({ user, ...input });
  }

  async synchronize(input) {
    return this.verify(input);
  }

  present(row) {
    if (!row) return row;
    return {
      transactionUid: row.transactionUid || null,
      chainId: Number(row.chainId), tokenUid: row.tokenUid || null, organizationUid: row.organizationUid || null,
      tokenAddress: row.tokenAddress || null, controllerAddress: row.controllerAddress || null,
      transactionHash: row.transactionHash, blockNumber: row.blockNumber == null ? null : Number(row.blockNumber),
      blockHash: row.blockHash || null, transactionIndex: row.transactionIndex ?? null, logIndex: row.logIndex ?? null,
      gasUsed: row.gasUsed || null, effectiveGasPrice: row.effectiveGasPrice || null,
      type: row.type, executionType: row.executionType || 'DIRECT', initiatedByUserUid: row.initiatedByUserUid,
      initiatedByWallet: row.initiatedByWallet || null, fromWallet: row.fromWallet || null, toWallet: row.toWallet || null,
      tokenAmountRaw: row.tokenAmountRaw || null, tokenAmount: row.tokenAmountFormatted == null ? null : String(row.tokenAmountFormatted),
      usdtAmountRaw: row.usdtAmountRaw || null, usdtAmount: row.usdtAmountFormatted == null ? null : String(row.usdtAmountFormatted),
      tokenName: row.tokenName || null, tokenSymbol: row.tokenSymbol, issuerName: row.issuerName || null,
      status: row.status, confirmationCount: Number(row.confirmationCount || 0),
      requiredConfirmations: Number(row.requiredConfirmations || this.requiredConfirmations()),
      blockTimestamp: row.blockTimestamp, confirmedAt: row.confirmedAt,
      error: row.errorCode ? { code: row.errorCode, message: row.errorMessage } : null,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  async list(user, query) {
    if (!['Investor', 'Issuer', 'Super Administrator'].includes(user.roleName)) throw ApiError.forbidden();
    const result = await this.repository.list(user, query);
    return {
      items: result.rows.map((row) => this.present(row)),
      pagination: {
        page: result.page, limit: result.limit, total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    };
  }

  async exportCsv(user, query) {
    if (!['Investor', 'Issuer', 'Super Administrator'].includes(user.roleName)) throw ApiError.forbidden();
    const rows = await this.repository.listForExport(user, query);
    const columns = ['blockTimestamp', 'type', 'tokenName', 'tokenAmountFormatted', 'tokenSymbol', 'usdtAmountFormatted',
      'fromWallet', 'toWallet', 'transactionHash', 'status', 'blockNumber'];
    const csvCell = (value) => {
      const text = String(value ?? '');
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
  }
}

module.exports = {
  BlockchainTransactionService,
  CONTROLLER_ABI,
  TOKEN_ABI,
  PAYMENT_ABI,
  DELEGATION_MANAGER_ABI,
  ACTIONS,
  sameAddress,
  confirmationsAt,
};
