# Investor Claim Targeted Recovery Runner

This worker is the recovery half of the hybrid claim architecture. It repairs prepared
`investorClaimSubmission` rows where the exact claim exists on-chain but the authoritative event
transaction hash is missing. The global claim indexer is the normal synchronization path.

## Candidate and execution model

A candidate is an existing `PENDING` row with `txHash IS NULL`, a due `nextSyncAt`, and
`syncStatus` of `IDLE`, `QUEUED`, or `FAILED`. Retry queues the same row; no new submission is
inserted.

For every claimed candidate the worker:

1. Atomically changes `syncStatus` to `PROCESSING` and increments `syncAttempts`.
2. Revalidates the signed claim's interest, `SIGNED` state, topic, data, and signature.
3. Calls `Identity.getClaim` first. If the exact scheme-1 claim is absent, no log scan is made.
4. Searches `ClaimAdded`/`ClaimChanged` only on that investor Identity, with indexed filters for
   claim ID, topic, and issuer.
5. Starts at `preparedAtBlock - 2` or the prior `lastScannedBlock - 2`. The large legacy lookback is
   used only for old rows without either cursor.
6. Scans reorg-safe ranges newest-first and stops after the first chunk containing the latest exact
   data/signature match.
7. Stores the real `event.transactionHash`, block, transaction index, and log index in the existing
   row using an atomic `txHash IS NULL AND status = 'PENDING'` update.
8. Applies the shared all-required-claims completion rule.

The worker is read-only on-chain. It never sends a claim transaction and never fabricates a hash.

## Synchronization states

- `IDLE`: not currently queued, or no exact claim was found.
- `QUEUED`: explicitly requested by the fast Retry API.
- `PROCESSING`: owned by a worker execution.
- `FAILED`: RPC/data processing failed and `nextSyncAt` schedules another attempt.

The submission remains `PENDING` until a matching event is recovered. Infrastructure failures do
not change it to `FAILED`.

## Settings

| Key | Default | Meaning |
|---|---:|---|
| `ClaimRecoveryEnabled` | `true` | Enables targeted recovery |
| `ClaimRecoveryIntervalSeconds` | `15` | Worker interval |
| `ClaimRecoveryBlockOffset` | `1000` | Maximum blocks per log query |
| `ClaimRecoveryConfirmationBlocks` | `2` | Safe-head/reorg buffer |
| `ClaimRecoveryLookbackBlocks` | `200000` | Legacy-row fallback only |
| `ClaimRecoveryBatchSize` | `100` | Candidates per run |

An in-process overlap guard prevents duplicate ticks. Row-level atomic claiming and conditional
confirmation provide cross-instance/idempotent safety without Redis.

## Relationship to the global indexer

The indexer scans each confirmed block range once across known Identity addresses. Targeted
recovery exists for browser/backend handoff failures, newly discovered identities that were absent
from a prior address batch, RPC/indexer downtime, and legacy rows. Running both workers is intended;
they converge through the same unique keys and conditional updates.

Migration: `database/migrations/20260909_add_hybrid_claim_indexer.sql`.
