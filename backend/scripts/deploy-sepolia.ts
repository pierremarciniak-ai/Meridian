import { network } from "hardhat";
import { isAddress } from "ethers";

// Ordre de l'enum Currency dans Meridian.sol : USDC = 0, USDT = 1, EURC = 2
const CURRENCY = { USDC: 0, USDT: 1, EURC: 2 };

const ADMIN_ADDRESS = "0xbdC42fAe1428584a28A038Af9922D769f799fa57";
const BUYER_ADDRESS = "0xAcE5753f5430DF640C350F7E95461d34e604Ec2E";
const SELLER_ADDRESS = "0x62CdB679886BC63365184a18060882C8786AC5fc";
const CONTAINER_POSITION_ORACLE_ADDRESS = "0x636B37b7F5DE69E8a4C5E7eBf4E1F0298b49AD91";
const FEES_WALLET_ADDRESS = "0xcdcF816d8F8b3890Bc58ddf345A62d270a7B1188";

function requireAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value)) {
    throw new Error(`${label} manquante ou invalide en haut de deploy-sepolia.ts : "${value}"`);
  }
  return value as `0x${string}`;
}

// Contrairement à deploy-local.ts, un seul compte est disponible sur Sepolia
// (celui du keystore Hardhat, SEPOLIA_PRIVATE_KEY) : ethers.getSigners() n'y
// renvoie qu'un seul signer. C'est lui qui paie tout le gas et déploie ; les
// autres rôles ne sont que des adresses désignées via les setters onlyOwner,
// jamais des signers de ce script.
async function main() {
  const { ethers } = await network.connect({ network: "sepolia" });

  const buyerAddress = requireAddress(BUYER_ADDRESS, "BUYER_ADDRESS");
  const sellerAddress = requireAddress(SELLER_ADDRESS, "SELLER_ADDRESS");
  const containerPositionOracleAddress = requireAddress(
    CONTAINER_POSITION_ORACLE_ADDRESS,
    "CONTAINER_POSITION_ORACLE_ADDRESS"
  );
  const feesWalletAddress = requireAddress(FEES_WALLET_ADDRESS, "FEES_WALLET_ADDRESS");
  const adminAddress = ADMIN_ADDRESS ? requireAddress(ADMIN_ADDRESS, "ADMIN_ADDRESS") : undefined;

  const [deployer] = await ethers.getSigners();
  const deployerBalance = await ethers.provider.getBalance(deployer.address);

  console.log("Déployeur :", deployer.address);
  console.log("Solde     :", ethers.formatEther(deployerBalance), "ETH");
  if (deployerBalance === 0n) {
    throw new Error("Le compte déployeur n'a pas d'ETH Sepolia. Utilise un faucet avant de continuer.");
  }

  // --- 1. Déploiement des 3 mocks (6 décimales, comme les vrais USDC/USDT/EURC) ---
  const usdc = await ethers.deployContract("MockERC20", ["Mock USDC", "USDC", 6]);
  await usdc.waitForDeployment();

  const usdt = await ethers.deployContract("MockERC20", ["Mock USDT", "USDT", 6]);
  await usdt.waitForDeployment();

  const eurc = await ethers.deployContract("MockERC20", ["Mock EURC", "EURC", 6]);
  await eurc.waitForDeployment();

  console.log("\nUSDC:", await usdc.getAddress());
  console.log("USDT:", await usdt.getAddress());
  console.log("EURC:", await eurc.getAddress());

  // --- 2. Déploiement de Meridian ---
  const meridian = await ethers.deployContract("Meridian");
  await meridian.waitForDeployment();
  console.log("\nMeridian:", await meridian.getAddress());

  // --- 3. Configuration des adresses de token dans Meridian ---
  await (await meridian.setTokenAddress(CURRENCY.USDC, await usdc.getAddress())).wait();
  await (await meridian.setTokenAddress(CURRENCY.USDT, await usdt.getAddress())).wait();
  await (await meridian.setTokenAddress(CURRENCY.EURC, await eurc.getAddress())).wait();

  // --- 4. Mint de tokens de test vers les comptes acheteur/fournisseur fixes ---
  const amount = ethers.parseUnits("10000", 6);
  for (const [label, to] of [
    ["acheteur", buyerAddress],
    ["fournisseur", sellerAddress],
  ] as const) {
    await (await usdc.mint(to, amount)).wait();
    await (await usdt.mint(to, amount)).wait();
    await (await eurc.mint(to, amount)).wait();
    console.log(`\n${ethers.formatUnits(amount, 6)} USDC/USDT/EURC mintés vers ${to} (${label})`);
  }
  console.log("(Le robinet /dev-tools du front permet aussi à n'importe quel testeur de s'en créditer lui-même.)");

  // --- 5. Oracle OFAC (mock) ---
  const sanctionsList = await ethers.deployContract("SanctionsList");
  await sanctionsList.waitForDeployment();
  console.log("\nMockSanctionsOracle:", await sanctionsList.getAddress());

  await (await meridian.setSanctionsOracleAddress(await sanctionsList.getAddress())).wait();
  await (await meridian.setMockSanctionsOracleAddress(await sanctionsList.getAddress())).wait();

  // --- 6. MeridianNFT ---
  const meridianNFT = await ethers.deployContract("MeridianNFT", [await meridian.getAddress()]);
  await meridianNFT.waitForDeployment();
  console.log("MeridianNFT:", await meridianNFT.getAddress());

  await (await meridian.setMeridianNFTAddress(await meridianNFT.getAddress())).wait();

  // --- 7. Oracle de position de conteneur (adresse fixe) ---
  await (await meridian.setContainerPositionOracleAddress(containerPositionOracleAddress)).wait();

  // --- 8. Configuration du wallet de frais (backend) ---
  await (await meridian.setFeesWalletAddress(feesWalletAddress)).wait();
  await (await meridian.setFeesRateBps(1000)).wait(); // ex: 250 = 2,50 %, sur 10000
  console.log("FeesRateBps set: ", await meridian.feesRateBps());

  // --- 9. Transfert de propriété vers l'admin final, si différent du déployeur ---
  if (adminAddress && adminAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await meridian.setNewOwner(adminAddress)).wait();
    console.log(`\nPropriété transférée de ${deployer.address} vers ${adminAddress}.`);
  }

  console.log("\n=========================================================");
  console.log("  À copier dans frontend/meridian/.env.local :");
  console.log("=========================================================");
  console.log(`NEXT_PUBLIC_CHAIN_ID=11155111`);
  console.log(`NEXT_PUBLIC_RPC_URL=<ton URL RPC Sepolia>`);
  console.log(`NEXT_PUBLIC_MERIDIAN_ADDRESS=${await meridian.getAddress()}`);
  console.log("CONTAINER_ORACLE_PRIVATE_KEY=<clé privée de", containerPositionOracleAddress, "— déjà en ta possession>");
  console.log("=========================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
