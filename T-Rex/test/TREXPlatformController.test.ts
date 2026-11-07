import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Unit tests for TREXPlatformController, isolated from the full T-REX suite
 * (IdentityRegistry / ModularCompliance / ONCHAINID) via lightweight mocks
 * that mirror only the surface the controller talks to:
 *
 *  - MockTRexToken: Ownable `owner()` + AgentRole-style `isAgent`/`addAgent`
 *    + onlyAgent-gated `mint`/`burn`, with switches to simulate T-REX-side
 *    rejections (paused, non-verified investor, compliance failure).
 *  - MockERC20: configurable-decimals ERC20 standing in for USDT/USDC.
 *  - ReentrantERC20: payment token that tries to re-enter buy()/redeem()
 *    from inside transferFrom.
 */
describe('TREXPlatformController', () => {
  const USDT_DECIMALS = 6;
  const TOKEN_DECIMALS = 18;
  const PRICE_DECIMALS = 6;
  // 10 per whole T-REX token, in PRICE_DECIMALS-precision units.
  const PRICE = ethers.parseUnits('10', PRICE_DECIMALS);

  // Deploys behind a UUPS proxy exactly like production; the plugin also
  // validates the implementation is upgrade-safe.
  async function deployController(initialOwner: string, paymentTokens: string[], from?: HardhatEthersSigner) {
    const Controller = await ethers.getContractFactory('TREXPlatformController', from);
    return upgrades.deployProxy(Controller, [initialOwner, paymentTokens], { kind: 'uups' });
  }

  async function deployFixture() {
    const [deployer, platformOwner, issuer, investor, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const usdt = await MockERC20.deploy('Mock USDT', 'mUSDT', USDT_DECIMALS);
    const usdc = await MockERC20.deploy('Mock USDC', 'mUSDC', USDT_DECIMALS);

    const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
    const trexToken = await MockTRexToken.connect(issuer).deploy('Security Token', 'SEC', TOKEN_DECIMALS);

    const controller = await deployController(platformOwner.address, [await usdt.getAddress(), await usdc.getAddress()]);

    // Issuer wires the controller in as an Agent — this is the one-time,
    // per-token setup step the issuer performs; everything after this is
    // backend/investor calls with no Agent key involved.
    await trexToken.connect(issuer).addAgent(await controller.getAddress());

    // Only the token's own issuer (its owner()) may set its price — the
    // platform never does, and takes no responsibility for pricing.
    await controller.connect(issuer).setPrice(await trexToken.getAddress(), PRICE);

    return {
      deployer, platformOwner, issuer, investor, other, usdt, usdc, trexToken, controller,
    };
  }

  async function fundAndApprove(token: any, from: HardhatEthersSigner, spender: string, amount: bigint) {
    await token.mint(from.address, amount);
    await token.connect(from).approve(spender, amount);
  }

  // ===========================================================
  //                       CONSTRUCTOR
  // ===========================================================

  describe('initialize', () => {
    it('sets the initial owner and whitelists the initial payment tokens', async () => {
      const {
        platformOwner, usdt, usdc, controller,
      } = await loadFixture(deployFixture);
      expect(await controller.owner()).to.equal(platformOwner.address);
      expect(await controller.isPaymentToken(await usdt.getAddress())).to.equal(true);
      expect(await controller.isPaymentToken(await usdc.getAddress())).to.equal(true);
      expect(await controller.paymentTokens()).to.deep.equal([await usdt.getAddress(), await usdc.getAddress()]);
    });

    it('reverts on a zero-address owner', async () => {
      const { usdt, controller } = await loadFixture(deployFixture);
      await expect(deployController(ethers.ZeroAddress, [await usdt.getAddress()])).to.be.revertedWithCustomError(
        controller,
        'ZeroAddress',
      );
    });

    it('reverts on a zero-address initial payment token', async () => {
      const { platformOwner, controller } = await loadFixture(deployFixture);
      await expect(deployController(platformOwner.address, [ethers.ZeroAddress])).to.be.revertedWithCustomError(
        controller,
        'ZeroAddress',
      );
    });

    it('deploys fine with no initial payment tokens, to be added later', async () => {
      const { platformOwner } = await loadFixture(deployFixture);
      const controller = await deployController(platformOwner.address, []);
      expect(await controller.paymentTokens()).to.deep.equal([]);
    });

    it('leaves the deployer as owner when initialOwner is the deployer', async () => {
      const { deployer, usdt } = await loadFixture(deployFixture);
      const controller = await deployController(deployer.address, [await usdt.getAddress()], deployer);
      expect(await controller.owner()).to.equal(deployer.address);
    });

    it('cannot be initialized twice, through the proxy or on the implementation', async () => {
      const { platformOwner, controller } = await loadFixture(deployFixture);
      await expect(controller.initialize(platformOwner.address, [])).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );

      const implementation = await ethers.getContractAt(
        'TREXPlatformController',
        await upgrades.erc1967.getImplementationAddress(await controller.getAddress()),
      );
      await expect(implementation.initialize(platformOwner.address, [])).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
    });
  });

  // ===========================================================
  //                        UPGRADES
  // ===========================================================

  describe('upgrades', () => {
    it('keeps the proxy address and all state across an upgrade, then runs the V2 reinitializer', async () => {
      const {
        platformOwner, issuer, usdt, usdc, trexToken, controller,
      } = await loadFixture(deployFixture);
      const proxyAddress = await controller.getAddress();
      expect(await controller.version()).to.equal('1.0.0');
      await controller.connect(issuer).setServiceWallet(platformOwner.address, await trexToken.getAddress());

      const V2 = await ethers.getContractFactory('TREXPlatformControllerV2Mock', platformOwner);
      // V2's reinitializer must NOT re-run the parent initializers, which the
      // plugin flags by default; storage-layout checks still apply.
      const upgraded = await upgrades.upgradeProxy(proxyAddress, V2, {
        call: { fn: 'initializeV2', args: [42] },
        unsafeAllow: ['missing-initializer', 'missing-initializer-call'],
      });

      expect(await upgraded.getAddress()).to.equal(proxyAddress);
      expect(await upgraded.version()).to.equal('2.0.0');
      expect(await upgraded.newFeatureValue()).to.equal(42n);
      expect(await upgraded.owner()).to.equal(platformOwner.address);
      expect(await upgraded.tokenPrice(await trexToken.getAddress())).to.equal(PRICE);
      expect(await upgraded.paymentTokens()).to.deep.equal([await usdt.getAddress(), await usdc.getAddress()]);
      expect(await upgraded.serviceWalletOf(await trexToken.getAddress())).to.equal(platformOwner.address);
      // Still the same Agent on the token — no re-wiring needed.
      expect(await trexToken.isAgent(proxyAddress)).to.equal(true);
      await expect(upgraded.initializeV2(7)).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('only lets the owner upgrade', async () => {
      const { issuer, other, controller } = await loadFixture(deployFixture);
      const V2 = await ethers.getContractFactory('TREXPlatformControllerV2Mock');
      const newImplementation = await V2.deploy();

      for (const caller of [issuer, other]) {
        await expect(controller.connect(caller).upgradeTo(await newImplementation.getAddress())).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      }
    });
  });

  // ===========================================================
  //                    ADMIN / CONFIGURATION
  // ===========================================================

  describe('addPaymentToken / removePaymentToken', () => {
    it('lets the owner whitelist a new payment token and emits an event', async () => {
      const { platformOwner, controller } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const dai = await MockERC20.deploy('Mock DAI', 'mDAI', 18);

      await expect(controller.connect(platformOwner).addPaymentToken(await dai.getAddress()))
        .to.emit(controller, 'PaymentTokenAdded')
        .withArgs(await dai.getAddress());

      expect(await controller.isPaymentToken(await dai.getAddress())).to.equal(true);
    });

    it('reverts for non-owner callers', async () => {
      const { other, controller, usdc } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const dai = await MockERC20.deploy('Mock DAI', 'mDAI', 18);
      await expect(controller.connect(other).addPaymentToken(await dai.getAddress())).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
      // usdc already whitelisted in fixture — used only to keep imports tidy.
      expect(await controller.isPaymentToken(await usdc.getAddress())).to.equal(true);
    });

    it('reverts on the zero address', async () => {
      const { platformOwner, controller } = await loadFixture(deployFixture);
      await expect(controller.connect(platformOwner).addPaymentToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        controller,
        'ZeroAddress',
      );
    });

    it('reverts when the token is already whitelisted', async () => {
      const { platformOwner, controller, usdt } = await loadFixture(deployFixture);
      await expect(controller.connect(platformOwner).addPaymentToken(await usdt.getAddress()))
        .to.be.revertedWithCustomError(controller, 'PaymentTokenAlreadyAdded')
        .withArgs(await usdt.getAddress());
    });

    it('lets the owner remove a payment token and emits an event', async () => {
      const {
        platformOwner, controller, usdt, usdc,
      } = await loadFixture(deployFixture);

      await expect(controller.connect(platformOwner).removePaymentToken(await usdt.getAddress()))
        .to.emit(controller, 'PaymentTokenRemoved')
        .withArgs(await usdt.getAddress());

      expect(await controller.isPaymentToken(await usdt.getAddress())).to.equal(false);
      expect(await controller.paymentTokens()).to.deep.equal([await usdc.getAddress()]);
    });

    it('reverts removing a token that is not whitelisted', async () => {
      const { platformOwner, controller, other } = await loadFixture(deployFixture);
      await expect(controller.connect(platformOwner).removePaymentToken(other.address))
        .to.be.revertedWithCustomError(controller, 'UnsupportedPaymentToken')
        .withArgs(other.address);
    });

    it('a removed payment token can no longer be used for buy()', async () => {
      const {
        platformOwner, investor, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      await controller.connect(platformOwner).removePaymentToken(await usdt.getAddress());

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWithCustomError(controller, 'UnsupportedPaymentToken');
    });
  });

  describe('setPrice', () => {
    it("lets the token's own issuer set and update a price, emitting old/new", async () => {
      const { issuer, controller, trexToken } = await loadFixture(deployFixture);
      const newPrice = ethers.parseUnits('12', PRICE_DECIMALS);

      await expect(controller.connect(issuer).setPrice(await trexToken.getAddress(), newPrice))
        .to.emit(controller, 'TokenPriceUpdated')
        .withArgs(await trexToken.getAddress(), PRICE, newPrice);

      expect(await controller.tokenPrice(await trexToken.getAddress())).to.equal(newPrice);
    });

    it('reverts with NotTokenOwner for anyone other than the token issuer, including the platform owner', async () => {
      const {
        platformOwner, other, controller, trexToken,
      } = await loadFixture(deployFixture);

      for (const caller of [other, platformOwner]) {
        await expect(controller.connect(caller).setPrice(await trexToken.getAddress(), PRICE))
          .to.be.revertedWithCustomError(controller, 'NotTokenOwner')
          .withArgs(await trexToken.getAddress(), caller.address);
      }
    });

    it('reverts on a zero price', async () => {
      const { issuer, controller, trexToken } = await loadFixture(deployFixture);
      await expect(
        controller.connect(issuer).setPrice(await trexToken.getAddress(), 0n),
      ).to.be.revertedWithCustomError(controller, 'InvalidPrice');
    });

    it('reverts on the zero address', async () => {
      const { issuer, controller } = await loadFixture(deployFixture);
      await expect(
        controller.connect(issuer).setPrice(ethers.ZeroAddress, PRICE),
      ).to.be.revertedWithCustomError(controller, 'ZeroAddress');
    });

    it('reverts for an address with no code', async () => {
      const { issuer, other, controller } = await loadFixture(deployFixture);
      await expect(
        controller.connect(issuer).setPrice(other.address, PRICE),
      ).to.be.revertedWithCustomError(controller, 'InvalidToken');
    });

    it('reverts for a contract that does not implement decimals()', async () => {
      const { issuer, controller } = await loadFixture(deployFixture);
      // The controller itself has no decimals() — good stand-in for "not an ERC20".
      await expect(
        controller.connect(issuer).setPrice(await controller.getAddress(), PRICE),
      ).to.be.revertedWithCustomError(controller, 'InvalidToken');
    });
  });

  describe('setPriceOnBehalfOf', () => {
    const SET_PRICE_TYPES = {
      SetPrice: [
        { name: 'token', type: 'address' },
        { name: 'newPrice', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    async function signSetPrice(
      signer: HardhatEthersSigner | ReturnType<typeof ethers.Wallet.createRandom>,
      controller: any,
      token: string,
      newPrice: bigint,
      deadline: bigint,
      nonce?: bigint,
    ) {
      const { chainId } = await ethers.provider.getNetwork();
      const signature = await signer.signTypedData(
        {
          name: 'TREXPlatformController',
          version: '1',
          chainId,
          verifyingContract: await controller.getAddress(),
        },
        SET_PRICE_TYPES,
        {
          token, newPrice, nonce: nonce ?? await controller.nonces(signer.address), deadline,
        },
      );
      return ethers.Signature.from(signature);
    }

    async function serviceWalletFixture() {
      const base = await deployFixture();
      const serviceWallet = ethers.Wallet.createRandom();
      await base.controller.connect(base.issuer).setServiceWallet(serviceWallet.address, await base.trexToken.getAddress());
      const deadline = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 3600);
      return { ...base, serviceWallet, deadline };
    }

    it('lets a relayer set the price with the issuer service wallet signature', async () => {
      const {
        other, serviceWallet, controller, trexToken, deadline,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();
      const newPrice = ethers.parseUnits('15', PRICE_DECIMALS);
      const sig = await signSetPrice(serviceWallet, controller, token, newPrice, deadline);

      await expect(controller.connect(other).setPriceOnBehalfOf(token, newPrice, deadline, sig.v, sig.r, sig.s))
        .to.emit(controller, 'TokenPriceUpdated')
        .withArgs(token, PRICE, newPrice);

      expect(await controller.tokenPrice(token)).to.equal(newPrice);
      expect(await controller.nonces(serviceWallet.address)).to.equal(1n);
    });

    it('emits ServiceWalletUpdated on register and revoke', async () => {
      const {
        issuer, other, controller, trexToken,
      } = await loadFixture(deployFixture);
      const token = await trexToken.getAddress();

      await expect(controller.connect(issuer).setServiceWallet(other.address, token))
        .to.emit(controller, 'ServiceWalletUpdated')
        .withArgs(issuer.address, token, ethers.ZeroAddress, other.address);
      await expect(controller.connect(issuer).setServiceWallet(ethers.ZeroAddress, token))
        .to.emit(controller, 'ServiceWalletUpdated')
        .withArgs(issuer.address, token, other.address, ethers.ZeroAddress);
    });

    it('rejects a replayed signature', async () => {
      const {
        serviceWallet, controller, trexToken, deadline,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();
      const newPrice = ethers.parseUnits('15', PRICE_DECIMALS);
      const sig = await signSetPrice(serviceWallet, controller, token, newPrice, deadline);

      await controller.setPriceOnBehalfOf(token, newPrice, deadline, sig.v, sig.r, sig.s);
      await expect(controller.setPriceOnBehalfOf(token, newPrice, deadline, sig.v, sig.r, sig.s))
        .to.be.revertedWithCustomError(controller, 'InvalidServiceWalletSignature');
    });

    it('rejects an expired signature', async () => {
      const {
        serviceWallet, controller, trexToken,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();
      const deadline = BigInt((await ethers.provider.getBlock('latest'))!.timestamp - 1);
      const sig = await signSetPrice(serviceWallet, controller, token, PRICE, deadline);

      await expect(controller.setPriceOnBehalfOf(token, PRICE, deadline, sig.v, sig.r, sig.s))
        .to.be.revertedWithCustomError(controller, 'SignatureExpired')
        .withArgs(deadline);
    });

    it('rejects signatures from the main wallet, the platform owner, or any unregistered wallet', async () => {
      const {
        issuer, platformOwner, other, controller, trexToken, deadline,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();

      for (const signer of [issuer, platformOwner, other]) {
        const sig = await signSetPrice(signer, controller, token, PRICE, deadline);
        await expect(controller.setPriceOnBehalfOf(token, PRICE, deadline, sig.v, sig.r, sig.s))
          .to.be.revertedWithCustomError(controller, 'InvalidServiceWalletSignature')
          .withArgs(token, signer.address);
      }
    });

    it('rejects a signature whose fields do not match the submitted price', async () => {
      const {
        serviceWallet, controller, trexToken, deadline,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();
      const sig = await signSetPrice(serviceWallet, controller, token, PRICE, deadline);

      await expect(controller.setPriceOnBehalfOf(token, PRICE + 1n, deadline, sig.v, sig.r, sig.s))
        .to.be.revertedWithCustomError(controller, 'InvalidServiceWalletSignature');
    });

    it('rejects once the issuer revokes the service wallet', async () => {
      const {
        issuer, serviceWallet, controller, trexToken, deadline,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();
      const sig = await signSetPrice(serviceWallet, controller, token, PRICE, deadline);

      await controller.connect(issuer).setServiceWallet(ethers.ZeroAddress, token);
      await expect(controller.setPriceOnBehalfOf(token, PRICE, deadline, sig.v, sig.r, sig.s))
        .to.be.revertedWithCustomError(controller, 'InvalidServiceWalletSignature');
    });

    it('applies the same price validation as setPrice', async () => {
      const {
        serviceWallet, controller, trexToken, deadline,
      } = await loadFixture(serviceWalletFixture);
      const token = await trexToken.getAddress();
      const sig = await signSetPrice(serviceWallet, controller, token, 0n, deadline);

      await expect(controller.setPriceOnBehalfOf(token, 0n, deadline, sig.v, sig.r, sig.s))
        .to.be.revertedWithCustomError(controller, 'InvalidPrice');
    });
  });

  describe('pause / unpause', () => {
    it('lets the owner pause and unpause', async () => {
      const { platformOwner, controller } = await loadFixture(deployFixture);
      await controller.connect(platformOwner).pause();
      expect(await controller.paused()).to.equal(true);
      await controller.connect(platformOwner).unpause();
      expect(await controller.paused()).to.equal(false);
    });

    it('reverts for non-owner callers', async () => {
      const { other, controller } = await loadFixture(deployFixture);
      await expect(controller.connect(other).pause()).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('blocks buy() and redeem() while paused', async () => {
      const {
        platformOwner, investor, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      await controller.connect(platformOwner).pause();

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        controller.connect(investor).redeem(
          investor.address,
          await trexToken.getAddress(),
          await usdt.getAddress(),
          ethers.parseUnits('1', TOKEN_DECIMALS),
        ),
      ).to.be.revertedWith('Pausable: paused');
    });
  });

  // ===========================================================
  //                            BUY
  // ===========================================================

  describe('buy', () => {
    it('transfers payment token investor -> issuer and mints tokens to the investor, atomically', async () => {
      const {
        investor, issuer, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('2.5', TOKEN_DECIMALS); // 2.5 tokens
      const expectedPayment = ethers.parseUnits('25', USDT_DECIMALS); // 2.5 * 10

      await fundAndApprove(usdt, investor, await controller.getAddress(), expectedPayment);

      await expect(controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount))
        .to.emit(controller, 'TokensPurchased')
        .withArgs(
          investor.address,
          await trexToken.getAddress(),
          issuer.address,
          await usdt.getAddress(),
          tokenAmount,
          expectedPayment,
          PRICE,
        );

      expect(await usdt.balanceOf(investor.address)).to.equal(0n);
      expect(await usdt.balanceOf(issuer.address)).to.equal(expectedPayment);
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
      // Controller never custodies funds or tokens.
      expect(await usdt.balanceOf(await controller.getAddress())).to.equal(0n);
    });

    it('also accepts a second whitelisted payment token (USDC) at the same price', async () => {
      const {
        investor, issuer, trexToken, controller, usdc,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const expectedPayment = ethers.parseUnits('10', USDT_DECIMALS);

      await fundAndApprove(usdc, investor, await controller.getAddress(), expectedPayment);

      await controller.connect(investor).buy(await trexToken.getAddress(), await usdc.getAddress(), tokenAmount);

      expect(await usdc.balanceOf(issuer.address)).to.equal(expectedPayment);
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
    });

    it('scales the payment amount for a payment token with different decimals', async () => {
      const {
        platformOwner, investor, issuer, trexToken, controller,
      } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const dai = await MockERC20.deploy('Mock DAI', 'mDAI', 18); // 18 decimals, unlike the 6-decimal PRICE_DECIMALS
      await controller.connect(platformOwner).addPaymentToken(await dai.getAddress());

      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const expectedPayment = ethers.parseUnits('10', 18); // 10 DAI, 18-decimal units

      await fundAndApprove(dai, investor, await controller.getAddress(), expectedPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), await dai.getAddress(), tokenAmount);

      expect(await dai.balanceOf(issuer.address)).to.equal(expectedPayment);
    });

    it('reverts with UnsupportedPaymentToken for a non-whitelisted payment token', async () => {
      const {
        investor, trexToken, controller,
      } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const notWhitelisted = await MockERC20.deploy('Not Whitelisted', 'NWL', USDT_DECIMALS);

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await notWhitelisted.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      )
        .to.be.revertedWithCustomError(controller, 'UnsupportedPaymentToken')
        .withArgs(await notWhitelisted.getAddress());
    });

    it('reverts with InvalidAmount for a zero amount', async () => {
      const { investor, trexToken, controller, usdt } = await loadFixture(deployFixture);
      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), 0n),
      ).to.be.revertedWithCustomError(controller, 'InvalidAmount');
    });

    it('reverts with InvalidPrice when no price has been set for the token', async () => {
      const {
        investor, issuer, controller, usdt,
      } = await loadFixture(deployFixture);
      const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
      const unpriced = await MockTRexToken.connect(issuer).deploy('Other Token', 'OTH', TOKEN_DECIMALS);
      await unpriced.connect(issuer).addAgent(await controller.getAddress());

      await expect(
        controller.connect(investor).buy(await unpriced.getAddress(), await usdt.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWithCustomError(controller, 'InvalidPrice');
    });

    it('reverts with InvalidToken for a non-contract address', async () => {
      const { investor, other, controller, usdt } = await loadFixture(deployFixture);
      await expect(
        controller.connect(investor).buy(other.address, await usdt.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWithCustomError(controller, 'InvalidToken');
    });

    it('reverts when the controller has not been added as an Agent', async () => {
      const {
        investor, issuer, controller, usdt,
      } = await loadFixture(deployFixture);
      const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
      const notWired = await MockTRexToken.connect(issuer).deploy('Not Wired', 'NW', TOKEN_DECIMALS);
      await controller.connect(issuer).setPrice(await notWired.getAddress(), PRICE);
      await fundAndApprove(usdt, investor, await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      await expect(
        controller.connect(investor).buy(await notWired.getAddress(), await usdt.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWith('AgentRole: caller does not have the Agent role');
    });

    it('reverts when not enough payment token is approved', async () => {
      const {
        investor, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      await usdt.mint(investor.address, ethers.parseUnits('10', USDT_DECIMALS));
      // No approval at all.
      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount),
      ).to.be.reverted;
    });

    it('reverts when approved but underfunded', async () => {
      const {
        investor, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS); // needs 10
      // Approve plenty, but never mint any payment token to the investor.
      await usdt.connect(investor).approve(await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount),
      ).to.be.reverted;
    });

    it('is atomic: if T-REX mint reverts, no payment moves', async () => {
      const {
        investor, issuer, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const payment = ethers.parseUnits('10', USDT_DECIMALS);
      await fundAndApprove(usdt, investor, await controller.getAddress(), payment);

      await trexToken.setMintShouldRevert(true);

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount),
      ).to.be.revertedWith('MockTRexToken: mint blocked (simulated compliance failure)');

      expect(await usdt.balanceOf(investor.address)).to.equal(payment);
      expect(await usdt.balanceOf(issuer.address)).to.equal(0n);
    });

    it('blocks a reentrant call through a malicious payment token', async () => {
      const {
        platformOwner, investor, trexToken, controller,
      } = await loadFixture(deployFixture);
      const ReentrantERC20 = await ethers.getContractFactory('ReentrantERC20');
      const evilToken = await ReentrantERC20.deploy();
      await controller.connect(platformOwner).addPaymentToken(await evilToken.getAddress());

      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const payment = ethers.parseUnits('10', USDT_DECIMALS);
      await evilToken.mint(investor.address, payment * 2n);
      await evilToken.connect(investor).approve(await controller.getAddress(), payment * 2n);
      await evilToken.configureBuyReentrancy(await controller.getAddress(), await trexToken.getAddress(), tokenAmount);

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), await evilToken.getAddress(), tokenAmount),
      ).to.be.revertedWith('ReentrancyGuard: reentrant call');
    });
  });

  // ===========================================================
  //                          REDEEM
  // ===========================================================

  describe('redeem', () => {
    async function mintTokensToInvestor(trexToken: any, controller: any, investor: HardhatEthersSigner, amount: bigint) {
      // Route through buy() so the investor legitimately holds tokens,
      // exercising the same path production traffic would.
      const price: bigint = await controller.tokenPrice(await trexToken.getAddress());
      const decimals: number = Number(await trexToken.decimals());
      const payment = (amount * price) / 10n ** BigInt(decimals);
      return payment;
    }

    it('burns investor tokens and pays out from issuer to investor, atomically', async () => {
      const {
        investor, issuer, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('2', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount);

      // Issuer now needs payment token on hand + approval to fund the redemption.
      const redeemAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const expectedPayout = ethers.parseUnits('10', USDT_DECIMALS);
      await usdt.mint(issuer.address, expectedPayout);
      await usdt.connect(issuer).approve(await controller.getAddress(), expectedPayout);

      const issuerBalanceBefore = await usdt.balanceOf(issuer.address);

      await expect(
        controller.connect(issuer).redeem(investor.address, await trexToken.getAddress(), await usdt.getAddress(), redeemAmount),
      )
        .to.emit(controller, 'TokensRedeemed')
        .withArgs(
          investor.address,
          await trexToken.getAddress(),
          issuer.address,
          await usdt.getAddress(),
          redeemAmount,
          expectedPayout,
          PRICE,
        );

      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount - redeemAmount);
      expect(await usdt.balanceOf(investor.address)).to.equal(expectedPayout);
      expect(await usdt.balanceOf(issuer.address)).to.equal(issuerBalanceBefore - expectedPayout);
    });

    it('reverts with OnlyIssuerCanRedeem when called by anyone other than the issuer', async () => {
      const {
        investor, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount);

      await expect(
        controller.connect(investor).redeem(investor.address, await trexToken.getAddress(), await usdt.getAddress(), tokenAmount),
      ).to.be.revertedWithCustomError(controller, 'OnlyIssuerCanRedeem');
    });

    it('reverts when the issuer has not approved enough payment token', async () => {
      const {
        investor, issuer, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount);

      await usdt.mint(issuer.address, ethers.parseUnits('10', USDT_DECIMALS));
      // No approval from the issuer.
      await expect(
        controller.connect(issuer).redeem(investor.address, await trexToken.getAddress(), await usdt.getAddress(), tokenAmount),
      ).to.be.reverted;

      // And the investor's tokens must NOT have been burned.
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
    });

    it('reverts when the issuer is approved but underfunded', async () => {
      const {
        investor, issuer, other, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount);

      // buy() just paid the issuer — sweep it away so the issuer is
      // genuinely underfunded for the redemption below.
      await usdt.connect(issuer).transfer(other.address, await usdt.balanceOf(issuer.address));

      // Approve plenty, but the issuer no longer actually holds any payment token.
      await usdt.connect(issuer).approve(await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      await expect(
        controller.connect(issuer).redeem(investor.address, await trexToken.getAddress(), await usdt.getAddress(), tokenAmount),
      ).to.be.reverted;
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
    });

    it('reverts (and moves no funds) when the investor does not hold enough tokens to burn', async () => {
      const {
        investor, issuer, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const redeemAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      await usdt.mint(issuer.address, ethers.parseUnits('10', USDT_DECIMALS));
      await usdt.connect(issuer).approve(await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      // Investor holds zero tokens.
      await expect(
        controller.connect(issuer).redeem(investor.address, await trexToken.getAddress(), await usdt.getAddress(), redeemAmount),
      ).to.be.reverted;
      expect(await usdt.balanceOf(issuer.address)).to.equal(ethers.parseUnits('10', USDT_DECIMALS));
    });

    it('reverts when the controller is not an Agent', async () => {
      const {
        investor, issuer, controller, usdt,
      } = await loadFixture(deployFixture);
      const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
      const notWired = await MockTRexToken.connect(issuer).deploy('Not Wired', 'NW', TOKEN_DECIMALS);
      await controller.connect(issuer).setPrice(await notWired.getAddress(), PRICE);

      await expect(
        controller.connect(issuer).redeem(investor.address, await notWired.getAddress(), await usdt.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWith('AgentRole: caller does not have the Agent role');
    });

    it('reverts with UnsupportedPaymentToken for a non-whitelisted payment token', async () => {
      const { investor, issuer, trexToken, controller } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const notWhitelisted = await MockERC20.deploy('Not Whitelisted', 'NWL', USDT_DECIMALS);

      await expect(
        controller.connect(issuer).redeem(
          investor.address,
          await trexToken.getAddress(),
          await notWhitelisted.getAddress(),
          ethers.parseUnits('1', TOKEN_DECIMALS),
        ),
      )
        .to.be.revertedWithCustomError(controller, 'UnsupportedPaymentToken')
        .withArgs(await notWhitelisted.getAddress());
    });
  });

  // ===========================================================
  //                       VIEW HELPERS
  // ===========================================================

  describe('view helpers', () => {
    it('quoteBuy / quoteRedeem report the same payment amount, price, decimals and issuer', async () => {
      const {
        issuer, trexToken, controller, usdt,
      } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('3', TOKEN_DECIMALS);
      const expectedPayment = ethers.parseUnits('30', USDT_DECIMALS);

      const buyQuote = await controller.quoteBuy(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount);
      const redeemQuote = await controller.quoteRedeem(await trexToken.getAddress(), await usdt.getAddress(), tokenAmount);

      for (const quote of [buyQuote, redeemQuote]) {
        expect(quote.paymentAmount).to.equal(expectedPayment);
        expect(quote.price).to.equal(PRICE);
        expect(quote.tokenDecimals).to.equal(TOKEN_DECIMALS);
        expect(quote.issuer).to.equal(issuer.address);
      }
    });

    it('quoteBuy reverts for a non-whitelisted payment token', async () => {
      const { trexToken, controller, other } = await loadFixture(deployFixture);
      await expect(
        controller.quoteBuy(await trexToken.getAddress(), other.address, ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWithCustomError(controller, 'UnsupportedPaymentToken');
    });

    it('getTokenInfo reflects on-chain issuer/decimals plus stored price and agent status, independent of payment token', async () => {
      const { issuer, trexToken, controller } = await loadFixture(deployFixture);
      const info = await controller.getTokenInfo(await trexToken.getAddress());
      expect(info.issuer).to.equal(issuer.address);
      expect(info.tokenDecimals).to.equal(TOKEN_DECIMALS);
      expect(info.price).to.equal(PRICE);
      expect(info.controllerIsAgent).to.equal(true);
    });
  });
});
