# Frontend integration: issuer chain selection

## Required request contract

The backend is the source of truth for networks and contract addresses. The issuer frontend
must not keep chain-specific contract maps in `VITE_*` variables or application source.

1. Load active networks with `GET /api/v1/chains`.
2. Store the selected `chainUid` in authenticated application state.
3. Load the selected network's public contracts with
   `GET /api/v1/chains/{chainUid}/config`.
4. Send the selected chain on every authenticated issuer request:

   ```http
   X-Chain-Uid: 60000000-0000-4000-8000-000000000001
   ```

The header contains the backend `chainUid`, not the numeric EVM `chainId`. The backend resolves
it to an active `chainMaster` row and rejects a missing, malformed, inactive, or unknown chain.
Admin endpoints are not changed by this requirement.

Configure the shared API client once instead of adding the header in individual components:

```ts
api.interceptors.request.use((request) => {
  const session = authStore.getState();
  if (['Issuer', 'Investor'].includes(session.user?.roleName) && session.selectedChainUid) {
    request.headers['X-Chain-Uid'] = session.selectedChainUid;
  }
  return request;
});
```

## Routes affected for issuers

The selected-chain header is required on authenticated issuer calls under:

- `/api/v1/organizations`
- `/api/v1/tokens`
- `/api/v1/investments`
- `/api/v1/issuer/claims`

This includes token drafts and deployment attempts, token price updates, marketplace and
transaction history, issuer investment requests, claim signing, Identity Registry operations,
investor invitations, and redemption review/execution confirmation.

List endpoints return only rows for the selected chain. Detail and mutation endpoints verify
that the requested token or related record belongs to the selected chain. A UID copied from
another chain is rejected even if it belongs to the same issuer.

## Chain switch lifecycle

When the issuer changes network in the UI:

1. Match the connected wallet's numeric `chainId` to `GET /api/v1/chains`.
2. Update `selectedChainUid` atomically.
3. Cancel or ignore in-flight requests issued for the previous chain.
4. Clear every issuer chain-scoped query cache.
5. Fetch `/chains/{chainUid}/config` and `/chains/me`.
6. Refetch organization, token, deployment attempt, investment requests, investors,
   invitations, claims, registry operations, redemptions, and transaction history.
7. Keep write buttons disabled until the wallet chain matches the selected backend chain.

Always include `chainUid` in query-cache keys:

```ts
['issuer-token', selectedChainUid]
['issuer-interests', selectedChainUid, filters]
['issuer-investors', selectedChainUid, tokenUid, filters]
['issuer-redemptions', selectedChainUid, filters]
['issuer-transactions', selectedChainUid, filters]
```

Do not reuse detail state, selected rows, pagination, or pending mutations after a chain switch.
Navigate back to the appropriate selected-chain list when an open detail belongs to the old
network.

## Read and write rules

- `GET /organizations/me` remains the issuer's shared legal/KYB record and now also returns
  `selectedChainIdentity` for the selected network.
- Organization legal data and documents remain global, but submission uses the header-selected
  onboarding chain. If the request body also contains `chainUid`, it must match the header.
- `GET /tokens/me` returns the issuer token only when it belongs to the selected chain; otherwise
  it returns `null`.
- While a token is still a draft, saving `/tokens/me/information` on another selected chain may
  move that draft to the selected chain. After it leaves draft status, its chain is immutable.
- All later token wizard writes, price changes, image reads, deployment attempts, and deployment
  confirmation must use the token's chain.
- A deployment-attempt body `chainId` and transaction-confirmation body `chainId` must equal the
  numeric chain ID represented by `X-Chain-Uid`.
- The frontend must use contract addresses returned by
  `/chains/{chainUid}/config` and supported payment tokens returned for that chain. Never reuse
  an address loaded for the previous network.
- Image/download endpoints are authenticated and chain-scoped. Fetch them with the configured
  API client as a Blob so both Authorization and `X-Chain-Uid` are included.

## Issuer ONCHAINID state

Use `GET /api/v1/chains/me` as the per-chain identity matrix. A chain reports `LOCKED`,
`CREATING`, `FAILED`, or `CREATED`.

- The issuer's onboarding chain is created during organization approval.
- To enable another network, call `POST /api/v1/chains/{chainUid}/unlock` and then refetch
  `/chains/me`.
- Token creation on a network is allowed only when its identity state is `CREATED` and
  `isUnlocked` is true.
- Do not infer identity availability from the legacy organization `contractAddress`; use the
  selected-chain identity response.

## Errors to handle

| Code | Frontend action |
|---|---|
| `SELECTED_CHAIN_REQUIRED` | Require a network selection and retry with `X-Chain-Uid`. |
| `INVALID_SELECTED_CHAIN` | Clear the saved selection and reload `/chains`. |
| `CHAIN_NOT_FOUND` | Selected chain is inactive/unavailable; choose another active chain. |
| `SELECTED_CHAIN_MISMATCH` | Align the request body, connected wallet, and selected chain. |
| `RESOURCE_NOT_FOUND_ON_SELECTED_CHAIN` | Clear stale detail state and return to the selected-chain list. |
| `CHAIN_LOCKED` / `CHAIN_IDENTITY_REQUIRED` | Show the network unlock action. |
| `CHAIN_IDENTITY_CREATION_IN_PROGRESS` | Disable duplicate unlock attempts and poll/refetch `/chains/me`. |
| `CHAIN_IDENTITY_CREATION_FAILED` | Show the safe backend message and allow retry. |

## Frontend completion checklist

- Remove issuer-side chain/address environment maps.
- Persist one `selectedChainUid` per authenticated session.
- Add the header through the common API client for both Issuer and Investor roles.
- Add `selectedChainUid` to every chain-scoped cache key.
- Clear and refetch all issuer screens when the chain changes.
- Validate wallet `chainId` before enabling any blockchain write.
- Obtain runtime contracts and payment-token addresses only from backend APIs.
- Verify organization, token creation/deployment, investment review, claim signing, registry,
  redemption, invitations, and transaction-history screens on at least two configured chains.
