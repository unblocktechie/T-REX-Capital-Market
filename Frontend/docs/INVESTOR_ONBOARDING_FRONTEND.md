# Investor Onboarding Frontend Module

## Route

The `/app/investors` route opens the interactive investor onboarding module.

## Current Flow

1. Identity Details
2. Identity Documents
3. Compliance Questionnaire
4. Review and Submit
5. Create Investor Profile modal
6. Investment Request Submitted

The former Selfie Verification step has been removed from the flow.

## Stepper and Layout

- The investor flow now reuses the same horizontal stepper structure and visual classes used by the Organization and Token issuance flows.
- Desktop and tablet layouts show the full horizontal stepper.
- Mobile layouts use the shared compact progress summary, progress bar, and step markers.
- The stepper displays only the four editable onboarding stages and preserves backward navigation to previously reached steps. Profile creation and request submission continue to run after Review and Submit without appearing in the stepper.

## Architecture

- `src/pages/investors/` contains the step screens and flow orchestrator.
- `src/components/investor/` contains reusable choice cards, upload zone, wallet card, modal, review primitives, and investor stepper adapter.
- `src/context/InvestorOnboardingProvider.jsx` maintains cross-step state and automatic draft recovery.
- `src/validations/investor.schemas.js` contains Zod validation schemas.
- `src/services/investor/` contains isolated Promise-based mock services.
- `src/constants/investor.js` contains options, defaults, step definitions, flow version, and storage keys.
- `src/assets/styles/investor.css` contains responsive module styling and investor-specific overrides.

## Draft Storage

The flow automatically stores safe draft data in `trex.investor-onboarding-draft.v1`.

Only form values and file metadata are persisted. File contents and blob preview URLs are not stored in localStorage. The visible **Save Draft** and **Save Changes** controls have been removed, while draft recovery remains available through automatic persistence.

Existing seven-step drafts are migrated to the six-step flow when loaded:

- Old Identity Details and Identity Documents steps remain unchanged.
- The removed Selfie step resumes at Compliance Questionnaire.
- Later steps are shifted back by one position.

## Mock Services

The module provides separated mock services for:

- Automatic draft persistence
- Document upload progress and retry
- Wallet connection
- Investor profile creation
- Investment request submission

The service boundaries can later be replaced with backend or Web3 integrations without restructuring the UI.

## Removed Development UI

The development tools panel and its visible failure/reset options are no longer rendered in the investor flow.

## Security Disclosure

Encryption, identity verification, accreditation checks, ONCHAINID creation, blockchain registration, and issuer submission remain simulated UI behavior only. The module displays this limitation anywhere a security or compliance message could otherwise imply a production integration.
