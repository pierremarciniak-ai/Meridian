import type { Abi, Address, ContractEventName, GetContractEventsParameters, GetContractEventsReturnType, PublicClient } from "viem";

/**
 * La plupart des fournisseurs RPC publics (Infura, Alchemy...) refusent un
 * `eth_getLogs` dont la plage dépasse quelques milliers de blocs — au-delà,
 * l'appel échoue (pas une panne réseau, une limite du fournisseur). Taille de
 * fenêtre suffisamment large pour rester rapide sur les petites plages
 * (Hardhat local, Sepolia juste après déploiement), suffisamment prudente
 * pour ne heurter la limite d'aucun fournisseur usuel.
 */
const MAX_BLOCK_RANGE = 5_000n;

/**
 * Pendant de `publicClient.getContractEvents`, qui scinde `[fromBlock,
 * toBlock]` en fenêtres de `MAX_BLOCK_RANGE` au lieu d'un seul appel. Voir
 * `getMeridianDeployBlock` (lib/web3/contracts.ts) pour le `fromBlock` à
 * passer en pratique (bloc de déploiement, jamais 0 sur un réseau déjà
 * avancé).
 */
export async function getContractEventsChunked<
  const TAbi extends Abi | readonly unknown[],
  TEventName extends ContractEventName<TAbi> | undefined = undefined,
>(
  publicClient: PublicClient,
  params: GetContractEventsParameters<TAbi, TEventName> & { address: Address; fromBlock: bigint; toBlock: bigint },
): Promise<GetContractEventsReturnType<TAbi, TEventName>> {
  const { fromBlock, toBlock } = params;
  const allLogs: GetContractEventsReturnType<TAbi, TEventName> = [];

  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
    const end = start + MAX_BLOCK_RANGE - 1n < toBlock ? start + MAX_BLOCK_RANGE - 1n : toBlock;
    const chunkLogs = await publicClient.getContractEvents({ ...params, fromBlock: start, toBlock: end });
    allLogs.push(...chunkLogs);
  }

  return allLogs;
}
