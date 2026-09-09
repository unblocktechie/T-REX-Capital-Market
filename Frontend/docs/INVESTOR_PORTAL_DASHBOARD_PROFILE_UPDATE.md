# Investor Portal Dashboard and Profile Update

## Scope

This update changes only the signed-in Investor workspace. Issuer/admin behavior remains unchanged.

## Investor sidebar

After investor onboarding is unlocked, the Investor sidebar contains:

- Dashboard
- Market Place
- My Application

The submitted Investor Profile remains available from the account/profile menu in the application header.

## Investor dashboard

The Investor dashboard now uses the authenticated investor profile API for identity/profile information and presents:

- Welcome/action header with Marketplace navigation
- Account Identity / ONCHAINID summary
- Linked primary wallet summary
- Recent profile activity derived from saved onboarding timestamps and documents
- My Investments empty state until investment data is available
- Profile/document summary with navigation to the full profile

No fake investment records are created.

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
