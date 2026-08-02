import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

describe("Meridian", function () {
  let Meridian: any;
  let meridian: any;
  let owner: any;
  let buyer: any;
  let seller: any;

  beforeEach(async function () {
    [owner, buyer, seller] = await ethers.getSigners();

    const contractPath = "contracts/Meridian/Meridian.sol";
    const MeridianFactory = await ethers.getContractFactory(contractPath);
    meridian = await MeridianFactory.deploy();
    await meridian.deployed();
  });

  it("Should initialize a transaction", async function () {
    const currency: number = 0; // USDC
    const transactionCondition: number = 0; // AtTheBeginningOfDelivery
    const transactionModel: number = 0; // FullLocked
    const advancePaymentMode: number = 0; // Immediate
    // const advanceAmount: number = ethers.utils.parseEther("1");
    // const totalAmount: number = ethers.utils.parseEther("2");
    const advanceAmount: number = 1;
    const totalAmount: number = 2;
    const transactionCancellingDate: number = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    await meridian.initializeTransaction(
      {
        currency,
        transactionCondition,
        transactionModel,
        advancePaymentMode,
        advanceAmount,
        totalAmount,
        transactionCancellingDate
      },
      "Bill123",
      { value: 0 }
    );

    const transactionID = await meridian.internalID();
    const transaction = await meridian.getTransaction(transactionID);

    expect(transaction.workflowStatus).to.equal(0); // TransactionInitialized
    expect(transaction.buyer.userAddress).to.equal(buyer.address);
    expect(transaction.currency).to.equal(currency);
    expect(transaction.transactionCondition).to.equal(transactionCondition);
    expect(transaction.transactionModel).to.equal(transactionModel);
    expect(transaction.advancePaymentMode).to.equal(advancePaymentMode);
    expect(transaction.advanceAmount).to.equal(advanceAmount);
    expect(transaction.totalAmount).to.equal(totalAmount);
    expect(transaction.transactionCancellingDate).to.equal(transactionCancellingDate);
  });
});