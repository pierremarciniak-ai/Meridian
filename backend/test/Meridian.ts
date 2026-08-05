import { network } from "hardhat";
import { expect } from "chai";

// Ordre des enums tel que déclaré dans InternalFunctions.sol
const WorkflowStatus = {
  Unset: 0,
  Initialized: 1,
  Created: 2,
  Signed: 3,
  Completed: 4,
  Aborted: 5,
};
const Currency = { USDC: 0, USDT: 1, EURC: 2 };
const TransactionCondition = { AtTheBeginningOfDelivery: 0, AtTheEndOfDelivery: 1 };
const TransactionModel = { FullLocked: 0, PartialLocked: 1, PartialImmediate: 2, Free: 3 };
const AdvancePaymentMode = { Immediate: 0, Deferred: 1 };
const UserType = { Buyer: 0, Seller: 1 };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

    // Deux oracles distincts (mock + "réel") pour pouvoir tester
    // indépendamment toggleMockSanctionsOracle. checkSanctionsEnabled et
    // mockSanctionsEnabled valent déjà true par défaut dans le contrat :
    // sans ce câblage, tout appel passant par onlyUnsanctioned (donc
    // initializeTransaction/createTransaction) revert au niveau bas (appel
    // vers l'adresse zéro).
    const mockSanctionsOracle = await ethers.deployContract("SanctionsList");
    const sanctionsOracle = await ethers.deployContract("SanctionsList");
    await meridian.setMockSanctionsOracleAddress(await mockSanctionsOracle.getAddress());
    await meridian.setSanctionsOracleAddress(await sanctionsOracle.getAddress());

    // Meridian doit être owner de MeridianNFT (onlyOwner sur mintOne), et
    // c'est Meridian qui doit connaître l'adresse de MeridianNFT en retour.
    const meridianNFT = await ethers.deployContract("MeridianNFT", [await meridian.getAddress()]);
    await meridian.setMeridianNFTAddress(await meridianNFT.getAddress());

    const mintAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(buyer.address, mintAmount);
    await usdt.mint(buyer.address, mintAmount);
    await eurc.mint(buyer.address, mintAmount);

    return {
      ethers,
      meridian,
      meridianNFT,
      usdc,
      usdt,
      eurc,
      mockSanctionsOracle,
      sanctionsOracle,
      deployer,
      buyer,
      seller,
      other,
      mintAmount,
    };
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

  async function extractTransactionID(meridian: any, tx: any) {
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

  // Initialise une transaction et retourne son ID + les détails utilisés.
  async function initializeOnly(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    billNumber: string,
    detailsOverrides: Partial<any> = {},
    amount = "200"
  ) {
    const { ethers, meridian, buyer } = ctx;
    const totalAmount = ethers.parseUnits(amount, 6);
    const cancellingDate = await futureDate(ethers);
    const details = buildDetails(detailsOverrides, { totalAmount, transactionCancellingDate: cancellingDate });

    const tx = await meridian.connect(buyer).initializeTransaction(details, billNumber);
    const transactionID = await extractTransactionID(meridian, tx);
    return { transactionID, details };
  }

  // Initialise puis fait créer la transaction par le vendeur (état Created).
  async function initAndCreate(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    billNumber: string,
    detailsOverrides: Partial<any> = {},
    amount = "200"
  ) {
    const { meridian, seller } = ctx;
    const { transactionID, details } = await initializeOnly(ctx, billNumber, detailsOverrides, amount);
    await meridian.connect(seller).createTransaction(transactionID, billNumber);
    return { transactionID, details };
  }

  // Fait avancer une transaction jusqu'à l'état Signed (utilisé par les tests
  // de depositFunds / withdrawFunds / rollbackDeposit, qui exigent cet état
  // préalable).
  async function createAndSignTransaction(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    detailsOverrides: Partial<any> = {},
    logisticsOverrides: Partial<any> = {},
    billNumber = "BILL-SIGNED"
  ) {
    const { ethers, meridian, buyer, seller } = ctx;
    const { transactionID, details } = await initAndCreate(ctx, billNumber, detailsOverrides, "1000");

    const logistics = {
      departureDate: await futureDate(ethers, 5),
      arrivalDate: await futureDate(ethers, 20),
      containerReference: "CONT-REF-001",
      ...logisticsOverrides,
    };
    await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details);

    await meridian.connect(seller).signTransactionSeller(transactionID);
    await meridian.connect(buyer).signTransactionBuyer(transactionID);

    return { transactionID, details, logistics, totalAmount: details.totalAmount, billNumber };
  }

  // Fait avancer le temps jusqu'après transactionCancellingDate.
  async function jumpPastCancellingDate(ethersLib: any, cancellingDate: bigint | number) {
    const latestBlock = await ethersLib.provider.getBlock("latest");
    const jumpSeconds = Number(cancellingDate) - latestBlock!.timestamp + 10;
    await ethersLib.provider.send("evm_increaseTime", [jumpSeconds]);
    await ethersLib.provider.send("evm_mine", []);
  }

  // =========================================================================
  // setTokenAddress
  // =========================================================================
  describe("setTokenAddress", function () {
    it("permet au owner de configurer une adresse de token", async function () {
      const { meridian, usdc } = await deployFixture();
      expect(await meridian.tokenAddresses(Currency.USDC)).to.equal(await usdc.getAddress());
    });

    it("émet TokenAddressUpdated", async function () {
      const { meridian, deployer, eurc } = await deployFixture();
      await expect(meridian.connect(deployer).setTokenAddress(Currency.EURC, await eurc.getAddress()))
        .to.emit(meridian, "TokenAddressUpdated")
        .withArgs(Currency.EURC, await eurc.getAddress());
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other, usdc } = await deployFixture();
      await expect(meridian.connect(other).setTokenAddress(Currency.USDC, await usdc.getAddress()))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("refuse l'adresse zéro", async function () {
      const { meridian, deployer } = await deployFixture();
      await expect(
        meridian.connect(deployer).setTokenAddress(Currency.USDC, ZERO_ADDRESS)
      ).to.be.revertedWith("Invalid token address");
    });
  });

  // =========================================================================
  // setSanctionsOracleAddress
  // =========================================================================
  describe("setSanctionsOracleAddress", function () {
    it("permet au owner de configurer l'oracle de sanctions", async function () {
      const { meridian, deployer, other } = await deployFixture();
      await expect(meridian.connect(deployer).setSanctionsOracleAddress(other.address))
        .to.emit(meridian, "SanctionsOracleAddressUpdated")
        .withArgs(other.address);
      expect(await meridian.sanctionsOracleAddress()).to.equal(other.address);
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).setSanctionsOracleAddress(other.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("refuse l'adresse zéro", async function () {
      const { meridian, deployer } = await deployFixture();
      await expect(
        meridian.connect(deployer).setSanctionsOracleAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("Invalid sanctions oracle address");
    });
  });

  // =========================================================================
  // setMockSanctionsOracleAddress
  // =========================================================================
  describe("setMockSanctionsOracleAddress", function () {
    it("permet au owner de configurer l'oracle mock de sanctions", async function () {
      const { meridian, deployer, other } = await deployFixture();
      await expect(meridian.connect(deployer).setMockSanctionsOracleAddress(other.address))
        .to.emit(meridian, "MockSanctionsOracleAddressUpdated")
        .withArgs(other.address);
      expect(await meridian.mockSanctionsOracleAddress()).to.equal(other.address);
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).setMockSanctionsOracleAddress(other.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("refuse l'adresse zéro", async function () {
      const { meridian, deployer } = await deployFixture();
      await expect(
        meridian.connect(deployer).setMockSanctionsOracleAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("Invalid mock sanctions oracle address");
    });
  });

  // =========================================================================
  // toggleMockSanctionsOracle
  // =========================================================================
  describe("toggleMockSanctionsOracle", function () {
    it("interroge l'oracle mock par défaut, puis le vrai oracle une fois désactivé", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, mockSanctionsOracle, buyer } = ctx;

      await mockSanctionsOracle.setSanctioned(buyer.address);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      // mockSanctionsEnabled vaut true par défaut : l'acheteur sanctionné
      // dans le mock est bloqué.
      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-MOCK-ON"))
        .to.be.revertedWithCustomError(meridian, "AddressIsSanctioned")
        .withArgs(buyer.address);

      // Bascule vers le vrai oracle, où l'acheteur n'est pas sanctionné.
      await expect(meridian.toggleMockSanctionsOracle(false))
        .to.emit(meridian, "MockSanctionsToggled")
        .withArgs(false);

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-MOCK-OFF")).to.emit(
        meridian,
        "TransactionInitialized"
      );
    });

    it("n'émet pas d'event si la valeur ne change pas", async function () {
      const { meridian } = await deployFixture();
      await expect(meridian.toggleMockSanctionsOracle(true)).to.not.emit(meridian, "MockSanctionsToggled");
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).toggleMockSanctionsOracle(false))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });
  });

  // =========================================================================
  // addExemptAddress / removeExemptAddress
  // =========================================================================
  describe("addExemptAddress / removeExemptAddress", function () {
    it("permet à une adresse exemptée de contourner une sanction, jusqu'au retrait de l'exemption", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, mockSanctionsOracle, buyer } = ctx;

      await mockSanctionsOracle.setSanctioned(buyer.address);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(
        meridian.connect(buyer).initializeTransaction(details, "BILL-EXEMPT-BEFORE")
      ).to.be.revertedWithCustomError(meridian, "AddressIsSanctioned");

      await expect(meridian.addExemptAddress(buyer.address))
        .to.emit(meridian, "ExemptAddressAdded")
        .withArgs(buyer.address);
      expect(await meridian.isExempt(buyer.address)).to.equal(true);

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-EXEMPT-AFTER")).to.emit(
        meridian,
        "TransactionInitialized"
      );

      await expect(meridian.removeExemptAddress(buyer.address))
        .to.emit(meridian, "ExemptAddressRemoved")
        .withArgs(buyer.address);
      expect(await meridian.isExempt(buyer.address)).to.equal(false);

      await expect(
        meridian.connect(buyer).initializeTransaction(details, "BILL-EXEMPT-REMOVED")
      ).to.be.revertedWithCustomError(meridian, "AddressIsSanctioned");
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).addExemptAddress(other.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
      await expect(meridian.connect(other).removeExemptAddress(other.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });
  });

  // =========================================================================
  // setNewOwner
  // =========================================================================
  describe("setNewOwner", function () {
    it("transfère la propriété du contrat", async function () {
      const { meridian, deployer, other } = await deployFixture();

      await expect(meridian.connect(deployer).setNewOwner(other.address))
        .to.emit(meridian, "OwnershipTransferred")
        .withArgs(deployer.address, other.address);

      expect(await meridian.owner()).to.equal(other.address);

      await expect(meridian.connect(deployer).addExemptAddress(deployer.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);

      await meridian.connect(other).addExemptAddress(other.address);
      expect(await meridian.isExempt(other.address)).to.equal(true);
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).setNewOwner(other.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("refuse l'adresse zéro", async function () {
      const { meridian, deployer } = await deployFixture();
      await expect(meridian.connect(deployer).setNewOwner(ZERO_ADDRESS))
        .to.be.revertedWithCustomError(meridian, "OwnableInvalidOwner")
        .withArgs(ZERO_ADDRESS);
    });
  });

  // =========================================================================
  // toggleSanctionsCheck
  // =========================================================================
  describe("toggleSanctionsCheck", function () {
    it("désactive globalement le contrôle des sanctions", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, mockSanctionsOracle, buyer } = ctx;

      await mockSanctionsOracle.setSanctioned(buyer.address);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(
        meridian.connect(buyer).initializeTransaction(details, "BILL-CHECK-ON")
      ).to.be.revertedWithCustomError(meridian, "AddressIsSanctioned");

      await expect(meridian.toggleSanctionsCheck(false))
        .to.emit(meridian, "SanctionsCheckToggled")
        .withArgs(false);

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-CHECK-OFF")).to.emit(
        meridian,
        "TransactionInitialized"
      );
    });

    it("n'émet pas d'event si la valeur ne change pas", async function () {
      const { meridian } = await deployFixture();
      await expect(meridian.toggleSanctionsCheck(true)).to.not.emit(meridian, "SanctionsCheckToggled");
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).toggleSanctionsCheck(false))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
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

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-A")).to.emit(
        meridian,
        "TransactionInitialized"
      );

      const tx = await meridian.connect(buyer).initializeTransaction(details, "BILL-B");
      const transactionID = await extractTransactionID(meridian, tx);

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
      const transactionID = await extractTransactionID(meridian, tx);

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

      await expect(meridian.connect(buyer).initializeTransaction(details, "")).to.be.revertedWith(
        "Bill number cannot be empty"
      );
    });

    it("refuse un acheteur sanctionné", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, mockSanctionsOracle, buyer } = ctx;
      await mockSanctionsOracle.setSanctioned(buyer.address);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-SANCTIONED"))
        .to.be.revertedWithCustomError(meridian, "AddressIsSanctioned")
        .withArgs(buyer.address);
    });
  });

  // =========================================================================
  // createTransaction
  // =========================================================================
  describe("createTransaction", function () {
    it("permet au vendeur de créer la transaction avec le bon bill number", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await initializeOnly(ctx, "BILL-OK");

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
      const { transactionID } = await initializeOnly(ctx, "BILL-REAL");

      await expect(
        meridian.connect(seller).createTransaction(transactionID, "BILL-WRONG")
      ).to.be.revertedWith("Bill number does not match");
    });

    it("refuse une transaction qui n'est pas dans l'état Initialized", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await initializeOnly(ctx, "BILL-TWICE");

      await meridian.connect(seller).createTransaction(transactionID, "BILL-TWICE");

      await expect(
        meridian.connect(seller).createTransaction(transactionID, "BILL-TWICE")
      ).to.be.revertedWith("Transaction is initialized");
    });

    it("refuse un bill number vide", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await initializeOnly(ctx, "BILL-EMPTY");

      await expect(meridian.connect(seller).createTransaction(transactionID, "")).to.be.revertedWith(
        "Bill number cannot be empty"
      );
    });

    it("refuse un vendeur sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, mockSanctionsOracle, seller } = ctx;
      const { transactionID } = await initializeOnly(ctx, "BILL-SELLER-SANCTIONED");
      await mockSanctionsOracle.setSanctioned(seller.address);

      await expect(meridian.connect(seller).createTransaction(transactionID, "BILL-SELLER-SANCTIONED"))
        .to.be.revertedWithCustomError(meridian, "AddressIsSanctioned")
        .withArgs(seller.address);
    });
  });

  // =========================================================================
  // saveTransactionDetailsSeller / saveTransactionDetailsBuyer
  // =========================================================================
  describe("saveTransactionDetailsSeller / saveTransactionDetailsBuyer", function () {
    it("permet au vendeur de renseigner les infos logistiques", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD");

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
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-2");

      const sameDate = await futureDate(ethers, 5);
      const logistics = { departureDate: sameDate, arrivalDate: sameDate, containerReference: "REF" };

      await expect(
        meridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details)
      ).to.be.revertedWith("Arrival date must be after departure date");
    });

    it("refuse une containerReference vide", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-3");

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
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-4");

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
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-5");

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
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-6");

      await meridian.connect(seller).signTransactionSeller(transactionID);
      expect((await meridian.getTransaction(transactionID)).signedBySeller).to.equal(true);

      await meridian.connect(buyer).saveTransactionDetailsBuyer(transactionID, details);

      expect((await meridian.getTransaction(transactionID)).signedBySeller).to.equal(false);
    });

    it("refuse l'appel par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-7");

      await expect(
        meridian.connect(other).saveTransactionDetailsBuyer(transactionID, details)
      ).to.be.revertedWith("You're not the declared buyer");
    });
  });

  // =========================================================================
  // signTransactionSeller / signTransactionBuyer
  // =========================================================================
  describe("signTransactionSeller / signTransactionBuyer", function () {
    it("passe en TransactionSigned quand les deux parties ont signé", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer, seller } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-SIGN");

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
      const { transactionID } = await initAndCreate(ctx, "BILL-SIGN-2");

      await expect(meridian.connect(other).signTransactionSeller(transactionID)).to.be.revertedWith(
        "You're not the declared seller"
      );
    });

    it("refuse la signature acheteur par un autre compte", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-SIGN-3");

      await expect(meridian.connect(other).signTransactionBuyer(transactionID)).to.be.revertedWith(
        "You're not the declared buyer"
      );
    });

    it("abandonne la transaction (sans revert) si le signataire est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, mockSanctionsOracle, seller } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-SIGN-ABORT");

      await mockSanctionsOracle.setSanctioned(seller.address);

      await expect(meridian.connect(seller).signTransactionSeller(transactionID)).to.emit(
        meridian,
        "TransactionAborted"
      );

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.signedBySeller).to.equal(false);
    });
  });

  // =========================================================================
  // mintTransactionNFTBuyer / mintTransactionNFTSeller
  // =========================================================================
  describe("mintTransactionNFTBuyer / mintTransactionNFTSeller", function () {
    it("permet à l'acheteur de minter son NFT récapitulatif", async function () {
      const ctx = await deployFixture();
      const { meridian, meridianNFT, buyer } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, {}, "BILL-NFT-BUYER");

      const tx = await meridian.connect(buyer).mintTransactionNFTBuyer(transactionID);
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionNFTMinted");

      expect(parsed!.args.transactionID).to.equal(transactionID);
      expect(parsed!.args.userType).to.equal(UserType.Buyer);
      expect(parsed!.args.userAddress).to.equal(buyer.address);

      const tokenId = parsed!.args.tokenId;
      expect(await meridianNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("permet au vendeur de minter son NFT récapitulatif, indépendamment de l'acheteur", async function () {
      const ctx = await deployFixture();
      const { meridian, meridianNFT, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, {}, "BILL-NFT-SELLER");

      // Le vendeur mint sans que l'acheteur n'ait rien fait de son côté : les
      // deux flags (buyerNFTMinted/sellerNFTMinted) sont indépendants.
      const tx = await meridian.connect(seller).mintTransactionNFTSeller(transactionID);
      const receipt = await tx.wait();
      const parsed = receipt!.logs
        .map((log: any) => {
          try {
            return meridian.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "TransactionNFTMinted");

      expect(parsed!.args.userType).to.equal(UserType.Seller);
      expect(parsed!.args.userAddress).to.equal(seller.address);

      const tokenId = parsed!.args.tokenId;
      expect(await meridianNFT.ownerOf(tokenId)).to.equal(seller.address);
    });

    it("refuse tant que meridianNFTAddress n'est pas configuré", async function () {
      const { ethers, buyer, seller } = await deployFixture();

      // Nouveau Meridian sans setMeridianNFTAddress.
      const freshMeridian = await ethers.deployContract("Meridian");
      const mockSanctionsOracle = await ethers.deployContract("SanctionsList");
      await freshMeridian.setMockSanctionsOracleAddress(await mockSanctionsOracle.getAddress());
      await freshMeridian.setSanctionsOracleAddress(await mockSanctionsOracle.getAddress());
      await freshMeridian.setTokenAddress(Currency.USDC, await (await ethers.deployContract("MockERC20", ["Mock USDC", "USDC", 6])).getAddress());

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      const tx = await freshMeridian.connect(buyer).initializeTransaction(details, "BILL-NFT-NOCONFIG");
      const transactionID = await extractTransactionID(freshMeridian, tx);
      await freshMeridian.connect(seller).createTransaction(transactionID, "BILL-NFT-NOCONFIG");
      const logistics = {
        departureDate: await futureDate(ethers, 5),
        arrivalDate: await futureDate(ethers, 15),
        containerReference: "REF",
      };
      await freshMeridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details);
      await freshMeridian.connect(seller).signTransactionSeller(transactionID);
      await freshMeridian.connect(buyer).signTransactionBuyer(transactionID);

      await expect(
        freshMeridian.connect(buyer).mintTransactionNFTBuyer(transactionID)
      ).to.be.revertedWith("Meridian NFT contract not configured");
    });

    it("refuse tant que la transaction n'est pas Signed", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer, seller } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-NFT-NOTSIGNED");

      await expect(meridian.connect(buyer).mintTransactionNFTBuyer(transactionID)).to.be.revertedWith(
        "Transaction is not signed"
      );
      await expect(meridian.connect(seller).mintTransactionNFTSeller(transactionID)).to.be.revertedWith(
        "Transaction is not signed"
      );
    });

    it("refuse un second mint buyer une fois déjà minté", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, {}, "BILL-NFT-BUYER-TWICE");

      await meridian.connect(buyer).mintTransactionNFTBuyer(transactionID);

      await expect(meridian.connect(buyer).mintTransactionNFTBuyer(transactionID)).to.be.revertedWith(
        "Buyer NFT already minted for this transaction"
      );
    });

    it("refuse un second mint seller une fois déjà minté", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, {}, "BILL-NFT-SELLER-TWICE");

      await meridian.connect(seller).mintTransactionNFTSeller(transactionID);

      await expect(meridian.connect(seller).mintTransactionNFTSeller(transactionID)).to.be.revertedWith(
        "Seller NFT already minted for this transaction"
      );
    });

    it("refuse l'appel au mint buyer par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, {}, "BILL-NFT-BUYER-OTHER");

      await expect(meridian.connect(other).mintTransactionNFTBuyer(transactionID)).to.be.revertedWith(
        "You're not the declared buyer"
      );
    });

    it("refuse l'appel au mint seller par quelqu'un d'autre que le vendeur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, {}, "BILL-NFT-SELLER-OTHER");

      await expect(meridian.connect(other).mintTransactionNFTSeller(transactionID)).to.be.revertedWith(
        "You're not the declared seller"
      );
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
      const { meridian, usdc, buyer } = ctx;
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
      const { transactionID } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.PartialLocked,
        advanceAmount: totalAmount,
      });

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
      const { meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await expect(meridian.connect(buyer).depositFunds(transactionID)).to.be.revertedWith(
        "Payment already completed"
      );
    });

    it("refuse l'appel par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      await expect(meridian.connect(other).depositFunds(transactionID)).to.be.revertedWith(
        "You're not the declared buyer"
      );
    });

    it("refuse si le token de la devise n'est pas configuré", async function () {
      const ctx = await deployFixture();
      const { ethers, mockSanctionsOracle, sanctionsOracle, buyer, seller } = ctx;

      // Nouveau contrat Meridian sans setTokenAddress pour EURC, mais avec
      // les oracles de sanctions câblés pour ne pas revert prématurément.
      const freshMeridian = await ethers.deployContract("Meridian");
      await freshMeridian.setMockSanctionsOracleAddress(await mockSanctionsOracle.getAddress());
      await freshMeridian.setSanctionsOracleAddress(await sanctionsOracle.getAddress());

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails(
        { currency: Currency.EURC, transactionModel: TransactionModel.FullLocked },
        { totalAmount, transactionCancellingDate: cancellingDate }
      );

      const tx = await freshMeridian.connect(buyer).initializeTransaction(details, "BILL-NOTOKEN");
      const transactionID = await extractTransactionID(freshMeridian, tx);

      await freshMeridian.connect(seller).createTransaction(transactionID, "BILL-NOTOKEN");
      const logistics = {
        departureDate: await futureDate(ethers, 5),
        arrivalDate: await futureDate(ethers, 15),
        containerReference: "REF",
      };
      await freshMeridian.connect(seller).saveTransactionDetailsSeller(transactionID, logistics, details);
      await freshMeridian.connect(seller).signTransactionSeller(transactionID);
      await freshMeridian.connect(buyer).signTransactionBuyer(transactionID);

      await expect(freshMeridian.connect(buyer).depositFunds(transactionID)).to.be.revertedWith(
        "Token address not configured for this currency"
      );
    });

    it("abandonne silencieusement (sans revert) si la date limite est dépassée", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;

      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

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

      await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.be.revertedWith(
        "Nothing to withdraw"
      );
    });

    it("permet au vendeur de retirer les fonds déposés et transfère les tokens", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      const sellerBalanceBefore = await usdc.balanceOf(seller.address);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, totalAmount, Currency.USDC);

      const sellerBalanceAfter = await usdc.balanceOf(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(totalAmount);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.pendingWithdrawalAmount).to.equal(0);
    });

    it("passe la transaction en TransactionCompleted quand tout est retiré et déposé", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "TransactionCompleted")
        .withArgs(transactionID, buyer.address, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Completed);
      expect(stored.withdrawalCompleted).to.equal(true);
    });

    it("ne passe PAS en Completed si le dépôt total n'est pas complet", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer, seller } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const { transactionID } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.PartialLocked,
        advanceAmount: totalAmount,
      });

      const advance = (totalAmount * 30n) / 100n;
      await usdc.connect(buyer).approve(await meridian.getAddress(), advance);
      await meridian.connect(buyer).depositFunds(transactionID);

      await meridian.connect(seller).withdrawFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Signed); // pas Completed
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

      await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.be.revertedWith(
        "Transaction is not signed"
      );
    });

    it("refuse l'appel par quelqu'un d'autre que le vendeur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      await expect(meridian.connect(other).withdrawFunds(transactionID)).to.be.revertedWith(
        "You're not the declared seller"
      );
    });
  });

  // =========================================================================
  // rollbackDeposit
  // =========================================================================
  describe("rollbackDeposit", function () {
    async function overdueAfterDeposit(
      ctx: Awaited<ReturnType<typeof deployFixture>>,
      billNumber = "BILL-ROLLBACK"
    ) {
      const { ethers, meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.FullLocked },
        {},
        billNumber
      );

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

      return { transactionID, totalAmount };
    }

    it("refuse tant que la transaction n'est pas abandonnée", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.FullLocked },
        {},
        "BILL-NOT-OVERDUE"
      );

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID)).to.be.revertedWith(
        "Transaction is not aborted"
      );
    });

    it("rembourse intégralement l'acheteur une fois la date dépassée", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await overdueAfterDeposit(ctx);

      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID))
        .to.emit(meridian, "totalAmountRefunded")
        .withArgs(transactionID, buyer.address, totalAmount, Currency.USDC);

      const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(totalAmount);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.depositedAmount).to.equal(0);
      expect(stored.totalAmountRefunded).to.equal(true);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
    });

    it("rembourse partiellement si le dépôt n'a pas atteint totalAmount", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const { transactionID } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.PartialLocked, advanceAmount: totalAmount },
        {},
        "BILL-PARTIAL-REFUND"
      );

      const advance = (totalAmount * 30n) / 100n;
      await usdc.connect(buyer).approve(await meridian.getAddress(), advance);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID))
        .to.emit(meridian, "partialAmountRefunded")
        .withArgs(transactionID, buyer.address, advance, Currency.USDC);

      const after = await meridian.getTransaction(transactionID);
      expect(after.partialAmountRefunded).to.equal(true);
    });

    it("refuse un second rollback une fois les fonds déjà remboursés", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await overdueAfterDeposit(ctx, "BILL-ROLLBACK-TWICE");

      await meridian.connect(buyer).rollbackDeposit(transactionID);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID)).to.be.revertedWith(
        "No funds to rollback"
      );
    });

    it("refuse l'appel par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await overdueAfterDeposit(ctx, "BILL-ROLLBACK-OTHER");

      await expect(meridian.connect(other).rollbackDeposit(transactionID)).to.be.revertedWith(
        "You're not the declared buyer"
      );
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
