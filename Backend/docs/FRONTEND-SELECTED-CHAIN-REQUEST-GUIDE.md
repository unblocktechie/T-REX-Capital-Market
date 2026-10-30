# Frontend selected-chain request integration

## Purpose

Every authenticated Investor and Issuer request that enters a chain-sensitive backend router must
identify the network currently selected in the UI. Send the backend `chainUid` in this header:

```http
X-Chain-Uid: 60000000-0000-4000-8000-000000000001
```

`chainUid` is a UUID from `GET /api/v1/chains`. It is not the numeric EVM `chainId`.

Without this header, endpoints such as `GET /api/v1/investors/me` return:

```json
{
  "success": false,
  "message": "Select a blockchain network before using chain-specific APIs.",
  "error": { "code": "SELECTED_CHAIN_REQUIRED" }
}
```

## Required application bootstrap order

Do not load the Investor or Issuer dashboard immediately after login. Initialize the selected
network first:

```text
Login succeeds
    -> store access token and user
    -> GET /api/v1/chains
    -> restore a valid saved chain or choose the backend default chain
    -> store selected chainUid and chainId
    -> GET /api/v1/chains/{chainUid}/config
    -> enable authenticated profile/dashboard queries
```

Selection priority:

1. A previously saved `chainUid`, but only when it still exists in the active `/chains` response.
2. The row where `isDefault === true`.
3. The first active chain returned by the backend.

Do not call `/investors/me`, `/organizations/me`, `/tokens/me`, or `/investments/*` until
`selectedChainUid` is available.

Example bootstrap:

```ts
async function initializeAuthenticatedApplication(user: AuthUser) {
  const chains = await chainApi.list();
  const savedUid = localStorage.getItem(`selectedChainUid:${user.userUid}`);

  const selected = chains.find((chain) => chain.chainUid === savedUid)
    ?? chains.find((chain) => chain.isDefault)
    ?? chains[0];

  if (!selected) {
    throw new Error('No active blockchain network is available.');
  }

  chainStore.getState().setSelectedChain(selected);
  await chainApi.getConfiguration(selected.chainUid);
  appStore.getState().setChainBootstrapComplete(true);
}
```

## Shared HTTP client

Add the header centrally. Do not manually add it in individual pages.

```ts
api.interceptors.request.use((request) => {
  const { accessToken, user } = authStore.getState();
  const { selectedChainUid } = chainStore.getState();

  if (accessToken) {
    request.headers.Authorization = `Bearer ${accessToken}`;
  }

  if (
    selectedChainUid
    && (user?.roleName === 'Investor' || user?.roleName === 'Issuer')
  ) {
    request.headers['X-Chain-Uid'] = selectedChainUid;
  }

  return request;
});
```

The backend CORS policy already allows `X-Chain-Uid`.

It is safe for the shared client to attach the header to all authenticated requests. The header is
mandatory on chain-sensitive routers and ignored where it is not needed.

## APIs that establish chain state

These calls do not require the selected-chain header:

```http
POST /api/v1/auth/login
GET  /api/v1/chains
GET  /api/v1/chains/{chainUid}/config
GET  /api/v1/chains/{chainUid}/image
```

These authenticated calls use their path parameter rather than the selected-chain header:

```http
GET  /api/v1/chains/me
POST /api/v1/chains/{chainUid}/unlock
```

All authenticated Investor and Issuer calls under the following chain-sensitive routers require
the selected chain:

```text
/api/v1/investors
/api/v1/organizations
/api/v1/tokens
/api/v1/investments
/api/v1/investor/claims
/api/v1/issuer/claims
```

Admin APIs keep their existing explicit resource/query scoping and do not use the selected-chain
middleware.

## React Query or equivalent query gating

Include `selectedChainUid` in every chain-scoped cache key and keep the query disabled until chain
bootstrap completes:

```ts
const selectedChainUid = useChainStore((state) => state.selectedChainUid);
const chainReady = useAppStore((state) => state.chainBootstrapComplete);

useQuery({
  queryKey: ['investor-profile', selectedChainUid],
  queryFn: investorApi.getMe,
  enabled: Boolean(accessToken && selectedChainUid && chainReady),
});
```

Examples of correct keys:

```ts
['investor-profile', selectedChainUid]
['organization-profile', selectedChainUid]
['marketplace', selectedChainUid, filters]
['portfolio', selectedChainUid, filters]
['issuer-token', selectedChainUid]
['transactions', selectedChainUid, filters]
['redemptions', selectedChainUid, filters]
['claims', selectedChainUid, interestUid]
```

Never cache chain-specific responses using only a user or resource UID.

## Chain-switch sequence

When the user selects another network:

1. Disable chain-sensitive write buttons.
2. Cancel or ignore in-flight requests belonging to the previous chain.
3. Fetch `/chains/{newChainUid}/config`.
4. Switch or add the wallet network using the returned numeric `chainId` and public RPC data.
5. Set the new `selectedChainUid` only after its configuration is available.
6. Persist it using a user-specific key.
7. Clear or invalidate every chain-scoped query.
8. Refetch the current screen with the new header.
9. Re-enable writes only when the connected wallet `chainId` equals the selected configuration.

Example:

```ts
async function selectChain(chainUid: string) {
  uiStore.getState().setChainSwitching(true);
  try {
    const config = await chainApi.getConfiguration(chainUid);
    await walletService.switchOrAddNetwork(config);

    chainStore.getState().setSelectedChain({
      chainUid: config.chainUid,
      chainId: config.chainId,
      chainName: config.chainName,
    });

    const userUid = authStore.getState().user?.userUid;
    if (userUid) {
      localStorage.setItem(`selectedChainUid:${userUid}`, config.chainUid);
    }

    await queryClient.invalidateQueries({ predicate: isChainScopedQuery });
  } finally {
    uiStore.getState().setChainSwitching(false);
  }
}
```

Do not display cached detail records from the previous network after a switch.

## Read and write consistency

- Use `X-Chain-Uid` as the authoritative selected backend network.
- Use numeric `chainId` for the connected wallet and transaction bodies that require it.
- If a body also contains `chainUid`, it must match the header.
- If a transaction-confirm body contains `chainId`, it must match the chain represented by the
  header.
- Contract addresses, payment tokens, public RPC, and explorer URLs must come from
  `/chains/{chainUid}/config`.
- Do not retain a contract instance created for the previous chain.
- Never fall back to a hardcoded chain, contract, or payment-token address.

## Images and downloads

Authenticated chain-scoped image/document endpoints must be fetched through the shared API client
so both `Authorization` and `X-Chain-Uid` are sent:

```ts
const response = await api.get(url, { responseType: 'blob' });
const objectUrl = URL.createObjectURL(response.data);
```

A plain `<img src="protected-api-url">` request cannot attach these headers.

## Error handling

| Backend code | Frontend behavior |
|---|---|
| `SELECTED_CHAIN_REQUIRED` | Finish chain bootstrap, attach the header, and retry once. |
| `INVALID_SELECTED_CHAIN` | Clear the saved UID and reload `/chains`. |
| `CHAIN_NOT_FOUND` | Selected chain is inactive or removed; choose the current default. |
| `SELECTED_CHAIN_MISMATCH` | Align body `chainUid`/`chainId`, selected network, and wallet network. |
| `RESOURCE_NOT_FOUND_ON_SELECTED_CHAIN` | Clear stale detail state and return to the selected-chain list. |
| `CHAIN_IDENTITY_REQUIRED` / `CHAIN_LOCKED` | Show the chain-unlock action. |
| `CHAIN_IDENTITY_CREATION_IN_PROGRESS` | Disable duplicate unlock calls and refetch `/chains/me`. |
| `CHAIN_IDENTITY_CREATION_FAILED` | Show the safe backend message and allow an explicit retry. |

Do not retry `SELECTED_CHAIN_REQUIRED` repeatedly without first setting a valid header.

## Logout and user changes

On logout:

- clear selected-chain runtime configuration;
- remove chain-scoped cached data;
- disconnect chain-specific contract clients;
- keep or remove the user-specific saved selection according to product preference.

Never reuse one user's in-memory profile, portfolio, token, claim, or transaction cache for the next
logged-in user.

## Acceptance checklist

- Login succeeds without `X-Chain-Uid`.
- `/chains` loads before Investor/Issuer profile queries begin.
- `/investors/me` and `/organizations/me` contain the selected-chain header.
- Refreshing a protected page restores a valid chain before fetching page data.
- An invalid saved chain falls back to the active default chain.
- Every chain-scoped query key contains `selectedChainUid`.
- Switching chain clears previous-chain lists and details.
- Wallet writes remain disabled while the wallet network differs from the selected chain.
- Transaction confirmation sends both the header UUID and matching numeric `chainId`.
- Protected images/downloads use the configured HTTP client.
- No chain contract address is hardcoded in frontend source or `VITE_*` variables.
