export type IngestionStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "PARTIAL" | "FAILED";

const LABELS: Record<IngestionStatus, string> = {
  PENDING: "En attente",
  PROCESSING: "En cours",
  SUCCESS: "Succès",
  PARTIAL: "Partiel",
  FAILED: "Échec",
};

const CLASS_NAMES: Record<IngestionStatus, string> = {
  PENDING: "badge badge-pending",
  PROCESSING: "badge badge-processing",
  SUCCESS: "badge badge-success",
  PARTIAL: "badge badge-partial",
  FAILED: "badge badge-failed",
};

export function IngestionStatusBadge({ status }: { status: IngestionStatus }) {
  return <span className={CLASS_NAMES[status]}>{LABELS[status]}</span>;
}
