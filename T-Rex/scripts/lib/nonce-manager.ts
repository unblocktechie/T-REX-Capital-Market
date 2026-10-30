import { ethers } from 'ethers';

/**
 * Manages a wallet's nonce locally instead of re-querying the RPC before
 * every transaction. Some RPC providers (Infura included) briefly disagree
 * with themselves right after a block is mined — a later call can read a
 * stale "pending" nonce that doesn't yet reflect a transaction this very
 * script just got confirmed, producing spurious "nonce too low" errors even
 * within a single sequential run. Tracking the nonce ourselves after the
 * first fetch sidesteps that entirely.
 */
export class NonceManager {
  private next: number | undefined;

  constructor(private readonly provider: ethers.JsonRpcProvider, private readonly address: string) {}

  async take(): Promise<number> {
    if (this.next === undefined) {
      this.next = await this.provider.getTransactionCount(this.address, 'pending');
    }
    return this.next++;
  }
}
