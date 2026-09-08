// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@erc3643org/erc-3643/contracts/compliance/modular/modules/AbstractModule.sol";
import "@erc3643org/erc-3643/contracts/compliance/modular/IModularCompliance.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Business-rule compliance module: caps how many tokens a single wallet can
 * hold, configurable per token.
 *
 * Deploy ONCE at platform level, bind to many tokens via
 * ModularCompliance.addModule(...). Each issuer sets their own cap on the
 * same shared instance — storage is keyed by `_compliance` (msg.sender),
 * so Token A and Token B can have completely different caps.
 *
 * No separate balance bookkeeping is kept here — the check reads the
 * token's own balanceOf() live, so there's no risk of the module's internal
 * state drifting out of sync with actual holdings.
 */
contract MaxBalanceModule is AbstractModule {
    /// compliance contract => max balance per holder (0 = unlimited)
    mapping(address => uint256) private _maxBalance;

    event MaxBalanceSet(address indexed _compliance, uint256 _max);

    /**
     * @dev Sets the per-holder cap for the calling compliance contract.
     * Reached via ModularCompliance.callModuleFunction(...) — the issuer-only
     * gate (onlyOwner) already happened at that call site, not in this module.
     */
    function setMaxBalance(uint256 _max) external onlyComplianceCall {
        _maxBalance[msg.sender] = _max;
        emit MaxBalanceSet(msg.sender, _max);
    }

    function getMaxBalance(address _compliance) external view returns (uint256) {
        return _maxBalance[_compliance];
    }

    /**
     * @dev Enforcement — called on every transfer and every mint. Rejects if
     * the recipient's resulting balance would exceed the configured cap.
     */
    function moduleCheck(
        address /* _from */,
        address _to,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        uint256 max = _maxBalance[_compliance];
        if (max == 0) {
            return true;
        }
        address token = IModularCompliance(_compliance).getTokenBound();
        uint256 currentBalance = IERC20(token).balanceOf(_to);
        return (currentBalance + _value) <= max;
    }

    // --- Required IModule boilerplate — no state to update on these actions ---

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function canComplianceBind(address /* _compliance */) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory _name) {
        return "MaxBalanceModule";
    }
}
