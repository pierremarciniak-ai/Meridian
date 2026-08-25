import { decodeEventLog, type Log } from "viem";
import { meridianAbi } from "@/lib/web3/abi/meridian";

/**
 * Extrait un argument d'un event nommé depuis les logs d'un reçu de
 * transaction. Ne filtre pas par adresse de contrat : les logs viennent du
 * reçu d'une transaction qu'on vient d'envoyer nous-mêmes, donc déjà scopés
 * au bon contrat/réseau — le nom d'event et le succès du décodage
 * (try/catch) suffisent à écarter tout log étranger.
 */
export function findEventArg<T = unknown>(logs: readonly Log[], eventName: string, argName: string): T | undefined {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({ abi: meridianAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) {
        const args = decoded.args as Record<string, unknown>;
        return args[argName] as T;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}
