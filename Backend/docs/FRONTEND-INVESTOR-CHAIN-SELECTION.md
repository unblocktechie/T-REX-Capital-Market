# Frontend integration: investor chain selection

## Backend contract

The backend is the source of truth for supported networks and contract addresses. Do not keep
chain-specific contract maps in `VITE_*` variables or frontend source code.

1. Load networks with `GET /api/v1/chains`.
2. When the user selects a network, load its public runtime configuration with
   `GET /api/v1/chains/{chainUid}/config`.
3. Store the selected `chainUid` in the authenticated application state.
4. Send this header on **every authenticated investor request** to `/api/v1/investors`,
   `/api/v1/investments`, and `/api/v1/investor/claims`:

   ```http
   X-Chain-Uid: 60000000-0000-4000-8000-000000000001
   ```

The backend resolves the header to an active `chainMaster` record. Missing, malformed,
inactive, or unknown chains are rejected. A token, subscription, invitation, transaction,
claim, transfer, purchase, or redemption from another network is not returned or mutated.

## Chain-switch behavior

When the connected wallet changes network:

1. Match the wallet `chainId` to a row returned by `GET /api/v1/chains`.
2. Update the selected `chainUid` atomically.
3. Clear all chain-scoped query caches.
4. Fetch `GET /api/v1/chains/{chainUid}/config` and `GET /api/v1/chains/me`.
5. Refetch marketplace, portfolio, interests, invitations, claims, transaction history,
   purchases, transfers, and redemptions using the new header.
6. Do not enable a write button until the wallet chain and selected backend chain match.

Queries should include `chainUid` in their cache key, for example:

```ts
['portfolio', selectedChainUid, filters]
['transactions', selectedChainUid, filters]
['marketplace', selectedChainUid, filters]
```

Configure the API client once:

```ts
api.interceptors.request.use((request) => {
  const session = authStore.getState();
  if (session.user?.roleName === 'Investor' && session.selectedChainUid) {
    request.headers['X-Chain-Uid'] = session.selectedChainUid;
  }
  return request;
});
```

Token image routes are authenticated and chain-scoped too. Fetch them through the configured
API client as a Blob and create an object URL; a plain `<img src="api-url">` cannot attach the
Authorization and `X-Chain-Uid` headers.

Do not send the header to choose a different chain than the connected wallet. For transaction
confirmation, `body.chainId` must equal the chain represented by `X-Chain-Uid`; otherwise the
backend returns `SELECTED_CHAIN_MISMATCH`.

## ONCHAINID state

`GET /api/v1/chains/me` is the per-user ONCHAINID matrix. Each chain reports `LOCKED`,
`CREATING`, `FAILED`, or `CREATED`.

- During first investor onboarding, submit the selected `chainUid` and the same
  `X-Chain-Uid` header. The backend creates/reuses ONCHAINID on that chain.
- To unlock another chain, call `POST /api/v1/chains/{chainUid}/unlock`.
- Refetch `/chains/me` after the operation and enable that network only when its state is
  `CREATED` and `isUnlocked` is true.
- `GET /api/v1/investors/me` now includes `selectedChainIdentity` for the header-selected chain.

Identity creation is backend-signed, but the signer no longer calls Identity Factory directly.
It calls that chain's `IDFactoryAccessManager`, which enforces access control and delegates to
the configured Identity Factory. A chain without `idFactoryAccessManagerAddress` cannot create
or unlock ONCHAINID and should be shown as temporarily unavailable.

## Error handling

| Code | Frontend action |
|---|---|
| `SELECTED_CHAIN_REQUIRED` | Ask the investor to select a network; retry with the header. |
| `INVALID_SELECTED_CHAIN` | Clear the stored selection and reload `/chains`. |
| `CHAIN_NOT_FOUND` | Selected chain is unavailable/inactive; choose another chain. |
| `SELECTED_CHAIN_MISMATCH` | Switch the wallet or selected network so both chain IDs match. |
| `RESOURCE_NOT_FOUND_ON_SELECTED_CHAIN` | Remove stale page state and navigate to the selected chain's list. |
| `CHAIN_IDENTITY_REQUIRED` | Offer the chain unlock action. |
| `CHAIN_IDENTITY_CREATION_FAILED` | Show the returned safe error and allow retry. |

## Global versus chain-scoped data

Account authentication and the investor's legal/KYC profile remain global. Blockchain
identity state and all token/investment activity are chain-specific. The frontend still sends
the selected-chain header to investor onboarding endpoints so one consistent request contract
is used across the authenticated investor application.
