import { WorkflowStatus, workflowStatusLabels } from "@/lib/domain/enums";

const statusClass: Record<WorkflowStatus, string> = {
  [WorkflowStatus.Unset]: "status-unset",
  [WorkflowStatus.Initialized]: "status-initialized",
  [WorkflowStatus.Created]: "status-created",
  [WorkflowStatus.Signed]: "status-signed",
  [WorkflowStatus.Finished]: "status-finished",
  [WorkflowStatus.Aborted]: "status-aborted",
};

export function StatusBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className={`status-badge ${statusClass[status]}`}>
      <span className="status-badge__dot" />
      {workflowStatusLabels[status]}
    </span>
  );
}
