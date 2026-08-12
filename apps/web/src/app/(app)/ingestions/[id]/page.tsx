import { ingestionRepository, schemaVersionRepository } from "@dataflow-ci/database";
import { notFound } from "next/navigation";
import { detectAnomalies } from "../../../../lib/insights/detectAnomalies";
import { IngestionReport } from "./IngestionReport";

interface IngestionDetailPageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_PAGE_SIZE = 50;

export default async function IngestionDetailPage({ params }: IngestionDetailPageProps) {
  const { id } = await params;

  const ingestion = await ingestionRepository.findIngestionById(id);
  if (!ingestion) {
    notFound();
  }

  const [totalCount, items, schemaVersion, columnStats] = await Promise.all([
    ingestionRepository.countIngestionErrors(id),
    ingestionRepository.listIngestionErrorsPage(id, { page: 1, pageSize: DEFAULT_PAGE_SIZE }),
    schemaVersionRepository.findSchemaVersionById(ingestion.schemaVersionId),
    ingestionRepository.listIngestionColumnStats(id),
  ]);

  const anomalies =
    columnStats.length > 0
      ? detectAnomalies(
          columnStats,
          await ingestionRepository.getHistoricalColumnStatsSummary(ingestion.dataSourceId, id),
        )
      : [];

  return (
    <IngestionReport
      ingestionId={id}
      initialData={{
        id: ingestion.id,
        dataSourceId: ingestion.dataSourceId,
        originalFilename: ingestion.originalFilename,
        status: ingestion.status,
        totalRows: ingestion.totalRows,
        validRows: ingestion.validRows,
        invalidRows: ingestion.invalidRows,
        failureReason: ingestion.failureReason,
        hasExport: ingestion.validFileKey !== null,
        schemaVersionNumber: schemaVersion?.versionNumber ?? null,
        anomalies,
        createdAt: ingestion.createdAt.toISOString(),
        processingStartedAt: ingestion.processingStartedAt?.toISOString() ?? null,
        processingCompletedAt: ingestion.processingCompletedAt?.toISOString() ?? null,
        errors: {
          items: items.map((error) => ({
            rowNumber: error.rowNumber,
            columnName: error.columnName,
            errorCode: error.errorCode,
            message: error.message,
            rawValue: error.rawValue,
          })),
          page: 1,
          pageSize: DEFAULT_PAGE_SIZE,
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE)),
        },
      }}
    />
  );
}
