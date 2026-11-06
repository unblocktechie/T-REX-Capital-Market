const ethers = require('ethers');

const ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
const unknown = () => ({
  currentTokenBalance: null, currentTokenBalanceRaw: null, isCurrentHolder: null,
  holderStatus: 'UNKNOWN', balanceBlockNumber: null, balanceBlockHash: null, balanceVerifiedAt: null,
});

// Read-only, short-lived snapshots. No signer, private key or state-changing call.
class TokenHolderBalanceService {
  constructor({ chainRepository, providerFactory, contractFactory, now = Date.now }) {
    Object.assign(this, { chainRepository, now });
    this.providerFactory = providerFactory || (url => {
      const request = new ethers.FetchRequest(url);
      request.timeout = 5000;
      return new ethers.JsonRpcProvider(request, undefined, { batchMaxCount: 3, batchStallTime: 10 });
    });
    this.contractFactory = contractFactory || ((address, provider) => new ethers.Contract(address, ABI, provider));
    this.cache = new Map();
    this.pending = new Map();
  }

  async balances(token, investors) {
    const wallets = [...new Set(investors.map(row => (row.walletAddress || '').toLowerCase()))].sort();
    const key = JSON.stringify([token.chainUid, token.chainId, token.tokenAddress?.toLowerCase(), wallets]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const work = this.read(token, wallets).then(value => {
      // Unknown snapshots are cached briefly too, to avoid hammering a failing RPC.
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, { value, expires: this.now() + 30000 });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  async read(token, wallets) {
    const empty = () => new Map(wallets.map(wallet => [wallet, unknown()]));
    if (!wallets.length || !ethers.isAddress(token.tokenAddress || '')) return empty();
    let config;
    try { config = await this.chainRepository.findRawByUid(token.chainUid); } catch { return empty(); }
    if (!config || config.isDeleted || Number(config.chainId) !== Number(token.chainId)) return empty();
    let fallback = config.fallbackRpcUrls;
    if (typeof fallback === 'string') { try { fallback = JSON.parse(fallback); } catch { fallback = []; } }
    const urls = [...new Set([config.rpcUrl, ...(Array.isArray(fallback) ? fallback : [])].filter(Boolean))];
    // Bound endpoint latency and load. Unchecked wallets remain UNKNOWN.
    const deadline = this.now() + 15000;
    for (const url of urls) {
      if (this.now() >= deadline) break;
      let provider;
      const result = empty();
      const call = async work => {
        const remaining = Math.min(5000, deadline - this.now());
        if (remaining <= 0) throw new Error('Balance read budget exhausted');
        let timer;
        try {
          return await Promise.race([work(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Balance read timeout')), remaining);
          })]);
        } finally { clearTimeout(timer); }
      };
      try {
        provider = this.providerFactory(url);
        const network = await call(() => provider.getNetwork());
        if (Number(network.chainId) !== Number(token.chainId)) continue;
        const block = await call(() => provider.getBlock('latest'));
        if (!block?.hash) continue;
        const contract = this.contractFactory(token.tokenAddress, provider);
        const decimals = Number(await call(() => contract.decimals({ blockTag: block.number })));
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) continue;
        const valid = wallets.filter(wallet => ethers.isAddress(wallet));
        let successes = 0;
        for (let i = 0; i < valid.length && this.now() < deadline; i += 3) {
          const group = valid.slice(i, i + 3);
          const values = await Promise.allSettled(group.map(wallet =>
            call(() => contract.balanceOf(wallet, { blockTag: block.number }))));
          let groupSuccesses = 0;
          values.forEach((value, index) => {
            if (value.status !== 'fulfilled') return;
            const raw = BigInt(value.value);
            if (raw < 0n) return;
            groupSuccesses++;
            result.set(group[index], {
              currentTokenBalance: ethers.formatUnits(raw, decimals),
              currentTokenBalanceRaw: raw.toString(), isCurrentHolder: raw > 0n,
              holderStatus: raw > 0n ? 'CURRENT' : 'FORMER',
              balanceBlockNumber: block.number, balanceBlockHash: block.hash,
              balanceVerifiedAt: new Date(this.now()).toISOString(),
            });
          });
          successes += groupSuccesses;
          // Stop on an unavailable/rate-limited batch rather than fan out more calls.
          if (!groupSuccesses) break;
        }
        // Ensure the snapshot's block is still canonical before returning it.
        const canonical = await call(() => provider.getBlock(block.number));
        if (canonical?.hash !== block.hash) continue;
        if (successes || !valid.length) return result;
      } catch {
        // Do not expose RPC credentials or classify read failures as zero balances.
      } finally {
        provider?.destroy?.();
      }
    }
    return empty();
  }
}

module.exports = { TokenHolderBalanceService, unknown };
