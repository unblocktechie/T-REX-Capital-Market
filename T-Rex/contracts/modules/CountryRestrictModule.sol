// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@erc3643org/erc-3643/contracts/compliance/modular/modules/AbstractModule.sol";
import "@erc3643org/erc-3643/contracts/compliance/modular/IModularCompliance.sol";
import "@erc3643org/erc-3643/contracts/token/IToken.sol";
import "@erc3643org/erc-3643/contracts/registry/interface/IIdentityRegistry.sol";

/**
 * Business-rule compliance module: blocks transfers and mints to any investor
 * whose registered country is on a per-token restricted list.
 *
 * Deploy this ONCE at platform level, then each issuer's token binds to the
 * same shared instance via ModularCompliance.addModule(...) at deploy time
 * (tokenDetails.complianceModules) — restricted-country lists are tracked
 * per `_compliance` address internally (see _restrictedCountries), so every
 * issuer configures their own list independently on the one shared contract.
 */
contract CountryRestrictModule is AbstractModule {
    /// compliance contract => country code (ISO 3166-1 numeric) => is restricted
    mapping(address => mapping(uint16 => bool)) private _restrictedCountries;

    event CountryRestricted(address indexed _compliance, uint16 _country);
    event CountryUnrestricted(address indexed _compliance, uint16 _country);

    /**
     * @dev Restricts one country for the calling compliance contract.
     * Reached via ModularCompliance.callModuleFunction(...), so msg.sender
     * here is the ModularCompliance contract itself — the issuer-only gate
     * (onlyOwner) already happened at that call site, not in this module.
     */
    function addCountryRestriction(uint16 _country) external onlyComplianceCall {
        _restrictedCountries[msg.sender][_country] = true;
        emit CountryRestricted(msg.sender, _country);
    }

    function removeCountryRestriction(uint16 _country) external onlyComplianceCall {
        _restrictedCountries[msg.sender][_country] = false;
        emit CountryUnrestricted(msg.sender, _country);
    }

    function batchRestrictCountries(uint16[] calldata _countries) external onlyComplianceCall {
        for (uint256 i = 0; i < _countries.length; i++) {
            _restrictedCountries[msg.sender][_countries[i]] = true;
            emit CountryRestricted(msg.sender, _countries[i]);
        }
    }

    function isCountryRestricted(address _compliance, uint16 _country) external view returns (bool) {
        return _restrictedCountries[_compliance][_country];
    }

    /**
     * @dev The actual enforcement — called by ModularCompliance.canTransfer,
     * which runs on every transfer AND every mint (Token.mint calls
     * canTransfer(address(0), _to, _amount) before minting). Only the
     * recipient's country is checked: this rule restricts who can RECEIVE
     * tokens in a given jurisdiction, not who can send them.
     */
    function moduleCheck(
        address /* _from */,
        address _to,
        uint256 /* _value */,
        address _compliance
    ) external view override returns (bool) {
        address token = IModularCompliance(_compliance).getTokenBound();
        IIdentityRegistry ir = IToken(token).identityRegistry();
        uint16 country = ir.investorCountry(_to);
        return !_restrictedCountries[_compliance][country];
    }

    // --- Required IModule boilerplate — this rule needs no state updates on these actions ---

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
        return "CountryRestrictModule";
    }
}
