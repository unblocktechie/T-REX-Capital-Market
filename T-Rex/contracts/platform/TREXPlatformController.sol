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
 *  - `isPaymentToken` the whitelist of ERC-20s accepted as payment (USDT,
 *                      USDC, ...). Owner-managed via `addPaymentToken` /
 *                      `removePaymentToken` so new stablecoins can be turned
 *                      on post-deployment, from the deployer/owner wallet,
 *                      with no need to redeploy this controller or re-wire
 *                      any already-onboarded T-REX token.
 *  - `tokenPrice`     price per whole T-REX token, expressed in a fixed
 *                      `PRICE_DECIMALS`-precision unit (independent of any
 *                      one payment token's own decimals), set by that
 *                      token's own issuer. The platform takes no
 *                      responsibility for pricing — only the token's
 *                      owner() can call setPrice. At buy/redeem time the
 *                      price is converted into whichever whitelisted
 *                      payment token the caller picked, scaling for that
 *                      token's own decimals.
 *
 * Everything else — issuer, decimals, agent status — is read live from the
 * T-REX token on every call, so there is no duplicated/stale copy of
 * on-chain token metadata here.
 *
 * Purchase flow:
 *
 *   investor approves a whitelisted payment token to this contract
 *          |
 *          v
 *   buy(token, paymentToken, tokenAmount)
 *          |
 *          v
 *   paymentToken.transferFrom(investor -> issuer) (controller never custodies funds)
 *          |
 *          v
 *   token.mint(investor, tokenAmount)
 *
 * Redemption flow:
 *
 *   issuer approves a whitelisted payment token to this contract
 *          |
 *          v
 *   redeem(investor, token, paymentToken, tokenAmount)
 *          |
 *          v
 *   token.burn(investor, tokenAmount)
 *          |
 *          v
 *   paymentToken.transferFrom(issuer -> investor)
 *
 * Both flows are a single atomic transaction — payment and mint/burn either
 * both happen or the whole call reverts.
 */
contract TREXPlatformController is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================
    //                           STATE
    // =============================================================

    /**
     * @notice Fixed-point precision `tokenPrice` is stored in, independent
     * of any specific payment token's own decimals. Sized to match
     * USDC/USDT (6 decimals) so prices for those need no conversion;
     * payment tokens with different decimals (e.g. 18-decimal DAI, should
     * one ever be whitelisted) are scaled automatically in `_quote`.
     */
    uint8 public constant PRICE_DECIMALS = 6;

    /// @notice ERC-20s currently accepted as payment for buy/redeem across
    /// the whole platform. Owner-settable so the set of supported
    /// stablecoins can grow (or shrink) post-deployment.
    mapping(address => bool) public isPaymentToken;

    /// @dev Enumerable backing store for `paymentTokens()`.
    address[] private _paymentTokenList;

    /// @dev token => (index in `_paymentTokenList` + 1); 0 means "not
    /// present". Lets `removePaymentToken` do an O(1) swap-and-pop instead
    /// of a linear scan.
    mapping(address => uint256) private _paymentTokenIndex;

    /**
     * @notice Price of one whole T-REX token, in `PRICE_DECIMALS`-precision
     * units. Set ONLY by that token's own issuer (its on-chain owner()) —
     * the platform does not set or take responsibility for pricing.
     *
     * Example: PRICE_DECIMALS = 6, price = 10 per token
     *          -> tokenPrice[token] = 10_000_000
     *          -> buy/redeem in 6-decimal USDT or USDC both cost 10 of that
     *             token per whole T-REX token.
     */
    mapping(address => uint256) public tokenPrice;

    // =============================================================
    //                            EVENTS
    // =============================================================

    event PaymentTokenAdded(address indexed paymentToken);

    event PaymentTokenRemoved(address indexed paymentToken);

    event TokenPriceUpdated(
        address indexed token,
        uint256 oldPrice,
        uint256 newPrice
    );

    event TokensPurchased(
        address indexed investor,
        address indexed token,
        address indexed issuer,
        address paymentToken,
        uint256 tokenAmount,
        uint256 paymentAmount,
        uint256 pricePerToken
    );

    event TokensRedeemed(
        address indexed investor,
        address indexed token,
        address indexed issuer,
        address paymentToken,
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
    error UnsupportedPaymentToken(address paymentToken);
    error PaymentTokenAlreadyAdded(address paymentToken);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @param initialOwner Platform owner/admin wallet (backend service wallet).
     * @param initialPaymentTokens Payment tokens to whitelist at deploy time
     * (e.g. [USDT, USDC] on Sepolia). More can be added later via
     * `addPaymentToken`, from `initialOwner`'s wallet, with no redeploy.
     */
    constructor(address initialOwner, address[] memory initialPaymentTokens) {
        if (initialOwner == address(0)) {
            revert ZeroAddress();
        }

        for (uint256 i = 0; i < initialPaymentTokens.length; i++) {
            _addPaymentToken(initialPaymentTokens[i]);
        }

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
     * @notice Whitelist a new ERC-20 as an accepted payment token. Owner-only.
     * This is the extension point for supporting more stablecoins later
     * (e.g. adding USDC alongside USDT) without redeploying the controller.
     */
    function addPaymentToken(address token) external onlyOwner {
        _addPaymentToken(token);
    }

    /**
     * @notice Remove a payment token from the whitelist. Owner-only.
     * Existing `tokenPrice` entries are untouched — they simply become
     * unusable with this payment token until/unless it (or another) is
     * whitelisted again.
     */
    function removePaymentToken(address token) external onlyOwner {
        if (!isPaymentToken[token]) {
            revert UnsupportedPaymentToken(token);
        }

        uint256 index = _paymentTokenIndex[token] - 1;
        uint256 lastIndex = _paymentTokenList.length - 1;
        if (index != lastIndex) {
            address lastToken = _paymentTokenList[lastIndex];
            _paymentTokenList[index] = lastToken;
            _paymentTokenIndex[lastToken] = index + 1;
        }
        _paymentTokenList.pop();
        delete _paymentTokenIndex[token];
        isPaymentToken[token] = false;

        emit PaymentTokenRemoved(token);
    }

    /// @notice Full list of currently whitelisted payment tokens.
    function paymentTokens() external view returns (address[] memory) {
        return _paymentTokenList;
    }

    /**
     * @notice Set or update the price of a T-REX token. Callable ONLY by
     * that token's own issuer (its T-REX `owner()`) — never by the
     * platform. Pricing is entirely the issuer's decision and liability;
     * the platform takes no responsibility for it.
     *
     * @param token T-REX token address.
     * @param newPrice Price of one whole token, in `PRICE_DECIMALS`-precision
     * units (see `PRICE_DECIMALS`). Must be non-zero — use a dedicated pause
     * if sales need to stop.
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
     * @notice Buy T-REX tokens with a whitelisted payment token. Investor
     * must approve this contract to spend `paymentToken` first.
     *
     * @param token T-REX token address.
     * @param paymentToken Whitelisted ERC-20 to pay with (e.g. USDT or USDC).
     * @param tokenAmount Amount of T-REX tokens to buy, in smallest units.
     */
    function buy(
        address token,
        address paymentToken,
        uint256 tokenAmount
    ) external nonReentrant whenNotPaused {
        (address issuer, uint256 price, uint256 paymentAmount) = _quote(
            token,
            paymentToken,
            tokenAmount
        );

        // Payment goes straight from investor to issuer — this controller
        // never custodies purchase funds.
        IERC20(paymentToken).safeTransferFrom(msg.sender, issuer, paymentAmount);

        // Requires this controller to be an Agent of `token`. T-REX itself
        // still runs its own identity/compliance checks on the mint.
        ITREXToken(token).mint(msg.sender, tokenAmount);

        emit TokensPurchased(
            msg.sender,
            token,
            issuer,
            paymentToken,
            tokenAmount,
            paymentAmount,
            price
        );
    }

    // =============================================================
    //                          REDEEM
    // =============================================================

    /**
     * @notice Redeem T-REX tokens for a whitelisted payment token. The
     * issuer must approve this contract to spend `paymentToken` on their
     * behalf first.
     *
     * @param investor Holder whose T-REX tokens are being burned.
     * @param token T-REX token address.
     * @param paymentToken Whitelisted ERC-20 to pay the investor out in.
     * @param tokenAmount Amount of T-REX tokens to redeem, in smallest units.
     */
    function redeem(
        address investor,
        address token,
        address paymentToken,
        uint256 tokenAmount
    ) external nonReentrant whenNotPaused {
        (address issuer, uint256 price, uint256 paymentAmount) = _quote(
            token,
            paymentToken,
            tokenAmount
        );
        if (msg.sender != issuer) {
            revert OnlyIssuerCanRedeem();
        }

        // Burn investor's tokens.
        // Controller must have the required Agent permission.
        ITREXToken(token).burn(investor, tokenAmount);
        // Transfer payment directly from issuer to investor.
        IERC20(paymentToken).safeTransferFrom(msg.sender, investor, paymentAmount);
        emit TokensRedeemed(
            investor,
            token,
            msg.sender,
            paymentToken,
            tokenAmount,
            paymentAmount,
            price
        );
    }

    // =============================================================
    //                       VIEW HELPERS
    // =============================================================

    /// @notice Quote what `buy(token, paymentToken, tokenAmount)` would
    /// currently cost.
    function quoteBuy(
        address token,
        address paymentToken,
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
        (issuer, price, paymentAmount) = _quote(token, paymentToken, tokenAmount);
        tokenDecimals = ITREXToken(token).decimals();
    }

    /// @notice Quote what `redeem(investor, token, paymentToken, tokenAmount)`
    /// would currently pay out. Same pricing formula as `quoteBuy` — kept
    /// separate to mirror buy/redeem.
    function quoteRedeem(
        address token,
        address paymentToken,
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
        (issuer, price, paymentAmount) = _quote(token, paymentToken, tokenAmount);
        tokenDecimals = ITREXToken(token).decimals();
    }

    /// @notice Read-only snapshot of what buy/redeem would use for `token`.
    /// Payment-token-agnostic: price is stored once per T-REX token and
    /// converted per whitelisted payment token at buy/redeem time.
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

    /// @dev Shared whitelist logic for the constructor and
    /// `addPaymentToken`.
    function _addPaymentToken(address token) internal {
        if (isPaymentToken[token]) {
            revert PaymentTokenAlreadyAdded(token);
        }
        _requireContract(token);

        // Confirm this is actually an ERC-20-shaped contract before
        // whitelisting it.
        try IERC20Metadata(token).decimals() returns (uint8) {
            // valid
        } catch {
            revert InvalidToken();
        }

        isPaymentToken[token] = true;
        _paymentTokenList.push(token);
        _paymentTokenIndex[token] = _paymentTokenList.length;

        emit PaymentTokenAdded(token);
    }

    /**
     * @dev Shared pricing logic for buy/redeem/quoteBuy/quoteRedeem. Reads
     * price, decimals and issuer, and computes the payment amount:
     *
     *   normalizedAmount = tokenAmount * price / 10^tokenDecimals   (PRICE_DECIMALS units)
     *   paymentAmount    = normalizedAmount * 10^paymentDecimals / 10^PRICE_DECIMALS
     *
     * Example: tokenDecimals = 18, tokenAmount = 1e18, price = 10e6
     *          -> normalizedAmount = 10e6
     *          -> paying in 6-decimal USDT/USDC: paymentAmount = 10e6 (10)
     *          -> paying in an 18-decimal stablecoin: paymentAmount = 10e18 (10)
     */
    function _quote(
        address token,
        address paymentToken,
        uint256 tokenAmount
    )
        internal
        view
        returns (address issuer, uint256 price, uint256 paymentAmount)
    {
        _requireContract(token);

        if (!isPaymentToken[paymentToken]) {
            revert UnsupportedPaymentToken(paymentToken);
        }

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

        uint256 normalizedAmount = Math.mulDiv(
            tokenAmount,
            price,
            10 ** uint256(tokenDecimals)
        );

        uint8 paymentDecimals = IERC20Metadata(paymentToken).decimals();
        paymentAmount = paymentDecimals == PRICE_DECIMALS
            ? normalizedAmount
            : Math.mulDiv(
                normalizedAmount,
                10 ** uint256(paymentDecimals),
                10 ** uint256(PRICE_DECIMALS)
            );

        if (paymentAmount == 0) {
            revert InvalidAmount();
        }
    }
}
