# Frontend organization onboarding guide

This guide maps the T-REX Capital Market organization APIs to the four onboarding screens:

1. Company information
2. Jurisdiction
3. Ultimate beneficial owners
4. Documents and final submission

The flow is available only to a logged-in **Issuer**. One issuer account has one organization form.

## 1. Route and state model

Recommended frontend routes:

```text
/organization/company
/organization/jurisdiction
/organization/beneficial-owners
/organization/documents
/organization/status
```

Keep the full form in a shared store or query cache. The backend returns these step values:

```ts
type OrganizationStep =
  | 'companyInformation'
  | 'jurisdiction'
  | 'beneficialOwners'
  | 'documents'
  | 'completed';

type OrganizationStatus =
  | 'draft'
  | 'submitted'
  | 'resubmitted'
  | 'underReview'
  | 'approved'
  | 'rejected';
```

On page entry:

1. Confirm a JWT is available.
2. Confirm the JWT/user profile has `roleName === "Issuer"`.
3. Fetch `GET /organizations/me`.
4. If it returns `null`, start on Company Information.
5. Otherwise hydrate every section and route to `currentStep`.
6. If status is `submitted`, `resubmitted`, `underReview`, or `approved`, render the form read-only and show the status screen.

Do not trust the frontend role check as authorization; it is only a navigation guard. The backend independently validates JWT, permissions, and the Issuer role.

## 2. API client

Base URL:

```text
http://localhost:3000/api/v1
```

Configure it through the frontend environment, for example:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

Generic TypeScript client:

```ts
type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  timestamp: string;
  requestId: string;
};

type ApiFailure = {
  success: false;
  message: string;
  error: {
    code: string;
    details?:
      | Array<{ field?: string; message: string }>
      | Record<string, unknown>;
  };
  requestId: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json();
  if (!response.ok) throw payload as ApiFailure;
  return payload;
}
```

For `FormData`, never manually set `Content-Type`; the browser must generate the multipart boundary.

## 3. Load form options

Request once and cache:

```http
GET /organization-options
```

Response data:

```ts
type OrganizationOptions = {
  entityTypes: Array<{
    entityTypeUid: string;
    entityTypeCode: string;
    entityTypeName: string;
  }>;
  industries: Array<{
    industryUid: string;
    industryCode: string;
    industryName: string;
  }>;
  documentTypes: Array<{
    documentTypeUid: string;
    documentTypeCode: string;
    documentTypeName: string;
    description: string | null;
    isRequired: boolean | 0 | 1;
  }>;
};
```

Use UIDs as select values and names as labels. Convert database boolean values with `Boolean(value)` when needed.

## 4. Country, state, and city dropdowns

Endpoints:

```http
GET /locations/countries?page=1&limit=50&search=United
GET /locations/countries/{countryUid}/states?page=1&limit=50&search=California
GET /locations/states/{stateUid}/cities?page=1&limit=50&search=San
```

Recommended behavior:

- Debounce search by approximately 250–400 ms.
- Reset `stateUid` and `cityUid` whenever the country changes.
- Reset `cityUid` whenever the state changes.
- Disable the state input until a country is selected.
- Disable the city input until a state is selected.
- Use the country API independently for headquarters country, country of incorporation, and UBO nationality.
- Respect pagination if the dropdown supports infinite loading.

When restoring a draft, the organization response includes `countryName`, `stateName`, and `cityName`. Use those values as the initial selected labels, then load the matching state/city lists in parent-to-child order.

## 5. Load and hydrate an existing draft

```http
GET /organizations/me
Authorization: Bearer <JWT>
```

The response is `data: null` when onboarding has not started. Otherwise it contains the organization fields plus:

```ts
type OrganizationForm = {
  organizationUid: string;
  currentStep: OrganizationStep;
  isDraft: boolean | 0 | 1;
  status: OrganizationStatus;
  submittedAt: string | null;
  rejectionReason: string | null;
  rejectionCount: number;
  canResubmit: boolean | 0 | 1;
  beneficialOwners: BeneficialOwner[];
  documents: OrganizationDocument[];
  // Company and jurisdiction fields are also returned.
};
```

Treat the server response as the source of truth after every save. Replace the cached organization data with the returned record instead of manually guessing `currentStep`.

When the frontend has displayed/handled the organization notification, mark it once:

```ts
await apiRequest('/organizations/me/user-notified', {
  method: 'PATCH',
});
```

The endpoint is idempotent and returns the updated organization with `isUserNotified: true` (or `1` before boolean normalization).

## 6. Company information screen

Form shape:

```ts
type CompanyInformation = {
  legalCompanyName: string;
  entityTypeUid: string;
  registrationNumber: string;
  streetAddress: string;
  countryUid: string;
  stateUid: string;
  cityUid: string;
  postalCode: string;
};
```

Save endpoint:

```http
PUT /organizations/me/company-information
```

Save as draft:

```ts
await apiRequest('/organizations/me/company-information', {
  method: 'PUT',
  body: JSON.stringify({ ...values, isDraft: true }),
});
```

Continue:

```ts
await apiRequest('/organizations/me/company-information', {
  method: 'PUT',
  body: JSON.stringify({ ...values, isDraft: false }),
});
navigate('/organization/jurisdiction');
```

Draft saves permit partial values. Continue requires every company field and a valid country → state → city relationship.

## 7. Jurisdiction screen

```ts
type JurisdictionInformation = {
  countryOfIncorporationUid: string;
  dateOfIncorporation: string; // YYYY-MM-DD
  taxIdentificationNumber: string;
  industryUid: string;
  businessActivity: string;
  website: string;
};
```

```http
PUT /organizations/me/jurisdiction
Content-Type: application/json
```

Send `isDraft: true` for Save for Later and `isDraft: false` for Continue. On successful completion, navigate to `/organization/beneficial-owners`.

Frontend validation:

- The incorporation date must not be in the future.
- Website is optional; when entered, require `http://` or `https://`.
- Business activity can contain at most 5,000 characters.
- Tax identification number can contain letters, numbers, spaces, hyphens, periods, and slashes.

## 8. Beneficial-owner screen

```ts
type BeneficialOwner = {
  beneficialOwnerUid?: string;
  fullName: string;
  dateOfBirth: string;
  nationalityCountryUid: string;
  ownershipPercentage: number | null;
  isPrimary: boolean;
};
```

```http
PUT /organizations/me/beneficial-owners
Content-Type: application/json
```

Payload:

```json
{
  "owners": [
    {
      "fullName": "Jane Doe",
      "dateOfBirth": "1985-06-15",
      "nationalityCountryUid": "<countryUid>",
      "ownershipPercentage": 100,
      "isPrimary": true
    }
  ],
  "isDraft": false
}
```

UI rules:

- Support adding and removing rows, up to 20.
- Completed data needs at least one owner.
- Each completed owner must be at least 18 years old.
- Do not enforce a minimum ownership percentage per owner.
- Completed data must total exactly 100% across all owners.
- Draft data may total less than 100%, but must not exceed 100%.
- Only one owner can be marked primary.
- Display a live ownership total.

This endpoint replaces the current owner list atomically. Always submit the complete current array, not only the edited row.

## 9. Documents screen

Load the document checklist from `organization-options`. A type is required when `Boolean(documentType.isRequired)` is true.

Upload:

```ts
async function uploadDocuments(documentTypeUid: string, files: File[]) {
  const formData = new FormData();
  formData.append('documentTypeUid', documentTypeUid);
  files.forEach((file) => formData.append('documents', file));

  return apiRequest<OrganizationDocument[]>(
    '/organizations/me/documents',
    { method: 'POST', body: formData },
  );
}
```

Accepted files:

- PDF
- PNG
- JPG/JPEG
- Maximum 10 MB per file by default
- Maximum 10 files per request by default

The limits are backend environment settings, so also handle server-side `422` responses even after frontend pre-validation.

List:

```http
GET /organizations/me/documents
```

Delete before submission:

```http
DELETE /organizations/me/documents/{documentUid}
```

Download requires the JWT and returns a file rather than JSON:

```ts
async function downloadDocument(documentUid: string, fileName: string) {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(
    `${API_BASE_URL}/organizations/me/documents/${documentUid}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) throw await response.json();
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
```

Group returned documents by `documentTypeUid`. A required type is complete when at least one active document exists for that type.

## 10. Final submission

```http
POST /organizations/me/submit
Authorization: Bearer <JWT>
Content-Type: application/json
```

Pass the connected issuer wallet:

```ts
await apiRequest('/organizations/me/submit', {
  method: 'POST',
  body: JSON.stringify({ walletAddress }),
});
```

The address must be an EVM address matching `0x` plus 40 hexadecimal characters. Before enabling the button, check:

- A wallet is connected and its address is valid.
- Company section is complete.
- Jurisdiction section is complete.
- At least one valid UBO exists.
- Ownership does not exceed 100%.
- Every required document type has at least one upload.

The backend revalidates everything. On success:

```ts
{
  walletAddress: '0x1111111111111111111111111111111111111111',
  currentStep: 'completed',
  isDraft: false,
  status: 'submitted',
  submittedAt: '2026-07-24T...Z'
}
```

Clear stale editable form state, invalidate the organization query, and navigate to `/organization/status`. Submitted, under-review, and approved organizations are read-only.

### Rejection and one-time revision UI

Use the organization response to choose the rejection experience:

```ts
const canEditRejectedApplication =
  organization.status === 'rejected' &&
  Boolean(organization.canResubmit);

const mustContactSales =
  organization.status === 'rejected' &&
  !Boolean(organization.canResubmit) &&
  organization.rejectionCount >= 2;
```

For the first rejection:

- Display `rejectionReason` prominently.
- Show an **Edit application** action when `canResubmit` is true.
- Start at `currentStep` (`companyInformation` after rejection).
- All existing company, jurisdiction, UBO, and document endpoints remain available.
- While changes are saved, `status` stays `rejected` and `isDraft` becomes true until resubmission.
- Warn that only one revised submission is permitted.
- On successful resubmission, return to the read-only status screen.
- Confirm the returned status is `resubmitted`.

For the second rejection:

- Do not render editable form actions.
- Show `rejectionReason`.
- Display the Contact Sales popup when `mustContactSales` is true.
- Treat a backend `409` as the final authority even if cached frontend state is stale.

### Admin review UI

```text
GET   /admin/organizations?page=1&limit=20
GET   /admin/organizations/{organizationUid}
GET   /admin/organizations/{organizationUid}/documents/{documentUid}/file
PATCH /admin/organizations/{organizationUid}/status
```

Use the list for the review queue and the detail API for the complete application. Approval sends `{ "status": "approved" }`. Rejection sends `{ "status": "rejected", "rejectionReason": "..." }`; require 10–2,000 characters in the UI.

Preview or download an admin document using an authenticated blob request:

```ts
async function getAdminDocument(
  organizationUid: string,
  documentUid: string,
  mode: 'inline' | 'attachment' = 'inline',
) {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(
    `${API_BASE_URL}/admin/organizations/${organizationUid}` +
      `/documents/${documentUid}/file?disposition=${mode}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw await response.json();

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (mode === 'inline') window.open(objectUrl, '_blank', 'noopener,noreferrer');
  return objectUrl;
}
```

For download mode, attach the returned object URL to an `<a download>` element. Revoke it with `URL.revokeObjectURL` after preview/download is complete.

## 11. Error handling

Important status codes:

```text
400  Business validation failed or required submission data is missing
401  JWT missing, invalid, expired, or stale
403  User is not an Issuer or lacks the API permission
404  Referenced location, organization, or document was not found
409  Duplicate organization value, application is under review, or the one-time revision was already used
422  Body/query/file validation failed
```

Map validation details to fields:

```ts
function toFieldErrors(error: ApiFailure) {
  const details = Array.isArray(error.error.details)
    ? error.error.details
    : [];

  return Object.fromEntries(
    details
      .filter((item) => item.field)
      .map((item) => [
        item.field!.replace(/^body\./, ''),
        item.message,
      ]),
  );
}
```

For errors without field details, show `error.message` in a form-level alert. Log or display `requestId` in support/debug details.

If a save fails, remain on the current screen and preserve unsaved values. Do not advance based only on a button click.

## 12. Recommended frontend behavior

- Disable submit/navigation buttons while a request is running.
- Prevent double uploads and duplicate submissions.
- Show a dirty-form warning before leaving with unsaved changes.
- Use explicit Save as Draft/Save for Later buttons; optional autosave should be debounced and use `isDraft: true`.
- Show upload progress if the chosen HTTP client supports it.
- Make Back navigation local; only call the API when values changed.
- Never store selected location labels as identifiers—submit only UIDs.
- Re-fetch the form after mutations that affect multiple sections or after final submission.

## 13. Frontend testing checklist

1. Investor users cannot open organization onboarding.
2. A new issuer begins on Company Information.
3. Partial Company Information survives refresh after Save as Draft.
4. State and city reset when their parent selection changes.
5. Continue rejects incomplete fields and shows field errors.
6. Existing draft values and dropdown labels hydrate correctly.
7. UBO total and primary-owner constraints work.
8. Invalid file type and files over 10 MB are rejected.
9. Multiple files can be uploaded under one document type.
10. Required-document checklist updates after upload/delete.
11. Final submission remains blocked while required data is missing.
12. Successful submission opens a read-only status screen.
13. Expired JWT redirects to login without losing recoverable local form state.
