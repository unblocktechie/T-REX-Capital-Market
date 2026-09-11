// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @dev Minimal surface of an @erc3643org/erc-3643 Token that this controller
 * needs. Deliberately not the full IToken — that interface drags in
 * IIdentityRegistry/IModularCompliance for events/functions we never call.
 * `mint`/`burn`/`isAgent` come from Token -> AgentRoleUpgradeable, `owner`
 * from Token -> OwnableUpgradeable, `decimals` from IERC20Metadata.
 */
interface ITREXToken is IERC20Metadata {
    function mint(address _to, uint256 _amount) external;

    function burn(address _userAddress, uint256 _amount) external;

    function owner() external view returns (address);

    function isAgent(address _agent) external view returns (bool);
}

/**
 * @title TREXPlatformController
 * @notice Platform-level Agent for T-REX (ERC-3643) tokens. Lets investors
 * buy and redeem tokens directly, without the backend ever touching a
 * per-token Agent private key.
 *
 * The issuer adds this contract as an Agent of their T-REX token
 * (`token.addAgent(platformController)`) once, after deployment. From then
 * on this controller can mint/burn on that token exactly like any other
 * agent, gated by the checks below.
 *
 * Stored configuration is intentionally limited to what cannot be read from
 * chain elsewhere:
 *
 *  - `paymentToken`   the single ERC-20 used to pay for every token (USDT).
 *  - `tokenPrice`     price per whole T-REX token, in payment-token
 *                      smallest units, set by that token's own issuer.
 *                      The platform takes no responsibility for pricing —
 *                      only the token's owner() can call setPrice.
 *
 * Everything else — issuer, decimals, agent status — is read live from the
 * T-REX token on every call, so there is no duplicated/stale copy of
 * on-chain token metadata here.
 *
 * Purchase flow:
 *
 *   investor approves USDT to this contract
 *          |
 *          v
 *   buy(token, tokenAmount)
 *          |
 *          v
 *   USDT.transferFrom(investor -> issuer)      (controller never custodies funds)
 *          |
 *          v
 *   token.mint(investor, tokenAmount)
 *
 * Redemption flow:
 *
 *   issuer approves USDT to this contract
 *          |
 *          v
 *   redeem(token, tokenAmount)
 *          |
 *          v
 *   token.burn(investor, tokenAmount)
 *          |
 *          v
 *   USDT.transferFrom(issuer -> investor)
 *
 * Both flows are a single atomic transaction — payment and mint/burn either
 * both happen or the whole call reverts.
 */
contract TREXPlatformController is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================
    //                           STATE
    // =============================================================

    /// @notice ERC-20 used to pay for/redeem every T-REX token on the
    /// platform. Owner-settable, in case USDT's address ever needs to
    /// change (e.g. migrating to a different stablecoin or deployment).
    IERC20 public paymentToken;

    /**
     * @notice Price of one whole T-REX token, in `paymentToken` smallest
     * units. Set ONLY by that token's own issuer (its on-chain owner()) —
     * the platform does not set or take responsibility for pricing.
     *
     * Example: USDT has 6 decimals, price = 10 USDT per token
     *          -> tokenPrice[token] = 10_000_000
     */
    mapping(address => uint256) public tokenPrice;

    // =============================================================
    //                            EVENTS
    // =============================================================

    event PaymentTokenUpdated(
        address indexed oldPaymentToken,
        address indexed newPaymentToken
    );

    event TokenPriceUpdated(
        address indexed token,
        uint256 oldPrice,
        uint256 newPrice
    );

    event TokensPurchased(
        address indexed investor,
        address indexed token,
        address indexed issuer,
        uint256 tokenAmount,
        uint256 paymentAmount,
        uint256 pricePerToken
    );

    event TokensRedeemed(
        address indexed investor,
        address indexed token,
        address indexed issuer,
        uint256 tokenAmount,
        uint256 paymentAmount,
        uint256 pricePerToken
    );

    // =============================================================
    //                            ERRORS
    // =============================================================

    error ZeroAddress();
    error InvalidToken();
    error InvalidPrice();
    error InvalidAmount();
    error NotTokenOwner(address token, address caller);
    error OnlyIssuerCanRedeem();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @param initialOwner Platform owner/admin wallet (backend service wallet).
     * @param paymentTokenAddress USDT (or equivalent) contract address.
     */
    constructor(address initialOwner, address paymentTokenAddress) {
        if (initialOwner == address(0) || paymentTokenAddress == address(0)) {
            revert ZeroAddress();
        }

        paymentToken = IERC20(paymentTokenAddress);

        // Ownable() already made the deployer the owner; only transfer if
        // the platform wallet deploying this isn't meant to stay in charge.
        if (initialOwner != owner()) {
            _transferOwnership(initialOwner);
        }
    }

    // =============================================================
    //                       ADMIN / CONFIGURATION
    // =============================================================

    /**
     * @notice Update the global payment token. Owner-only.
     */
    function setPaymentToken(address newPaymentToken) external onlyOwner {
        if (newPaymentToken == address(0)) {
            revert ZeroAddress();
        }

        address oldPaymentToken = address(paymentToken);
        paymentToken = IERC20(newPaymentToken);

        emit PaymentTokenUpdated(oldPaymentToken, newPaymentToken);
    }

    /**
     * @notice Set or update the price of a T-REX token. Callable ONLY by
     * that token's own issuer (its T-REX `owner()`) — never by the
     * platform. Pricing is entirely the issuer's decision and liability;
     * the platform takes no responsibility for it.
     *
     * @param token T-REX token address.
     * @param newPrice Price of one whole token, in payment-token smallest
     * units. Must be non-zero — use a dedicated pause if sales need to stop.
     */
    function setPrice(address token, uint256 newPrice) external {
        _requireContract(token);

        if (newPrice == 0) {
            revert InvalidPrice();
        }

        // Confirm this is actually an ERC-20-shaped contract before
        // recording a price for it.
        try IERC20Metadata(token).decimals() returns (uint8) {
            // valid
        } catch {
            revert InvalidToken();
        }

        address issuer = ITREXToken(token).owner();
        if (msg.sender != issuer) {
            revert NotTokenOwner(token, msg.sender);
        }

        uint256 oldPrice = tokenPrice[token];
        tokenPrice[token] = newPrice;

        emit TokenPriceUpdated(token, oldPrice, newPrice);
    }

    /// @notice Emergency stop for buy/redeem. Admin functions stay available.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // =============================================================
    //                           BUY
    // =============================================================

    /**
     * @notice Buy T-REX tokens with the platform payment token. Investor
     * must approve this contract to spend `paymentToken` first.
     *
     * @param token T-REX token address.
     * @param tokenAmount Amount of T-REX tokens to buy, in smallest units.
     */
    function buy(
        address token,
        uint256 tokenAmount
    ) external nonReentrant whenNotPaused {
        (address issuer, uint256 price, uint256 paymentAmount) = _quote(
            token,
            tokenAmount
        );

        // USDT goes straight from investor to issuer — this controller
        // never custodies purchase funds.
        paymentToken.safeTransferFrom(msg.sender, issuer, paymentAmount);

        // Requires this controller to be an Agent of `token`. T-REX itself
        // still runs its own identity/compliance checks on the mint.
        ITREXToken(token).mint(msg.sender, tokenAmount);

        emit TokensPurchased(
            msg.sender,
            token,
            issuer,
            tokenAmount,
            paymentAmount,
            price
        );
    }

    // =============================================================
    //                          REDEEM
    // =============================================================

    /**
     * @notice Redeem T-REX tokens for the payment token. The issuer must
     * approve this contract to spend `paymentToken` on their behalf first.
     *
     * @param token T-REX token address.
     * @param tokenAmount Amount of T-REX tokens to redeem, in smallest units.
     */
    function redeem(
        address investor,
        address token,
        uint256 tokenAmount
    ) external nonReentrant whenNotPaused {
        (address issuer, uint256 price, uint256 paymentAmount) = _quote(
            token,
            tokenAmount
        );
        if (msg.sender != issuer) {
            revert OnlyIssuerCanRedeem();
        }

        // Burn investor's tokens.
        // Controller must have the required Agent permission.
        ITREXToken(token).burn(investor, tokenAmount);
        // Transfer USDT directly from issuer to investor.
        paymentToken.safeTransferFrom(msg.sender, investor, paymentAmount);
        emit TokensRedeemed(
            investor,
            token,
            msg.sender,
            tokenAmount,
            paymentAmount,
            price
        );
    }

    // =============================================================
    //                       VIEW HELPERS
    // =============================================================

    /// @notice Quote what `buy(token, tokenAmount)` would currently cost.
    function quoteBuy(
        address token,
        uint256 tokenAmount
    )
        external
        view
        returns (
            uint256 paymentAmount,
            uint256 price,
            uint8 tokenDecimals,
            address issuer
        )
    {
        (issuer, price, paymentAmount) = _quote(token, tokenAmount);
        tokenDecimals = ITREXToken(token).decimals();
    }

    /// @notice Quote what `redeem(token, tokenAmount)` would currently pay out.
    /// Same pricing formula as `quoteBuy` — kept separate to mirror buy/redeem.
    function quoteRedeem(
        address token,
        uint256 tokenAmount
    )
        external
        view
        returns (
            uint256 paymentAmount,
            uint256 price,
            uint8 tokenDecimals,
            address issuer
        )
    {
        (issuer, price, paymentAmount) = _quote(token, tokenAmount);
        tokenDecimals = ITREXToken(token).decimals();
    }

    /// @notice Read-only snapshot of what buy/redeem would use for `token`.
    function getTokenInfo(
        address token
    )
        external
        view
        returns (
            address issuer,
            uint8 tokenDecimals,
            uint256 price,
            bool controllerIsAgent
        )
    {
        _requireContract(token);

        issuer = ITREXToken(token).owner();
        tokenDecimals = ITREXToken(token).decimals();
        price = tokenPrice[token];
        controllerIsAgent = ITREXToken(token).isAgent(address(this));
    }

    // =============================================================
    //                       INTERNAL LOGIC
    // =============================================================

    /// @dev Reverts unless `token` is a non-zero address with contract code.
    function _requireContract(address token) internal view {
        if (token == address(0)) {
            revert ZeroAddress();
        }

        if (token.code.length == 0) {
            revert InvalidToken();
        }
    }

    /**
     * @dev Shared pricing logic for buy/redeem/quoteBuy/quoteRedeem. Reads
     * price, decimals and issuer, and computes the payment amount:
     *
     *   paymentAmount = tokenAmount * price / 10^tokenDecimals
     *
     * Example: decimals = 18, tokenAmount = 1e18, price = 10e6 (USDT)
     *          -> paymentAmount = 10e6 (10 USDT)
     */
    function _quote(
        address token,
        uint256 tokenAmount
    )
        internal
        view
        returns (address issuer, uint256 price, uint256 paymentAmount)
    {
        _requireContract(token);

        if (tokenAmount == 0) {
            revert InvalidAmount();
        }

        price = tokenPrice[token];
        if (price == 0) {
            revert InvalidPrice();
        }

        // Reverts naturally if `token` isn't ERC20/T-REX shaped.
        uint8 tokenDecimals = ITREXToken(token).decimals();
        issuer = ITREXToken(token).owner();

        if (issuer == address(0)) {
            revert ZeroAddress();
        }

        paymentAmount = Math.mulDiv(
            tokenAmount,
            price,
            10 ** uint256(tokenDecimals)
        );

        if (paymentAmount == 0) {
            revert InvalidAmount();
        }
    }
}
