# Sign-in Mainnet launch banner

The launch announcement banner is rendered by `AuthLayout` only when both conditions are true:

1. The current route is `/login`.
2. `VITE_ENABLE_MAINNET_LAUNCH_BANNER=true` for the active Vite build mode.

It is not rendered on Sign Up, Forgot Password, Verify Email, Reset Password, or authenticated application screens.

## Configuration

```env
VITE_ENABLE_MAINNET_LAUNCH_BANNER=true
VITE_MAINNET_LAUNCH_BANNER_MESSAGE=T-REX Capital Market is now live on Mainnet.
VITE_MAINNET_LAUNCH_BANNER_CTA=Read the announcement
VITE_MAINNET_LAUNCH_BANNER_URL=
```

Set `VITE_MAINNET_LAUNCH_BANNER_URL` to the public announcement URL. When configured, **Read the announcement** is rendered as a clickable, pointer-cursor link that opens in a new tab. If the URL is left empty, the CTA remains visible as non-clickable text.

To remove the banner later, change only:

```env
VITE_ENABLE_MAINNET_LAUNCH_BANNER=false
```

Then rebuild and deploy the frontend. No component or routing changes are required.

The mainnet/default profiles enable the banner. Testnet profiles disable it by default.


## Banner styling

The sign-in banner uses `#e7b066` as its background color. Its responsive font sizes are 14px by default and 15px from the `sm` breakpoint upward.
