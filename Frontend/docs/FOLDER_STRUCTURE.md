# Folder Structure

```text
src/
├── api/
│   ├── auth/                 # Auth endpoint adapter, service and mock
│   ├── axios/                # Axios instance, interceptors, cancellation
│   ├── dashboard/            # Dashboard server API
│   └── users/                # User server API
├── assets/
│   ├── fonts/
│   ├── icons/
│   ├── illustrations/
│   ├── images/
│   └── styles/global.css     # Semantic design tokens and component styles
├── components/
│   ├── auth/                 # Session restoration/bootstrap
│   ├── common/               # Error boundary
│   ├── forms/                # OTP and password strength
│   ├── loaders/              # Global concurrent-request loader
│   ├── pagination/
│   ├── tables/
│   └── ui/                   # Reusable primitives
├── config/                   # Environment, app, routes, permissions, flags
├── constants/                # Auth, HTTP, regex and storage constants
├── context/                  # Reserved for scoped React contexts
├── hooks/                    # Shared hooks
├── layouts/                  # Auth and authenticated application shells
├── lib/                      # Query client and third-party initialization
├── middleware/               # Guest/auth/role/permission route policies
├── pages/
│   ├── auth/
│   ├── dashboard/
│   ├── errors/
│   ├── profile/
│   ├── settings/
│   └── users/
├── routes/                   # Lazy route tree
├── services/                 # Token/infrastructure services
├── store/                    # Zustand client state
├── theme/                    # JS tokens for programmatic usage
├── types/                    # Reserved for JSDoc/TypeScript domain types
├── utils/                    # Formatting and generic utilities
├── validations/              # Shared Zod schemas
├── App.jsx
└── main.jsx
```
