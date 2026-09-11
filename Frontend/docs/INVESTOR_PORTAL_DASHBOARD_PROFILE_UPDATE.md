# Investor Portal Dashboard and Profile Update

## Scope

This update changes only the signed-in Investor workspace. Issuer/admin behavior remains unchanged.

## Investor sidebar

After investor onboarding is unlocked, the Investor sidebar contains:

- Dashboard
- Market Place
- My Application
- Invitations
- Asset Management

The submitted Investor Profile remains available from the account/profile menu in the application header.

## Investor dashboard

The Investor dashboard now uses the authenticated investor profile and existing investment APIs and presents:

- Welcome/action header with Marketplace navigation
- Account Identity / ONCHAINID and linked-wallet summary
- Live application totals and recent application states
- Live invitation totals, unread invitation count, and recent invitations
- Registered-asset count derived from backend interest status
- Current deployed marketplace offering count and offering previews
- An action center derived from current invitation/application state
- Profile/document summary with navigation to the full profile

No fake investment records, portfolio balances, activities, counts, or fixed dashboard values are created.

## Investor profile

For Investor users, `/app/profile` now displays the submitted onboarding record rather than the generic editable account form. It includes all information shown on Review & Submit:

- Personal Information
- Identity Verification documents with secure preview
- Accredited Investor Status and accreditation documents
- Source of Wealth, Net Worth, Annual Investment Capacity
- Investment Experience Categories and Years of Experience
- Previous RWA Experience and description
- Profile Reference, ONCHAINID, primary wallet, connected network/balance when available, and creation time

Issuer users continue to receive the pre-existing generic profile page.

## Marketplace and My Application

The new routes are Investor-only. Because no offering/application backend API was supplied for this scope, both pages use honest empty states instead of fabricated investment data. They are ready for later API integration without affecting onboarding.
