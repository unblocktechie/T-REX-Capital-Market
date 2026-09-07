# Architecture Guide

## Dependency direction

UI pages depend on reusable components, hooks and feature API adapters. API adapters depend on the shared Axios transport. Infrastructure modules never import route-level pages. This keeps feature code replaceable and prevents circular dependencies.

```text
pages -> components/hooks -> api feature modules -> axios transport
  |            |                    |
  +---------- config/constants/services/store
```

## State ownership

| State                                | Owner                             | Examples                               |
| ------------------------------------ | --------------------------------- | -------------------------------------- |
| Remote/server data                   | TanStack Query                    | users, dashboard, paginated records    |
| Identity and client session metadata | Zustand auth store                | current user, role, permissions        |
| UI preferences                       | Zustand theme/UI stores           | theme, sidebar, request counter        |
| Form state                           | React Hook Form                   | fields, dirty state, validation errors |
| URL state                            | React Router/search params        | active route, reset token, email       |
| Refresh token                        | Browser cookie managed by backend | persistent secure session              |

## Adding a feature

1. Add endpoint constants and API functions under `src/api/<feature>`.
2. Add Zod schemas under the feature folder or `src/validations` when shared.
3. Create route-level screens under `src/pages/<feature>`.
4. Keep feature-only components beside the page; promote a component to `src/components` only after it is genuinely reused.
5. Add lazy routes and guards in `src/routes/router.jsx`.
6. Add navigation only when the current user permission allows it.
7. Use TanStack Query keys shaped as `[feature, resource, params]`.
8. Invalidate only related keys after mutations.

## API conventions

- Return normalized domain data from API modules; do not expose raw Axios responses to pages.
- Use `data.data ?? data` only at the transport edge.
- Pass `AbortSignal` to Axios for cancellable requests.
- Use query metadata `{ silent: true }` when a request has a local error treatment.
- Never redirect from random components after API errors; centralize session expiry in the interceptor.
- Do not retry validation, authorization or conflict errors.

## Access control

Route middleware prevents navigation to unauthorized screens. Navigation filtering removes unavailable choices. UI action checks can hide or disable protected actions. None of these replace backend authorization.

## Design system conventions

Use semantic variables (`--surface`, `--text`, `--danger-500`) rather than raw colors in components. New component styles should support both themes automatically. Use the existing radius, shadow, transition and breakpoint conventions.

## Accessibility baseline

- Native interactive elements first.
- Every icon-only control has an accessible name.
- Inputs connect errors through `aria-describedby`.
- Loading indicators expose a status label.
- Modal closes with Escape and locks document scrolling.
- Motion respects `prefers-reduced-motion`.
- Color is not the only state indicator; labels and icons remain visible.

## Production hardening checklist

- Configure HTTP-only refresh cookies and CSRF strategy.
- Add Content Security Policy without unsafe inline scripts.
- Add Sentry/OpenTelemetry and correlation IDs.
- Add OpenAPI-generated request/response typing.
- Add Vitest, Testing Library and Playwright.
- Add dependency and secret scanning in CI.
- Add bundle-size budgets and Lighthouse checks.
- Use a self-hosted font or system font stack.
- Define CDN cache headers and SPA fallback.
- Run authorization tests against every protected backend endpoint.
