// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// Compile-only shim (never deployed, lives outside contracts/ so it never
// touches the main artifacts/ build). Pulls the @erc3643org/erc-3643
// contracts that scripts/phase0-01-deploy-platform.ts deploys straight from
// the npm package into a local compile (via hardhat.verify.config.ts), so
// scripts/verify-chain.ts has matching sources to submit to a block
// explorer. Keep this list in sync with that script's deployContract calls.
// solhint-disable no-unused-import
import '@erc3643org/erc-3643/contracts/registry/implementation/ClaimTopicsRegistry.sol';
import '@erc3643org/erc-3643/contracts/registry/implementation/TrustedIssuersRegistry.sol';
import '@erc3643org/erc-3643/contracts/registry/implementation/IdentityRegistryStorage.sol';
import '@erc3643org/erc-3643/contracts/registry/implementation/IdentityRegistry.sol';
import '@erc3643org/erc-3643/contracts/compliance/modular/ModularCompliance.sol';
import '@erc3643org/erc-3643/contracts/token/Token.sol';
import '@erc3643org/erc-3643/contracts/proxy/authority/TREXImplementationAuthority.sol';
import '@erc3643org/erc-3643/contracts/factory/TREXFactory.sol';
import '@erc3643org/erc-3643/contracts/factory/TREXGateway.sol';
