// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev Test-only stand-in for @erc3643org/erc-3643's Token contract. Mirrors
 * just the bits TREXPlatformController talks to — Ownable `owner()`,
 * AgentRole-style `isAgent`/`addAgent`/`onlyAgent`-gated `mint`/`burn` — so
 * the controller's own logic can be unit-tested without standing up a full
 * IdentityRegistry/ModularCompliance/ONCHAINID suite. Never deployed live.
 */
contract MockTRexToken is ERC20, Ownable {
    mapping(address => bool) private _agents;

    /// @dev Lets tests simulate T-REX-side rejections (paused, non-verified
    /// investor, compliance module reverting, etc.) without modelling them.
    bool public mintShouldRevert;
    bool public burnShouldRevert;

    modifier onlyAgent() {
        require(isAgent(msg.sender), "AgentRole: caller does not have the Agent role");
        _;
    }

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _mockDecimals = decimals_;
    }

    uint8 private _mockDecimals;

    function decimals() public view override returns (uint8) {
        return _mockDecimals;
    }

    function addAgent(address agent) external onlyOwner {
        _agents[agent] = true;
    }

    function removeAgent(address agent) external onlyOwner {
        _agents[agent] = false;
    }

    function isAgent(address agent) public view returns (bool) {
        return _agents[agent];
    }

    function setMintShouldRevert(bool value) external {
        mintShouldRevert = value;
    }

    function setBurnShouldRevert(bool value) external {
        burnShouldRevert = value;
    }

    function mint(address to, uint256 amount) external onlyAgent {
        require(!mintShouldRevert, "MockTRexToken: mint blocked (simulated compliance failure)");
        _mint(to, amount);
    }

    function burn(address account, uint256 amount) external onlyAgent {
        require(!burnShouldRevert, "MockTRexToken: burn blocked (simulated compliance failure)");
        _burn(account, amount);
    }
}
