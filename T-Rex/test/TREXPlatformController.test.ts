import { expect } from 'chai';
import { ethers } from 'hardhat';
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
 *  - MockERC20: configurable-decimals ERC20 standing in for USDT.
 *  - ReentrancyERC20: payment token that tries to re-enter buy()/redeem()
 *    from inside transferFrom.
 */
describe('TREXPlatformController', () => {
  const USDT_DECIMALS = 6;
  const TOKEN_DECIMALS = 18;
  // 10 USDT per whole T-REX token, in USDT's 6-decimal smallest units.
  const PRICE = ethers.parseUnits('10', USDT_DECIMALS);

  async function deployFixture() {
    const [deployer, platformOwner, issuer, investor, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const usdt = await MockERC20.deploy('Mock USDT', 'mUSDT', USDT_DECIMALS);

    const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
    const trexToken = await MockTRexToken.connect(issuer).deploy('Security Token', 'SEC', TOKEN_DECIMALS);

    const Controller = await ethers.getContractFactory('TREXPlatformController');
    const controller = await Controller.deploy(platformOwner.address, await usdt.getAddress());

    // Issuer wires the controller in as an Agent — this is the one-time,
    // per-token setup step the issuer performs; everything after this is
    // backend/investor calls with no Agent key involved.
    await trexToken.connect(issuer).addAgent(await controller.getAddress());

    // Only the token's own issuer (its owner()) may set its price — the
    // platform never does, and takes no responsibility for pricing.
    await controller.connect(issuer).setPrice(await trexToken.getAddress(), PRICE);

    return { deployer, platformOwner, issuer, investor, other, usdt, trexToken, controller };
  }

  async function fundAndApprove(usdt: any, from: HardhatEthersSigner, spender: string, amount: bigint) {
    await usdt.mint(from.address, amount);
    await usdt.connect(from).approve(spender, amount);
  }

  // ===========================================================
  //                       CONSTRUCTOR
  // ===========================================================

  describe('constructor', () => {
    it('sets the initial owner and payment token', async () => {
      const { platformOwner, usdt, controller } = await loadFixture(deployFixture);
      expect(await controller.owner()).to.equal(platformOwner.address);
      expect(await controller.paymentToken()).to.equal(await usdt.getAddress());
    });

    it('reverts on a zero-address owner', async () => {
      const { usdt } = await loadFixture(deployFixture);
      const Controller = await ethers.getContractFactory('TREXPlatformController');
      await expect(Controller.deploy(ethers.ZeroAddress, await usdt.getAddress())).to.be.revertedWithCustomError(
        Controller,
        'ZeroAddress',
      );
    });

    it('reverts on a zero-address payment token', async () => {
      const { platformOwner } = await loadFixture(deployFixture);
      const Controller = await ethers.getContractFactory('TREXPlatformController');
      await expect(Controller.deploy(platformOwner.address, ethers.ZeroAddress)).to.be.revertedWithCustomError(
        Controller,
        'ZeroAddress',
      );
    });

    it('leaves the deployer as owner when initialOwner is the deployer', async () => {
      const { deployer, usdt } = await loadFixture(deployFixture);
      const Controller = await ethers.getContractFactory('TREXPlatformController', deployer);
      const controller = await Controller.deploy(deployer.address, await usdt.getAddress());
      expect(await controller.owner()).to.equal(deployer.address);
    });
  });

  // ===========================================================
  //                    ADMIN / CONFIGURATION
  // ===========================================================

  describe('setPaymentToken', () => {
    it('lets the owner update the payment token and emits an event', async () => {
      const { platformOwner, controller, usdt } = await loadFixture(deployFixture);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const newUsdt = await MockERC20.deploy('New USDT', 'nUSDT', USDT_DECIMALS);

      await expect(controller.connect(platformOwner).setPaymentToken(await newUsdt.getAddress()))
        .to.emit(controller, 'PaymentTokenUpdated')
        .withArgs(await usdt.getAddress(), await newUsdt.getAddress());

      expect(await controller.paymentToken()).to.equal(await newUsdt.getAddress());
    });

    it('reverts for non-owner callers', async () => {
      const { other, controller, usdt } = await loadFixture(deployFixture);
      await expect(controller.connect(other).setPaymentToken(await usdt.getAddress())).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('reverts on the zero address', async () => {
      const { platformOwner, controller } = await loadFixture(deployFixture);
      await expect(controller.connect(platformOwner).setPaymentToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        controller,
        'ZeroAddress',
      );
    });
  });

  describe('setPrice', () => {
    it("lets the token's own issuer set and update a price, emitting old/new", async () => {
      const { issuer, controller, trexToken } = await loadFixture(deployFixture);
      const newPrice = ethers.parseUnits('12', USDT_DECIMALS);

      await expect(controller.connect(issuer).setPrice(await trexToken.getAddress(), newPrice))
        .to.emit(controller, 'TokenPriceUpdated')
        .withArgs(await trexToken.getAddress(), PRICE, newPrice);

      expect(await controller.tokenPrice(await trexToken.getAddress())).to.equal(newPrice);
    });

    it('reverts with NotTokenOwner for anyone other than the token issuer, including the platform owner', async () => {
      const { platformOwner, other, controller, trexToken } = await loadFixture(deployFixture);

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
      const { platformOwner, investor, trexToken, controller, usdt } = await loadFixture(deployFixture);
      await controller.connect(platformOwner).pause();

      await expect(controller.connect(investor).buy(await trexToken.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS))).to.be.revertedWith(
        'Pausable: paused',
      );
      await expect(
        controller.connect(investor).redeem(await trexToken.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWith('Pausable: paused');
    });
  });

  // ===========================================================
  //                            BUY
  // ===========================================================

  describe('buy', () => {
    it('transfers USDT investor -> issuer and mints tokens to the investor, atomically', async () => {
      const { investor, issuer, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('2.5', TOKEN_DECIMALS); // 2.5 tokens
      const expectedPayment = ethers.parseUnits('25', USDT_DECIMALS); // 2.5 * 10 USDT

      await fundAndApprove(usdt, investor, await controller.getAddress(), expectedPayment);

      await expect(controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount))
        .to.emit(controller, 'TokensPurchased')
        .withArgs(investor.address, await trexToken.getAddress(), issuer.address, tokenAmount, expectedPayment, PRICE);

      expect(await usdt.balanceOf(investor.address)).to.equal(0n);
      expect(await usdt.balanceOf(issuer.address)).to.equal(expectedPayment);
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
      // Controller never custodies funds or tokens.
      expect(await usdt.balanceOf(await controller.getAddress())).to.equal(0n);
    });

    it('reverts with InvalidAmount for a zero amount', async () => {
      const { investor, trexToken, controller } = await loadFixture(deployFixture);
      await expect(controller.connect(investor).buy(await trexToken.getAddress(), 0n)).to.be.revertedWithCustomError(
        controller,
        'InvalidAmount',
      );
    });

    it('reverts with InvalidPrice when no price has been set for the token', async () => {
      const { investor, issuer, controller } = await loadFixture(deployFixture);
      const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
      const unpriced = await MockTRexToken.connect(issuer).deploy('Other Token', 'OTH', TOKEN_DECIMALS);
      await unpriced.connect(issuer).addAgent(await controller.getAddress());

      await expect(
        controller.connect(investor).buy(await unpriced.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWithCustomError(controller, 'InvalidPrice');
    });

    it('reverts with InvalidToken for a non-contract address', async () => {
      const { investor, other, controller } = await loadFixture(deployFixture);
      await expect(
        controller.connect(investor).buy(other.address, ethers.parseUnits('1', TOKEN_DECIMALS)),
      ).to.be.revertedWithCustomError(controller, 'InvalidToken');
    });

    it('reverts with NotAgentOfToken when the controller has not been added as an Agent', async () => {
      const { investor, issuer, controller } = await loadFixture(deployFixture);
      const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
      const notWired = await MockTRexToken.connect(issuer).deploy('Not Wired', 'NW', TOKEN_DECIMALS);
      await controller.connect(issuer).setPrice(await notWired.getAddress(), PRICE);

      await expect(controller.connect(investor).buy(await notWired.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)))
        .to.be.revertedWithCustomError(controller, 'NotAgentOfToken')
        .withArgs(await notWired.getAddress());
    });

    it('reverts with InsufficientInvestorAllowance when not enough USDT is approved', async () => {
      const { investor, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      await usdt.mint(investor.address, ethers.parseUnits('10', USDT_DECIMALS));
      // No approval at all.
      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount),
      ).to.be.revertedWithCustomError(controller, 'InsufficientInvestorAllowance');
    });

    it('reverts with InsufficientInvestorBalance when approved but underfunded', async () => {
      const { investor, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS); // needs 10 USDT
      // Approve plenty, but never mint any USDT to the investor.
      await usdt.connect(investor).approve(await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      await expect(
        controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount),
      ).to.be.revertedWithCustomError(controller, 'InsufficientInvestorBalance');
    });

    it('is atomic: if T-REX mint reverts, no USDT moves', async () => {
      const { investor, issuer, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const payment = ethers.parseUnits('10', USDT_DECIMALS);
      await fundAndApprove(usdt, investor, await controller.getAddress(), payment);

      await trexToken.setMintShouldRevert(true);

      await expect(controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount)).to.be.revertedWith(
        'MockTRexToken: mint blocked (simulated compliance failure)',
      );

      expect(await usdt.balanceOf(investor.address)).to.equal(payment);
      expect(await usdt.balanceOf(issuer.address)).to.equal(0n);
    });

    it('blocks a reentrant call through a malicious payment token', async () => {
      const { investor, trexToken, controller } = await loadFixture(deployFixture);
      const ReentrantERC20 = await ethers.getContractFactory('ReentrantERC20');
      const evilUsdt = await ReentrantERC20.deploy();

      const controllerOwner = await controller.owner();
      await ethers.provider.send('hardhat_impersonateAccount', [controllerOwner]);
      const ownerSigner = await ethers.getSigner(controllerOwner);
      await controller.connect(ownerSigner).setPaymentToken(await evilUsdt.getAddress());

      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const payment = ethers.parseUnits('10', USDT_DECIMALS);
      await evilUsdt.mint(investor.address, payment * 2n);
      await evilUsdt.connect(investor).approve(await controller.getAddress(), payment * 2n);
      await evilUsdt.configureBuyReentrancy(await controller.getAddress(), await trexToken.getAddress(), tokenAmount);

      await expect(controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount)).to.be.revertedWith(
        'ReentrancyGuard: reentrant call',
      );
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

    it('burns investor tokens and pays out USDT from issuer to investor, atomically', async () => {
      const { investor, issuer, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('2', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount);

      // Issuer now needs USDT on hand + approval to fund the redemption.
      const redeemAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const expectedPayout = ethers.parseUnits('10', USDT_DECIMALS);
      await usdt.mint(issuer.address, expectedPayout);
      await usdt.connect(issuer).approve(await controller.getAddress(), expectedPayout);

      const issuerUsdtBefore = await usdt.balanceOf(issuer.address);

      await expect(controller.connect(investor).redeem(await trexToken.getAddress(), redeemAmount))
        .to.emit(controller, 'TokensRedeemed')
        .withArgs(investor.address, await trexToken.getAddress(), issuer.address, redeemAmount, expectedPayout, PRICE);

      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount - redeemAmount);
      expect(await usdt.balanceOf(investor.address)).to.equal(expectedPayout);
      expect(await usdt.balanceOf(issuer.address)).to.equal(issuerUsdtBefore - expectedPayout);
    });

    it('reverts with InsufficientIssuerAllowance when the issuer has not approved enough', async () => {
      const { investor, issuer, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount);

      await usdt.mint(issuer.address, ethers.parseUnits('10', USDT_DECIMALS));
      // No approval from the issuer.
      await expect(
        controller.connect(investor).redeem(await trexToken.getAddress(), tokenAmount),
      ).to.be.revertedWithCustomError(controller, 'InsufficientIssuerAllowance');

      // And the investor's tokens must NOT have been burned.
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
    });

    it('reverts with InsufficientIssuerBalance when the issuer is approved but underfunded', async () => {
      const { investor, issuer, other, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      const buyPayment = await mintTokensToInvestor(trexToken, controller, investor, tokenAmount);
      await fundAndApprove(usdt, investor, await controller.getAddress(), buyPayment);
      await controller.connect(investor).buy(await trexToken.getAddress(), tokenAmount);

      // buy() just paid the issuer in USDT — sweep it away so the issuer is
      // genuinely underfunded for the redemption below.
      await usdt.connect(issuer).transfer(other.address, await usdt.balanceOf(issuer.address));

      // Approve plenty, but the issuer no longer actually holds any USDT.
      await usdt.connect(issuer).approve(await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      await expect(
        controller.connect(investor).redeem(await trexToken.getAddress(), tokenAmount),
      ).to.be.revertedWithCustomError(controller, 'InsufficientIssuerBalance');
      expect(await trexToken.balanceOf(investor.address)).to.equal(tokenAmount);
    });

    it('reverts (and moves no funds) when the investor does not hold enough tokens to burn', async () => {
      const { investor, issuer, trexToken, controller, usdt } = await loadFixture(deployFixture);
      const redeemAmount = ethers.parseUnits('1', TOKEN_DECIMALS);
      await usdt.mint(issuer.address, ethers.parseUnits('10', USDT_DECIMALS));
      await usdt.connect(issuer).approve(await controller.getAddress(), ethers.parseUnits('10', USDT_DECIMALS));

      // Investor holds zero tokens.
      await expect(controller.connect(investor).redeem(await trexToken.getAddress(), redeemAmount)).to.be.reverted;
      expect(await usdt.balanceOf(issuer.address)).to.equal(ethers.parseUnits('10', USDT_DECIMALS));
    });

    it('reverts with NotAgentOfToken when the controller is not an Agent', async () => {
      const { investor, issuer, controller } = await loadFixture(deployFixture);
      const MockTRexToken = await ethers.getContractFactory('MockTRexToken');
      const notWired = await MockTRexToken.connect(issuer).deploy('Not Wired', 'NW', TOKEN_DECIMALS);
      await controller.connect(issuer).setPrice(await notWired.getAddress(), PRICE);

      await expect(controller.connect(investor).redeem(await notWired.getAddress(), ethers.parseUnits('1', TOKEN_DECIMALS)))
        .to.be.revertedWithCustomError(controller, 'NotAgentOfToken')
        .withArgs(await notWired.getAddress());
    });
  });

  // ===========================================================
  //                       VIEW HELPERS
  // ===========================================================

  describe('view helpers', () => {
    it('quoteBuy / quoteRedeem report the same payment amount, price, decimals and issuer', async () => {
      const { issuer, trexToken, controller } = await loadFixture(deployFixture);
      const tokenAmount = ethers.parseUnits('3', TOKEN_DECIMALS);
      const expectedPayment = ethers.parseUnits('30', USDT_DECIMALS);

      const buyQuote = await controller.quoteBuy(await trexToken.getAddress(), tokenAmount);
      const redeemQuote = await controller.quoteRedeem(await trexToken.getAddress(), tokenAmount);

      for (const quote of [buyQuote, redeemQuote]) {
        expect(quote.paymentAmount).to.equal(expectedPayment);
        expect(quote.price).to.equal(PRICE);
        expect(quote.tokenDecimals).to.equal(TOKEN_DECIMALS);
        expect(quote.issuer).to.equal(issuer.address);
      }
    });

    it('getTokenInfo reflects on-chain issuer/decimals plus stored price and agent status', async () => {
      const { issuer, trexToken, controller } = await loadFixture(deployFixture);
      const info = await controller.getTokenInfo(await trexToken.getAddress());
      expect(info.issuer).to.equal(issuer.address);
      expect(info.tokenDecimals).to.equal(TOKEN_DECIMALS);
      expect(info.price).to.equal(PRICE);
      expect(info.controllerIsAgent).to.equal(true);
    });
  });
});
