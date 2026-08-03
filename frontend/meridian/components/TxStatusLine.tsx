import { AlertIcon, AnchorSpinnerIcon, CheckIcon } from "@/components/icons";

export function TxStatusLine({
  stage,
  error,
}: {
  stage: "idle" | "signing" | "confirming" | "success" | "error";
  error?: string | null;
}) {
  if (stage === "idle") return null;

  if (stage === "signing") {
    return (
      <p className="flex items-center gap-2 text-sm text-subtle">
        <AnchorSpinnerIcon className="h-4 w-4 animate-spin" />
        Confirmez la transaction dans votre portefeuille…
      </p>
    );
  }

  if (stage === "confirming") {
    return (
      <p className="flex items-center gap-2 text-sm text-accent">
        <AnchorSpinnerIcon className="h-4 w-4 animate-spin" />
        Transaction en cours de confirmation sur la chaîne…
      </p>
    );
  }

  if (stage === "success") {
    return (
      <p className="flex items-center gap-2 text-sm" style={{ color: "#86efac" }}>
        <CheckIcon className="h-4 w-4" />
        Confirmée.
      </p>
    );
  }

  return (
    <p className="flex items-start gap-2 text-sm text-danger">
      <AlertIcon className="h-4 w-4 shrink-0 translate-y-0.5" />
      <span>{error ?? "La transaction a échoué."}</span>
    </p>
  );
}
