# Wallet Management and USDC token icon UX

## What changed

- Added a reusable `TokenIcon` component with a dedicated USDC mark and safe text fallback for other token symbols.
- Updated the Privy wallet control in the application header and wallet details modal so the USDC balance has an immediate visual currency cue.
- Added a `Wallet Management` sidebar destination for both issuer and investor workspaces at `/app/wallet`.
- Added a responsive Wallet Management page that shows:
  - the active Privy secure account and network status;
  - known asset type count and assets with a detected balance;
  - the Arc native USDC balance;
  - T-REX investment token symbols, balances, contract references and contextual navigation;
  - token search, hide-zero filtering, copy actions and manual balance refresh.

## Balance sources

- Arc native USDC uses the existing shared `useWalletConnection` balance, so the header and wallet page stay consistent.
- T-REX token holdings use live ERC-20 `balanceOf` reads where contract details are available.
- Investor portfolio rows fall back to the backend portfolio balance only when a live read cannot be completed, and the UI labels that balance as `Recorded` rather than `Live`.
- The page explicitly describes its scope as T-REX-known assets rather than claiming to index every unrelated third-party token at the address.

## Responsiveness

The wallet overview, summary cards, filters and asset rows progressively collapse from desktop to tablet and mobile layouts. Primary balance information remains visible while secondary action labels collapse to icon controls on narrow screens.

## Arc network identity cue

- Added the Arc Testnet network SVG from `https://testnet.arcscan.app/assets/configs/network_icon.svg` as a reusable visual cue in wallet surfaces.
- The Arc mark appears beside the network state on Wallet Management, in the wallet details network card, beside Arc-native USDC context, and as a compact cue in the navbar wallet control.
- A lightweight network glyph fallback is kept in place if the remote SVG cannot load, so wallet information and actions remain fully usable.

## Balance network selector and Ethereum Sepolia assets

- Replaced the browser-native balance-network `<select>` with an application-styled, keyboard-dismissible network menu so Arc Testnet and Ethereum Sepolia remain visually consistent with the rest of the wallet workspace.
- The selector is read-only: choosing a balance network never switches the Privy wallet or changes the Arc Testnet network used by T-REX transaction flows.
- Ethereum Sepolia now reads both the wallet's native ETH balance and Circle's official Sepolia USDC ERC-20 balance (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).
- Optional balance-view ERC-20s live in `web3Config.walletViewTokenAssets`, keeping token discovery explicit and extensible without pretending standard EVM RPC can enumerate every token at an address.
- Sepolia USDC is read with the existing on-chain ERC-20 balance reader, including contract-authoritative decimals, and is shown with the shared USDC SVG mark.
