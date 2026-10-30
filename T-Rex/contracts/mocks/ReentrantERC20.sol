// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IReentrancyTarget {
    function buy(address token, address paymentToken, uint256 amount) external;

    function redeem(address investor, address token, address paymentToken, uint256 amount) external;
}

/**
 * @dev Test-only payment token that tries to re-enter
 * TREXPlatformController.buy()/redeem() from inside its own transferFrom,
 * proving the controller's `nonReentrant` guard actually blocks it. Never
 * deployed live — real USDT has no such callback.
 */
contract ReentrantERC20 is ERC20 {
    address public attackTarget;
    address public attackToken;
    address public attackPaymentToken;
    address public attackInvestor;
    uint256 public attackAmount;
    bool public reenterOnBuy;
    bool public reenterOnRedeem;

    constructor() ERC20("Reentrant", "RENT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureBuyReentrancy(address target, address token, uint256 amount) external {
        attackTarget = target;
        attackToken = token;
        attackPaymentToken = address(this);
        attackAmount = amount;
        reenterOnBuy = true;
    }

    function configureRedeemReentrancy(address target, address investor, address token, uint256 amount) external {
        attackTarget = target;
        attackInvestor = investor;
        attackToken = token;
        attackPaymentToken = address(this);
        attackAmount = amount;
        reenterOnRedeem = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (reenterOnBuy) {
            reenterOnBuy = false;
            IReentrancyTarget(attackTarget).buy(attackToken, attackPaymentToken, attackAmount);
        }
        if (reenterOnRedeem) {
            reenterOnRedeem = false;
            IReentrancyTarget(attackTarget).redeem(attackInvestor, attackToken, attackPaymentToken, attackAmount);
        }
        return super.transferFrom(from, to, amount);
    }
}
