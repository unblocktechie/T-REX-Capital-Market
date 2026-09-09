# Investor On-Chain Claim Submission

Investor claims use a two-phase, hybrid confirmation flow. The normal path verifies the wallet
transaction receipt immediately. A global indexer synchronizes confirmed `ClaimAdded` and
`ClaimChanged` events, while a targeted recovery worker handles unusual cases where an identity was
not monitored or the browser/backend handoff failed.

The blockchain is the source of truth. The backend never accepts identity, issuer, topic, claim data,
or signature values from the client; all expected values come from the signed claim and subscription
records.

## Endpoints

All endpoints require an investor JWT and API-level permission.

### List signed claims

`GET /api/v1/investor/claims?interestId={interestUid}`

Returns the investor and issuer ONCHAINID addresses plus each issuer-signed claim. A claim status is
`notInitiated` when no submission exists, otherwise it is `PENDING`, `CONFIRMED`, or `FAILED`.

### Prepare a claim

`POST /api/v1/investor/claims/:claimId/prepare`

```json
{ "interestId": "00000000-0000-4000-8000-000000000001" }
```

Creates or resets the single submission row and returns the exact arguments for the frontend wallet
transaction. The service records `preparedAtBlock` when RPC is available, so targeted recovery can
start near the attempt rather than scanning a large fixed history.

```json
{
  "success": true,
  "message": "Claim submission prepared. Submit the transaction on-chain, then confirm with txHash.",
  "data": {
    "submissionUid": "00000000-0000-4000-8000-000000000010",
    "claimId": "00000000-0000-4000-8000-000000000020",
    "claimTopic": 1,
    "data": "0x4b59435f415050524f564544",
    "signature": "0x...",
    "investorIdentityAddress": "0x1111111111111111111111111111111111111111",
    "issuerIdentityAddress": "0x2222222222222222222222222222222222222222",
    "status": "PENDING",
    "alreadyConfirmed": false
  }
}
```

### Submit the wallet transaction hash

`POST /api/v1/investor/claims/:claimId/submit`

```json
{
  "interestId": "00000000-0000-4000-8000-000000000001",
  "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

The hash is persisted before the RPC receipt lookup. This protects against a backend crash or RPC
outage after the transaction is broadcast.

- `200 CONFIRMED`: receipt succeeded and contains the exact claim event on the expected identity.
- `202 PENDING_CONFIRMATION`: hash is durable, but the transaction is not mined or lacks required
  confirmations. No duplicate transaction is required.
- `422`: definitive failure such as wrong chain, failed transaction, wrong identity, or claim mismatch.
- `503`: temporary RPC failure; the row stays `PENDING` with the submitted hash.

Both `ClaimAdded` and `ClaimChanged` are valid, but the event must have scheme `1` and exactly match
the expected identity, issuer, topic, data, and signature.

### Fast Retry

`POST /api/v1/investor/claims/:claimId/retry`

```json
{ "interestId": "00000000-0000-4000-8000-000000000001" }
```

Retry never performs a large `eth_getLogs` scan inside the HTTP request:

1. If the row is already `CONFIRMED`, return it immediately.
2. If `txHash` exists, verify that exact receipt. A missing/unconfirmed receipt returns
   `PENDING_CONFIRMATION`.
3. Without a usable hash, call `Identity.getClaim(claimId)` once and compare the complete claim.
4. If the exact claim is absent, return `TRANSACTION_REQUIRED`; the frontend may then open the wallet.
5. If the claim exists, reconcile a previously indexed event. If it is not stored yet, atomically
   queue targeted recovery and return HTTP `202` with `SYNCING`.

Examples:

```json
{ "success": true, "data": { "status": "CONFIRMED", "detected": true, "claim": { "status": "CONFIRMED", "txHash": "0x..." } } }
```

```json
{ "success": true, "data": { "status": "SYNCING", "detected": true, "claim": { "status": "PENDING", "txHash": null } } }
```

```json
{ "success": true, "data": { "status": "TRANSACTION_REQUIRED", "detected": false, "claim": { "status": "PENDING", "txHash": null } } }
```

The frontend must open MetaMask only for `TRANSACTION_REQUIRED`, not for `SYNCING` or
`PENDING_CONFIRMATION`.

## Idempotency and completion

- `UNIQUE(interestUid, claimSignatureUid)` ensures one row per logical submission.
- `UNIQUE(txHash, logIndex)` prevents one event from confirming multiple rows.
- Raw indexed events use `UNIQUE(chainId, txHash, logIndex)`.
- Receipt verification, global indexing, Retry, and recovery all update the existing row; none
  creates a second blockchain transaction.
- Once every required topic is confirmed, the application conditionally transitions
  `verifiedByIssuer` to `claimSubmitted` and writes one history event.

## Persistence

`investorClaimSubmission` stores expected claim fields, receipt metadata, `preparedAtBlock`,
`lastScannedBlock`, synchronization status/timestamps/attempts, and final confirmation state.
`investorClaimBlockchainEvent` is the durable raw-event ledger. `blockchainIndexerCheckpoint`
stores the global per-chain cursor and database lease.

Migrations: `20260909_investor_claim_submission.sql` through
`20260909_add_hybrid_claim_indexer.sql`.

See [CLAIM-INDEXER.md](./CLAIM-INDEXER.md) and
[CLAIM-RECOVERY-RUNNER.md](./CLAIM-RECOVERY-RUNNER.md) for worker behavior. Frontend teams should
follow [FRONTEND-INVESTOR-CLAIM-RETRY-GUIDE.md](./FRONTEND-INVESTOR-CLAIM-RETRY-GUIDE.md).
