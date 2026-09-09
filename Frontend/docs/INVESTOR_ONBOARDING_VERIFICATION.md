# Investor Onboarding Update Verification

## Changes verified

- Investor stepper uses the shared Organization/Token stepper markup and CSS classes.
- The visible stepper contains four onboarding stages; profile creation and request submission remain internal post-review flow states.
- Identity Documents continues directly to Compliance Questionnaire.
- Compliance Questionnaire returns to Identity Documents and continues to Review and Submit.
- Review edit actions point to the updated step numbers.
- Profile creation is step 5 and successful submission is step 6.
- Selfie Verification is no longer included in routing, readiness validation, review output, initial state, or active service behavior.
- All visible Save Draft and Save Changes controls were removed.
- The Development tools panel and its component were removed from the active module.
- Draft recovery is preserved through debounced automatic localStorage persistence.
- Legacy seven-step drafts are migrated to the six-step flow.
- Gender options use a compact card variant to remove the excess vertical space visible in the supplied screenshot.
- Responsive stepper columns are configured for four visible stages on desktop and mobile.

## Static checks completed

- Parsed all JavaScript and JSX source files using TypeScript's JSX parser.
- Resolved every relative and `@/` source import.
- Parsed `src/assets/styles/investor.css` without CSS parser errors.
- Confirmed no active investor page or component contains `Save Draft`, `Save Changes`, `Selfie Verification`, or `Development tools`.
- Confirmed the supplied package manifests were not changed.

## Environment limitation

A complete dependency installation and Vite production build could not be completed in this sandbox. The dependency installation did not finish within the available execution window, and the sandbox provides Node.js `22.16.0` while the project declares Node.js `>=22.22.1`.

Run the following in the normal project environment with Node.js 22.22.1 or later:

```bash
npm ci
npm run lint
npm run build
npm run dev
```

Then manually verify `/app/investors` at small-mobile, large-mobile, tablet, desktop, and large-desktop widths.
