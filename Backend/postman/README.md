# Postman collection

Import `T-REX Capital Market Backend.postman_collection.json` into Postman.

1. Start the API and run `npm run seed:admin` once.
2. Update collection variables `baseUrl`, `adminEmail`, and `adminPassword` if they differ from `.env`.
3. Run **Authentication / Admin Login**. Its test script saves `adminToken` automatically.
4. Run CRUD requests in folder order: create, list, get, update, delete. Create responses automatically save each UID.
5. For the public signup flow, run **Signup (Issuer Example)**, copy the latest email token into `verificationToken`, and run Verify Email. Change `isIssuer` to `false` in the request body to test Investor assignment. Do the same with `resetToken` for password reset.
6. Run **User Login** for the verified issuer; it saves `userToken`. Then use **Organization Onboarding** in order. Reference requests automatically capture sample country/state/city and option UIDs. Select local PDF/PNG/JPG files in the upload request and repeat it for every required document type before final submission. The delete-document request is optional; re-upload the deleted required type before submitting.
7. Configure a funded Sepolia deployer and the OnchainID factory variables from `.env.example`. Use **Admin Organization Review** with `adminToken` to list pending submissions, load the complete application, preview/download its documents, and run either the approve or reject example (not both against the same application). Approval creates or reuses the wallet's OnchainID before changing status. The rejection example sets `rejectionReason`; after one issuer revision and resubmission, a second rejection returns `canResubmit: false`.
8. After organization approval, run **Token Creation** with `userToken`. Select a real token image in Step 1, then run claims, compliance, and governance. Deploy the TREX suite from the frontend wallet, paste its confirmed hash into `tokenDeployTxHash`, and run final submission. The backend verifies the configured factory event and returns `deployed`; invalid or failed receipts are stored as `deploymentFailed`.
9. For **Add to Registry**, use an issuer-owned `claimSubmitted` interest. Run Create or Resume Registry Registration, use only its returned parameters in MetaMask, paste the real Sepolia hash into `registryTxHash`, and run Confirm Registry Transaction. The create test captures `registryRegistrationUid`; `202` means keep polling and only `CONFIRMED` is complete.

Revised issuer submissions return `status: resubmitted`; use `status=resubmitted` on the admin list endpoint to filter them.

Signup and managed-user emails, role names, menu codes, permission codes, API paths, and setting keys use timestamps so repeated runs do not collide with previous data.

The collection includes stable `issuerRoleUid` and `investorRoleUid` variables plus organization/location variables populated by request tests.
Registry testing also uses `registryRegistrationUid` (captured automatically) and `registryTxHash` (a real issuer-wallet `registerIdentity` transaction).
