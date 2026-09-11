# Identity Registry registration

This flow makes the backend database plus independently verified blockchain state authoritative.
The browser cannot set an operation to `CONFIRMED` and cannot supply registry, wallet, identity,
country, issuer, token, or chain values.

## HTTP flow

All endpoints require an Issuer JWT and RBAC permission. `interestUid` is the existing
`tokenInvestmentInterest` subscription identifier.

### 1. Prepare the operation

```http
POST /api/v1/investments/issuer/interests/{interestUid}/registry-registration
Content-Type: application/json

{}
```

The backend verifies subscription ownership, approved/active issuer organization, deployed token,
Identity Registry address, submitted investor onboarding, investor wallet and ONCHAINID, active
ISO-3166 numeric country, token country restrictions, `claimSubmitted` state, every independently
`CONFIRMED` required claim, current non-membership, and the issuer wallet's registry agent role.

If the investor is already present in the expected registry but the application has no confirmed
operation, Create performs idempotent recovery instead of returning `INVESTOR_ALREADY_REGISTERED`.
It does not create a PENDING operation and the frontend must not open MetaMask. The backend first
locates the exact canonical `IdentityRegistered` event, fully verifies its transaction and final
state, then inserts the operation directly as `CONFIRMED`, changes the investment interest to
`registered`, and returns the normal HTTP `200` success response. If authoritative evidence is
temporarily unavailable, the API returns `503` and asks the client to retry the API without opening
MetaMask; registry state alone is never treated as confirmation proof.
The synchronous recovery scan is bounded by `REGISTRY_RECOVERY_LOOKBACK_BLOCKS`, split into
`REGISTRY_RECOVERY_BLOCK_OFFSET` ranges, and retries inconsistent public-RPC evidence reads up to
`REGISTRY_RPC_EVIDENCE_ATTEMPTS` times before handing recovery back to the worker.
`SEPOLIA_FALLBACK_RPC_URLS` accepts a comma-separated list of independent RPC endpoints. Historical
event lookup and transaction verification fail over when the primary endpoint errors, returns
incomplete transaction evidence, or returns no matching log for a state-confirmed registration.

Success creates exactly one `identityRegistryRegistration` row with `PENDING` and `txHash = NULL`:

```json
{
  "success": true,
  "data": {
    "registryOperationId": "5d689ab8-6ef0-43b6-b430-f1e6a17cf46c",
    "subscriptionId": "ff2cc584-4e5b-4657-a66b-06d84534c98f",
    "tokenId": "02647d95-d487-4a7a-ab83-d470176cf803",
    "status": "PENDING",
    "chainId": 11155111,
    "identityRegistryAddress": "0x...",
    "investorWalletAddress": "0x...",
    "onchainIdentityAddress": "0x...",
    "country": 356,
    "txHash": null
  }
}
```

Repeated preparation returns the same row. The unique `interestUid` index prevents race duplicates.
If it is already confirmed, the existing confirmed operation is returned.

The frontend must use these returned values unchanged:

```solidity
registerIdentity(investorWalletAddress, onchainIdentityAddress, country)
```

### 2. Confirm the MetaMask transaction

```http
POST /api/v1/investments/issuer/interests/{interestUid}/registry-registration/{registryOperationId}/confirm
Content-Type: application/json

{ "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
```

`txHash` is the only accepted input. It is first durably attached to the `PENDING` row, so an RPC
outage or process crash remains recoverable. The backend then proves all of the following:

1. The RPC chain is supported and equals the operation chain.
2. The transaction exists and is sufficiently confirmed.
3. `tx.from` is the stored issuer wallet and the outer transaction sends no native value.
4. For a direct transaction, `tx.to` is the stored Identity Registry and calldata is exactly
   `registerIdentity(address,address,uint16)`.
5. For a delegated smart-wallet transaction, `tx.to` is an explicitly configured
   `REGISTRY_DELEGATION_MANAGER_ADDRESSES` entry, the outer call is exactly
   `redeemDelegations(bytes[],bytes32[],bytes[])`, and it contains one supported single execution.
   The packed nested target, native value, function and arguments are decoded independently; the
   target must be the stored Identity Registry and the nested value must be zero.
6. Investor wallet, ONCHAINID and country equal the stored authoritative values.
7. The receipt succeeded, has the configured confirmations and its block hash is still canonical.
8. The expected deployed-version `IdentityRegistered(address,address)` event came from the stored registry.
9. `contains`, `identity`, and `investorCountry` prove the matching final registry state.

MetaMask may wrap the frontend's normal `registerIdentity` request through its Delegation Manager.
The frontend still submits only the returned transaction hash; it must not reject the transaction
because the outer `tx.to` is the configured delegated executor.

Only then does a conditional database transaction change `PENDING` to `CONFIRMED` and save the
actual hash, block number/hash, transaction index, event log index, and `verifiedAt`. In that same
database transaction it changes `tokenInvestmentInterest.status` from `claimSubmitted` to
`registered` and appends one `tokenInvestmentInterestHistory` event with `eventType: registered`.
If any of these three writes fails, all of them roll back. Repeated API/fallback confirmations do
not create duplicate history because the history row is written only by the successful conditional
status transition.

The successful confirmation response also includes `subscriptionStatus: "registered"`.

An unmined or under-confirmed transaction returns HTTP `202` and stays `PENDING`. RPC failures return
`503` and stay recoverable. Definitive mismatches return `422`, retain `PENDING`, and store an audit
`errorCode`/`errorMessage`. A new hash can replace a definitively invalid hash, but cannot replace one
that is merely mining, confirming, or temporarily unverifiable. A hash has a global unique index and
cannot be reused by another operation.

### 3. Resume/status

```http
GET /api/v1/investments/issuer/interests/{interestUid}/registry-registration
```

Use this after refresh to resume a pending wallet/verification UI. Confirmation with the same hash is
idempotent; after `CONFIRMED` it returns the stored result without blockchain writes.

## Hybrid reconciliation

The in-process `IdentityRegistryReconciliationRunner` combines two read-only recovery paths:

- Global indexer: one chain-scoped `blockchainIndexerCheckpoint` named
  `identityRegistryRegistration`, protected by an expiring DB lease. It scans safe sequential ranges
  once across all deployed token registry addresses, stores raw events before advancing the cursor,
  then matches them to pending rows.
- Targeted recovery: examines bounded batches of pending operations. A known hash is reverified
  directly. Without a hash it first reads exact final registry state, then searches only the stored
  registry with indexed investor/identity topics from the prepared cursor inside a bounded lookback.

Neither path creates an on-chain transaction or a second operation. Every discovered event hash is
passed through the same full verifier; matching event fields alone are not enough. A confirmation
buffer avoids recent reorgs. If the persisted checkpoint block becomes non-canonical, the worker
rewinds atomically, marks orphaned events non-canonical, moves affected confirmations back to
`PENDING`, and queues independent verification again.

Operator settings use the `RegistryIndexer*` and `RegistryRecovery*` keys seeded by migration
`20260909_add_identity_registry_registration.sql`. In production set `REGISTRY_INDEXER_START_BLOCK`
to the earliest relevant deployed registry block, keep `REGISTRY_CONFIRMATIONS` at the configured
two-block threshold, and monitor checkpoint lag, lease expiry, errors,
pending age, and reconciliation counts.

## Database records

- `identityRegistryRegistration`: one authoritative operation per subscription.
- `identityRegistryBlockchainEvent`: immutable-style raw event/audit ledger with canonical and
  processing state.
- `blockchainIndexerCheckpoint`: existing shared checkpoint table, global per indexer name + chain.
- `tokenInvestmentInterest` and `tokenInvestmentInterestHistory`: final subscription state and its
  issuer-attributed `registered` timeline event.

There are no foreign keys, matching the project convention; service/repository checks enforce soft
relationships. All columns are camelCase and timestamps are UTC.
