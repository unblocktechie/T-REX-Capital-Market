# Postman collection

Import `T-REX Capital Market Backend.postman_collection.json` into Postman.

1. Start the API and run `npm run seed:admin` once.
2. Update collection variables `baseUrl`, `adminEmail`, and `adminPassword` if they differ from `.env`.
3. Run **Authentication / Admin Login**. Its test script saves `adminToken` automatically.
4. Run CRUD requests in folder order: create, list, get, update, delete. Create responses automatically save each UID.
5. For the public signup flow, run **Signup (Issuer Example)**, copy the latest email token into `verificationToken`, and run **Verify Email**. It uses `POST`, verifies the email, creates a login session, and saves `userToken` automatically. Change `isIssuer` to `false` in the signup body to test Investor assignment. Do the same with `resetToken` for password reset.
6. **User Login** is optional after Verify Email and can be used to test password login separately. Then use **Organization Onboarding** in order. Reference requests automatically capture sample country/state/city and option UIDs. Select local PDF/PNG/JPG files in the upload request and repeat it for every required document type before final submission. The delete-document request is optional; re-upload the deleted required type before submitting.
7. Configure a funded Sepolia deployer and the OnchainID factory variables from `.env.example`. Use **Admin Organization Review** with `adminToken` to list pending submissions, load the complete application, preview/download its documents, and run either the approve or reject example (not both against the same application). Approval creates or reuses the wallet's OnchainID before changing status. The rejection example sets `rejectionReason`; after one issuer revision and resubmission, a second rejection returns `canResubmit: false`.
8. After organization approval, run **Token Creation** with `userToken`. Select a real token image in Step 1, then run claims, compliance, and governance. Deploy the TREX suite from the frontend wallet, paste its confirmed hash into `tokenDeployTxHash`, and run final submission. The backend verifies the configured factory event and returns `deployed`; invalid or failed receipts are stored as `deploymentFailed`.
9. For **Add to Registry**, use an issuer-owned `claimSubmitted` interest. Run Create or Resume Registry Registration, use only its returned parameters in MetaMask, paste the real Sepolia hash into `registryTxHash`, and run Confirm Registry Transaction. The create test captures `registryRegistrationUid`; `202` means keep polling and only `CONFIRMED` is complete.
10. For token purchases, run **List Token Purchase History** on page load and after Create/Confirm.
    Confirm returns HTTP `200` for every persisted lifecycle state; inspect `data.status` instead of
    treating HTTP 200 as proof of completion. Run **Get Investor Portfolio** after at least one
    purchase reaches `COMPLETED`; it returns one aggregated row per invested token.
11. For **Token Redemption**, create an intent as the investor, sign the returned
    `data.authorization.typedData` with the registered wallet, and paste it into
    `redemptionSignature`. Approve as issuer, wait for `TOKENS_LOCKED`, transfer the exact returned
    USDT raw amount, and set `redemptionPaymentTxHash`. If a response is missed, use detail/Retry;
    never send the payment a second time merely because the frontend lost the response.
12. For **Investor Invitations**, set `investmentTokenUid`, run **Issuer - List Completed Investors**
    with the issuer `userToken`, then run **Issuer - Invite Investor**. The test stores
    `invitationInvestorUid` and `investorInvitationUid`. Switch to `investorToken` for inbox,
    detail, and mark-viewed requests. Re-run the issuer invite to verify it returns HTTP `200` and
    does not send another email.
13. For **Token Transfer**, use an `investorToken` whose wallet owns the selected token and set
    `transferRecipientWalletAddress` to another completed investor registered for that token. Run
    Create, submit exactly `data.transactionRequest` through MetaMask, set `transferTxHash`, then
    run Confirm. Poll Detail/History while `data.status=PENDING_TRANSFER`; never submit a duplicate
    transaction just because the backend response was missed.
14. Apply `20260911_add_current_token_price.sql`, then run **Update Current Token Price** as the
    owning issuer. New purchase/redemption/transfer intents snapshot that price; old records are not
    repriced.

Revised issuer submissions return `status: resubmitted`; use `status=resubmitted` on the admin list endpoint to filter them.

Signup and managed-user emails, role names, menu codes, permission codes, API paths, and setting keys use timestamps so repeated runs do not collide with previous data.

The collection includes stable `issuerRoleUid` and `investorRoleUid` variables plus organization/location variables populated by request tests.
Registry testing also uses `registryRegistrationUid` (captured automatically) and `registryTxHash` (a real issuer-wallet `registerIdentity` transaction).
