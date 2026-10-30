const { ethers } = require('ethers');
const { execute } = require('../../database/connection');

const ABI = ['function balanceOf(address) view returns (uint256)'];
const timeout = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Balance read timeout')), ms);
  })]).finally(() => clearTimeout(timer));
};

class TokenHolderSummaryService {
  constructor({ chainRepository, query = execute, providerFactory = url => new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 3 }),
    contractFactory = (address, provider) => new ethers.Contract(address, ABI, provider), now = Date.now }) {
    Object.assign(this, { chainRepository, query, providerFactory, contractFactory, now });
    this.cache = new Map();
    this.running = new Map();
  }

  async summary(token) {
    const key = `${token.chainUid}:${token.chainId}:${token.tokenUid}:${token.tokenAddress}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return { ...cached.value };
    if (this.running.has(key)) return this.running.get(key);
    const work = this.read(token).then(value => {
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, { value, expires: this.now() + 30000 });
      return { ...value };
    }).finally(() => this.running.delete(key));
    this.running.set(key, work);
    return work;
  }

  async read(token) {
    // Historical investors only; transfers to non-investors do not inflate counts.
    const rows = await this.query(`SELECT DISTINCT LOWER(i.walletAddress) AS walletAddress
      FROM investorMaster i INNER JOIN userMaster u ON u.userUid=i.userUid AND u.isDeleted=0
      WHERE i.isDeleted=0 AND u.roleUid='00000000-0000-4000-8000-000000000004'
      AND (EXISTS (SELECT 1 FROM blockchainTransaction bt WHERE bt.tokenUid=? AND bt.chainId=?
        AND bt.type='INVEST' AND bt.status='CONFIRMED' AND bt.isCanonical=1 AND bt.isDeleted=0
        AND LOWER(bt.toWallet)=LOWER(i.walletAddress))
      OR EXISTS (SELECT 1 FROM tokenPurchase p WHERE p.tokenUid=? AND p.chainId=?
        AND p.status='COMPLETED' AND p.isDeleted=0 AND LOWER(p.investorWalletAddress)=LOWER(i.walletAddress)))`,
    [token.tokenUid, token.chainId, token.tokenUid, token.chainId]);
    const result = { totalInvestors: rows.length, currentHolders: 0, formerHolders: 0, unknownHolders: rows.length,
      balanceBlockNumber: null, balanceVerifiedAt: null };
    if (!rows.length || !ethers.isAddress(token.tokenAddress)) return result;
    const chain = await this.chainRepository.findRawByUid(token.chainUid);
    if (!chain || Number(chain.chainId) !== Number(token.chainId)) return result;
    let fallback = chain.fallbackRpcUrls;
    if (typeof fallback === 'string') { try { fallback = JSON.parse(fallback); } catch { fallback = []; } }
    const urls = [...new Set([chain.rpcUrl, ...(Array.isArray(fallback) ? fallback : [])].filter(Boolean))];
    const deadline = this.now() + 15000;
    for (const url of urls) {
      if (this.now() >= deadline) break;
      let provider;
      try {
        provider = this.providerFactory(url);
        const read = promise => timeout(promise, Math.max(1, Math.min(5000, deadline - this.now())));
        if (Number((await read(provider.getNetwork())).chainId) !== Number(token.chainId)) continue;
        const block = await read(provider.getBlock('latest'));
        if (!block?.hash) continue;
        const contract = this.contractFactory(token.tokenAddress, provider);
        let index = 0; let current = 0; let former = 0;
        await Promise.all(Array.from({ length: Math.min(3, rows.length) }, async () => {
          while (index < rows.length && this.now() < deadline) {
            const wallet = rows[index++].walletAddress;
            try {
              if (!ethers.isAddress(wallet)) continue;
              const balance = BigInt(await read(contract.balanceOf(wallet, { blockTag: block.number })));
              if (balance > 0n) current++; else if (balance === 0n) former++;
            } catch { /* Unverified balances remain unknown. */ }
          }
        }));
        const verified = await read(provider.getBlock(block.number));
        if (verified?.hash !== block.hash) continue;
        Object.assign(result, { currentHolders: current, formerHolders: former,
          unknownHolders: rows.length - current - former, balanceBlockNumber: block.number,
          balanceVerifiedAt: new Date(this.now()).toISOString() });
        if (current + former) return result;
      } catch { /* Try the next configured RPC within the request budget. */ }
      finally { if (provider?.destroy) provider.destroy(); }
    }
    return result;
  }
}

module.exports = { TokenHolderSummaryService };
