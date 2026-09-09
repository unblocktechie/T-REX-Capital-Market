# Issuer Claim Signature Verification

The backend is the **source of truth** for verifying issuer signatures over the claim topics a
token requires. The frontend collects signatures claim-topic-wise and submits them; the backend
independently derives every trusted value and cryptographically verifies each signature.

In this codebase a **subscription** is a **token investment interest** (`tokenInvestmentInterest`),
so the API `subscriptionId` == our `interestUid`.

## Endpoints (issuer-only)

### `POST /api/v1/issuer/claims/sign`
Request — the frontend sends **only** the claim topic, data, and signature:
```json
{
  "subscriptionId": "ef90e8e6-3bb9-4754-8181-52868e8f2a56",
  "claims": [
    { "claimTopic": 1, "data": "0x4b59...", "signature": "0x1ad9...1c" },
    { "claimTopic": 2, "data": "0x4b59...", "signature": "0x951d...1b" }
  ]
}
```
It must **not** send `status`, `signedByWallet`, `verificationId`, `verifiedAt`, the issuer
wallet, the investor identity, the required topics, or any verification result — the schema
rejects unknown fields, and every trusted value is derived server-side.

Response:
```json
{
  "verificationId": "…", "subscriptionId": "…", "status": "VERIFICATION_FAILED",
  "attemptNumber": 1, "requiredClaimCount": 3, "verifiedClaimCount": 2, "completedAt": null,
  "claims": [
    { "claimTopic": 1, "status": "SIGNED", "signedByWallet": "0x…", "verificationError": null },
    { "claimTopic": 2, "status": "VERIFICATION_FAILED", "signedByWallet": "0x…", "verificationError": "Recovered signer does not match the registered issuer wallet." },
    { "claimTopic": 3, "status": "SIGNED", "signedByWallet": "0x…", "verificationError": null }
  ]
}
```
The frontend keeps collecting/submitting until `status === "SIGNED"`.

### `GET /api/v1/issuer/claims/:subscriptionId`
Returns the **latest** verification attempt (with its per-claim statuses), or an empty
`PENDING` shape (with `requiredClaimCount` from the token) before any submission.

## What the backend derives (never trusts from the client)

| Value | Source |
|---|---|
| Expected issuer wallet | authenticated issuer's `organizationMaster.walletAddress` |
| Investor identity address | the interest's investor `contractAddress` (OnchainID identity) |
| Required claim topics | the token's `tokenClaimTopic` → `claimTopicMaster.value` |
| Recovered signing wallet | `ecrecover` from the signature only |
| Verification status | computed from stored individual results |

Authorization: issuer role, the interest must belong to the issuer's organization, and the
subscription must be in a signable state (`submitIntrest`, or `verifiedByIssuer` for idempotent
re-signing).

**Subscription transition.** Signing advances the subscription to `verifiedByIssuer` **only when
the overall verification is `SIGNED`** (every required claim topic has a valid issuer signature).
On any `VERIFICATION_FAILED` / `PENDING` / `NETWORK_ERROR` result the interest status is left
unchanged (it stays `submitIntrest`) — a failed signing attempt never advances the subscription.
The issuer's separate `POST /api/v1/investments/issuer/interests/:interestUid/approve` action also
promotes to `verifiedByIssuer` and is likewise **gated on a `SIGNED` verification existing** (else
`409 ISSUER_CLAIMS_NOT_VERIFIED`). Each attempt is recorded (new `attemptNumber`) for audit.

## Cryptographic verification

`src/services/blockchain/claim-signature.service.js` — isolated so the digest lives in one place:
```
digest = keccak256( abi.encode(address identity, uint256 topic, bytes data) )
recovered = ethers.verifyMessage(getBytes(digest), signature)   // EIP-191 personal_sign
valid = recovered.toLowerCase() === expectedIssuerWallet.toLowerCase()
```
This is the canonical OnchainID / T-REX claim scheme and matches the sample payload shape (data
is bytes, topic is uint256, identity is an address). **It must match the frontend's
`buildClaimDigest` byte-for-byte** — if the frontend encodes differently (e.g. `encodePacked`,
or a different field order), change only `buildClaimDigest`.

## Status logic (the core rule)

`issuerClaimVerification.status` is the overall source of truth; `issuerClaimSignature.status`
is per claim topic. Both use `PENDING | VERIFICATION_FAILED | NETWORK_ERROR | SIGNED`.

Per claim: valid → `SIGNED`; invalid/mismatch/malformed → `VERIFICATION_FAILED`;
RPC/network issue → `NETWORK_ERROR` (reserved — the core path is pure local crypto).

Overall (derived from stored signatures):
1. `SIGNED` **only** when every required topic has a valid signature (`verifiedClaimCount === requiredClaimCount`).
2. else any `VERIFICATION_FAILED` → `VERIFICATION_FAILED`.
3. else any `NETWORK_ERROR` → `NETWORK_ERROR`.
4. else `PENDING` (partial, nothing failed).

The overall status is **never** `SIGNED` unless 100% of the required topics verify.

## Attempts, snapshot & idempotency

- Each submit that isn't already-completed creates a **new attempt** (`attemptNumber` increments)
  — previous attempts are preserved for a full audit trail. The required topics are snapshotted
  per attempt (`requiredClaimTopics`, `requiredClaimCount`) so historical records stay reproducible
  even if the token config changes later.
- Within an attempt, `UNIQUE(verificationUid, claimTopic)` + an upsert make repeated processing
  of the same topic idempotent (no duplicate signature rows).
- Once a subscription has a `SIGNED` verification, further submits return that verification
  without creating a new attempt.

## Data model (camelCase, no foreign keys)

- `issuerClaimVerification` — `verificationUid` PK, `interestUid` (subscription), `tokenUid`,
  `organizationUid`, `investorUid`, `status`, `requiredClaimCount`, `verifiedClaimCount`,
  `requiredClaimTopics`, `attemptNumber`, `completedAt`, timestamps.
  `UNIQUE(interestUid, attemptNumber)`.
- `issuerClaimSignature` — `signatureUid` PK, `verificationUid`, `interestUid`, `claimTopic`,
  `data`, `signature`, `signedByWallet`, `status`, `verificationError`, `verifiedAt`, timestamps.
  `UNIQUE(verificationUid, claimTopic)`.

Migration: `database/migrations/20260909_issuer_claim_verification.sql` (creates both tables +
issuer permissions). Idempotent.
