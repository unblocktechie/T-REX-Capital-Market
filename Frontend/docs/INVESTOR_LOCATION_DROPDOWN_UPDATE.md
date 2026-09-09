# Investor Identity Location Dropdown Update

The Investor → Identity Details → Permanent Address section now uses the same location-master flow as Organization onboarding.

## Behavior

- Country of Residence is loaded from `GET /locations/countries` and stores `countryUid`.
- State / Province is a dropdown loaded from `GET /locations/countries/:countryUid/states` and stores `stateUid`.
- City is a dropdown loaded from `GET /locations/states/:stateUid/cities` and stores `cityUid`.
- Changing Country clears State and City.
- Changing State clears City.
- The dropdowns keep the existing shared `SelectField` behavior, including search, loading/disabled states, keyboard support, and responsive layout.
- Existing drafts that still contain location names are resolved back to location UIDs when a matching location-master option is available.
- Review & Submit resolves the stored UIDs to readable location names.

## Identity payload

Completed and draft identity saves send the location identifiers with the rest of the existing identity data:

```json
{
  "countryUid": "...",
  "stateUid": "...",
  "cityUid": "..."
}
```

The frontend continues to map backend validation errors for both the UID field names and the previous display-oriented field names back to the correct form controls.
