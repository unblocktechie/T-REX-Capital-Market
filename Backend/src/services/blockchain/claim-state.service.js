const ethers = require('ethers');
const { env } = require('../../core/config/env');

const CLAIM_READ_ABI = [
  'function getClaim(bytes32 _claimId) view returns (uint256 topic, uint256 scheme, address issuer, bytes signature, bytes data, string uri)',
];

const normalizeHex = (value) => {
  try {
    return ethers.hexlify(ethers.getBytes(value)).toLowerCase();
  } catch {
    return String(value || '').toLowerCase();
  }
};

const hexEqual = (left, right) => normalizeHex(left) === normalizeHex(right);

const buildOnchainClaimId = (issuerIdentityAddress, claimTopic) => ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256'],
    [issuerIdentityAddress, BigInt(claimTopic)],
  ),
);

class ClaimStateService {
  constructor(config = env.blockchain, dependencies = {}) {
    this.config = config;
    this.providerFactory = dependencies.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
    this.contractFactory = dependencies.contractFactory
      || ((address, provider) => new ethers.Contract(address, CLAIM_READ_ABI, provider));
  }

  isConfigured() {
    return Boolean(this.config.sepoliaRpcUrl);
  }

  async withProvider(work) {
    if (!this.isConfigured()) throw new Error('Blockchain RPC is not configured.');
    const provider = this.providerFactory(this.config.sepoliaRpcUrl);
    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const supported = Array.isArray(this.config.supportedChainIds) && this.config.supportedChainIds.length
        ? this.config.supportedChainIds.map(Number)
        : [Number(this.config.chainId)];
      if (!supported.includes(chainId)) throw new Error(`Blockchain RPC is connected to unsupported chain ${chainId}.`);
      return await work(provider, chainId);
    } finally {
      if (provider && typeof provider.destroy === 'function') provider.destroy();
    }
  }

  async getLatestBlockNumber() {
    return this.withProvider(async (provider) => Number(await provider.getBlockNumber()));
  }

  async inspectClaim({ investorIdentityAddress, issuerIdentityAddress, claimTopic, data, signature, expectedScheme = 1 }) {
    if (!ethers.isAddress(investorIdentityAddress) || !ethers.isAddress(issuerIdentityAddress)) {
      throw new Error('Claim state lookup requires valid investor and issuer identity addresses.');
    }
    const onchainClaimId = buildOnchainClaimId(issuerIdentityAddress, claimTopic);
    return this.withProvider(async (provider, chainId) => {
      const identity = this.contractFactory(investorIdentityAddress, provider);
      const claim = await identity.getClaim(onchainClaimId);
      const topic = Number(claim.topic ?? claim[0]);
      const scheme = Number(claim.scheme ?? claim[1]);
      const issuer = String(claim.issuer ?? claim[2]);
      const onchainSignature = claim.signature ?? claim[3];
      const onchainData = claim.data ?? claim[4];
      const uri = String(claim.uri ?? claim[5] ?? '');
      const exists = topic > 0 && ethers.isAddress(issuer) && issuer !== ethers.ZeroAddress;
      if (!exists) return { exists: false, matches: false, chainId, onchainClaimId };

      const checks = {
        topic: topic === Number(claimTopic),
        scheme: scheme === Number(expectedScheme),
        issuer: issuer.toLowerCase() === issuerIdentityAddress.toLowerCase(),
        data: hexEqual(onchainData, data),
        signature: hexEqual(onchainSignature, signature),
      };
      const mismatch = Object.entries(checks).find(([, valid]) => !valid);
      return {
        exists: true,
        matches: !mismatch,
        mismatchReason: mismatch ? mismatch[0] : null,
        chainId,
        onchainClaimId,
        claim: { topic, scheme, issuer, data: onchainData, signature: onchainSignature, uri },
      };
    });
  }
}

module.exports = { ClaimStateService, CLAIM_READ_ABI, buildOnchainClaimId, normalizeHex, hexEqual };
