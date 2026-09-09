# Global Investor Claim Indexer

The global indexer is the normal asynchronous synchronization path for investor ONCHAINID claims.
It has one persisted block progression per `(indexerName, chainId)`, even though each investor has a
different Identity contract.

## Processing flow

1. Acquire a database lease for the `investorClaim` checkpoint. A second API instance exits quickly.
2. Read the RPC head and calculate `safeLatestBlock = latestBlock - confirmationBlocks`.
3. Verify that the stored checkpoint block hash is still canonical. A mismatch stops the indexer
   and records an operator-visible error; it does not silently accept potentially orphaned claims.
4. Load active submitted investor Identity addresses from `investorMaster.contractAddress`.
5. Scan sequential block chunks and address batches for `ClaimAdded` and `ClaimChanged`.
6. In one database transaction, upsert raw events and then advance the checkpoint. A failed event
   write therefore cannot skip a block range.
7. Match raw events to existing claim submissions by identity, computed claim ID, issuer, topic,
   scheme `1`, data, and signature.
8. Atomically confirm the existing submission with the actual `transactionHash`, `blockNumber`,
   `transactionIndex`, and `logIndex`, then apply the shared application completion rule.

The indexer does not create a submission or send a blockchain transaction. Events with no current
DB match remain `UNMATCHED` and are retried, which supports DB/event arrival races.

## Tables

- `blockchainIndexerCheckpoint`: global cursor, canonical block hash, last-run state, and expiring
  database lease. Unique on `(indexerName, chainId)`.
- `investorClaimBlockchainEvent`: durable event ledger and matching status. Unique on
  `(chainId, txHash, logIndex)`.
- `investorClaimSubmission`: logical claim row and final user-facing state.

## Settings

| Key | Default | Meaning |
|---|---:|---|
| `ClaimIndexerEnabled` | `true` | Master switch |
| `ClaimIndexerIntervalSeconds` | `15` | Scheduler interval |
| `ClaimIndexerStartBlock` | `0` | Explicit start; zero uses `CLAIM_INDEXER_START_BLOCK` / TREX factory start |
| `ClaimIndexerBlockOffset` | `1000` | Blocks per sequential chunk |
| `ClaimIndexerConfirmationBlocks` | `12` | Reorg buffer |
| `ClaimIndexerAddressBatchSize` | `100` | Identity addresses per RPC filter |
| `ClaimIndexerEventBatchSize` | `200` | Stored events reconciled per run |
| `ClaimIndexerLeaseSeconds` | `120` | Distributed lease duration |
| `ClaimIndexerMaxChunksPerRun` | `20` | Catch-up work cap per tick |

`CLAIM_INDEXER_START_BLOCK` should be set to the earliest block where platform investor identities
could have emitted claims. Starting too late requires targeted recovery for older submissions;
starting at genesis is correct but unnecessarily expensive.

## Production operations

- Alert when `lastIndexedBlock` lags the safe head, `lastErrorMessage` is non-null, or `FAILED` raw
  events grow.
- Keep the same confirmation depth across receipt verification, indexer, and recovery settings.
- If the checkpoint hash becomes non-canonical, pause claim confirmation, inspect the affected
  range, rewind the checkpoint/event ledger using an operator-approved procedure, then resume.
- Use an RPC provider that supports address-array log filters and the configured batch size.

The targeted recovery worker remains enabled as a repair path; see
[CLAIM-RECOVERY-RUNNER.md](./CLAIM-RECOVERY-RUNNER.md).
