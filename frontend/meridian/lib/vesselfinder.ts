import { ContainerPositionStatus } from "@/lib/domain/enums";

// Doc source : https://container.vesselfinder.com/api/1.0/docs
// GET /container/{apiKey}/{containerNumber}/{sealine} — sealine ("AUTO" si
// non fourni) est le code SCAC du transporteur, containerNumber fait
// toujours 11 caractères.
const API_BASE = process.env.VESSELFINDER_API_BASE_URL ?? "https://api.vesselfinder.com/container";

interface ScheduleEvent {
  code: string;
  // Distingue un événement réellement survenu d'une estimation (le
  // "schedule" complet, y compris les étapes futures encore prévisionnelles,
  // semble renvoyé d'un coup) — non documenté explicitement dans le spec,
  // mais absent/true traité comme confirmé, false explicitement exclu : on
  // ne veut débloquer des fonds que sur du confirmé, jamais du prévisionnel.
  actual?: boolean;
}

interface ApiSuccessResponse {
  status: "success";
  schedule?: ScheduleEvent[];
}

interface ApiOtherResponse {
  status: "queued" | "processing" | "error";
  errorCode?: string;
  errorDescription?: string;
  message?: string;
}

type ApiResponse = ApiSuccessResponse | ApiOtherResponse;

// Codes d'événements (section "Event-codes" de la doc) :
// VDL = "Vessel departure from first POL" (le navire a quitté le port de
// chargement d'origine) → InTransit.
// VAD = "Vessel arrival at final POD" (le navire est arrivé au port de
// destination final) → AtDestination.
//
// `schedule` est un historique cumulatif chronologique (rien n'est jamais
// retiré au fil du voyage) : la présence de VAD implique nécessairement que
// VDL est aussi présent, plus tôt dans la liste. D'où une recherche par
// présence (`.some`) plutôt que par position/dernier élément, qui serait
// fragile.
function mapScheduleToStatus(schedule: ScheduleEvent[]): ContainerPositionStatus {
  const isConfirmed = (event: ScheduleEvent) => event.actual !== false;

  if (schedule.some((event) => event.code === "VAD" && isConfirmed(event))) {
    return ContainerPositionStatus.AtDestination;
  }
  if (schedule.some((event) => event.code === "VDL" && isConfirmed(event))) {
    return ContainerPositionStatus.InTransit;
  }
  return ContainerPositionStatus.UnSet;
}

// Retourne undefined si aucune donnée exploitable n'est encore disponible
// (conteneur en cours de traitement côté VesselFinder, schedule vide/absent
// — ex. erreur NO_EVENTS —, ou erreur réseau) : l'appelant retentera plus
// tard plutôt que d'écrire un statut incertain on-chain.
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

  if (!body.schedule || body.schedule.length === 0) return undefined;

  return mapScheduleToStatus(body.schedule);
}
