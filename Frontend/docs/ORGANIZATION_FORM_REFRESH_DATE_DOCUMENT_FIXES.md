# Organization form fixes

This update keeps the existing organization UI and backend integration while correcting the following behaviors:

- Rehydrates Company Information, Jurisdiction, and UBO forms after a direct page refresh.
- Preserves selected country, state, city, incorporation country, and nationality labels while API option lists load.
- Uses controlled custom select/date displays so React Hook Form resets are immediately reflected in the UI.
- Replaces the browser-styled month/year controls with responsive custom calendar menus.
- Allows month/year navigation without clearing an already selected date.
- Allows the Documentation step to continue after at least one successful upload.
- Restricts uploads to matching PDF, PNG, JPG, or JPEG extensions and MIME types, with a 10 MB limit.
- Keeps backend save calls inside valid React Hook Form submit handlers only; incomplete forms remain on the current step and do not call the save endpoint.
