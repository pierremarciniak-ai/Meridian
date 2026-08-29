# Meridian

Escrow on-chain pour des transactions commerciales maritimes entre un acheteur et un fournisseur : dépôt en stablecoin, libération des fonds conditionnée à la position réelle du conteneur (attestée par un oracle), possibilité de récupérer un reçu sous la forme d'un mint NFT.

## Structure du dépôt

```
backend/            Contrats Solidity (Hardhat 3), scripts de déploiement, tests
frontend/meridian/   Application Next.js (front acheteur/fournisseur/admin/oracle)
.github/workflows/  CI : compile + tests backend à chaque push
```

## Stack

- **Contrats** — Solidity 0.8.28, Hardhat 3, OpenZeppelin, tests TypeScript (Mocha + ethers.js v6)
- **Front** — Next.js 16 (App Router), React 19, wagmi v3 + viem v2, Reown AppKit (connexion wallet), Tailwind v4

## Démarrage rapide

### Contrats (`backend/`)

```bash
cd backend
pnpm install
pnpm hardhat compile
pnpm hardhat test mocha
```

Pour un déploiement local complet (contrats, tokens de test, oracles mock), dans deux terminaux :

```bash
# terminal 1 — nœud local persistant, sur lequel MetaMask peut se connecter
pnpm hardhat node

# terminal 2 — déploiement sur ce nœud
pnpm hardhat run scripts/deploy-local.ts --network localhost
```

Pour déployer sur Sepolia, configurer d'abord les deux variables attendues par `hardhat.config.ts` (via `hardhat-keystore`, ou en variables d'environnement classiques) :

```bash
pnpm hardhat keystore set SEPOLIA_RPC_URL
pnpm hardhat keystore set SEPOLIA_PRIVATE_KEY
```

Deux scripts, selon le besoin :

```bash
# déploiement complet (tous les contrats, tokens de test inclus) — coûte du vrai ETH Sepolia
pnpm hardhat run scripts/deploy-sepolia.ts --network sepolia

# redéploiement de Meridian (+ un nouveau MeridianNFT) uniquement, en réutilisant
# les tokens/oracles déjà déployés — utile après une modification du contrat
pnpm hardhat run "scripts/deploy-sepolia_Meridan only.ts" --network sepolia
```

Les adresses des comptes concernés (acheteur, fournisseur, oracles, wallet de frais, admin) sont à renseigner en constantes en tête de chaque script avant de lancer le déploiement.

#### Vérification du contrat (Etherscan)

Configurer une clé API Etherscan (une seule fois) :

```bash
pnpm hardhat keystore set ETHERSCAN_API_KEY
```

Puis vérifier un contrat déployé :

```bash
pnpm hardhat verify --network sepolia --build-profile default <adresse> [arguments du constructeur]
```

`--build-profile default` est **indispensable** : nos scripts de déploiement compilent avec le profil `default` (`viaIR: true`), alors que `hardhat verify` utilise le profil `production` par défaut si on ne le précise pas — sans cette option, le bytecode recompilé ne correspond pas à celui réellement déployé et la vérification échoue. MeridianNFT attend en plus l'adresse de Meridian comme argument du constructeur ; Meridian n'en attend aucun.

### Front (`frontend/meridian/`)

```bash
cd frontend/meridian
pnpm install
pnpm dev
```

Copier `.env.local.example` (si présent) ou renseigner les variables décrites en tête de `.env.local` — notamment l'adresse Meridian et l'URL RPC par réseau supporté.

## Réseaux supportés

| Réseau | Chain ID | Usage |
|---|---|---|
| Hardhat local | 31337 | développement |
| Sepolia | 11155111 | testnet public |

Chaque réseau a sa propre adresse Meridian et son propre wallet oracle — voir `frontend/meridian/lib/web3/chain.ts` et `contracts.ts`.

### Adresses déployées sur Sepolia

Vérifiées on-chain à jour :

| Contrat / rôle | Adresse |
|---|---|
| Meridian | `0x1a36044Bba55b5acEFA4CB8164A2100d3A8615FB` |
| MeridianNFT | `0x65EDB3b5bC818C15c98A582E7667972A74040B2F` |
| SanctionsList (oracle) | `0x7CF947EFD5377C05e4Feb3cfb8AAdB6343F7625a` |
| Mock USDC | `0xe9542BA4DDE93faF6598BDB564a580b0671014a4` |
| Mock USDT | `0x7CDe28048BDa4f5B4678683ad2dCBF6e35a98464` |
| Mock EURC | `0xC9454cd04426271c75F5c4e418E5d9aAF07309B5` |
| Oracle position de conteneur | `0x636B37b7F5DE69E8a4C5E7eBf4E1F0298b49AD91` |
| Wallet de frais | `0xcdcF816d8F8b3890Bc58ddf345A62d270a7B1188` |
| Owner actuel | `0xbdC42fAe1428584a28A038Af9922D769f799fa57` |

## Contrats principaux

- **Meridian (+ InternalFunctions)** — logique d'escrow (signature des deux parties, dépôt, retrait, rétractation, frais de service)
- **MeridianNFT** — reçu NFT de transaction, un par partie
- **MockERC20** (mock) — création de faux stable coin pour les test/démo
- **SanctionsList** (mock) — oracle de sanctions pour les tests/démo

## CI

Un workflow GitHub Actions (`.github/workflows/backend-tests.yml`) compile les contrats et lance la suite de tests à chaque push et sur chaque pull request vers `main`.
