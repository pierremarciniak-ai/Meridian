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
const ContainerPositionStatus = { UnSet: 0, InTransit: 1, AtDestination: 2 };

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

    const [deployer, buyer, seller, other, containerPositionOracle, feesWallet] = await ethers.getSigners();

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

    // Adresse dédiée simulant le backend qui interroge VesselFinder : seule
    // cette adresse peut appeler reportContainerPosition, ou signer une
    // attestation valide pour applySignedContainerPosition.
    await meridian.setContainerPositionOracleAddress(containerPositionOracle.address);

    // feesWalletAddress est requis dès qu'une signature complète déclenche un
    // prélèvement de frais non nul (require dédié dans transfertFeesFromBuyer)
    // : sans ce câblage, tout test dédié aux frais échouerait. feesRateBps
    // reste à 0 par défaut (valeur initiale du contrat) : à ce taux, aucun
    // prélèvement n'a lieu, donc tous les tests qui ne testent pas les frais
    // ne sont pas affectés par ce câblage. Les tests dédiés ajustent
    // feesRateBps eux-mêmes via setFeesRateBps.
    await meridian.setFeesWalletAddress(feesWallet.address);

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
      containerPositionOracle,
      feesWallet,
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

  // Décode un event précis depuis le receipt d'une transaction : chaque log
  // est tenté avec l'ABI du contrat (un log qui ne matche aucun event connu
  // lève, d'où le try/catch), puis on cherche celui dont le nom correspond.
  // Partagé par extractTransactionID et les tests de mint NFT, qui avaient
  // chacun leur propre copie de cette même logique.
  async function findEventLog(contract: any, tx: any, eventName: string) {
    const receipt = await tx.wait();
    return receipt!.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === eventName);
  }

  async function extractTransactionID(meridian: any, tx: any) {
    const parsed = await findEventLog(meridian, tx, "TransactionInitialized");
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

  // currentEditor démarre à Seller (initializeTransaction) et ne bascule vers
  // Buyer qu'une fois le vendeur signé : le vendeur signe donc toujours EN
  // PREMIER dans ce contrat, et c'est systématiquement la signature de
  // l'acheteur (signTransactionBuyer) qui, en complétant les deux
  // signatures, déclenche checkSignatures -> transfertFeesFromBuyer. Le
  // prélèvement des frais se fait donc toujours dans la propre transaction
  // de l'acheteur, jamais dans celle du vendeur — pas besoin de simuler un
  // "vendeur signe en dernier", ce cas n'existe pas dans ce contrat.
  // Arrêté juste avant la signature acheteur : nécessaire pour les tests de
  // frais, qui doivent insérer un usdc.approve() entre les deux signatures.
  async function createSignedBySellerOnly(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    detailsOverrides: Partial<any> = {},
    containerReference = "CONT-REF-001",
    billNumber = "BILL-SIGNED"
  ) {
    const { meridian, seller } = ctx;
    const { transactionID, details } = await initAndCreate(ctx, billNumber, detailsOverrides, "1000");

    await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, containerReference, details);
    await meridian.connect(seller).signTransactionSeller(transactionID);

    return { transactionID, details, containerReference, totalAmount: details.totalAmount, billNumber };
  }

  // Complète createSignedBySellerOnly par la signature acheteur — voir son
  // commentaire pour l'ordre de signature imposé par le contrat. Utilisé par
  // la quasi-totalité des tests de depositFunds/withdrawFunds/rollbackDeposit,
  // qui exigent l'état Signed en préalable.
  async function createAndSignTransaction(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    detailsOverrides: Partial<any> = {},
    containerReference = "CONT-REF-001",
    billNumber = "BILL-SIGNED"
  ) {
    const { meridian, buyer } = ctx;
    const result = await createSignedBySellerOnly(ctx, detailsOverrides, containerReference, billNumber);
    await meridian.connect(buyer).signTransactionBuyer(result.transactionID);
    return result;
  }

  // Simule le backend qui interroge VesselFinder et fait remonter la
  // position on-chain via reportContainerPosition (seul containerPositionOracle
  // peut l'appeler — voir withdrawFunds, qui n'accepte plus ce statut en
  // paramètre direct pour éviter qu'un vendeur ne se l'auto-déclare). En usage
  // normal c'est plutôt applySignedContainerPosition (testée séparément) qui
  // écrit cette valeur, payée par l'utilisateur.
  async function reportAtDestination(ctx: Awaited<ReturnType<typeof deployFixture>>, transactionID: string) {
    const { meridian, containerPositionOracle } = ctx;
    await meridian
      .connect(containerPositionOracle)
      .reportContainerPosition(transactionID, ContainerPositionStatus.AtDestination);
  }

  // Signe une attestation de position hors-chaîne, exactement comme le ferait
  // la route API (voir app/api/container-position/sign côté front) : hash
  // packé (transactionID, status, deadline, adresse du contrat) puis
  // personal_sign — doit correspondre bit à bit à
  // applySignedContainerPosition (InternalFunctions.sol), qui reconstruit le
  // même hash et vérifie via ECDSA.recover + toEthSignedMessageHash.
  async function signContainerPosition(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    transactionID: string,
    status: number,
    deadline: number
  ) {
    const { ethers, meridian, containerPositionOracle } = ctx;
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint8", "uint256", "address"],
      [transactionID, status, deadline, await meridian.getAddress()]
    );
    return containerPositionOracle.signMessage(ethers.getBytes(messageHash));
  }

  // Fait avancer le temps jusqu'après transactionCancellingDate.
  async function jumpPastCancellingDate(ethersLib: any, cancellingDate: bigint | number) {
    const latestBlock = await ethersLib.provider.getBlock("latest");
    const jumpSeconds = Number(cancellingDate) - latestBlock!.timestamp + 10;
    await ethersLib.provider.send("evm_increaseTime", [jumpSeconds]);
    await ethersLib.provider.send("evm_mine", []);
  }

  // Construit un Meridian "presque câblé" pour tester un require de
  // configuration manquante (NFT/token/wallet de frais) : toujours les
  // oracles de sanctions (indispensables, y compris pour signer — un oracle
  // sans code fait revert le try/catch de checkSanction, voir plus bas), le
  // reste au choix via options. Un paramètre omis reste à sa valeur par
  // défaut (adresse zéro / taux 0) : c'est justement ce qu'on veut tester.
  async function deployPartiallyWiredMeridian(
    ctx: Awaited<ReturnType<typeof deployFixture>>,
    options: { tokenAddress?: string; feesRateBps?: number } = {}
  ) {
    const { ethers, mockSanctionsOracle, sanctionsOracle } = ctx;
    const meridian = await ethers.deployContract("Meridian");
    await meridian.setMockSanctionsOracleAddress(await mockSanctionsOracle.getAddress());
    await meridian.setSanctionsOracleAddress(await sanctionsOracle.getAddress());
    if (options.tokenAddress) {
      await meridian.setTokenAddress(Currency.USDC, options.tokenAddress);
    }
    if (options.feesRateBps) {
      await meridian.setFeesRateBps(options.feesRateBps);
    }
    return meridian;
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
  // setNewOwner
  // =========================================================================
  describe("setNewOwner", function () {
    it("transfère la propriété du contrat", async function () {
      const { meridian, deployer, other } = await deployFixture();

      await expect(meridian.connect(deployer).setNewOwner(other.address))
        .to.emit(meridian, "OwnershipTransferred")
        .withArgs(deployer.address, other.address);

      expect(await meridian.owner()).to.equal(other.address);

      // Vérifie que l'ancien owner a bien perdu la main et que le nouveau
      // l'a récupérée, via un autre setter onlyOwner du contrat (l'exemption
      // d'adresse a été retirée du contrat, voir InternalFunctions.sol).
      await expect(meridian.connect(deployer).toggleMockSanctionsOracle(false))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);

      await meridian.connect(other).toggleMockSanctionsOracle(false);
      expect(await meridian.mockSanctionsEnabled()).to.equal(false);
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
  // setContainerPositionOracleAddress
  // =========================================================================
  describe("setContainerPositionOracleAddress", function () {
    it("permet au owner de configurer l'oracle de position du conteneur", async function () {
      const { meridian, deployer, other } = await deployFixture();
      await expect(meridian.connect(deployer).setContainerPositionOracleAddress(other.address))
        .to.emit(meridian, "ContainerPositionOracleAddressUpdated")
        .withArgs(other.address);
      expect(await meridian.containerPositionOracleAddress()).to.equal(other.address);
    });

    it("refuse un appel par un compte non-owner", async function () {
      const { meridian, other } = await deployFixture();
      await expect(meridian.connect(other).setContainerPositionOracleAddress(other.address))
        .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });

    it("refuse l'adresse zéro", async function () {
      const { meridian, deployer } = await deployFixture();
      await expect(
        meridian.connect(deployer).setContainerPositionOracleAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("Invalid container position oracle address");
    });
  });

  // =========================================================================
  // reportContainerPosition
  // =========================================================================
  describe("reportContainerPosition", function () {
    it("permet à l'oracle de reporter la position du conteneur", async function () {
      const ctx = await deployFixture();
      const { meridian, containerPositionOracle } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-POS-1");

      await expect(
        meridian
          .connect(containerPositionOracle)
          .reportContainerPosition(transactionID, ContainerPositionStatus.InTransit)
      )
        .to.emit(meridian, "ContainerPositionReported")
        .withArgs(transactionID, ContainerPositionStatus.InTransit);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.containerPositionStatus).to.equal(ContainerPositionStatus.InTransit);
    });

    it("refuse un appel par quelqu'un d'autre que l'oracle configuré (ex. le vendeur lui-même)", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-POS-2");

      await expect(
        meridian.connect(seller).reportContainerPosition(transactionID, ContainerPositionStatus.AtDestination)
      ).to.be.revertedWith("You're not the container position oracle");
    });

    it("refuse tant que la transaction n'est pas Signed", async function () {
      const ctx = await deployFixture();
      const { meridian, containerPositionOracle } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-POS-3");

      await expect(
        meridian
          .connect(containerPositionOracle)
          .reportContainerPosition(transactionID, ContainerPositionStatus.InTransit)
      ).to.be.revertedWith("Transaction is not signed");
    });
  });

  // =========================================================================
  // checkSanction — panne de l'oracle (le contrôle n'est plus désactivable :
  // voir InternalFunctions.sol. checkSanction est fail-open : si l'appel à
  // l'oracle échoue, l'adresse est traitée comme NON sanctionnée pour ne pas
  // bloquer la transaction, avec SanctionsOracleCallFailed émis pour tracer
  // l'incident).
  // =========================================================================
  describe("checkSanction — panne de l'oracle", function () {
    it("n'empêche pas l'appel (fail-open) si l'oracle revert, mais émet SanctionsOracleCallFailed", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, mockSanctionsOracle, buyer } = ctx;

      await mockSanctionsOracle.setBroken(true);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-ORACLE-DOWN"))
        .to.emit(meridian, "SanctionsOracleCallFailed")
        .withArgs(buyer.address)
        .and.to.emit(meridian, "TransactionInitialized");
    });

    it("ne bloque pas l'action (fail-open) et émet SanctionsOracleCallFailed quand l'oracle échoue lors d'une vérification qui, sinon, aurait abandonné la transaction", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, mockSanctionsOracle, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await mockSanctionsOracle.setBroken(true);
      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);

      await expect(meridian.connect(buyer).depositFunds(transactionID)).to.emit(meridian, "SanctionsOracleCallFailed");

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.not.equal(WorkflowStatus.Aborted);
      expect(stored.buyerSanctioned).to.equal(false);
      expect(stored.sellerSanctioned).to.equal(false);
      expect(stored.depositedAmount).to.equal(totalAmount);
      expect(stored.depositCompleted).to.equal(true);
    });

    it("(comportement réel documenté) si l'oracle configuré n'a pas de code du tout, le try/catch ne rattrape pas l'échec : la transaction revert au lieu de rester fail-open", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer, other } = ctx;

      // other.address est un compte externe (EOA), sans aucun contrat déployé.
      // Contrairement à un oracle qui revert (cas ci-dessus, bien rattrapé par
      // le try/catch), ce cas précis échappe au catch sur ce couple
      // Hardhat 3 (EDR) / Solidity 0.8.28 : la transaction échoue avec un
      // revert "brut" (sans raison) au lieu de suivre la voie fail-open
      // prévue par checkSanction — donc ici plus restrictif que voulu (pas
      // moins sûr, juste incohérent avec l'intention).
      await meridian.setMockSanctionsOracleAddress(other.address);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      await expect(meridian.connect(buyer).initializeTransaction(details, "BILL-ORACLE-NO-CODE")).to.revert(ethers);
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

    it("force AdvancePaymentMode.Deferred pour FullLocked et PartialLocked, quelle que soit la valeur demandée", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const cancellingDate = await futureDate(ethers);

      for (const transactionModel of [TransactionModel.FullLocked, TransactionModel.PartialLocked]) {
        const details = buildDetails(
          { transactionModel, advancePaymentMode: AdvancePaymentMode.Immediate },
          { totalAmount, transactionCancellingDate: cancellingDate }
        );
        const tx = await meridian.connect(buyer).initializeTransaction(details, `BILL-APM-${transactionModel}`);
        const transactionID = await extractTransactionID(meridian, tx);
        const stored = await meridian.getTransaction(transactionID);
        expect(stored.advancePaymentMode).to.equal(AdvancePaymentMode.Deferred);
      }
    });

    it("force AdvancePaymentMode.Immediate pour PartialImmediate, quelle que soit la valeur demandée", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails(
        { transactionModel: TransactionModel.PartialImmediate, advancePaymentMode: AdvancePaymentMode.Deferred },
        { totalAmount, transactionCancellingDate: cancellingDate }
      );

      const tx = await meridian.connect(buyer).initializeTransaction(details, "BILL-APM-PI");
      const transactionID = await extractTransactionID(meridian, tx);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.advancePaymentMode).to.equal(AdvancePaymentMode.Immediate);
    });

    it("respecte l'AdvancePaymentMode demandé pour Free (Immediate ou Deferred)", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const cancellingDate = await futureDate(ethers);

      for (const advancePaymentMode of [AdvancePaymentMode.Immediate, AdvancePaymentMode.Deferred]) {
        const details = buildDetails(
          { transactionModel: TransactionModel.Free, advancePaymentMode },
          { totalAmount, transactionCancellingDate: cancellingDate }
        );
        const tx = await meridian.connect(buyer).initializeTransaction(details, `BILL-APM-FREE-${advancePaymentMode}`);
        const transactionID = await extractTransactionID(meridian, tx);
        const stored = await meridian.getTransaction(transactionID);
        expect(stored.advancePaymentMode).to.equal(advancePaymentMode);
      }
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

    it("refuse que l'acheteur crée lui-même son propre dossier", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await initializeOnly(ctx, "BILL-SELF");

      await expect(
        meridian.connect(buyer).createTransaction(transactionID, "BILL-SELF")
      ).to.be.revertedWith("Buyer cannot be the seller");
    });
  });

  // =========================================================================
  // saveTransactionDetailsSeller / saveTransactionDetailsBuyer
  // =========================================================================
  describe("saveTransactionDetailsSeller / saveTransactionDetailsBuyer", function () {
    it("permet au vendeur de renseigner la référence du conteneur", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD");

      await expect(meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "MEDU1234567", details))
        .to.emit(meridian, "TransactionDetailsSaved")
        .withArgs(transactionID, UserType.Seller, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.containerReference).to.equal("MEDU1234567");
    });

    it("refuse une containerReference vide", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-3");

      await expect(
        meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "", details)
      ).to.be.revertedWith("Container reference cannot be empty");
    });

    it("refuse l'appel par quelqu'un d'autre que le vendeur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-4");

      await expect(
        meridian.connect(other).saveTransactionDetailsSeller(transactionID, "REF", details)
      ).to.be.revertedWith("You're not the declared seller");
    });

    it("permet à l'acheteur de mettre à jour les détails communs", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-5");

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-STD-5", details);
      // La main ne passe à l'acheteur (currentEditor) qu'une fois le vendeur
      // signé : voir la même exigence dans le test "réinitialise les
      // signatures..." juste après.
      await meridian.connect(seller).signTransactionSeller(transactionID);

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

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-STD-6", details);

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

    it("refuse la mise à jour acheteur tant que le vendeur n'a pas renseigné la référence du conteneur", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-8");

      await expect(
        meridian.connect(buyer).saveTransactionDetailsBuyer(transactionID, details)
      ).to.be.revertedWith("Container reference cannot be empty");
    });

    // saveCommonTransactionDetails (appelée par saveTransactionDetailsSeller
    // ET saveTransactionDetailsBuyer) porte sa propre copie de ces deux
    // require, distincte de celle d'initializeTransaction : les tester ici
    // aussi évite qu'une régression sur cette copie passe inaperçue.
    it("refuse un totalAmount à zéro (via saveTransactionDetailsSeller)", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-9");

      const badDetails = { ...details, totalAmount: 0 };

      await expect(
        meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-STD-9", badDetails)
      ).to.be.revertedWith("Total amount must be greater than zero");
    });

    it("refuse une date d'annulation dans le passé (via saveTransactionDetailsBuyer)", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-10");

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-STD-10", details);
      await meridian.connect(seller).signTransactionSeller(transactionID);

      const pastDate = (await futureDate(ethers, 0)) - 1000;
      const badDetails = { ...details, transactionCancellingDate: pastDate };

      await expect(
        meridian.connect(buyer).saveTransactionDetailsBuyer(transactionID, badDetails)
      ).to.be.revertedWith("Transaction cancelling date must be in the future");
    });

    it("abandonne la transaction (sans revert, sans sauvegarde) si le vendeur est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-SANCTION-SELLER");

      await mockSanctionsOracle.setSanctioned(seller.address);

      await expect(meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-SANCTION-SELLER", details))
        .to.emit(meridian, "TransactionAborted")
        .withArgs(transactionID, buyer.address, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.sellerSanctioned).to.equal(true);
      expect(stored.buyerSanctioned).to.equal(false);
      // L'abandon court-circuite la sauvegarde : rien n'a été enregistré.
      expect(stored.containerReference).to.equal("");
    });

    it("abandonne la transaction (sans revert, sans sauvegarde) si l'acheteur est sanctionné", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-STD-SANCTION-BUYER");

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-SANCTION-BUYER", details);
      await meridian.connect(seller).signTransactionSeller(transactionID);

      await mockSanctionsOracle.setSanctioned(buyer.address);

      const newDetails = { ...details, totalAmount: ethers.parseUnits("999", 6) };

      await expect(meridian.connect(buyer).saveTransactionDetailsBuyer(transactionID, newDetails))
        .to.emit(meridian, "TransactionAborted")
        .withArgs(transactionID, buyer.address, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.buyerSanctioned).to.equal(true);
      expect(stored.sellerSanctioned).to.equal(false);
      // Les nouveaux détails n'ont pas été appliqués.
      expect(stored.totalAmount).to.equal(details.totalAmount);
    });
  });

  // =========================================================================
  // signTransactionSeller / signTransactionBuyer
  // =========================================================================
  describe("signTransactionSeller / signTransactionBuyer", function () {
    it("passe en TransactionSigned quand les deux parties ont signé", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-SIGN");

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-SIGN", details);

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

    it("refuse la signature vendeur tant que la référence du conteneur n'est pas renseignée", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-SIGN-4");

      await expect(meridian.connect(seller).signTransactionSeller(transactionID)).to.be.revertedWith(
        "Container reference cannot be empty"
      );
    });

    it("refuse la signature acheteur tant que la référence du conteneur n'est pas renseignée", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-SIGN-5");

      await expect(meridian.connect(buyer).signTransactionBuyer(transactionID)).to.be.revertedWith(
        "Container reference cannot be empty"
      );
    });

    it("abandonne la transaction (sans revert) si le signataire est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, mockSanctionsOracle, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-SIGN-ABORT");

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-SIGN-ABORT", details);

      await mockSanctionsOracle.setSanctioned(seller.address);

      await expect(meridian.connect(seller).signTransactionSeller(transactionID)).to.emit(
        meridian,
        "TransactionAborted"
      );

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.signedBySeller).to.equal(false);
      expect(stored.sellerSanctioned).to.equal(true);
      expect(stored.buyerSanctioned).to.equal(false);
    });

    it("distingue un abandon pour cause de sanction acheteur (buyerSanctioned) de celui du vendeur", async function () {
      const ctx = await deployFixture();
      const { meridian, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, details } = await initAndCreate(ctx, "BILL-SIGN-ABORT-BUYER");

      await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF-SIGN-ABORT-BUYER", details);
      await meridian.connect(seller).signTransactionSeller(transactionID);

      await mockSanctionsOracle.setSanctioned(buyer.address);

      await expect(meridian.connect(buyer).signTransactionBuyer(transactionID)).to.emit(meridian, "TransactionAborted");

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.buyerSanctioned).to.equal(true);
      expect(stored.sellerSanctioned).to.equal(false);
    });
  });

  // =========================================================================
  // mintTransactionNFTBuyer / mintTransactionNFTSeller
  // =========================================================================
  describe("mintTransactionNFTBuyer / mintTransactionNFTSeller", function () {
    it("permet à l'acheteur de minter son NFT récapitulatif", async function () {
      const ctx = await deployFixture();
      const { meridian, meridianNFT, buyer } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-NFT-BUYER");

      const tx = await meridian.connect(buyer).mintTransactionNFTBuyer(transactionID);
      const parsed = await findEventLog(meridian, tx, "TransactionNFTMinted");

      expect(parsed!.args.transactionID).to.equal(transactionID);
      expect(parsed!.args.userType).to.equal(UserType.Buyer);
      expect(parsed!.args.userAddress).to.equal(buyer.address);

      const tokenId = parsed!.args.tokenId;
      expect(await meridianNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it("permet au vendeur de minter son NFT récapitulatif, indépendamment de l'acheteur", async function () {
      const ctx = await deployFixture();
      const { meridian, meridianNFT, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-NFT-SELLER");

      // Le vendeur mint sans que l'acheteur n'ait rien fait de son côté : les
      // deux flags (buyerNFTMinted/sellerNFTMinted) sont indépendants.
      const tx = await meridian.connect(seller).mintTransactionNFTSeller(transactionID);
      const parsed = await findEventLog(meridian, tx, "TransactionNFTMinted");

      expect(parsed!.args.userType).to.equal(UserType.Seller);
      expect(parsed!.args.userAddress).to.equal(seller.address);

      const tokenId = parsed!.args.tokenId;
      expect(await meridianNFT.ownerOf(tokenId)).to.equal(seller.address);
    });

    it("refuse tant que meridianNFTAddress n'est pas configuré", async function () {
      const ctx = await deployFixture();
      const { ethers, buyer, seller } = ctx;
      // NFT volontairement pas câblé (token non plus : inutile ici, feesRateBps
      // reste à 0 par défaut donc transfertFeesFromBuyer ne le lit jamais).
      const freshMeridian = await deployPartiallyWiredMeridian(ctx);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails({}, { totalAmount, transactionCancellingDate: cancellingDate });

      const tx = await freshMeridian.connect(buyer).initializeTransaction(details, "BILL-NFT-NOCONFIG");
      const transactionID = await extractTransactionID(freshMeridian, tx);
      await freshMeridian.connect(seller).createTransaction(transactionID, "BILL-NFT-NOCONFIG");
      await freshMeridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF", details);
      await freshMeridian.connect(seller).signTransactionSeller(transactionID);
      await freshMeridian.connect(buyer).signTransactionBuyer(transactionID);

      await expect(
        freshMeridian.connect(buyer).mintTransactionNFTBuyer(transactionID)
      ).to.be.revertedWith("Meridian NFT contract not configured");
    });

    it("refuse tant que la transaction n'est ni Signed ni Completed", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer, seller } = ctx;
      const { transactionID } = await initAndCreate(ctx, "BILL-NFT-NOTSIGNED");

      await expect(meridian.connect(buyer).mintTransactionNFTBuyer(transactionID)).to.be.revertedWith(
        "Transaction must be signed or completed"
      );
      await expect(meridian.connect(seller).mintTransactionNFTSeller(transactionID)).to.be.revertedWith(
        "Transaction must be signed or completed"
      );
    });

    // Le NFT est un reçu on-chain : il doit rester mintable même une fois le
    // dossier soldé (TransactionCompleted), pas seulement pendant la fenêtre
    // Signed — voir onlySignedOrCompletedTransaction dans InternalFunctions.sol.
    it("permet de minter même une fois le dossier soldé (TransactionCompleted)", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.FullLocked },
        "CONT-REF-001",
        "BILL-NFT-COMPLETED"
      );

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);
      await reportAtDestination(ctx, transactionID);
      await meridian.connect(seller).withdrawFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Completed);

      await expect(meridian.connect(buyer).mintTransactionNFTBuyer(transactionID)).to.emit(meridian, "TransactionNFTMinted");
      await expect(meridian.connect(seller).mintTransactionNFTSeller(transactionID)).to.emit(meridian, "TransactionNFTMinted");
    });

    it("refuse un second mint buyer une fois déjà minté", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-NFT-BUYER-TWICE");

      await meridian.connect(buyer).mintTransactionNFTBuyer(transactionID);

      await expect(meridian.connect(buyer).mintTransactionNFTBuyer(transactionID)).to.be.revertedWith(
        "Buyer NFT already minted for this transaction"
      );
    });

    it("refuse un second mint seller une fois déjà minté", async function () {
      const ctx = await deployFixture();
      const { meridian, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-NFT-SELLER-TWICE");

      await meridian.connect(seller).mintTransactionNFTSeller(transactionID);

      await expect(meridian.connect(seller).mintTransactionNFTSeller(transactionID)).to.be.revertedWith(
        "Seller NFT already minted for this transaction"
      );
    });

    it("refuse l'appel au mint buyer par quelqu'un d'autre que l'acheteur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-NFT-BUYER-OTHER");

      await expect(meridian.connect(other).mintTransactionNFTBuyer(transactionID)).to.be.revertedWith(
        "You're not the declared buyer"
      );
    });

    it("refuse l'appel au mint seller par quelqu'un d'autre que le vendeur déclaré", async function () {
      const ctx = await deployFixture();
      const { meridian, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {}, "CONT-REF-001", "BILL-NFT-SELLER-OTHER");

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

    it("abandonne le dépôt (sans transfert, sans revert) si le vendeur est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await mockSanctionsOracle.setSanctioned(seller.address);
      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);

      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);

      await expect(meridian.connect(buyer).depositFunds(transactionID))
        .to.emit(meridian, "TransactionAborted")
        .withArgs(transactionID, buyer.address, seller.address);

      expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBalanceBefore);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.sellerSanctioned).to.equal(true);
      expect(stored.buyerSanctioned).to.equal(false);
      expect(stored.depositedAmount).to.equal(0);
    });

    it("abandonne le dépôt (sans transfert, sans revert) si l'acheteur est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await mockSanctionsOracle.setSanctioned(buyer.address);
      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);

      await expect(meridian.connect(buyer).depositFunds(transactionID))
        .to.emit(meridian, "TransactionAborted")
        .withArgs(transactionID, buyer.address, seller.address);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.buyerSanctioned).to.equal(true);
      expect(stored.sellerSanctioned).to.equal(false);
      expect(stored.depositedAmount).to.equal(0);
    });

    it("refuse si le token de la devise n'est pas configuré", async function () {
      const ctx = await deployFixture();
      const { ethers, buyer, seller } = ctx;
      // EURC volontairement pas câblé.
      const freshMeridian = await deployPartiallyWiredMeridian(ctx);

      const totalAmount = ethers.parseUnits("100", 6);
      const cancellingDate = await futureDate(ethers);
      const details = buildDetails(
        { currency: Currency.EURC, transactionModel: TransactionModel.FullLocked },
        { totalAmount, transactionCancellingDate: cancellingDate }
      );

      const tx = await freshMeridian.connect(buyer).initializeTransaction(details, "BILL-NOTOKEN");
      const transactionID = await extractTransactionID(freshMeridian, tx);

      await freshMeridian.connect(seller).createTransaction(transactionID, "BILL-NOTOKEN");
      await freshMeridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF", details);
      await freshMeridian.connect(seller).signTransactionSeller(transactionID);
      await freshMeridian.connect(buyer).signTransactionBuyer(transactionID);

      await expect(freshMeridian.connect(buyer).depositFunds(transactionID)).to.be.revertedWith(
        "Token address not configured for this currency"
      );
    });

    // depositFunds n'a plus de vérification de date (transactionDateNotOverdue
    // a été retiré) : l'échéance n'est désormais consultée qu'au moment d'un
    // rollback (rollbackEligibilityStatus), pas pour bloquer un dépôt. Un
    // dépôt après l'échéance doit donc simplement réussir normalement.
    it("permet toujours de déposer après l'échéance (plus de vérification de date dans depositFunds)", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;

      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);

      await expect(meridian.connect(buyer).depositFunds(transactionID))
        .to.emit(meridian, "FundsDeposited")
        .withArgs(transactionID, buyer.address, totalAmount, Currency.USDC);

      const after = await meridian.getTransaction(transactionID);
      expect(after.workflowStatus).to.equal(WorkflowStatus.Signed);
      expect(after.depositedAmount).to.equal(totalAmount);
      expect(after.depositCompleted).to.equal(true);
    });
  });

  // =========================================================================
  // Frais de gestion — setFeesWalletAddress / setFeesRateBps / prélèvement à
  // la signature complète (checkSignatures -> transfertFeesFromBuyer)
  //
  // Mécanique : l'acheteur paie 100% des frais (feesAmount = totalAmount *
  // feesRateBps / 10000) en un virement séparé, dès que les deux signatures
  // sont réunies — pas au dépôt. En contrepartie, il ne dépose ensuite que
  // netAmountDue = totalAmount - feesAmount/2 (pas totalAmount) : le
  // fournisseur reçoit donc mécaniquement moins que totalAmount au retrait,
  // sans qu'aucune ligne de code ne déduise quoi que ce soit à la sortie —
  // c'est ainsi qu'il "paie" sa moitié des frais.
  // =========================================================================
  describe("Frais de gestion", function () {
    describe("setFeesWalletAddress", function () {
      it("permet au owner de configurer le wallet de frais", async function () {
        const { meridian, feesWallet } = await deployFixture();
        await expect(meridian.setFeesWalletAddress(feesWallet.address))
          .to.emit(meridian, "FeesWalletAddressUpdated")
          .withArgs(feesWallet.address);
        expect(await meridian.feesWalletAddress()).to.equal(feesWallet.address);
      });

      it("refuse l'adresse zéro", async function () {
        const { meridian } = await deployFixture();
        await expect(meridian.setFeesWalletAddress(ZERO_ADDRESS)).to.be.revertedWith("Invalid fees wallet address");
      });

      it("refuse un appel par un compte non-owner", async function () {
        const { meridian, other, feesWallet } = await deployFixture();
        await expect(meridian.connect(other).setFeesWalletAddress(feesWallet.address))
          .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
          .withArgs(other.address);
      });
    });

    describe("setFeesRateBps", function () {
      it("permet au owner de configurer le taux de frais (en points de base)", async function () {
        const { meridian } = await deployFixture();
        await expect(meridian.setFeesRateBps(500)).to.emit(meridian, "FeesRateBpsUpdated").withArgs(500);
        expect(await meridian.feesRateBps()).to.equal(500);
      });

      it("refuse un appel par un compte non-owner", async function () {
        const { meridian, other } = await deployFixture();
        await expect(meridian.connect(other).setFeesRateBps(500))
          .to.be.revertedWithCustomError(meridian, "OwnableUnauthorizedAccount")
          .withArgs(other.address);
      });
    });

    describe("prélèvement à la signature complète", function () {
      // Setup commun aux 3 tests suivants : taux à 5%, dossier signé côté
      // vendeur, prêt pour la signature acheteur — celle qui, en complétant
      // les deux signatures, déclenche le prélèvement (voir le commentaire
      // sur createSignedBySellerOnly).
      async function readyForBuyerSignature(
        ctx: Awaited<ReturnType<typeof deployFixture>>,
        transactionModel = TransactionModel.FullLocked
      ) {
        await ctx.meridian.setFeesRateBps(500); // 5%
        const { transactionID, totalAmount } = await createSignedBySellerOnly(ctx, { transactionModel });
        const feesAmount = (totalAmount * 500n) / 10000n;
        const netAmountDue = totalAmount - feesAmount / 2n;
        return { transactionID, totalAmount, feesAmount, netAmountDue };
      }

      it("prélève 100% des frais chez l'acheteur dès la double signature et fige feesAmount/netAmountDue", async function () {
        const ctx = await deployFixture();
        const { meridian, usdc, buyer, feesWallet } = ctx;
        const { transactionID, feesAmount, netAmountDue } = await readyForBuyerSignature(ctx);

        // Seul un approve des frais est nécessaire avant la signature
        // acheteur (celle qui complète le dossier) : l'allowance du dépôt
        // lui-même n'est demandée qu'ensuite, via depositFunds.
        await usdc.connect(buyer).approve(await meridian.getAddress(), feesAmount);

        const feesWalletBalanceBefore = await usdc.balanceOf(feesWallet.address);

        await expect(meridian.connect(buyer).signTransactionBuyer(transactionID))
          .to.emit(meridian, "FeesPaid")
          .withArgs(transactionID, buyer.address, feesWallet.address, feesAmount, Currency.USDC)
          .and.to.emit(meridian, "TransactionSigned");

        expect((await usdc.balanceOf(feesWallet.address)) - feesWalletBalanceBefore).to.equal(feesAmount);

        const stored = await meridian.getTransaction(transactionID);
        expect(stored.feesPaid).to.equal(true);
        expect(stored.feesAmount).to.equal(feesAmount);
        expect(stored.netAmountDue).to.equal(netAmountDue);
      });

      it("limite le dépôt à netAmountDue une fois les frais prélevés à la signature", async function () {
        const ctx = await deployFixture();
        const { meridian, usdc, buyer } = ctx;
        const { transactionID, feesAmount, netAmountDue } = await readyForBuyerSignature(ctx);

        await usdc.connect(buyer).approve(await meridian.getAddress(), feesAmount);
        await meridian.connect(buyer).signTransactionBuyer(transactionID);

        // Le dépôt ne porte que sur netAmountDue, plus sur totalAmount.
        await usdc.connect(buyer).approve(await meridian.getAddress(), netAmountDue);
        await expect(meridian.connect(buyer).depositFunds(transactionID))
          .to.emit(meridian, "FundsDeposited")
          .withArgs(transactionID, buyer.address, netAmountDue, Currency.USDC)
          .and.to.not.emit(meridian, "FeesPaid");

        const stored = await meridian.getTransaction(transactionID);
        expect(stored.depositedAmount).to.equal(netAmountDue);
        expect(stored.depositCompleted).to.equal(true);
      });

      it("le fournisseur ne perçoit que netAmountDue au retrait (sa moitié des frais est absorbée par le dépôt réduit)", async function () {
        const ctx = await deployFixture();
        const { meridian, usdc, buyer, seller } = ctx;
        const { transactionID, feesAmount, netAmountDue } = await readyForBuyerSignature(ctx);

        await usdc.connect(buyer).approve(await meridian.getAddress(), feesAmount);
        await meridian.connect(buyer).signTransactionBuyer(transactionID);
        await usdc.connect(buyer).approve(await meridian.getAddress(), netAmountDue);
        await meridian.connect(buyer).depositFunds(transactionID);

        // FullLocked -> AdvancePaymentMode.Deferred : le retrait exige le
        // conteneur à destination (transactionCondition par défaut =
        // AtTheEndOfDelivery, voir buildDetails).
        await reportAtDestination(ctx, transactionID);
        const sellerBalanceBefore = await usdc.balanceOf(seller.address);
        await meridian.connect(seller).withdrawFunds(transactionID);

        // Aucune déduction séparée ici : sa moitié des frais a déjà été
        // absorbée par la réduction du montant déposé.
        expect((await usdc.balanceOf(seller.address)) - sellerBalanceBefore).to.equal(netAmountDue);
      });

      it("plafonne advanceAmount à netAmountDue s'il le dépassait (saisi avant que netAmountDue existe)", async function () {
        const ctx = await deployFixture();
        const { meridian, usdc, buyer } = ctx;
        await meridian.setFeesRateBps(500); // 5%

        const totalAmount = 1000n * 10n ** 6n;
        // Modèle Free : advanceAmount est repris tel quel (pas de mise à
        // l'échelle 30%/15%), le cas le plus direct pour dépasser netAmountDue.
        const { transactionID } = await createSignedBySellerOnly(ctx, {
          transactionModel: TransactionModel.Free,
          advanceAmount: totalAmount,
          totalAmount,
        });
        const feesAmount = (totalAmount * 500n) / 10000n;
        const netAmountDue = totalAmount - feesAmount / 2n;

        await usdc.connect(buyer).approve(await meridian.getAddress(), feesAmount);
        await meridian.connect(buyer).signTransactionBuyer(transactionID);

        const afterSign = await meridian.getTransaction(transactionID);
        expect(afterSign.advanceAmount).to.equal(netAmountDue); // plafonné, pas totalAmount

        // Le dépôt couvre alors netAmountDue en un seul appel.
        await usdc.connect(buyer).approve(await meridian.getAddress(), netAmountDue);
        await expect(meridian.connect(buyer).depositFunds(transactionID))
          .to.emit(meridian, "FundsDeposited")
          .withArgs(transactionID, buyer.address, netAmountDue, Currency.USDC);

        expect((await meridian.getTransaction(transactionID)).depositCompleted).to.equal(true);
      });

      it("n'a aucun effet quand feesRateBps vaut 0 (comportement par défaut, rétrocompatible)", async function () {
        const ctx = await deployFixture();
        const { meridian, usdc, buyer, feesWallet } = ctx;
        const { transactionID, totalAmount } = await createSignedBySellerOnly(ctx, {
          transactionModel: TransactionModel.FullLocked,
        });

        const feesWalletBalanceBefore = await usdc.balanceOf(feesWallet.address);

        await expect(meridian.connect(buyer).signTransactionBuyer(transactionID)).to.not.emit(meridian, "FeesPaid");

        const stored = await meridian.getTransaction(transactionID);
        expect(stored.feesAmount).to.equal(0);
        expect(stored.feesPaid).to.equal(false);
        expect(stored.netAmountDue).to.equal(totalAmount);
        expect(await usdc.balanceOf(feesWallet.address)).to.equal(feesWalletBalanceBefore);
      });

      it("refuse la signature acheteur si l'allowance ne couvre pas les frais", async function () {
        const ctx = await deployFixture();
        const { meridian, usdc, buyer } = ctx;
        const { transactionID } = await readyForBuyerSignature(ctx);

        // Aucune approbation des frais.
        await expect(meridian.connect(buyer).signTransactionBuyer(transactionID)).to.be.revertedWithCustomError(
          usdc,
          "ERC20InsufficientAllowance"
        );
      });

      it("refuse la signature acheteur si le wallet de frais n'est pas configuré (taux non nul)", async function () {
        const ctx = await deployFixture();
        const { ethers, usdc, buyer, seller } = ctx;
        // Wallet de frais volontairement pas câblé.
        const freshMeridian = await deployPartiallyWiredMeridian(ctx, {
          tokenAddress: await usdc.getAddress(),
          feesRateBps: 500,
        });

        const totalAmount = ethers.parseUnits("100", 6);
        const cancellingDate = await futureDate(ethers);
        const details = buildDetails(
          { transactionModel: TransactionModel.FullLocked },
          { totalAmount, transactionCancellingDate: cancellingDate }
        );

        const tx = await freshMeridian.connect(buyer).initializeTransaction(details, "BILL-NOFEESWALLET");
        const transactionID = await extractTransactionID(freshMeridian, tx);

        await freshMeridian.connect(seller).createTransaction(transactionID, "BILL-NOFEESWALLET");
        await freshMeridian.connect(seller).saveTransactionDetailsSeller(transactionID, "REF", details);
        await freshMeridian.connect(seller).signTransactionSeller(transactionID);

        const feesAmount = (totalAmount * 500n) / 10000n;
        await usdc.connect(buyer).approve(await freshMeridian.getAddress(), feesAmount);

        await expect(freshMeridian.connect(buyer).signTransactionBuyer(transactionID)).to.be.revertedWith(
          "Fees wallet address not configured"
        );
      });
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
        "No pending amount to withdraw"
      );
    });

    it("abandonne le retrait (sans transfert, sans revert) si le vendeur est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);
      await reportAtDestination(ctx, transactionID);

      await mockSanctionsOracle.setSanctioned(seller.address);

      const sellerBalanceBefore = await usdc.balanceOf(seller.address);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "TransactionAborted")
        .withArgs(transactionID, buyer.address, seller.address);

      expect(await usdc.balanceOf(seller.address)).to.equal(sellerBalanceBefore);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      // Rien n'a été retiré : le montant en attente reste intact (utile ensuite
      // pour un éventuel rollbackDeposit côté acheteur).
      expect(stored.pendingWithdrawalAmount).to.equal(totalAmount);
      expect(stored.sellerSanctioned).to.equal(true);
      expect(stored.buyerSanctioned).to.equal(false);
    });

    it("abandonne le retrait (sans transfert, sans revert) si l'acheteur est sanctionné", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, mockSanctionsOracle, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);
      await reportAtDestination(ctx, transactionID);

      await mockSanctionsOracle.setSanctioned(buyer.address);

      const sellerBalanceBefore = await usdc.balanceOf(seller.address);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "TransactionAborted")
        .withArgs(transactionID, buyer.address, seller.address);

      expect(await usdc.balanceOf(seller.address)).to.equal(sellerBalanceBefore);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Aborted);
      expect(stored.pendingWithdrawalAmount).to.equal(totalAmount);
      expect(stored.buyerSanctioned).to.equal(true);
      expect(stored.sellerSanctioned).to.equal(false);
    });

    it("refuse tant que la position du conteneur n'a pas été reportée (AtTheEndOfDelivery)", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.be.revertedWith(
        "Container must be at destination for withdrawal"
      );
    });

    // Le test ci-dessus utilise FullLocked, où AdvancePaymentMode.Deferred est
    // imposé (calculateAdvancePaymentMode), pas choisi. Free est le seul
    // modèle où Deferred est un vrai choix explicite : on vérifie ici que la
    // porte containerPositionStatus bloque bien le retrait indépendamment de
    // ce choix, et pas seulement pour la valeur par défaut/forcée.
    it("refuse le retrait tant que la position n'a pas été reportée (Free, AdvancePaymentMode.Deferred)", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.Free,
        advancePaymentMode: AdvancePaymentMode.Deferred,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.advancePaymentMode).to.equal(AdvancePaymentMode.Deferred);
      expect(stored.containerPositionStatus).to.equal(ContainerPositionStatus.UnSet);

      await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.be.revertedWith(
        "Container must be at destination for withdrawal"
      );
    });

    // Contrepartie du test ci-dessus : quand AdvancePaymentMode = Immediate,
    // withdrawFunds ne doit plus du tout regarder containerPositionStatus —
    // le vendeur peut retirer dès que l'acheteur a déposé, sans attendre le
    // moindre report de position (même UnSet, jamais reporté).
    it("permet le retrait dès le dépôt, sans attendre la position du conteneur (Free, AdvancePaymentMode.Immediate)", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.Free,
        advancePaymentMode: AdvancePaymentMode.Immediate,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.advancePaymentMode).to.equal(AdvancePaymentMode.Immediate);
      expect(stored.containerPositionStatus).to.equal(ContainerPositionStatus.UnSet);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, totalAmount, Currency.USDC);
    });

    it("permet le retrait dès le dépôt, sans attendre la position du conteneur (PartialImmediate)", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.PartialImmediate,
        advanceAmount: ethers.parseUnits("1000", 6),
      });

      const advance = (ethers.parseUnits("1000", 6) * 15n) / 100n;
      await usdc.connect(buyer).approve(await meridian.getAddress(), advance);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.advancePaymentMode).to.equal(AdvancePaymentMode.Immediate);
      expect(stored.containerPositionStatus).to.equal(ContainerPositionStatus.UnSet);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, advance, Currency.USDC);
    });

    // Le bypass "Immediate" ne vaut que pour le tout premier retrait :
    // partialWithdrawalCompleted passe à true après ce premier retrait, et
    // le reliquat (déposé ensuite) redevient soumis à la même condition de
    // position que Deferred, même si advancePaymentMode reste Immediate.
    it("réapplique la condition de position dès le second retrait, même en AdvancePaymentMode.Immediate", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer, seller } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const { transactionID } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.PartialImmediate,
        advanceAmount: totalAmount,
      });
      const advance = (totalAmount * 15n) / 100n;
      const remainder = totalAmount - advance;

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);

      // 1er dépôt (l'acompte) + 1er retrait : Immediate, aucune position requise.
      await meridian.connect(buyer).depositFunds(transactionID);
      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, advance, Currency.USDC);

      let stored = await meridian.getTransaction(transactionID);
      expect(stored.partialWithdrawalCompleted).to.equal(true);

      // 2e dépôt (le reliquat) : le retrait doit désormais respecter la même
      // condition de position que Deferred, alors même qu'advancePaymentMode
      // vaut toujours Immediate.
      await meridian.connect(buyer).depositFunds(transactionID);
      await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.be.revertedWith(
        "Container must be at destination for withdrawal"
      );

      await reportAtDestination(ctx, transactionID);

      await expect(meridian.connect(seller).withdrawFunds(transactionID))
        .to.emit(meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, remainder, Currency.USDC)
        .and.to.emit(meridian, "TransactionCompleted");

      stored = await meridian.getTransaction(transactionID);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Completed);
      expect(stored.withdrawalCompleted).to.equal(true);
    });

    it("accepte InTransit ou AtDestination pour la condition AtTheBeginningOfDelivery", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller, containerPositionOracle } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
        transactionCondition: TransactionCondition.AtTheBeginningOfDelivery,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      await meridian
        .connect(containerPositionOracle)
        .reportContainerPosition(transactionID, ContainerPositionStatus.InTransit);

      await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.emit(meridian, "FundsWithdrawn");
    });

    it("permet au vendeur de retirer les fonds déposés et transfère les tokens", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer, seller } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);
      await reportAtDestination(ctx, transactionID);

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
      await reportAtDestination(ctx, transactionID);

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
      await reportAtDestination(ctx, transactionID);

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
      await reportAtDestination(ctx, transactionID);
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

    // Dépose autant de fois que nécessaire pour couvrir totalAmount : 1 appel
    // pour FullLocked/Free (advanceAmount=0), 2 pour PartialLocked/PartialImmediate
    // (acompte, puis reliquat) — voir calculateDepositAmount.
    async function depositUntilComplete(ctx: Awaited<ReturnType<typeof deployFixture>>, transactionID: string) {
      const { meridian, buyer } = ctx;
      let stored = await meridian.getTransaction(transactionID);
      while (!stored.depositCompleted) {
        await meridian.connect(buyer).depositFunds(transactionID);
        stored = await meridian.getTransaction(transactionID);
      }
    }

    // Couverture systématique de withdrawFunds pour chaque TransactionModel,
    // y compris les 2 AdvancePaymentMode possibles pour Free (les autres
    // modèles imposent le leur — voir les tests de calculateAdvancePaymentMode
    // dans initializeTransaction ci-dessus).
    const modelConfigs = [
      { label: "FullLocked", slug: "FULL", transactionModel: TransactionModel.FullLocked, advancePaymentMode: AdvancePaymentMode.Deferred },
      { label: "PartialLocked", slug: "PLOCK", transactionModel: TransactionModel.PartialLocked, advancePaymentMode: AdvancePaymentMode.Deferred },
      { label: "PartialImmediate", slug: "PIMM", transactionModel: TransactionModel.PartialImmediate, advancePaymentMode: AdvancePaymentMode.Immediate },
      { label: "Free (AdvancePaymentMode.Immediate)", slug: "FREE-IMM", transactionModel: TransactionModel.Free, advancePaymentMode: AdvancePaymentMode.Immediate },
      { label: "Free (AdvancePaymentMode.Deferred)", slug: "FREE-DEF", transactionModel: TransactionModel.Free, advancePaymentMode: AdvancePaymentMode.Deferred },
    ];

    for (const { label, slug, transactionModel, advancePaymentMode } of modelConfigs) {
      it(`retire l'intégralité et complète la transaction pour le modèle ${label}`, async function () {
        const ctx = await deployFixture();
        const { ethers, meridian, usdc, buyer, seller } = ctx;
        const advanceAmount =
          transactionModel === TransactionModel.PartialLocked || transactionModel === TransactionModel.PartialImmediate
            ? ethers.parseUnits("1000", 6)
            : 0;

        const { transactionID, totalAmount } = await createAndSignTransaction(
          ctx,
          { transactionModel, advancePaymentMode, advanceAmount },
          "CONT-REF-001",
          `BILL-MODEL-${slug}`
        );

        await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
        await depositUntilComplete(ctx, transactionID);
        await reportAtDestination(ctx, transactionID);

        const sellerBalanceBefore = await usdc.balanceOf(seller.address);

        await expect(meridian.connect(seller).withdrawFunds(transactionID)).to.emit(meridian, "TransactionCompleted");

        const sellerBalanceAfter = await usdc.balanceOf(seller.address);
        expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(totalAmount);

        const stored = await meridian.getTransaction(transactionID);
        expect(stored.workflowStatus).to.equal(WorkflowStatus.Completed);
        expect(stored.withdrawalCompleted).to.equal(true);
        expect(stored.pendingWithdrawalAmount).to.equal(0);
      });
    }
  });

  // =========================================================================
  // rollbackDeposit
  // =========================================================================
  describe("rollbackDeposit", function () {
    // FullLocked signé et intégralement déposé — préalable commun aux tests
    // ci-dessous, qui ne diffèrent qu'en cela : dépassent-ils ou non
    // ensuite l'échéance avant d'appeler rollbackDeposit.
    async function signedAndDepositedFullLocked(
      ctx: Awaited<ReturnType<typeof deployFixture>>,
      billNumber = "BILL-ROLLBACK"
    ) {
      const { meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.FullLocked },
        "CONT-REF-001",
        billNumber
      );

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      return { transactionID, totalAmount };
    }

    async function overdueAfterDeposit(
      ctx: Awaited<ReturnType<typeof deployFixture>>,
      billNumber = "BILL-ROLLBACK"
    ) {
      const { ethers, meridian } = ctx;
      const { transactionID, totalAmount } = await signedAndDepositedFullLocked(ctx, billNumber);

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

      return { transactionID, totalAmount };
    }

    it("refuse tant que la transaction n'est pas éligible au rollback (échéance non dépassée)", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await signedAndDepositedFullLocked(ctx, "BILL-NOT-OVERDUE");

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID)).to.be.revertedWith(
        "Transaction is not eligible for rollback"
      );
    });

    it("rembourse intégralement l'acheteur une fois la date dépassée", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await overdueAfterDeposit(ctx);

      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID))
        .to.emit(meridian, "totalAmountRefunded")
        .withArgs(transactionID, buyer.address, totalAmount, Currency.USDC)
        .and.to.not.emit(meridian, "TransactionAborted");

      const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(totalAmount);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.depositedAmount).to.equal(0);
      expect(stored.pendingWithdrawalAmount).to.equal(0);
      expect(stored.totalAmountRefunded).to.equal(true);
      // rollbackEligibilityStatus ne fait plus persister de passage à
      // Aborted (effet de bord retiré) : le statut reste Signed après un
      // rollback, même quand l'éligibilité vient de la voie "échéance
      // dépassée + condition non remplie" — le dossier reste utilisable
      // (voir "permet de redéposer après un rollback intégral" ci-dessous).
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Signed);
      // Corollaire indispensable : sans ce reset, un second depositFunds
      // reverterait avec "Payment already completed" alors que depositedAmount
      // vaut 0 (voir rollbackDepositCore).
      expect(stored.depositCompleted).to.equal(false);
    });

    it("permet de redéposer après un rollback intégral (depositCompleted correctement réinitialisé)", async function () {
      const ctx = await deployFixture();
      const { meridian, usdc, buyer } = ctx;
      const { transactionID, totalAmount } = await overdueAfterDeposit(ctx, "BILL-ROLLBACK-REDEPOSIT");

      await meridian.connect(buyer).rollbackDeposit(transactionID);

      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await expect(meridian.connect(buyer).depositFunds(transactionID))
        .to.emit(meridian, "FundsDeposited")
        .withArgs(transactionID, buyer.address, totalAmount, Currency.USDC);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.depositedAmount).to.equal(totalAmount);
      expect(stored.depositCompleted).to.equal(true);
    });

    it("rembourse partiellement si le dépôt n'a pas atteint totalAmount", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer } = ctx;
      const totalAmount = ethers.parseUnits("1000", 6);
      const { transactionID } = await createAndSignTransaction(
        ctx,
        { transactionModel: TransactionModel.PartialLocked, advanceAmount: totalAmount },
        "CONT-REF-001",
        "BILL-PARTIAL-REFUND"
      );

      const advance = (totalAmount * 30n) / 100n;
      await usdc.connect(buyer).approve(await meridian.getAddress(), advance);
      await meridian.connect(buyer).depositFunds(transactionID);

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID))
        .to.emit(meridian, "partialAmountRefunded")
        .withArgs(transactionID, buyer.address, advance, Currency.USDC)
        .and.to.not.emit(meridian, "TransactionAborted");

      const after = await meridian.getTransaction(transactionID);
      expect(after.partialAmountRefunded).to.equal(true);
      expect(after.workflowStatus).to.equal(WorkflowStatus.Signed);
      expect(after.depositCompleted).to.equal(false);
    });

    it("refuse un second rollback une fois les fonds déjà remboursés", async function () {
      const ctx = await deployFixture();
      const { meridian, buyer } = ctx;
      const { transactionID } = await overdueAfterDeposit(ctx, "BILL-ROLLBACK-TWICE");

      await meridian.connect(buyer).rollbackDeposit(transactionID);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID)).to.be.revertedWith(
        "No pending amount to rollback"
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
  // withdrawFundsWithPositionUpdate / rollbackDepositWithPositionUpdate —
  // applySignedContainerPosition : le wallet oracle ne fait que signer (hors
  // chaîne, gratuit) ; c'est l'utilisateur (vendeur ou acheteur) qui envoie
  // la transaction et paie le gas de la mise à jour on-chain.
  // =========================================================================
  describe("withdrawFundsWithPositionUpdate / rollbackDepositWithPositionUpdate", function () {
    it("withdrawFundsWithPositionUpdate : applique l'attestation signée puis retire les fonds, en un seul appel", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer, seller } = ctx;
      // AtTheEndOfDelivery (défaut de buildDetails) : sans position reportée,
      // withdrawFunds seul refuserait ("Container must be at destination").
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });
      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      const deadline = (await futureDate(ethers, 0)) + 600;
      const signature = await signContainerPosition(ctx, transactionID, ContainerPositionStatus.AtDestination, deadline);

      await expect(
        meridian
          .connect(seller)
          .withdrawFundsWithPositionUpdate(transactionID, ContainerPositionStatus.AtDestination, deadline, signature)
      )
        .to.emit(meridian, "ContainerPositionReported")
        .withArgs(transactionID, ContainerPositionStatus.AtDestination)
        .and.to.emit(meridian, "FundsWithdrawn")
        .withArgs(transactionID, seller.address, totalAmount, Currency.USDC);

      const stored = await meridian.getTransaction(transactionID);
      expect(stored.containerPositionStatus).to.equal(ContainerPositionStatus.AtDestination);
      expect(stored.pendingWithdrawalAmount).to.equal(0);
      expect(stored.workflowStatus).to.equal(WorkflowStatus.Completed);
    });

    it("refuse une signature expirée", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      const expiredDeadline = (await futureDate(ethers, 0)) - 10;
      const signature = await signContainerPosition(
        ctx,
        transactionID,
        ContainerPositionStatus.AtDestination,
        expiredDeadline
      );

      await expect(
        meridian
          .connect(seller)
          .withdrawFundsWithPositionUpdate(
            transactionID,
            ContainerPositionStatus.AtDestination,
            expiredDeadline,
            signature
          )
      ).to.be.revertedWith("Container position signature expired");
    });

    it("refuse une signature venant d'un autre compte que l'oracle configuré", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller, other } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      const deadline = (await futureDate(ethers, 0)) + 600;
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "uint8", "uint256", "address"],
        [transactionID, ContainerPositionStatus.AtDestination, deadline, await meridian.getAddress()]
      );
      const wrongSignature = await other.signMessage(ethers.getBytes(messageHash));

      await expect(
        meridian
          .connect(seller)
          .withdrawFundsWithPositionUpdate(transactionID, ContainerPositionStatus.AtDestination, deadline, wrongSignature)
      ).to.be.revertedWith("Invalid container position signature");
    });

    it("refuse si le statut soumis ne correspond pas à celui réellement signé", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, seller } = ctx;
      const { transactionID } = await createAndSignTransaction(ctx);

      const deadline = (await futureDate(ethers, 0)) + 600;
      // Signé pour InTransit, mais on soumet AtDestination : le hash
      // reconstruit on-chain ne correspond plus à la signature.
      const signature = await signContainerPosition(ctx, transactionID, ContainerPositionStatus.InTransit, deadline);

      await expect(
        meridian
          .connect(seller)
          .withdrawFundsWithPositionUpdate(transactionID, ContainerPositionStatus.AtDestination, deadline, signature)
      ).to.be.revertedWith("Invalid container position signature");
    });

    it("rollbackDepositWithPositionUpdate : applique l'attestation signée puis rembourse l'acheteur", async function () {
      const ctx = await deployFixture();
      const { ethers, meridian, usdc, buyer, containerPositionOracle } = ctx;
      const { transactionID, totalAmount } = await createAndSignTransaction(ctx, {
        transactionModel: TransactionModel.FullLocked,
      });
      await usdc.connect(buyer).approve(await meridian.getAddress(), totalAmount);
      await meridian.connect(buyer).depositFunds(transactionID);

      // Position réellement à AtDestination sur la chaîne : une fois
      // l'échéance dépassée, un rollbackDeposit "nu" serait refusé (condition
      // de livraison déjà remplie).
      await meridian
        .connect(containerPositionOracle)
        .reportContainerPosition(transactionID, ContainerPositionStatus.AtDestination);

      const stored = await meridian.getTransaction(transactionID);
      await jumpPastCancellingDate(ethers, stored.transactionCancellingDate);

      await expect(meridian.connect(buyer).rollbackDeposit(transactionID)).to.be.revertedWith(
        "Transaction is not eligible for rollback"
      );

      // L'attestation signée fait revenir la position à InTransit : le
      // rollback redevient éligible dans le même appel qui l'applique.
      const deadline = (await futureDate(ethers, 0)) + 600;
      const signature = await signContainerPosition(ctx, transactionID, ContainerPositionStatus.InTransit, deadline);

      await expect(
        meridian
          .connect(buyer)
          .rollbackDepositWithPositionUpdate(transactionID, ContainerPositionStatus.InTransit, deadline, signature)
      )
        .to.emit(meridian, "ContainerPositionReported")
        .withArgs(transactionID, ContainerPositionStatus.InTransit)
        .and.to.emit(meridian, "totalAmountRefunded")
        .withArgs(transactionID, buyer.address, totalAmount, Currency.USDC);

      const after = await meridian.getTransaction(transactionID);
      expect(after.containerPositionStatus).to.equal(ContainerPositionStatus.InTransit);
      expect(after.pendingWithdrawalAmount).to.equal(0);
      expect(after.totalAmountRefunded).to.equal(true);
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
