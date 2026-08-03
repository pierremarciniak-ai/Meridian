import { CheckIcon } from "@/components/icons";
import { WorkflowStatus } from "@/lib/domain/enums";

const STEPS: { status: WorkflowStatus; label: string }[] = [
  { status: WorkflowStatus.Initialized, label: "Initiée" },
  { status: WorkflowStatus.Created, label: "Acceptée" },
  { status: WorkflowStatus.Signed, label: "Signée" },
  { status: WorkflowStatus.Finished, label: "Soldée" },
];

export function TimelineStepper({ status }: { status: WorkflowStatus }) {
  if (status === WorkflowStatus.Aborted) {
    return (
      <div className="status-badge status-aborted w-fit">
        <span className="status-badge__dot" />
        Dossier abandonné — échéance dépassée
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, index) => {
        const done = index < currentIndex || status === WorkflowStatus.Finished;
        const active = index === currentIndex;
        return (
          <div key={step.status} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  background: done || active ? "var(--color-teal-400)" : "var(--color-navy-800)",
                  color: done || active ? "var(--color-navy-950)" : "var(--color-foam-400)",
                  border: active && !done ? "2px solid var(--color-teal-300)" : "1px solid var(--color-navy-600)",
                }}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span className={`label-caps ${done || active ? "text-accent" : ""}`}>{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className="mx-2 h-px flex-1"
                style={{ background: index < currentIndex ? "var(--color-teal-400)" : "var(--color-navy-600)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
