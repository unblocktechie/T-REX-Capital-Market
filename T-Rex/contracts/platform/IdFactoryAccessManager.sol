// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IIdFactory (minimal local interface)
 *
 * @notice Declares only the {IdFactory} `onlyOwner`-gated functions that
 *      {IdFactoryAccessManager} actually calls.
 *
 * @dev Declared locally instead of importing `./IIdFactory.sol` so this file
 *      has no dependency on that interface file. Signatures must be kept in
 *      sync with the real `IdFactory` contract this is deployed against.
 */
interface IIdFactory {
    /**
     * @notice Deploys a new on-chain identity for `_wallet`, deterministically
     *      addressed via `_salt`.
     *
     * @dev Callable only by the `IdFactory`'s owner, i.e. this contract.
     *
     * @param _wallet wallet address the new identity will be linked to
     * @param _salt unique salt used to deterministically derive the identity address;
     *      reverts inside `IdFactory` if already taken
     * @return address of the newly deployed identity contract
     */
    function createIdentity(address _wallet, string calldata _salt) external returns (address);

    /**
     * @notice Deploys a new on-chain identity for `_wallet` pre-configured with
     *      the given management keys instead of the wallet itself.
     *
     * @dev Callable only by the `IdFactory`'s owner, i.e. this contract.
     *
     * @param _wallet wallet address the new identity will be linked to
     * @param _salt unique salt used to deterministically derive the identity address
     * @param _managementKeys list of hashed keys (see `IERC734`) granted management
     *      rights on the newly deployed identity
     * @return address of the newly deployed identity contract
     */
    function createIdentityWithManagementKeys(
        address _wallet,
        string calldata _salt,
        bytes32[] calldata _managementKeys
    ) external returns (address);

    /**
     * @notice Whitelists `_factory` as an authorized token identity factory
     *      on the underlying `IdFactory`.
     *
     * @dev Callable only by the `IdFactory`'s owner, i.e. this contract.
     *
     * @param _factory address of the token factory contract to whitelist
     */
    function addTokenFactory(address _factory) external;

    /**
     * @notice Revokes `_factory`'s authorization as a token identity factory
     *      on the underlying `IdFactory`.
     *
     * @dev Callable only by the `IdFactory`'s owner, i.e. this contract.
     *
     * @param _factory address of the token factory contract to de-whitelist
     */
    function removeTokenFactory(address _factory) external;
}

/**
 * @title IdFactoryAccessManager
 *
 * @notice Access-control front door for an {IdFactory} instance. `IdFactory` itself
 *      exposes all of its privileged functions behind a single `onlyOwner` modifier;
 *      this contract becomes that owner and re-exposes those functions split across
 *      two independently manageable roles, so day-to-day identity creation doesn't
 *      require holding the same key as factory administration.
 *
 * @dev Role split:
 *      - `IDENTITY_AUTHORIZER_ROLE`: intended for the relay back-end signer that
 *        onboards users. May ONLY call {createIdentity}.
 *      - `ADMIN_ROLE`: may call every other `onlyOwner`-gated function on
 *        {IdFactory} (`createIdentityWithManagementKeys`, `addTokenFactory`,
 *        `removeTokenFactory`, `transferOwnership`), as well as manage this
 *        contract's own configuration (swapping the target factory,
 *        granting/revoking `IDENTITY_AUTHORIZER_ROLE`).
 *      - `DEFAULT_ADMIN_ROLE`: the OpenZeppelin `AccessControl` super-role; controls
 *        who holds `ADMIN_ROLE`. Should be held by a multisig, not an EOA.
 *
 * @dev IMPORTANT (deployment/migration step): after deploying this contract, the
 *      existing owner of {IdFactory} must call
 *      `IdFactory.transferOwnership(address(idFactoryAccessManager))` so this
 *      contract actually holds owner privileges on the factory. Until that
 *      happens, every function below will revert inside {IdFactory} with
 *      "Ownable: caller is not the owner".
 *
 * @dev CAUTION: {transferIdFactoryOwnership} and {setIdFactory} are highly
 *      privileged, effectively irreversible operations (the underlying `IdFactory`
 *      uses a single-step `Ownable`, not `Ownable2Step`) — a mistaken address
 *      passed to either can permanently strand `IdFactory` or this contract's
 *      control over it. Treat both as break-glass operations.
 */
contract IdFactoryAccessManager is AccessControl {

    /**
     * @notice Role allowed to call {createIdentity} only.
     *
     * @dev Intended for the relay back-end signer that onboards individual users.
     *      Granted/revoked by `ADMIN_ROLE` (see `_setRoleAdmin` in the constructor).
     */
    bytes32 public constant IDENTITY_AUTHORIZER_ROLE = keccak256("IDENTITY_AUTHORIZER_ROLE");

    /**
     * @notice Role allowed to call every function on this contract except
     *      those gated to `IDENTITY_AUTHORIZER_ROLE`.
     *
     * @dev Covers both `IdFactory` administration (via this contract) and this
     *      contract's own configuration. Granted/revoked by `DEFAULT_ADMIN_ROLE`.
     */
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /**
     * @notice The `IdFactory` instance this contract currently administers.
     *
     * @dev This contract must be the `owner()` of the referenced `IdFactory` for
     *      any of the forwarding functions below to succeed. Updatable by
     *      `ADMIN_ROLE` via {setIdFactory}.
     */
    IIdFactory public idFactory;

    /**
     * @dev Fired when `ADMIN_ROLE` repoints this contract at a different
     *      `IdFactory` deployment via {setIdFactory}.
     *
     * @param previousFactory the `IdFactory` address that was previously configured
     * @param newFactory the `IdFactory` address now configured
     */
    event IdFactoryUpdated(address indexed previousFactory, address indexed newFactory);

    /**
     * @dev Fired when {createIdentity} successfully deploys a new identity.
     *
     * @param caller the `IDENTITY_AUTHORIZER_ROLE` account that made the call
     * @param wallet the wallet address the new identity is linked to
     * @param salt the salt used to deterministically derive the identity address
     * @param identity address of the newly deployed identity contract
     */
    event IdentityCreated(address indexed caller, address indexed wallet, string salt, address identity);

    /**
     * @dev Fired when {createIdentityWithManagementKeys} successfully deploys a
     *      new identity.
     *
     * @param caller the `ADMIN_ROLE` account that made the call
     * @param wallet the wallet address the new identity is linked to
     * @param salt the salt used to deterministically derive the identity address
     * @param identity address of the newly deployed identity contract
     */
    event IdentityWithKeysCreated(address indexed caller, address indexed wallet, string salt, address identity);

    /**
     * @dev Fired when {addTokenFactory} successfully whitelists a token factory
     *      on the underlying `IdFactory`.
     *
     * @param caller the `ADMIN_ROLE` account that made the call
     * @param factory address of the token factory that was whitelisted
     */
    event TokenFactoryAddedViaRelayer(address indexed caller, address indexed factory);

    /**
     * @dev Fired when {removeTokenFactory} successfully de-whitelists a token
     *      factory on the underlying `IdFactory`.
     *
     * @param caller the `ADMIN_ROLE` account that made the call
     * @param factory address of the token factory that was de-whitelisted
     */
    event TokenFactoryRemovedViaRelayer(address indexed caller, address indexed factory);

    /**
     * @dev Fired when {transferIdFactoryOwnership} successfully transfers
     *      ownership of the underlying `IdFactory` away from this contract.
     *
     * @param caller the `ADMIN_ROLE` account that made the call
     * @param newOwner address `IdFactory` ownership was transferred to
     */
    event IdFactoryOwnershipTransferred(address indexed caller, address indexed newOwner);

    /**
     * @notice Deploys the access manager, pointing it at an existing `IdFactory`
     *      and granting initial admin control.
     *
     * @dev Sets up the `AccessControl` role hierarchy:
     *      - `_defaultAdmin` receives both `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE`.
     *      - `ADMIN_ROLE` is configured as the admin of `IDENTITY_AUTHORIZER_ROLE`
     *        (so `ADMIN_ROLE` can grant/revoke the back-end signer role).
     *      - `DEFAULT_ADMIN_ROLE` is configured as the admin of `ADMIN_ROLE`.
     *
     *      Does NOT grant `IDENTITY_AUTHORIZER_ROLE` to anyone; that must be
     *      granted separately, post-deployment, by an `ADMIN_ROLE` holder.
     *
     *      Note: this contract is not yet functional immediately after
     *      deployment — see the contract-level "IMPORTANT" note regarding
     *      `IdFactory.transferOwnership`.
     *
     * @param _idFactory address of the `IdFactory` instance this contract will administer
     * @param _defaultAdmin address granted `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` at
     *      deployment; use a multisig here, not an EOA
     */
    constructor(address _idFactory, address _defaultAdmin) {
        require(_idFactory != address(0), "IdFactoryAccessManager: zero address");
        require(_defaultAdmin != address(0), "IdFactoryAccessManager: zero address");

        idFactory = IIdFactory(_idFactory);

        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(ADMIN_ROLE, _defaultAdmin);

        // ADMIN_ROLE manages who holds IDENTITY_AUTHORIZER_ROLE (grant/revoke the back-end signer)
        _setRoleAdmin(IDENTITY_AUTHORIZER_ROLE, ADMIN_ROLE);
        // DEFAULT_ADMIN_ROLE manages who holds ADMIN_ROLE
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
    }

    // ============================================================
    //                 IDENTITY AUTHORIZER ROLE
    //     relay back-end authorizor — createIdentity ONLY
    // ============================================================

    /**
     * @notice Deploys a new on-chain identity for `_wallet`.
     *
     * @dev Relays the call to {IdFactory-createIdentity}. Only accounts holding
     *      `IDENTITY_AUTHORIZER_ROLE` may call this.
     *
     * @param _wallet wallet address the new identity will be linked to
     * @param _salt unique salt used to deterministically derive the identity address
     * @return address of the newly deployed identity contract
     */
    function createIdentity(address _wallet, string calldata _salt)
        external
        onlyRole(IDENTITY_AUTHORIZER_ROLE)
        returns (address)
    {
        address identity = idFactory.createIdentity(_wallet, _salt);
        emit IdentityCreated(msg.sender, _wallet, _salt, identity);
        return identity;
    }

    // ============================================================
    //                        ADMIN ROLE
    //   every other onlyOwner-gated function on IdFactory, plus
    //   relayer configuration
    // ============================================================

    /**
     * @notice Deploys a new on-chain identity for `_wallet`, pre-configured with
     *      the given management keys instead of the wallet itself.
     *
     * @dev Relays the call to {IdFactory-createIdentityWithManagementKeys}. Only
     *      accounts holding `ADMIN_ROLE` may call this.
     *
     * @param _wallet wallet address the new identity will be linked to
     * @param _salt unique salt used to deterministically derive the identity address
     * @param _managementKeys list of hashed keys (see `IERC734`) granted management
     *      rights on the newly deployed identity
     * @return address of the newly deployed identity contract
     */
    function createIdentityWithManagementKeys(
        address _wallet,
        string calldata _salt,
        bytes32[] calldata _managementKeys
    )
        external
        onlyRole(ADMIN_ROLE)
        returns (address)
    {
        address identity = idFactory.createIdentityWithManagementKeys(_wallet, _salt, _managementKeys);
        emit IdentityWithKeysCreated(msg.sender, _wallet, _salt, identity);
        return identity;
    }

    /**
     * @notice Whitelists `_factory` as an authorized token identity factory on
     *      the underlying `IdFactory`.
     *
     * @dev Relays the call to {IdFactory-addTokenFactory}. Only accounts holding
     *      `ADMIN_ROLE` may call this.
     *
     * @param _factory address of the token factory contract to whitelist
     */
    function addTokenFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        idFactory.addTokenFactory(_factory);
        emit TokenFactoryAddedViaRelayer(msg.sender, _factory);
    }

    /**
     * @notice Revokes `_factory`'s authorization as a token identity factory on
     *      the underlying `IdFactory`.
     *
     * @dev Relays the call to {IdFactory-removeTokenFactory}. Only accounts holding
     *      `ADMIN_ROLE` may call this.
     *
     * @param _factory address of the token factory contract to de-whitelist
     */
    function removeTokenFactory(address _factory) external onlyRole(ADMIN_ROLE) {
        idFactory.removeTokenFactory(_factory);
        emit TokenFactoryRemovedViaRelayer(msg.sender, _factory);
    }

    /**
     * @notice Transfers ownership of the underlying `IdFactory` away from this
     *      contract, e.g. to migrate to a new access manager version.
     *
     * @dev CAUTION: `IdFactory` uses single-step `Ownable`, so this takes effect
     *      immediately with no acceptance step by `_newOwner`. A mistaken address
     *      here permanently strands this contract's (and thus every role holder's)
     *      control over `IdFactory`.
     *
     * @param _newOwner address to transfer `IdFactory` ownership to; must be non-zero
     */
    function transferIdFactoryOwnership(address _newOwner) external onlyRole(ADMIN_ROLE) {
        require(_newOwner != address(0), "IdFactoryAccessManager: zero address");
        Ownable(address(idFactory)).transferOwnership(_newOwner);
        emit IdFactoryOwnershipTransferred(msg.sender, _newOwner);
    }

    /**
     * @notice Repoints this contract at a different `IdFactory` deployment.
     *
     * @dev Only updates local bookkeeping (the {idFactory} reference); it does
     *      NOT transfer ownership on the new factory. This contract must
     *      separately be made `owner()` of `_newFactory` (by whoever currently
     *      owns it) for the forwarding functions above to succeed against it.
     *
     * @param _newFactory address of the `IdFactory` deployment to point at; must be non-zero
     */
    function setIdFactory(address _newFactory) external onlyRole(ADMIN_ROLE) {
        require(_newFactory != address(0), "IdFactoryAccessManager: zero address");
        address previous = address(idFactory);
        idFactory = IIdFactory(_newFactory);
        emit IdFactoryUpdated(previous, _newFactory);
    }

    // ============================================================
    //                          VIEWS
    // ============================================================

    /**
     * @notice Returns who currently owns the configured `IdFactory`.
     *
     * @dev Convenience view for off-chain tooling/monitoring: this should equal
     *      `address(this)` whenever the forwarding functions above are expected
     *      to succeed. A mismatch indicates the migration step described in the
     *      contract-level "IMPORTANT" note hasn't been completed, or that
     *      ownership was transferred elsewhere via {transferIdFactoryOwnership}.
     *
     * @return address of the current owner of {idFactory}
     */
    function idFactoryOwner() external view returns (address) {
        return Ownable(address(idFactory)).owner();
    }
}