// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@erc3643org/erc-3643/contracts/compliance/modular/modules/AbstractModule.sol";
import "@erc3643org/erc-3643/contracts/compliance/modular/IModularCompliance.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Business-rule compliance module: caps the total number of distinct
 * non-zero-balance holders a token can have, configurable per token.
 *
 * Unlike MaxBalanceModule, this rule genuinely needs its own bookkeeping —
 * "how many distinct holders exist" isn't something the token contract
 * exposes directly. Holder status is synced from the token's actual
 * balanceOf() every time a transfer/mint/burn action hook fires (which
 * Token.sol calls AFTER the underlying balance change), so this module's
 * count can never drift from on-chain reality.
 */
contract MaxInvestorsModule is AbstractModule {
    /// compliance contract => max distinct holders (0 = unlimited)
    mapping(address => uint256) private _maxInvestors;
    /// compliance contract => current distinct holder count
    mapping(address => uint256) private _holderCount;
    /// compliance contract => wallet => currently holds a non-zero balance
    mapping(address => mapping(address => bool)) private _isHolder;

    event MaxInvestorsSet(address indexed _compliance, uint256 _max);

    /**
     * @dev Sets the holder-count cap for the calling compliance contract.
     * Reached via ModularCompliance.callModuleFunction(...) — the issuer-only
     * gate (onlyOwner) already happened at that call site, not in this module.
     */
    function setMaxInvestors(uint256 _max) external onlyComplianceCall {
        _maxInvestors[msg.sender] = _max;
        emit MaxInvestorsSet(msg.sender, _max);
    }

    function getMaxInvestors(address _compliance) external view returns (uint256) {
        return _maxInvestors[_compliance];
    }

    function getHolderCount(address _compliance) external view returns (uint256) {
        return _holderCount[_compliance];
    }

    /**
     * @dev Enforcement — only blocks a transfer/mint if the recipient would
     * become a BRAND NEW holder while already at the cap. Existing holders
     * receiving more tokens never count against the cap.
     */
    function moduleCheck(
        address /* _from */,
        address _to,
        uint256 /* _value */,
        address _compliance
    ) external view override returns (bool) {
        uint256 max = _maxInvestors[_compliance];
        if (max == 0) {
            return true;
        }
        if (_isHolder[_compliance][_to]) {
            return true;
        }
        return _holderCount[_compliance] < max;
    }

    function moduleTransferAction(address _from, address _to, uint256 /* _value */) external override onlyComplianceCall {
        _syncHolder(msg.sender, _from);
        _syncHolder(msg.sender, _to);
    }

    function moduleMintAction(address _to, uint256 /* _value */) external override onlyComplianceCall {
        _syncHolder(msg.sender, _to);
    }

    function moduleBurnAction(address _from, uint256 /* _value */) external override onlyComplianceCall {
        _syncHolder(msg.sender, _from);
    }

    /// @dev Re-reads the account's real balance and updates the holder count if its status flipped.
    function _syncHolder(address _compliance, address _account) private {
        address token = IModularCompliance(_compliance).getTokenBound();
        uint256 balance = IERC20(token).balanceOf(_account);
        bool wasHolder = _isHolder[_compliance][_account];
        bool isHolderNow = balance > 0;

        if (isHolderNow && !wasHolder) {
            _isHolder[_compliance][_account] = true;
            _holderCount[_compliance] += 1;
        } else if (!isHolderNow && wasHolder) {
            _isHolder[_compliance][_account] = false;
            _holderCount[_compliance] -= 1;
        }
    }

    function canComplianceBind(address /* _compliance */) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory _name) {
        return "MaxInvestorsModule";
    }
}
