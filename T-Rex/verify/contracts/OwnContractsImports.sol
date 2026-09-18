// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Compile-only shim (never deployed). Pulls this repo's own contracts into
// this same verify/ build (alongside Erc3643Imports.sol /
// OnchainIdImports.sol) so scripts/verify-chain.ts can verify everything in
// deployments/<network>.json through a single `hardhat.verify.config.ts`
// compile, without ever touching the main artifacts/ build.
// solhint-disable no-unused-import
import '../../contracts/platform/TREXPlatformController.sol';
import '../../contracts/modules/CountryRestrictModule.sol';
import '../../contracts/modules/MaxBalanceModule.sol';
import '../../contracts/modules/MaxInvestorsModule.sol';
