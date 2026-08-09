import { network } from "hardhat";
import { expect } from "chai";

// Ordre des enums tel que déclaré dans InternalFunctions.sol
const Currency = { USDC: 0, USDT: 1, EURC: 2 };
const TransactionCondition = { AtTheBeginningOfDelivery: 0, AtTheEndOfDelivery: 1 };
const TransactionModel = { FullLocked: 0, PartialLocked: 1, PartialImmediate: 2, Free: 3 };
const AdvancePaymentMode = { Immediate: 0, Deferred: 1 };

describe("MeridianNFT", function () {
  async function deployFixture() {
    const { ethers } = await network.getOrCreate();
    const [deployer, buyer, seller, other] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockERC20", ["Mock USDC", "USDC", 6]);
    const meridian = await ethers.deployContract("Meridian");
    await meridian.setTokenAddress(Currency.USDC, await usdc.getAddress());

    const mockSanctionsOracle = await ethers.deployContract("SanctionsList");
    await meridian.setMockSanctionsOracleAddress(await mockSanctionsOracle.getAddress());
    await meridian.setSanctionsOracleAddress(await mockSanctionsOracle.getAddress());

    // Meridian doit être owner de MeridianNFT pour pouvoir appeler
    // mintOne (onlyOwner côté MeridianNFT).
    const meridianNFT = await ethers.deployContract("MeridianNFT", [await meridian.getAddress()]);
    await meridian.setMeridianNFTAddress(await meridianNFT.getAddress());

    const mintAmount = ethers.parseUnits("10000", 6);
    await usdc.mint(buyer.address, mintAmount);

    return { ethers, meridian, meridianNFT, usdc, deployer, buyer, seller, other };
  }

  async function futureDate(ethersLib: any, daysFromNow = 30) {
    const latestBlock = await ethersLib.provider.getBlock("latest");
    return latestBlock!.timestamp + daysFromNow * 24 * 60 * 60;
  }

  // Fait avancer une transaction jusqu'à l'état Signed.
  async function createAndSignTransaction(ctx: Awaited<ReturnType<typeof deployFixture>>, billNumber = "BILL-NFT") {
    const { ethers, meridian, buyer, seller } = ctx;
    const totalAmount = ethers.parseUnits("1000", 6);
    const cancellingDate = await futureDate(ethers);

    const details = {
      currency: Currency.USDC,
      transactionCondition: TransactionCondition.AtTheEndOfDelivery,
      transactionModel: TransactionModel.FullLocked,
      advancePaymentMode: AdvancePaymentMode.Deferred,
      advanceAmount: 0,
      totalAmount,
      transactionCancellingDate: cancellingDate,
    };

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
    const transactionID = parsed!.args.transactionID;

    await meridian.connect(seller).createTransaction(transactionID, billNumber);

    await meridian.connect(seller).saveTransactionDetailsSeller(transactionID, "CONT-NFT-001", details);

    await meridian.connect(seller).signTransactionSeller(transactionID);
    await meridian.connect(buyer).signTransactionBuyer(transactionID);

    return { transactionID, details, billNumber };
  }

  function decodeTokenURI(uri: string): any {
    const prefix = "data:application/json;base64,";
    expect(uri.startsWith(prefix)).to.equal(true);
    const json = Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
    return JSON.parse(json);
  }

  async function tokenIdFromMintTx(meridian: any, tx: any) {
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
    return parsed!.args.tokenId;
  }

  it("mint un NFT pour l'acheteur et un pour le vendeur (appels séparés), avec la metadata de la transaction", async function () {
    const ctx = await deployFixture();
    const { meridian, meridianNFT, buyer, seller } = ctx;
    const { transactionID, details, billNumber } = await createAndSignTransaction(ctx);

    const buyerTokenId = await tokenIdFromMintTx(
      meridian,
      await meridian.connect(buyer).mintTransactionNFTBuyer(transactionID)
    );
    const sellerTokenId = await tokenIdFromMintTx(
      meridian,
      await meridian.connect(seller).mintTransactionNFTSeller(transactionID)
    );

    expect(await meridianNFT.ownerOf(buyerTokenId)).to.equal(buyer.address);
    expect(await meridianNFT.ownerOf(sellerTokenId)).to.equal(seller.address);
    expect(buyerTokenId).to.not.equal(sellerTokenId);

    const stored = await meridianNFT.getTransactionData(buyerTokenId);
    expect(stored.transactionID).to.equal(transactionID);
    expect(stored.buyer).to.equal(buyer.address);
    expect(stored.seller).to.equal(seller.address);
    expect(stored.currency).to.equal(details.currency);
    expect(stored.totalAmount).to.equal(details.totalAmount);

    const metadata = decodeTokenURI(await meridianNFT.tokenURI(buyerTokenId));
    expect(metadata.name).to.include(billNumber);
    const currencyAttr = metadata.attributes.find((a: any) => a.trait_type === "Currency");
    expect(currencyAttr.value).to.equal("USDC");
    const totalAmountAttr = metadata.attributes.find((a: any) => a.trait_type === "Total Amount");
    expect(totalAmountAttr.value).to.equal(Number(details.totalAmount));
  });

  it("refuse un appel direct à mintOne par quelqu'un d'autre que Meridian", async function () {
    const ctx = await deployFixture();
    const { meridianNFT, other } = ctx;

    const data = {
      transactionID: "0x0000000000000000000000000000000000000000000000000000000000000001",
      billNumber: "BILL-DIRECT",
      buyer: other.address,
      seller: other.address,
      currency: 0,
      transactionCondition: 0,
      transactionModel: 0,
      advancePaymentMode: 0,
      advanceAmount: 0,
      totalAmount: 100,
      transactionCancellingDate: 0,
      containerReference: "REF",
    };

    // mintOne est onlyOwner, et le owner de MeridianNFT est Meridian, pas
    // `other` : personne d'autre que le contrat Meridian ne peut forger un
    // NFT avec des données inventées.
    await expect(meridianNFT.connect(other).mintOne(other.address, data))
      .to.be.revertedWithCustomError(meridianNFT, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
  });

  it("refuse même un appel direct par le deployer (qui n'est pas Meridian)", async function () {
    const ctx = await deployFixture();
    const { meridianNFT, deployer, other } = ctx;

    const data = {
      transactionID: "0x0000000000000000000000000000000000000000000000000000000000000001",
      billNumber: "BILL-DIRECT-2",
      buyer: other.address,
      seller: other.address,
      currency: 0,
      transactionCondition: 0,
      transactionModel: 0,
      advancePaymentMode: 0,
      advanceAmount: 0,
      totalAmount: 100,
      transactionCancellingDate: 0,
      containerReference: "REF",
    };

    await expect(meridianNFT.connect(deployer).mintOne(other.address, data))
      .to.be.revertedWithCustomError(meridianNFT, "OwnableUnauthorizedAccount")
      .withArgs(deployer.address);
  });
});
