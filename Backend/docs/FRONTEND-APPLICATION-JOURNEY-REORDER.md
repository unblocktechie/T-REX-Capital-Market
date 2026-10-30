# Investor application journey: issuer registers before investor submits claims

## Final flow

```text
Investor applies and provides documents
  -> Issuer reviews documents and verifies/signs all required claims
  -> Issuer wallet registers investor in the token Identity Registry
  -> Backend verifies the registry receipt/event
  -> Issuer work is finished
  -> Investor wallet submits the signed claims to the investor ONCHAINID
  -> Backend verifies every required claim
  -> Application completes -> Invest Now
```

No new endpoint, table, enum, migration, or contract change is required. Invest,
Send and Redemption execution remain unchanged. Existing application ownership,
selected-chain, identity, country, registry-agent and receipt/event checks remain.

## Headers

All calls below use the logged-in user's JWT and selected chain:

```http
Authorization: Bearer <user JWT>
X-Chain-Uid: <selected chain UID>
Content-Type: application/json
```

On a chain switch, discard stale forms/transaction parameters and refetch the
application. Never submit a transaction prepared for a different chain.

## Issuer: calls in order

1. Keep the existing application review and claim-signing UI. Send verified
   signatures using `POST /api/v1/issuer/claims/sign`:

   ```json
   {
     "subscriptionId": "<interestUid>",
     "claims": [{ "claimTopic": 1, "data": "0x...", "signature": "0x..." }]
   }
   ```

   The backend validates the signatures. Continue only when verification status
   is `SIGNED` for all token-required topics. The application is internally
   `verifiedByIssuer` but its issuer stage is still **Pending** until registration
   is confirmed. `GET /api/v1/issuer/claims/:subscriptionId` checks signing status.

2. Move registry registration into this issuer verification step. Call
   `POST /api/v1/investments/issuer/interests/:interestUid/registry-registration`
   with `{}`. Investor on-chain claim submission is no longer a prerequisite.
   Missing or incomplete issuer signatures return `409 ISSUER_CLAIMS_NOT_VERIFIED`.

3. Use the returned `registryOperationId`, `chainId`, `identityRegistryAddress`,
   `investorWalletAddress`, `onchainIdentityAddress` and numeric `country`.
   If the operation is already `CONFIRMED`, skip the wallet transaction.
   Otherwise the issuer wallet signs and sends the existing transaction:

   ```js
   const tx = await identityRegistry.registerIdentity(
     operation.investorWalletAddress,
     operation.onchainIdentityAddress,
     operation.country,
   );
   ```

   This is a real on-chain transaction and the issuer pays its gas. A signed
   claim message alone does not register the investor. Preserve existing wallet
   network/account checks. The backend never sends this transaction.

4. Save the hash immediately and call
   `POST /api/v1/investments/issuer/interests/:interestUid/registry-registration/:registryOperationId/confirm`
   with `{ "txHash": "0x..." }`. Only verified blockchain evidence changes the
   registry operation to `CONFIRMED`. A `202` means verification is pending.

5. Refresh via
   `GET /api/v1/investments/issuer/interests/:interestUid/registry-registration`
   and the existing application details/list APIs. Once both issuer verification
   and registration are confirmed, show **Issuer steps complete — awaiting
   investor claims**. Do not ask the issuer for another approval or registry
   transaction after investor submission.

## Investor: calls in order

1. Refresh `GET /api/v1/investments/me/interests` and
   `GET /api/v1/investor/claims?interestId=<interestUid>`.
2. While `canSubmitClaims=false`, show **Pending issuer verification/registration**.
   A Submit Claim section may remain visible, but its wallet action must be disabled.
   Do not treat the presence of issuer signatures as permission to submit yet.
3. Once `canSubmitClaims=true` and `claimsConfirmed=false`, enable **Submit Claim**.
   For each required claim, keep the existing flow:

   - `POST /api/v1/investor/claims/:claimId/prepare` with `{ "interestId": "..." }`.
   - Use the returned trusted identity/topic/data/signature parameters in the
     existing investor-wallet ONCHAINID claim transaction. The investor signs
     and pays gas. Do not replace this with an issuer transaction.
   - `POST /api/v1/investor/claims/:claimId/submit` with
     `{ "interestId": "...", "txHash": "0x..." }`.

4. Confirmed partial submission keeps the application incomplete. After the
   final required claim is confirmed, the backend moves it directly to
   `registered`, returns `canInvest=true` and `journeyStage=COMPLETED`.
   There is no final issuer step. Refresh application, portfolio and eligibility
   views, then show **Invest Now**, subject to current contract eligibility.

Calling prepare/submit before issuer verification and registry confirmation
returns `409 ISSUER_REGISTRATION_REQUIRED`. Show a waiting message and refresh;
do not keep opening wallet prompts.

## Progress fields and existing status compatibility

Progress fields are added to each investor/issuer application list row, issuer
application details, the investor claims-list response, registry operation
create/get/confirmed responses, and the claim-submit `application` object.

```json
{
  "issuerVerificationConfirmed": true,
  "registryRegistrationConfirmed": true,
  "claimsConfirmed": false,
  "canSubmitClaims": true,
  "canInvest": false,
  "journeyStage": "AWAITING_INVESTOR_CLAIMS"
}
```

| Issuer verified | Registry confirmed | Investor claims confirmed | Stage | Investor action |
|---|---|---|---|---|
| No | No | No | PENDING | Wait |
| Yes | No | No | PENDING | Wait |
| Yes | Yes | No | AWAITING_INVESTOR_CLAIMS | Submit Claim |
| Yes | Yes | Yes | COMPLETED | Invest Now |

The existing database/application status stays `verifiedByIssuer` while waiting
for registry confirmation **and** while awaiting investor claims. Do not display
it as Completed. Use the new flags/stage for UI decisions. `claimSubmitted`
remains accepted for older, claims-first applications; they complete when their
confirmed registry registration is reconciled. No historical records are deleted
or bulk-relabelled. Existing `registered` records remain intact.

`canInvest` describes completed application prerequisites, not a guarantee that
an investment will succeed. Contract checks such as balance, allowance, paused
state, eligibility and holding limits still apply.

## Timeline, outages and failures

- The existing `registered` timeline event records actual confirmed Identity
  Registry membership. It can now appear before investor claim submission;
  this event alone does not mean the whole application is complete.
- A final `claimSubmitted` event records completion after all prerequisites.
  History writes use locked/conditional transitions to avoid duplicate completion.
- Wallet rejection or a reverted transaction must not advance the application.
- Save operation IDs and hashes. After refresh, read existing operations rather
  than sending another transaction just because an HTTP response was lost.
- Registry reconciliation and claim indexing/recovery use the same completion
  rule. A periodic chain-scoped database reconciliation repairs interrupted
  finalization after confirmed records were already saved.
- This recovery requires the existing background runners to be enabled and their
  chain/RPC configuration to be healthy. Never mark a step confirmed in the UI
  based solely on a wallet popup closing or a submitted transaction hash.

## Frontend checks before release

Test blocked registration before issuer signatures; registry first then multiple
investor claims; wallet rejection; reverted transactions; refresh after either
transaction; backend outage after a successful transaction; duplicate confirmations;
chain switching; and a legacy claims-first application. Confirm no further issuer
action is shown after issuer registration is confirmed.
