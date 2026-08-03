import { decodeEventLog, type Log } from "viem";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

export function findEventArg<T = unknown>(logs: readonly Log[], eventName: string, argName: string): T | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== meridianAddress.toLowerCase()) continue;
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
