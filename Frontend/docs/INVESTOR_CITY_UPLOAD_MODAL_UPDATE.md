# Investor City, Upload Validation, and Profile Confirmation Update

## Identity Details — City dropdown

- The Investor Identity Details flow continues to use the shared Country → State → City location master APIs used by Organization onboarding.
- The City dropdown no longer displays a `Loading cities...` placeholder.
- The City dropdown remains disabled until a state is selected and the city request has completed.
- If the city lookup fails or the selected state has no retrievable city options, the UI displays:
  - `While we're unable to retrieve the city from the selected state, you can continue to the next step.`
- In that fallback case, City does not block Identity Details completion. When city options are available, selecting a valid city remains required.
- An empty `cityUid` is omitted from the completed identity payload instead of sending an invalid empty UUID.

## Investor document upload validation

- Active identity and accreditation uploaders accept only PDF, JPG/JPEG, and PNG files, up to 10 MB.
- Validation checks the filename extension, browser MIME type when available, and the file signature before upload.
- Non-document formats such as DOC/DOCX/XLS/XLSX/TXT are rejected before the backend request.
- The legacy hidden upload zone uses the same stricter validation behavior.

## Create Investor Profile confirmation

- Updated the modal copy to the requested `Create Your Investor Profile` content.
- Wallet, balance, and network remain populated from the live connected wallet.
- The ownership confirmation checkbox remains required before submission.
- Existing loading, error, focus-trap, and responsive modal behavior is preserved.
