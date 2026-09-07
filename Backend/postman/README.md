# Postman collection

Import `T-REX Capital Market Backend.postman_collection.json` into Postman.

1. Start the API and run `npm run seed:admin` once.
2. Update collection variables `baseUrl`, `adminEmail`, and `adminPassword` if they differ from `.env`.
3. Run **Authentication / Admin Login**. Its test script saves `adminToken` automatically.
4. Run CRUD requests in folder order: create, list, get, update, delete. Create responses automatically save each UID.
5. For the public signup flow, run **Signup (Issuer Example)**, copy the latest email token into `verificationToken`, and run Verify Email. Change `isIssuer` to `false` in the request body to test Investor assignment. Do the same with `resetToken` for password reset.

Signup and managed-user emails, role names, menu codes, permission codes, API paths, and setting keys use timestamps so repeated runs do not collide with previous data.

The collection includes stable `issuerRoleUid` and `investorRoleUid` variables matching the database seed and migration.
