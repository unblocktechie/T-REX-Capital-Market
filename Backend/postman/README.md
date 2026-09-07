# Postman collection

Import `T-REX Capital Market Backend.postman_collection.json` into Postman.

1. Start the API and run `npm run seed:admin` once.
2. Update collection variables `baseUrl`, `adminEmail`, and `adminPassword` if they differ from `.env`.
3. Run **Authentication / Admin Login**. Its test script saves `adminToken` automatically.
4. Run CRUD requests in folder order: create, list, get, update, delete. Create responses automatically save each UID.
5. For the public signup flow, run **Signup (Issuer Example)**, copy the latest email token into `verificationToken`, and run Verify Email. Change `isIssuer` to `false` in the request body to test Investor assignment. Do the same with `resetToken` for password reset.
6. Run **User Login** for the verified issuer; it saves `userToken`. Then use **Organization Onboarding** in order. Reference requests automatically capture sample country/state/city and option UIDs. Select local PDF/PNG/JPG files in the upload request and repeat it for every required document type before final submission. The delete-document request is optional; re-upload the deleted required type before submitting.

Signup and managed-user emails, role names, menu codes, permission codes, API paths, and setting keys use timestamps so repeated runs do not collide with previous data.

The collection includes stable `issuerRoleUid` and `investorRoleUid` variables plus organization/location variables populated by request tests.
