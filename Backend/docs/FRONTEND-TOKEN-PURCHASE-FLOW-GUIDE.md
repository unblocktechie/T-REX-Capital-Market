# Frontend Token Purchase Flow

This guide describes the investor purchase screen, MetaMask interaction, confirmation call, and
token-specific history table. The backend response `data.status` is the settlement source of truth.
Do not infer blockchain state from an HTTP 200 response alone.

## Endpoints

```text
POST /api/v1/investments/tokens/:tokenUid/purchases
POST /api/v1/investments/purchases/:purchaseUid/confirm
GET  /api/v1/investments/tokens/:tokenUid/purchases?page=1&limit=20&search=&status=all
GET  /api/v1/investments/purchases/:purchaseUid
POST /api/v1/investments/purchases/:purchaseUid/retry
```

All calls require the investor JWT.

## Status meanings

| Status | Frontend meaning | Recommended display |
|---|---|---|
| `PENDING_PAYMENT` | Intent exists; MetaMask may not have returned a hash yet, or payment verification is pending | Pending payment |
| `PAYMENT_CONFIRMED` | USDT payment was verified; platform mint is queued/processing | Payment confirmed |
| `MINT_SUBMITTED` | Platform mint was broadcast and is awaiting final verification | Minting |
| `COMPLETED` | Payment and mint were independently verified | Completed |
| `EXPIRED` | No payment hash/event was received before the deadline | Expired |

HTTP 200 means the Confirm request was handled and the returned database state is valid. It does
not mean the purchase is completed. Completion is only `data.status === "COMPLETED"`.

## Page initialization

When the token purchase page opens, call:

```http
GET /api/v1/investments/tokens/{tokenUid}/purchases?page=1&limit=20&search=&status=all
```

Render `data` as the transaction table and use `meta` for pagination. The response is investor
scoped: another investor's purchases are never included. Suggested columns are date, token amount,
USDT amount, status, payment hash, mint hash, completed time, and expiration reason.

Supported history filters:

- `status`: `all`, `PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, `MINT_SUBMITTED`, `COMPLETED`, or
  `EXPIRED`.
- `search`: up to 100 characters. It searches purchase UID, idempotency key, payment/mint hashes,
  token/investor/treasury addresses, token amount, and USDT amount.

Reset `page` to `1` whenever search or status changes. Debounce search input by approximately
300–500 ms, cancel the previous request when possible, and send `status=all` to remove the filter.

For an expandable row or audit drawer, call:

```http
GET /api/v1/investments/purchases/{purchaseUid}
```

That endpoint includes `transactionHistory` with payment/mint attempts. Do not call the detail API
for every table row on initial load.

## Start purchase and MetaMask

1. Disable the Purchase button only while the create request or MetaMask prompt is actively open.
2. Generate a new idempotency key for a genuinely new checkout.
3. Call Create Purchase with the entered token amount.
4. Store the returned `purchaseUid`, authoritative USDT address, treasury address,
   `usdtAmountRaw`, and `expiration.expiresAt`.
5. Do not recompute the amount using JavaScript floating-point arithmetic.
6. Before opening MetaMask, verify the current time is before `expiration.expiresAt`.
7. Ask MetaMask to call USDT `transfer(treasuryWalletAddress, usdtAmountRaw)`.

```ts
const created = await api.post(
  `/api/v1/investments/tokens/${tokenUid}/purchases`,
  { tokenAmount, idempotencyKey },
);

const purchase = created.data.data;
if (purchase.status === 'EXPIRED') {
  // The same idempotency key referred to an old checkout. Generate a new key and create again.
  return;
}

const tx = await usdt.transfer(
  purchase.treasuryWalletAddress,
  BigInt(purchase.usdtAmountRaw),
);
```

The backend allows only one unsettled purchase per investor. Therefore, clicking Purchase again
while an earlier row is active may return that existing row instead of creating a duplicate. The
button can remain enabled, but the frontend must inspect the returned `purchaseUid` and status.

## When to call Confirm

Call Confirm only after MetaMask returns a real transaction hash:

```ts
const response = await api.post(
  `/api/v1/investments/purchases/${purchase.purchaseUid}/confirm`,
  { txHash: tx.hash },
);

const current = response.data.data;
switch (current.status) {
  case 'COMPLETED':
    showSuccess('Purchase completed');
    break;
  case 'PAYMENT_CONFIRMED':
  case 'MINT_SUBMITTED':
    showInfo('Payment received; token settlement is continuing');
    break;
  case 'PENDING_PAYMENT':
    showInfo('Payment verification is continuing');
    break;
  case 'EXPIRED':
    showWarning('This payment intent expired. Start a new purchase.');
    break;
}
```

Confirm returns HTTP 200 for every valid persisted lifecycle result above. Verification mismatches,
wrong/duplicate hashes, unauthorized access, and malformed requests still return their normal
4xx errors and must be shown as errors.

Do not call Confirm when MetaMask is rejected or closed before a transaction hash exists. Re-enable
the Purchase button, refresh history, and let the background runner expire the abandoned intent.
Never invent a hash or send an empty value.

## When to refresh history

Call the token history endpoint:

- when the page first opens;
- immediately after Create Purchase returns;
- after MetaMask is rejected/closed;
- after every Confirm response or Confirm error;
- after Retry returns;
- when the user manually refreshes the table;
- while a visible row is active, using controlled polling.

Preserve the current `search`, `status`, `page`, and `limit` values when polling so the table does
not unexpectedly change filters.

A 5–10 second polling interval is sufficient while the current page contains
`PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, or `MINT_SUBMITTED`. Stop polling when the page is hidden or
all visible rows are terminal (`COMPLETED` or `EXPIRED`). Avoid overlapping requests.

## Button lifecycle

Use a local UI flag such as `isPurchaseActionRunning`; do not permanently disable the button based
on an old table row.

```ts
setPurchaseActionRunning(true);
try {
  const purchase = await createPurchase();
  const hash = await openMetaMask(purchase);
  if (hash) await confirmPurchase(purchase.purchaseUid, hash);
} finally {
  setPurchaseActionRunning(false);
  await refreshPurchaseHistory();
}
```

This re-enables the button regardless of the returned lifecycle status. Backend idempotency and the
single-active-purchase rule remain the final duplicate protection.

## Abandoned and expired intents

Create Purchase returns `expiration.expiresAt`. If MetaMask is closed and no hash is submitted:

1. The row stays visible as `PENDING_PAYMENT` until its deadline and safety grace pass.
2. The backend first catches its global USDT indexer up after any outage.
3. If no matching payment hash/event exists, the runner marks it `EXPIRED`.
4. The history table shows `EXPIRED` and `expiration.reason = PAYMENT_NOT_SUBMITTED`.
5. A new purchase uses a new idempotency key.

Do not initiate a transfer after `expiresAt`. An expired Confirm returns HTTP 200 with
`data.status = "EXPIRED"`, but it does not attach or process the late hash.

## Recommended state model

Keep these concerns separate:

```text
isPurchaseActionRunning  -> controls button spinner/temporary disabling
purchaseHistory[]        -> renders durable backend rows
selectedPurchase         -> optional detail drawer
pollTimer                -> refreshes only while active rows are visible
```

Never remove an older row just because a new checkout begins. Refresh from the history endpoint and
let `purchaseUid` identify each row.
