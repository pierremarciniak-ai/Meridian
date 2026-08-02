import { network } from "hardhat";
import { expect } from "chai";

// Ordre des enums tel que déclaré dans InternalFunctions.sol
const WorkflowStatus = {
  Unset: 0,
  Initialized: 1,
  Created: 2,
  Signed: 3,
  Finished: 4,
  Aborted: 5,
};
const Currency = { USDC: 0, USDT: 1, EURC: 2 };
const TransactionCondition = { AtTheBeginningOfDelivery: 0, AtTheEndOfDelivery: 1 };
const TransactionModel = { FullLocked: 0, PartialLocked: 1, PartialImmediate: 2, Free: 3 };
const AdvancePaymentMode = { Immediate: 0, Deferred: 1 };
const UserType = { Buyer: 0, Seller: 1 };

describe("Meridian", function () {
  // --- Fixture de déploiement -------------------------------------------
  // On redéploie systématiquement des contrats frais dans chaque test
  // (plutôt que de réutiliser les adresses d'un déploiement manuel figé),
  // pour que la suite de tests soit isolée et rejouable indéfiniment via
  // `npx hardhat test`, indépendamment de l'état d'un node local qui aurait
  // pu tourner entre-temps.
  async function deployFixture() {
    const { ethers } = await network.getOrCreate();

    const [deployer, buyer, seller, other] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockERC20", ["Mock USDC", "USDC", 6]);
    const usdt = await ethers.deployContract("MockERC20", ["Mock USDT", "USDT", 6]);
    const eurc = await ethers.deployContract("MockERC20", ["Mock EURC", "EURC", 6]);

    const meridian = await ethers.deployContract("Meridian");

    await meridian.setTokenAddress(Currency.USDC, await usdc.getAddress());
    await meridian.setTokenAddress(Currency.USDT, await usdt.getAddress());
    await meridian.setTokenAddress(Currency.EURC, await eurc.getAddress());

    const mintAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(buyer.address, mintAmount);
    await usdt.mint(buyer.address, mintAmount);
    await eurc.mint(buyer.address, mintAmount);

    return { ethers, meridian, usdc, usdt, eurc, deployer, buyer, seller, other, mintAmount };
  }

  // --- Helpers -------------------------------------------------------------

  async function futureDate(ethersLib: any, daysFromNow = 30) {
    const latestBlock = await ethersLib.provider.getBlock("latest");
    return latestBlock!.timestamp + daysFromNow * 24 * 60 * 60;
  }

  function buildDetails(overrides: Partial<any> = {}, defaults: any) {
    return {
      currency: Currency.USDC,
      transactionCondition: TransactionCondition.AtTheEndOfDelivery,
      transactionModel: TransactionModel.PartialLocked,
      advancePaymentMode: AdvancePaymentMode.Deferred,
      advanceAmount: 0,
      totalAmount: defaults.totalAmount,
      transactionCancellingDate: defaults.transactionCancellingDate,
      ...overrides,
    };
  }

  // Fait avancer une transaction jusqu'à l'état Signed (utilisé par les tests
  // de depositFunds / withdrawFunds, qui exigent cet état préalable).
  async function createAndSignTransaction(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    detailsOverrides: Partial<any> = {},
    logisticsOverrides: Partial<any> = {}
  ) {
    const { ethers, meridian, buyer, seller } = ctx;
    const totalAmount = ethers.parseUnits("1000", 6);
    const cancellingDate = await futureDate(ethers);

    const details = buildDetails(detailsOverrides, { totalAmount, transactionCancellingDate: cancellingDate });
    const billNumber = "BILL-0001";

    const tx = await meridian.connect(buyer).initializeTransaction(details, billNumber);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log: any) => {
        try {
          return meridian.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "TransactionInitialized");
    const transactionID = event!.args.transactionID;

    await meridian.connect(seller).createTransaction(transactionID, billNumber);

    const logistics = {
      departureDate: await futureDate(ethers, 5),
      arrivalDate: await futureDate(ethers, 20),
      containerReference: "CONT-REF-001",
      ...logisticsOverrides,
    };
    await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details);

    await meridian.connect(seller).signTransactionSeller(transactionID);
    await meridian.connect(buyer).signTransactionBuyer(transactionID);

    return { transactionID, details, logistics, totalAmount, billNumber };
  }

  // =========================================================================
  // setTokenAddress
  // =========================================================================
  describe("setTokenAddress", function () {
    it("permet au owner de configurer une adresse de token", async function () {
      const { meridian, usdc } = await deployFixture();
      expect(await meridian.tokenAddresses(Currency.USDC)).to.equal(await usdc.getAddress());
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other, usdc } = await deployFixture();
      await expect(
        meridian.connect(other).setTokenAddress(Currency.USDC, await usdc.getAddress())
      )
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("refuse l'adresse zéro", async function () {
      const { meridian, deployer } = await deployFixture();
      await expect(
        meridian.connect(deployer).setTokenAddress(Currency.USDC, "0x0000000000000000000000000000000000000000")
      ).to.be.revertedWith("Invalid token address");
    });
  });

  // =========================================================================
  // initializeTransaction
  // =========================================================================
  describe("initializeTransaction", function () {
    it("crée une transaction avec le statut Initialized", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;

      const totalAmount = ethers.parseUnits("500", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-A"))
        .to.emit(meridian, "TransactionInitialized");

      const tx = await meridian.connect(buyer).initializeTransaction(details, "BILL-B");
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionInitialized");
      const transactionID = parsed!.args.transactionID;

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Initialized);
      expect(stored.buyer.userAddress).to.equal(buyer.address);
      expect(stored.totalAmount).to.equal(totalAmount);
      expect(stored.billNumber).to.equal("BILL-B");
    });

    it("calcule correctement advanceAmount pour PartialLocked (30%)", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;

      const totalAmount = ethers.parseUnits("1000", 6);
      const advanceInput = ethers.parseUnits("1000", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails(
        { transactionModel: TransactionModel.PartialLocked, advanceAmount: advanceInput },
        { totalAmount, transactionCancellingDate: cancellingDate }
      );

      const tx = await meridian.connect(buyer).initializeTransaction(details, "BILL-PL");
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionInitialized");
      const transactionID = parsed!.args.transactionID;

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.advanceAmount).to.equal((advanceInput * 30n) / 100n);
      expect(stored.advancePaymentMode).to.equal(AdvancePaymentMode.Deferred);
    });

    it("refuse un totalAmount à zéro", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount: 0, transactionCancellingDate: cancellingDate });

      await expect(
        meridian.connect(buyer).initializeTransaction(details, "BILL-ZERO")
      ).to.be.revertedWith("Total amount must be greater than zero");
    });

    it("refuse une date d'annulation dans le passé", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const totalAmount = ethers.parseUnits("100", 6);
      const pastDate = (await futureDate(ethers, 0)) - 1000;
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: pastDate });

      await expect(
        meridian.connect(buyer).initializeTransaction(details, "BILL-PAST")
      ).to.be.revertedWith("Transaction cancelling date must be in the future");
    });

    it("refuse un billNumber vide", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(
        meridian.connect(buyer).initializeTransaction(details, "")
      ).to.be.revertedWith("Bill number cannot be empty");
    });
  });

  // =========================================================================
  // createTransaction
  // =========================================================================
  describe("createTransaction", function () {
    async function initOnly(ctx: Awaited<ReturnType<typeof deployFixture>>, billNumber = "BILL-CT") {
      const { ethers, meridian, buyer } = ctx;
      const totalAmount = ethers.parseUnits("200", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      const tx = await meridian.connect(buyer).initializeTransaction(details, billNumber);
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionInitialized");
      return parsed!.args.transactionID;
    }

    it("permet au vendeur de créer la transaction avec le bon bill number", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const transactionID = await initOnly(ctx, "BILL-OK");

      await expect(meridian.connect(seller).createTransaction(transactionID, "BILL-OK"))
        .to.emit(meridian, "TransactionCreated")
        .withArgs(transactionID, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Created);
      expect(stored.seller.userAddress).to.equal(seller.address);
    });

    it("refuse un bill number qui ne correspond pas", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const transactionID = await initOnly(ctx, "BILL-REAL");

      await expect(
        meridian.connect(seller).createTransaction(transactionID, "BILL-WRONG")
      ).to.be.revertedWith("Bill number does not match");
    });

    it("refuse une transaction qui n'est pas dans l'état Initialized", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const transactionID = await initOnly(ctx, "BILL-TWICE");

      await meridian.connect(seller).createTransaction(transactionID, "BILL-TWICE");

      await expect(
        meridian.connect(seller).createTransaction(transactionID, "BILL-TWICE")
      ).to.be.revertedWith("Transaction is not in the initialized state");
    });

    it("refuse un bill number vide", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const transactionID = await initOnly(ctx, "BILL-EMPTY");

      await expect(
        meridian.connect(seller).createTransaction(transactionID, "")
      ).to.be.revertedWith("Bill number cannot be empty");
    });
  });

  // =========================================================================
  // saveTransactionDetailsSeller / saveTransactionDetailsBuyer
  // =========================================================================
  describe("saveTransactionDetailsSeller / saveTransactionDetailsBuyer", function () {
    async function initAndCreate(ctx: Awaited<ReturnType<typeof deployFixture>>) {
      const { ethers, meridian, buyer, seller } = ctx;
      const totalAmount = ethers.parseUnits("300", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      const tx = await meridian.connect(buyer).initializeTransaction(details, "BILL-STD");
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionInitialized");
      const transactionID = parsed!.args.transactionID;

      await meridian.connect(seller).createTransaction(transactionID, "BILL-STD");
      return { transactionID, details };
    }

    it("permet au vendeur de renseigner les infos logistiques", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      const logistics = {
        departureDate: await futureDate(ethers, 5),
        arrivalDate: await futureDate(ethers, 15),
        containerReference: "MEDU1234567",
      };

      await expect(meridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details))
        .to.emit(meridian, "TransactionDetailsSaved")
        .withArgs(transactionID, UserType.Seller, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.sellerDepartureDate).to.equal(logistics.departureDate);
      expect(stored.sellerArrivalDate).to.equal(logistics.arrivalDate);
      expect(stored.containerReference).to.equal(logistics.containerReference);
    });

    it("refuse une arrivalDate antérieure ou égale à departureDate", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      const sameDate = await futureDate(ethers, 5);
      const logistics = { departureDate: sameDate, arrivalDate: sameDate, containerReference: "REF" };

      await expect(
        meridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details)
      ).to.be.revertedWith("Arrival date must be after departure date");
    });

    it("refuse une containerReference vide", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      const logistics = {
        departureDate: await futureDate(ethers, 5),
        arrivalDate: await futureDate(ethers, 15),
        containerReference: "",
      };

      await expect(
        meridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details)
      ).to.be.revertedWith("Container reference cannot be empty");
    });

    it("refuse l'appel par quelqu'un d'autre que le vendeur déclaré", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, other } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      const logistics = {
        departureDate: await futureDate(ethers, 5),
        arrivalDate: await futureDate(ethers, 15),
        containerReference: "REF",
      };

      await expect(
        meridian.connect(other).saveTransactionDetailsSeller(transactionID, logistics, details)
      ).to.be.revertedWith("You're not the declared seller");
    });

    it("permet à l'acheteur de mettre à jour les détails communs", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      const newDetails = { ...details, totalAmount: ethers.parseUnits("350", 6) };

      await expect(meridian.connect(buyer).saveTransactionDetailsBuyer(transactionID, newDetails))
        .to.emit(meridian, "TransactionDetailsSaved")
        .withArgs(transactionID, UserType.Buyer, buyer.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.totalAmount).to.equal(newDetails.totalAmount);
    });

    it("réinitialise les signatures après une mise à jour des détails", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      await meridian.connect(seller).signTransactionSeller(transactionID);
      expect((await meridian.getTransaction(transactionID)).signedBySeller).to.equal(true);

      await meridian.connect(buyer).saveTransactionDetailsBuyer(transactionID, details);

      expect((await meridian.getTransaction(transactionID)).signedBySeller).to.equal(false);
    });

    it("refuse l'appel par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID, details } = await initAndCreate(ctx);

      await expect(
        meridian.connect(other).saveTransactionDetailsBuyer(transactionID, details)
      ).to.be.revertedWith("You're not the declared buyer");
    });
  });

  // =========================================================================
  // signTransactionSeller / signTransactionBuyer
  // =========================================================================
  describe("signTransactionSeller / signTransactionBuyer", function () {
    async function initCreateAndLogistics(ctx: Awaited<ReturnType<typeof deployFixture>>) {
      const { ethers, meridian, buyer, seller } = ctx;
      const totalAmount = ethers.parseUnits("400", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      const tx = await meridian.connect(buyer).initializeTransaction(details, "BILL-SIGN");
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionInitialized");
      const transactionID = parsed!.args.transactionID;

      await meridian.connect(seller).createTransaction(transactionID, "BILL-SIGN");
      return transactionID;
    }

    it("passe en TransactionSigned quand les deux parties ont signé", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer, seller } = ctx;
      const transactionID = await initCreateAndLogistics(ctx);

      await expect(meridian.connect(seller).signTransactionSeller(transactionID))
        .to.emit(meridian, "TransactionPartiallySigned")
        .withArgs(transactionID, UserType.Seller, seller.address);

      expect((await meridian.getTransaction(transactionID)).workflowStatus).to.equal(WorkflowStatus.Created);

      await expect(meridian.connect(buyer).signTransactionBuyer(transactionID))
        .to.emit(meridian, "TransactionSigned")
        .withArgs(transactionID, buyer.address, seller.address);

      expect((await meridian.getTransaction(transactionID)).workflowStatus).to.equal(WorkflowStatus.Signed);
    });

    it("refuse la signature vendeur par un autre compte", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const transactionID = await initCreateAndLogistics(ctx);

      await expect(
        meridian.connect(other).signTransactionSeller(transactionID)
      ).to.be.revertedWith("You're not the declared seller");
    });

    it("refuse la signature acheteur par un autre compte", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const transactionID = await initCreateAndLogistics(ctx);

      await expect(
        meridian.connect(other).signTransactionBuyer(transactionID)
      ).to.be.revertedWith("You're not the declared buyer");
    });
  });

  // =========================================================================
  // depositFunds
  // =========================================================================
  describe("depositFunds", function () {
    it("effectue un dépôt partiel (PartialLocked) et met à jour depositedAmount", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.PartialLocked,
        advanceAmount: ethers.parseUnits("1000", 6),
      });

      const expectedAdvance = (ethers.parseUnits("1000", 6) * 30n) / 100n;

      await usdc.connect(buyer).approve(await meridian.getAddress(), expectedAdvance);

      await expect(meridian.connect(buyer).depositFunds(transactionID))
        .to.emit(meridian, "FundsDeposited")
        .withArgs(transactionID, buyer.address, expectedAdvance, Currency.USDC);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.depositedAmount).to.equal(expectedAdvance);
      expect(stored.pendingWithdrawalAmount).to.equal(expectedAdvance);
      expect(stored.depositCompleted).to.equal(expectedAdvance >= totalAmount);
    });

    it("marque depositCompleted à true pour un FullLocked déposé en une fois", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.depositedAmount).to.equal(totalAmount);
      expect(stored.depositCompleted).to.equal(true);
    });

    it("permet un second dépôt complémentaire jusqu'à couvrir totalAmount", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const { transactionID } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.PartialLocked, advanceAmount: totalAmount }
      );

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      let stored = await meridian.getTransaction(transactionID);
      expect(stored.depositCompleted).to.equal(false);

      // Second dépôt : calculateDepositAmount doit désormais retourner le reliquat
      await meridian.connect(buyer).depositFunds(transactionID);

      stored = await meridian.getTransaction(transactionID);
      expect(stored.depositedAmount).to.equal(totalAmount);
      expect(stored.depositCompleted).to.equal(true);
    });

    it("refuse un second dépôt une fois depositCompleted déjà atteint", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await expect(
        meridian.connect(buyer).depositFunds(transactionID)
      ).to.be.revertedWith("Payment already completed");
    });

    it("refuse l'appel par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      await expect(
        meridian.connect(other).depositFunds(transactionID)
      ).to.be.revertedWith("You're not the declared buyer");
    });

    it("refuse si le token de la devise n'est pas configuré", async function () {
      const ctx = await deployFixture();
      const { ethers, buyer, seller } = ctx;

      // Nouveau contrat Meridian sans setTokenAddress pour EURC
      const freshMeridian = await ethers.deployContract("Meridian");
      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails(
        { currency: Currency.EURC, transactionModel: TransactionModel.FullLocked },
        { totalAmount, transactionCancellingDate: cancellingDate }
      );

      const tx = await freshMeridian.connect(buyer).initializeTransaction(details, "BILL-NOTOKEN");
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return freshMeridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionInitialized");
      const transactionID = parsed!.args.transactionID;

      await freshMeridian.connect(seller).createTransaction(transactionID, "BILL-NOTOKEN");
      const logistics = {
        departureDate: await futureDate(ethers, 5),
        arrivalDate: await futureDate(ethers, 15),
        containerReference: "REF",
      };
      await freshMeridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details);
      await freshMeridian.connect(seller).signTransactionSeller(transactionID);
      await freshMeridian.connect(buyer).signTransactionBuyer(transactionID);

      await expect(
        freshMeridian.connect(buyer).depositFunds(transactionID)
      ).to.be.revertedWith("Token address not configured for this currency");
    });

    it("abandonne silencieusement (sans revert) si la date limite est dépassée", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;

      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      const stored = await meridian.getTransaction(transactionID);
      const latestBlock = await ethers.provider.getBlock("latest");
      const jumpSeconds = Number(stored.transactionCancellingDate) - latestBlock!.timestamp + 10;
      await ethers.provider.send("evm_increaseTime", [jumpSeconds]);
      await ethers.provider.send("evm_mine", []);

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);

      await expect(meridian.connect(buyer).depositFunds(transactionID)).to.emit(
        meridian,
        "TransactionDateOverdue"
      );

      const after = await meridian.getTransaction(transactionID);
      expect(after.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(after.depositedAmount).to.equal(0);
    });
  });

  // =========================================================================
  // withdrawFunds
  // =========================================================================
  describe("withdrawFunds", function () {
    it("refuse s'il n'y a rien à retirer", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      await expect(
        meridian.connect(seller).withdrawFunds(transactionID)
      ).to.be.revertedWith("Nothing to withdraw");
    });

    it("permet au vendeur de retirer les fonds déposés et transfère les tokens", async function () {
      const ctx = await deployFixture();
      const { usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await ctx.meridian.getAddress(), totalAmount);
      await ctx.meridian.connect(buyer).depositFunds(transactionID);

      const sellerBalanceBefore = await usdc.balanceOf(seller.address);

      await expect(ctx.meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(ctx.meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, totalAmount, Currency.USDC);

      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(totalAmount);

      const stored = await ctx.meridian.getTransaction(transactionID);
      expect(stored.pendingWithdrawalAmount).to.equal(0);
    });

    it("passe la transaction en TransactionFinished quand tout est retiré et déposé", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "TransactionFinished")
        .withArgs(transactionID, buyer.address, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Finished);
      expect(stored.withdrawalCompleted).to.equal(true);
    });

    it("ne passe PAS en Finished si le dépôt total n'est pas complet", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const totalAmount = ethersParse(ctx, "1000");
      const { transactionID } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.PartialLocked,
        advanceAmount: totalAmount,
      });

      const advance = (totalAmount * 30n) / 100n;
      await usdc.connect(buyer).approve(await meridian.getAddress(), advance);
      await meridian.connect(buyer).depositFunds(transactionID);

      await meridian.connect(seller).withdrawFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Signed); // pas Finished
      expect(stored.withdrawalCompleted).to.equal(false);
    });

    it("refuse un second retrait une fois withdrawalCompleted atteint", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);
      await meridian.connect(seller).withdrawFunds(transactionID);

      await expect(
        meridian.connect(seller).withdrawFunds(transactionID)
      ).to.be.revertedWith("Transaction is not in the signed state");
    });

    it("refuse l'appel par quelqu'un d'autre que le vendeur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      await expect(
        meridian.connect(other).withdrawFunds(transactionID)
      ).to.be.revertedWith("You're not the declared seller");
    });
  });

  // =========================================================================
  // getTransaction
  // =========================================================================
  describe("getTransaction", function () {
    it("retourne une struct vide pour un transactionID inconnu", async function () {
      const ctx = await deployFixture();
      const { meridian } = ctx;

      const unknown = await meridian.getTransaction(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
      );
      expect(unknown.workflowStatus).to.equal(WorkflowStatus.Unset);
      expect(unknown.totalAmount).to.equal(0);
    });

    it("reflète fidèlement l'état après plusieurs étapes", async function () {
      const ctx = await deployFixture();
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx);

      const stored = await ctx.meridian.getTransaction(transactionID);
      expect(stored.totalAmount).to.equal(totalAmount);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Signed);
      expect(stored.signedByBuyer).to.equal(true);
      expect(stored.signedBySeller).to.equal(true);
    });
  });
});

function ethersParse(ctx: any, amount: string) {
  return ctx.ethers.parseUnits(amount, 6);
}
