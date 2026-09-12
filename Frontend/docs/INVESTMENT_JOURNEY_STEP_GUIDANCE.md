# Investment Journey Step Guidance

This update adds role-aware step help to the shared Investment Journey tracker used by Investor and Issuer request detail views.

## What changed

- Added an info action to every journey step.
- Selecting the info action opens simple guidance for that step without changing navigation or request state.
- Guidance is written separately for Investor and Issuer views and explains:
  - What this step is
  - What the current user needs to do
  - How the step is completed
  - How the user knows it is complete
  - What happens next
- The "What you need to do" message also respects the live journey state:
  - Completed steps say no action is needed.
  - Upcoming steps say no action is needed yet.
  - Current steps tell the user to act only when the journey owner is `You`.
  - When the issuer, investor, or platform owns the current action, the viewer is explicitly told to wait.
- The guidance panel stacks into a single column on tablet/mobile and uses larger touch targets on phones.
- Accessibility support includes keyboard-focus states, `aria-expanded`, `aria-controls`, labels, and a dedicated close control.

## Small status clarity fix

When the journey is fully complete, Step 5 now also displays `Completed` instead of `Current step`. This removes the previous contradiction between "All 5 steps complete" and a final stage still appearing current.

## Scope

No API calls, backend status values, approval actions, routes, wallet behavior, or request-processing logic were changed. The update is limited to journey presentation/help text plus the final-step display-state correction above.
