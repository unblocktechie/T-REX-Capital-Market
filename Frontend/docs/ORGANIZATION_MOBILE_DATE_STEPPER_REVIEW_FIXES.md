# Organization mobile calendar, stepper, and Review navigation fixes

## Mobile date picker

- The date picker is rendered through `document.body`, so it no longer inherits the normal field dropdown's `min-width: 100%` rule.
- The calendar uses `window.visualViewport` when available and stays within mobile browser and device-emulation boundaries.
- Calendar width includes padding and borders through `box-sizing: border-box`.
- The picker chooses a safe position above, below, or centered in the visible viewport and repositions on scroll, resize, zoom, and visual viewport changes.
- Horizontal overflow is prevented while Month and Year controls remain usable.

## Responsive organization stepper

- Mobile and tablet layouts display all five steps in a fixed five-column progress row.
- Compact labels (`Company`, `Legal`, `UBO`, `Docs`, and `Review`) prevent clipping on narrow screens.
- Current, completed, visited, and unavailable steps have distinct states.
- Every reachable step remains visible and keyboard accessible without a horizontally clipped list.

## Direct return to Review

- The highest reached onboarding step is stored as UI navigation state per organization.
- Backend refreshes and earlier-step edits cannot reduce the locally reached step.
- A fully complete organization is treated as Review-ready even when a step-specific backend response reports an earlier `currentStep`.
- After editing Company Information, Jurisdiction, UBO Details, or Documentation, Step 5 can be selected directly without reopening Documentation and pressing Continue.
