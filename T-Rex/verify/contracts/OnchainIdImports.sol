// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// Compile-only shim (never deployed, lives outside contracts/ so it never
// touches the main artifacts/ build). Pulls the @onchain-id/solidity
// contracts that scripts/phase0-01-deploy-platform.ts deploys straight from
// the npm package into a local compile (via hardhat.verify.config.ts), so
// scripts/verify-chain.ts has matching sources to submit to a block
// explorer. These three files are compiled with the optimizer disabled via
// hardhat.verify.config.ts's solidity.overrides, matching how
// @onchain-id/solidity itself was published (see its shipped
// artifacts/build-info) — keep that override in sync with this list.
// solhint-disable no-unused-import
import '@onchain-id/solidity/contracts/Identity.sol';
import '@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol';
import '@onchain-id/solidity/contracts/factory/IdFactory.sol';
