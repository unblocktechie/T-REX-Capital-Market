// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../platform/TREXPlatformController.sol";

/// @dev Stand-in for a future controller version: appends one state
/// variable and a reinitializer, the way a real upgrade should.
/// @custom:oz-upgrades-from TREXPlatformController
contract TREXPlatformControllerV2Mock is TREXPlatformController {
    uint256 public newFeatureValue;

    function initializeV2(uint256 value) external reinitializer(2) {
        newFeatureValue = value;
    }

    function version() external pure override returns (string memory) {
        return "2.0.0";
    }
}
