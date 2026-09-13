# Arc Testnet migration

The frontend is configured for Arc Testnet only. Sepolia is no longer an accepted chain in the runtime environment schema.

## Network

| Setting | Value |
| --- | --- |
| Chain | Arc Testnet |
| Chain ID | `5042002` |
| HTTP RPC | `https://rpc.testnet.arc.network` |
| WebSocket RPC | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Native gas asset | USDC |
| Receipt confirmations used by the frontend | `1` |

Arc exposes native USDC with 18 internal decimals for native-balance accounting and a 6-decimal ERC-20 USDC interface at `0x3600000000000000000000000000000000000000`. The payment-token service reads ERC-20 metadata at runtime, while native wallet balance display uses the chain definition.

## T-REX contracts

```env
VITE_TREX_GATEWAY_ADDRESS=0x9b0077e6000C9937eE769A61519F9CdFc3f30331
VITE_TREX_PLATFORM_WALLET_ADDRESS=0x849F887daec1B14c161ec377C95549ef83dDf3ff
VITE_TREX_PLATFORM_CONTROLLER_ADDRESS=0x972E9CEf9eA9d3A9d7f3261bb8e16bA59E76a0FB
VITE_TREX_PAYMENT_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
VITE_ONCHAIN_ID_FACTORY_ADDRESS=0xA30A9FC6d6ea2Fa3fa3F01265a3C1253125481D8
VITE_COUNTRY_RESTRICT_MODULE_ADDRESS=0x7f3a67C7b520a0F01d7A3d98A5B7F2a3bfc7A54D
VITE_MAX_BALANCE_MODULE_ADDRESS=0x08B942c8aCFdB143F0096Cc4D80160221B589804
VITE_MAX_INVESTORS_MODULE_ADDRESS=0xa893BFEE2eCd38A61De91D74Ec15427dA6f7890f
```

## Coordinated backend requirements

Any backend service that validates transaction chain IDs, polls receipts, builds explorer links, or has a Sepolia allowlist must be changed to Arc Testnet (`5042002`) and an Arc RPC before production testing. Existing API payload field names are intentionally unchanged by the frontend migration to avoid breaking server contracts.

## Compatibility decisions

- Existing responsive CSS and page structure are unchanged.
- Legacy internal property names such as `usdtAmount` are retained when they are part of an API/data shape; only user-facing/default currency semantics are migrated to USDC.
- All on-chain addresses remain environment-overridable through `VITE_*` variables.
- Explorer URLs are derived from the configured chain instead of hardcoding a Sepolia explorer.

## Organization ONCHAINID migration and admin approval

> **Canonical Arc IdFactory:** `0xA30A9FC6d6ea2Fa3fa3F01265a3C1253125481D8`. This must be the same factory used when approved organization ONCHAINIDs are created on Arc. A previous Arc migration configuration referenced `0x667ce07e2C17CeB4089823B7d542494B6c2aA042`; that value must not be used for organization identity preflight or token deployment.

Organization approval on the previous Sepolia deployment was not only an off-chain status change: the approved organization wallet also needed an ONCHAINID on the active network. Arc Testnet must preserve that invariant.

The frontend now treats the organization identity as **chain-specific readiness**, not as a portable database string. Before a token-creation transaction can be opened in Privy it verifies all of the following against Arc Testnet (`chainId 5042002`):

1. the configured `VITE_ONCHAIN_ID_FACTORY_ADDRESS` contains contract bytecode;
2. `getIdentity(organizationWallet)` succeeds on that Arc factory;
3. the returned identity contains contract bytecode on Arc;
4. the approved organization wallet is a MANAGEMENT key on the identity (`keyHasPurpose(..., 1)`);
5. the backend's stored organization identity address matches the Arc factory result.

This intentionally prevents an old Sepolia `organizationIdentityAddress` / `contractAddress` from being accepted just because it is a valid EVM address.

### Required backend/admin behavior

The current frontend admin approval endpoint remains:

```text
PATCH /api/v1/admin/organizations/:organizationUid/status
{ "status": "approved" }
```

The backend that processes approval must ensure the ONCHAINID side effect targets **Arc Testnet**, not Sepolia. The secure sequence should be:

1. load the approved organization wallet;
2. connect to Arc Testnet (`5042002`);
3. query the Arc ONCHAINID factory for the wallet;
4. if no Arc identity exists, create it through the privileged ONCHAINID factory owner / approved ONCHAINID gateway used by the platform;
5. wait for the Arc transaction receipt and query the factory again;
6. persist the Arc identity address together with Arc network metadata in the organization record;
7. return the updated identity address from admin and issuer organization APIs.

Do **not** let the browser manufacture an ONCHAINID directly from an issuer session. ONCHAINID factory creation is normally access-controlled and the identity salt/deployment policy must remain server/platform controlled.

### Existing organizations approved on Sepolia

Already-approved organizations need a one-time backfill/migration. For every approved organization:

- read its approved wallet address;
- create or resolve its ONCHAINID on Arc Testnet using the platform's canonical Arc identity deployment policy;
- persist the Arc identity address in place of the old Sepolia technical identity reference;
- keep the old Sepolia value only in migration/audit history if it is still needed for traceability.

The Sepolia factory in the previous frontend was `0xe1da45b88C9d3f4347A6E1C6e8ee63e360068a15`, while Arc uses `0xA30A9FC6d6ea2Fa3fa3F01265a3C1253125481D8`. Because the factory address changed, the frontend does not assume that a Sepolia ONCHAINID contract address is automatically valid on Arc.

### Frontend behavior after this update

- Admin approval still saves the backend decision without introducing a second wallet transaction in the browser.
- For approved organizations, the admin review panel displays **Arc ONCHAINID: Ready on Arc** or **Setup required** based on live Arc reads.
- Token creation fails *before broadcast* with a migration-specific explanation if the Arc factory, identity mapping, identity contract, management key, or backend identity record is not ready.
- Raw `getIdentity reverted` errors are no longer presented as if token deployment itself failed.
- No existing issuer, investor, Privy, token, or responsive-layout behavior is changed by the identity readiness guard.
