import { ingestionRepository, schemaVersionRepository } from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/api/requireSession";
import { jsonError } from "../../../../lib/api/responses";
import { detectAnomalies } from "../../../../lib/insights/detectAnomalies";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 200;

function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = value !== null ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

/**
 * Rapport d'ingestion : métadonnées + compteurs + erreurs paginées (voir
 * ASSUMPTIONS.md §8 — stockage exhaustif, consultation paginée). Interrogé au
 * chargement de la page ET par le polling client tant que le statut n'est pas
 * terminal (voir ADR-009).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const ingestion = await ingestionRepository.findIngestionById(id);
  if (!ingestion) {
    return jsonError(404, "Ingestion introuvable.");
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const [totalCount, items, schemaVersion, columnStats] = await Promise.all([
    ingestionRepository.countIngestionErrors(id),
    ingestionRepository.listIngestionErrorsPage(id, { page, pageSize }),
    schemaVersionRepository.findSchemaVersionById(ingestion.schemaVersionId),
    ingestionRepository.listIngestionColumnStats(id),
  ]);

  // Détection d'anomalies : seulement si cette ingestion a des statistiques
  // numériques à comparer (voir ADR-037) — évite une requête historique
  // inutile sur un fichier sans colonne numérique ou sans ligne valide.
  const anomalies =
    columnStats.length > 0
      ? detectAnomalies(
          columnStats,
          await ingestionRepository.getHistoricalColumnStatsSummary(ingestion.dataSourceId, id),
        )
      : [];

  return NextResponse.json({
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
    createdAt: ingestion.createdAt,
    processingStartedAt: ingestion.processingStartedAt,
    processingCompletedAt: ingestion.processingCompletedAt,
    errors: {
      items,
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  });
}
