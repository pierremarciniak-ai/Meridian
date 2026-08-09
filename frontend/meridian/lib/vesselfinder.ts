import { ContainerPositionStatus } from "@/lib/domain/enums";

// Doc source : openapi.json (Container Tracking API) à la racine du repo.
// GET /container/{apiKey}/{containerNumber}/{sealine} — sealine ("AUTO" si
// non fourni) est le code SCAC du transporteur, containerNumber fait
// toujours 11 caractères.
const API_BASE = process.env.VESSELFINDER_API_BASE_URL ?? "https://api.vesselfinder.com/container";

interface ApiSuccessResponse {
  status: "success";
  general?: {
    progress?: number;
  };
}

interface ApiOtherResponse {
  status: "queued" | "processing" | "error";
  errorCode?: string;
  errorDescription?: string;
  message?: string;
}

type ApiResponse = ApiSuccessResponse | ApiOtherResponse;

// La position exacte du conteneur (escale par escale) n'est pas utile ici :
// Meridian n'a besoin que d'un signal binaire "en transit / arrivé à
// destination" pour débloquer le withdraw. `general.progress` (0-100, fourni
// par l'API) est un proxy simple et fiable pour ça, plutôt que de tenter
// d'énumérer tous les codes d'event possibles (CEP, CGI, CLL, VAD...), qui
// varient selon le transporteur et ne sont pas tous documentés dans le spec.
function mapProgressToStatus(progress: number): ContainerPositionStatus {
  if (progress >= 100) return ContainerPositionStatus.AtDestination;
  if (progress > 0) return ContainerPositionStatus.InTransit;
  return ContainerPositionStatus.UnSet;
}

// Retourne undefined si aucune donnée exploitable n'est encore disponible
// (conteneur en cours de traitement côté VesselFinder, ou erreur) : le cron
// réessaiera au prochain passage plutôt que d'écrire un statut incertain
// on-chain.
export async function fetchContainerPositionStatus(
  containerNumber: string,
): Promise<ContainerPositionStatus | undefined> {
  const apiKey = process.env.VESSELFINDER_API_KEY;
  if (!apiKey) {
    throw new Error("Variable d'environnement VESSELFINDER_API_KEY manquante");
  }

  const url = `${API_BASE}/${apiKey}/${encodeURIComponent(containerNumber)}/AUTO`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json()) as ApiResponse;

  if (body.status !== "success") {
    if (body.status === "error") {
      console.error(`VesselFinder: erreur pour ${containerNumber}`, body.errorCode, body.errorDescription);
    }
    return undefined;
  }

  const progress = body.general?.progress;
  if (progress === undefined) return undefined;

  return mapProgressToStatus(progress);
}
