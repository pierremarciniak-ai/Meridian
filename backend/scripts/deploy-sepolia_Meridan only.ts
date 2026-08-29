import { network } from "hardhat";
import { isAddress } from "ethers";

// Ordre de l'enum Currency dans Meridian.sol : USDC = 0, USDT = 1, EURC = 2
const CURRENCY = { USDC: 0, USDT: 1, EURC: 2 };

const ADMIN_ADDRESS = "0xbdC42fAe1428584a28A038Af9922D769f799fa57";
const USDC_ADDRESS = "0xe9542BA4DDE93faF6598BDB564a580b0671014a4";
const USDT_ADDRESS = "0x7CDe28048BDa4f5B4678683ad2dCBF6e35a98464";
const EURC_ADDRESS = "0xC9454cd04426271c75F5c4e418E5d9aAF07309B5";
const SANCTIONS_ORACLE_ADDRESS = "0x7CF947EFD5377C05e4Feb3cfb8AAdB6343F7625a";
const CONTAINER_POSITION_ORACLE_ADDRESS = "0x636B37b7F5DE69E8a4C5E7eBf4E1F0298b49AD91";
const FEES_WALLET_ADDRESS = "0xcdcF816d8F8b3890Bc58ddf345A62d270a7B1188";

function requireAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value)) {
    throw new Error(`${label} manquante ou invalide en haut de deploy-sepolia_Meridan only.ts : "${value}"`);
  }
  return value as `0x${string}`;
}

// Redéploie uniquement Meridian (seul contrat modifié), en le câblant sur les
// contrats satellites déjà en place sur Sepolia — sauf MeridianNFT : son
// owner (Ownable) est figé sur l'ANCIEN Meridian, et un contrat n'a aucun
// moyen de relayer transferOwnership vers ce nouveau Meridian. Un
// MeridianNFT frais est donc redéployé ci-dessous avec ce nouveau Meridian
// comme owner ; l'ancien reste intact et consultable à sa propre adresse
// (les reçus déjà mintés n'en sont pas affectés).
async function main() {
  const { ethers } = await network.connect({ network: "sepolia" });

  const sanctionsOracleAddress = requireAddress(SANCTIONS_ORACLE_ADDRESS, "SANCTIONS_ORACLE_ADDRESS");
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

  // --- 1. Déploiement de Meridian ---
  const meridian = await ethers.deployContract("Meridian");
  await meridian.waitForDeployment();
  const meridianAddress = await meridian.getAddress();
  console.log("\nMeridian:", meridianAddress);

  const deployReceipt = await meridian.deploymentTransaction()!.wait();
  console.log("Bloc de déploiement:", deployReceipt!.blockNumber);

  // --- 2. Câblage sur les tokens existants ---
  await (await meridian.setTokenAddress(CURRENCY.USDC, USDC_ADDRESS)).wait();
  await (await meridian.setTokenAddress(CURRENCY.USDT, USDT_ADDRESS)).wait();
  await (await meridian.setTokenAddress(CURRENCY.EURC, EURC_ADDRESS)).wait();

  // --- 3. Câblage sur l'oracle de sanctions existant (mock + "réel") ---
  await (await meridian.setSanctionsOracleAddress(sanctionsOracleAddress)).wait();
  await (await meridian.setMockSanctionsOracleAddress(sanctionsOracleAddress)).wait();

  // --- 4. MeridianNFT : redéploiement frais (voir commentaire en tête) ---
  const meridianNFT = await ethers.deployContract("MeridianNFT", [meridianAddress]);
  await meridianNFT.waitForDeployment();
  console.log("MeridianNFT (nouveau):", await meridianNFT.getAddress());

  await (await meridian.setMeridianNFTAddress(await meridianNFT.getAddress())).wait();

  // --- 5. Câblage sur l'oracle de position et le wallet de frais existants ---
  await (await meridian.setContainerPositionOracleAddress(containerPositionOracleAddress)).wait();
  await (await meridian.setFeesWalletAddress(feesWalletAddress)).wait();

  // --- 6. Réglage du taux des frais de service ---
  await (await meridian.setFeesRateBps(15)).wait(); // ex: 250 = 2,50 %, sur 10000
  console.log("FeesRateBps set: ", await meridian.feesRateBps());

  // --- 7. Transfert de propriété vers l'admin final, si différent du déployeur ---
  if (adminAddress && adminAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await meridian.setNewOwner(adminAddress)).wait();
    console.log(`\nPropriété transférée de ${deployer.address} vers ${adminAddress}.`);
  }

  console.log("\n=========================================================");
  console.log("  À copier dans frontend/meridian/.env.local :");
  console.log("=========================================================");
  console.log(`NEXT_PUBLIC_MERIDIAN_ADDRESS_SEPOLIA=${meridianAddress}`);
  console.log(`NEXT_PUBLIC_MERIDIAN_DEPLOY_BLOCK_SEPOLIA=${deployReceipt!.blockNumber}`);
  console.log("(tokens/oracles/wallet de frais inchangés : rien d'autre à mettre à jour)");
  console.log("=========================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
