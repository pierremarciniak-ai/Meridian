import { network } from "hardhat";

// Ordre de l'enum Currency dans Meridian.sol : USDC = 0, USDT = 1, EURC = 2
const CURRENCY = { USDC: 0, USDT: 1, EURC: 2 };

async function main() {
  const { ethers } = await network.getOrCreate();

  const [deployer, buyer, seller, containerPositionOracle, feesWallet] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log("Buyer   :", buyer.address);
  console.log("Seller  :", seller.address);
  console.log("Container position oracle:", containerPositionOracle.address);
  console.log("Fees wallet:", feesWallet.address);

  // --- 1. Déploiement des 3 mocks (6 décimales, comme les vrais USDC/USDT/EURC) ---
  const usdc = await ethers.deployContract("MockERC20", ["Mock USDC", "USDC", 6]);
  await usdc.waitForDeployment();

  const usdt = await ethers.deployContract("MockERC20", ["Mock USDT", "USDT", 6]);
  await usdt.waitForDeployment();

  const eurc = await ethers.deployContract("MockERC20", ["Mock EURC", "EURC", 6]);
  await eurc.waitForDeployment();

  console.log("USDC:", await usdc.getAddress());
  console.log("USDT:", await usdt.getAddress());
  console.log("EURC:", await eurc.getAddress());

  // --- 2. Déploiement de Meridian ---
  const meridian = await ethers.deployContract("Meridian");
  await meridian.waitForDeployment();
  console.log("Meridian:", await meridian.getAddress());

  // --- 3. Configuration des adresses de token dans Meridian ---
  await meridian.setTokenAddress(CURRENCY.USDC, await usdc.getAddress());
  await meridian.setTokenAddress(CURRENCY.USDT, await usdt.getAddress());
  await meridian.setTokenAddress(CURRENCY.EURC, await eurc.getAddress());

  // --- 4. Distribution de tokens de test ---
  const amount = ethers.parseUnits("10000", 6);

  await usdc.mint(buyer.address, amount);
  await usdt.mint(buyer.address, amount);
  await eurc.mint(buyer.address, amount);

  console.log(`\n${ethers.formatUnits(amount, 6)} USDC/USDT/EURC mintés vers ${buyer.address}`);

  await usdc.mint(seller.address, amount);
  await usdt.mint(seller.address, amount);
  await eurc.mint(seller.address, amount);

  console.log(`\n${ethers.formatUnits(amount, 6)} USDC/USDT/EURC mintés vers ${seller.address}`);

  // --- 5. Déploiement de l'oracle OFAC ---
  const sanctionsList = await ethers.deployContract("SanctionsList");
  await sanctionsList.waitForDeployment();

  console.log("MockSanctionsOracle:", await sanctionsList.getAddress());

  await meridian.setSanctionsOracleAddress(await sanctionsList.getAddress());
  await meridian.setMockSanctionsOracleAddress(await sanctionsList.getAddress());

  // --- 6. Déploiement de MeridianNFT ---
  const meridianNFT = await ethers.deployContract("MeridianNFT", [await meridian.getAddress()]);
  await meridianNFT.waitForDeployment();
  console.log("MeridianNFT:", await meridianNFT.getAddress());

  await meridian.setMeridianNFTAddress(await meridianNFT.getAddress());

  // --- 7. Oracle de position de conteneur (backend VesselFinder) ---
  await meridian.setContainerPositionOracleAddress(containerPositionOracle.address);

  // --- 8. Configuration du wallet de frais (backend) ---
  await meridian.setFeesWalletAddress(feesWallet.address);
  await meridian.setFeesAmount(2000000); // 2000000 = 2 USDC/USDT/EURC (6 décimales)
  console.log("Fees set: ", await meridian.feesAmount());

  console.log("\n--- Pour l'attestation de position (frontend/meridian/.env.local) ---");
  console.log("CONTAINER_ORACLE_PRIVATE_KEY= (clé privée du compte #3 affichée au démarrage de `npx hardhat node`)");
  console.log("Adresse correspondante :", containerPositionOracle.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
