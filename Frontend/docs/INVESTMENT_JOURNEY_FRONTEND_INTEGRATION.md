# Investment Journey Frontend Integration

This frontend now uses the authenticated `/api/v1/investments/*` backend journey when `VITE_USE_MOCK_API=false`.

## Investor marketplace

- `GET /investments/tokens` — marketplace catalogue with server pagination, token status, and name/symbol search.
- `GET /investments/tokens/:tokenUid` — token details and required claim topics.
- `GET /investments/tokens/:tokenUid/image` — authenticated blob image fetch; browser object URLs are revoked after use.
- `GET /investments/tokens/:tokenUid/required-documents` — claim-topic eligibility, matching documents, and missing topics.
- `POST /investments/tokens/:tokenUid/interest` — submits optional investor note after server-side eligibility checks.
- `GET /investments/me/interests` — powers My Applications and marketplace request status.

Missing required claim topics route the investor to `/app/profile?token=<tokenUid>`. The profile loads the token-specific requirements and reuses the existing authenticated `POST /investors/me/documents` upload flow. Document type `claimTopicCode` values are preserved by the investor mapper.

## Issuer review

- `GET /investments/issuer/interests?status=...` — issuer subscription request list.
- `GET /investments/issuer/interests/:interestUid` — investor identity summary, all submitted documents, and claim-topic eligibility.
- `GET /investments/issuer/interests/:interestUid/documents/:documentUid/download` — protected blob download through the existing JWT Axios interceptor.

The provided backend documentation does not expose approval, rejection, request-more-info, or signing write endpoints. Those controls are deliberately disabled in the UI instead of writing local-only issuer decisions.

## Security choices

- All investment calls use the shared Axios client and existing Bearer JWT interceptor/RBAC backend routes.
- Route identifiers are URL encoded before request construction.
- Token images and issuer investor documents are fetched as authenticated blobs rather than opening backend URLs directly.
- Temporary browser object URLs are revoked.
- Server-side `422 INVESTOR_CLAIM_TOPIC_DOCUMENTS_MISSING` and duplicate `409` responses are handled without bypassing eligibility.
- Local marketplace/issuer mocks are used only when `VITE_USE_MOCK_API=true`.
- No backend storage key or private file path is persisted by the new investment integration.
