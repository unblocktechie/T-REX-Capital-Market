# Investor Marketplace — Local UI Flow

## Purpose
The investor marketplace is implemented as an API-ready frontend flow while the marketplace backend is still being added.

## Routes
- `/app/marketplace` — offering list, search, filters, sort and progressive loading.
- `/app/marketplace/:tokenId` — offering details and status-dependent actions.
- `/app/applications` — investor application tracking.

## Local data boundary
Marketplace components do not own the seed data directly. They call:

`src/services/investor/investorMarketplaceService.js`

That service currently delegates to:

`src/services/investor/investorMarketplaceLocalService.js`

The local service persists state changes in `localStorage`. When backend endpoints become available, replace individual methods in `investorMarketplaceService.js` without redesigning the pages.

## Status-driven detail page
The detail page renders its right-side action panel from one offering `status` value:

- `not_applied` → Submit Interest
- `action_required` → Submit Claims
- `pending_review` → View Application
- `approved` → investment amount + Invest action
- `verified_holder` → holding summary + Invest More / Send / Redeem actions

This keeps the frontend ready for backend status updates: the backend only needs to return the current status and related balance/application values.

## Local interactions
- Submit Interest changes the selected offering to `pending_review`.
- Submit Claims changes the selected offering to `pending_review`.
- Invest changes an `approved` offering to `verified_holder` and records a local holding.
- My Applications automatically reads every locally managed offering whose status is not `not_applied`.

## Verification popup
The local verification profile is intentionally separated from the token status. A token may require accreditation before interest can be submitted. This supports the "Complete Your Verification Profile" modal and can later be replaced with the real investor verification API response.

## Backend integration path
Recommended endpoint mapping when available:

1. `listOfferings()` → marketplace offering list API.
2. `getOffering(tokenId)` → offering details API.
3. `listApplications()` → current investor application API.
4. `getVerificationProfile()` → investor KYC/accreditation status API.
5. `submitInterest(tokenId)` → investment-interest API.
6. `submitClaims(tokenId)` → claims/eligibility submission API.
7. `invest(tokenId, amount)` → investment/order transaction flow.

Document links, registry explorer links, transfer, redemption and notification subscription currently show safe frontend placeholders and are intentionally isolated for later endpoint integration.
