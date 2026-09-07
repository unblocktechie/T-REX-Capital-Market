# Organization state, review, and date picker fixes

## State synchronization

- Step save responses are merged with the existing organization cache instead of replacing unrelated sections with empty arrays or blank data.
- Company and jurisdiction updates preserve existing UBO and document records.
- UBO updates immediately retain the complete submitted owner array, including local relationship labels.
- After each successful step mutation, `GET /organizations/me` is fetched to hydrate the complete authoritative record.
- If the follow-up fetch is temporarily unavailable or returns an incomplete association list, the successfully saved local section data remains available until the next refresh.
- The Review page performs a full organization synchronization on entry.

## Review validation

- Company, jurisdiction, and UBO validations remain mandatory.
- At least one successfully uploaded organization document is required to enable submission.
- The frontend no longer requires every configured document type before enabling Review submission.

## Date picker

- The calendar renders through a document-level portal so it is not clipped or incorrectly positioned by cards, layout containers, or fixed headers.
- Desktop and tablet positioning automatically selects the available area above or below the field.
- Short landscape viewports use a constrained scrollable calendar surface.
- Mobile uses a viewport-safe bottom-positioned calendar.
- The calendar repositions on page scroll and viewport resize.
- Month and year dropdowns retain the existing custom design and remain usable without clearing the selected date.
