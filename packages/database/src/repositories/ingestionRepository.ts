import type {
  Ingestion,
  IngestionColumnStat,
  IngestionError,
  IngestionStatus,
  PrismaClient,
} from "@prisma/client";
import { prisma as defaultClient } from "../client";

export interface CreateIngestionInput {
  dataSourceId: string;
  schemaVersionId: string;
  createdById: string;
  originalFilename: string;
  originalFileKey: string;
  checksum: string;
}

export async function createIngestion(
  input: CreateIngestionInput,
  client: PrismaClient = defaultClient,
): Promise<Ingestion> {
  return client.ingestion.create({ data: input });
}

export async function findIngestionById(
  id: string,
  client: PrismaClient = defaultClient,
): Promise<Ingestion | null> {
  return client.ingestion.findUnique({ where: { id } });
}

export async function markIngestionProcessing(
  ingestionId: string,
  client: PrismaClient = defaultClient,
): Promise<Ingestion> {
  return client.ingestion.update({
    where: { id: ingestionId },
    data: { status: "PROCESSING", processingStartedAt: new Date() },
  });
}

/**
 * Verrou logique utilisé par le worker : ne transitionne PENDING -> PROCESSING
 * que si l'ingestion est encore PENDING au moment de l'UPDATE (Postgres
 * garantit l'atomicité de la ligne). Retourne `false` si quelqu'un d'autre a
 * gagné la course (ou si l'ingestion n'est déjà plus PENDING) — le worker sait
 * alors qu'il ne doit pas retraiter. Voir apps/worker pour l'explication
 * complète des race conditions évitées.
 */
export async function claimIngestionForProcessing(
  ingestionId: string,
  client: PrismaClient = defaultClient,
): Promise<boolean> {
  const result = await client.ingestion.updateMany({
    where: { id: ingestionId, status: "PENDING" },
    data: { status: "PROCESSING", processingStartedAt: new Date() },
  });
  return result.count === 1;
}

export interface IngestionResultInput {
  status: Extract<IngestionStatus, "SUCCESS" | "PARTIAL" | "FAILED">;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  validFileKey?: string;
  failureReason?: string;
}

export async function completeIngestion(
  ingestionId: string,
  result: IngestionResultInput,
  client: PrismaClient = defaultClient,
): Promise<Ingestion> {
  return client.ingestion.update({
    where: { id: ingestionId },
    data: {
      status: result.status,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      processingCompletedAt: new Date(),
      // Spread conditionnel plutôt que de passer `undefined` directement : sous
      // exactOptionalPropertyTypes, Prisma distingue "clé absente" (colonne
      // inchangée) de "clé présente mais undefined" (erreur de type) — un champ
      // de résultat optionnel non fourni doit donc omettre la clé.
      ...(result.validFileKey !== undefined ? { validFileKey: result.validFileKey } : {}),
      ...(result.failureReason !== undefined ? { failureReason: result.failureReason } : {}),
    },
  });
}

export type IngestionErrorInput = Omit<IngestionError, "id" | "ingestionId" | "createdAt">;

export async function appendIngestionErrors(
  ingestionId: string,
  errors: IngestionErrorInput[],
  client: PrismaClient = defaultClient,
): Promise<number> {
  if (errors.length === 0) {
    return 0;
  }
  const result = await client.ingestionError.createMany({
    data: errors.map((error) => ({ ...error, ingestionId })),
  });
  return result.count;
}

/**
 * Supprime les erreurs déjà enregistrées pour cette ingestion — appelé au
 * début de chaque tentative de traitement (y compris les retries) pour que
 * `appendIngestionErrors` ne duplique jamais les lignes d'erreur d'une
 * tentative précédente qui aurait échoué après en avoir déjà écrit certaines.
 */
export async function deleteIngestionErrors(
  ingestionId: string,
  client: PrismaClient = defaultClient,
): Promise<void> {
  await client.ingestionError.deleteMany({ where: { ingestionId } });
}

export async function findIngestionWithErrors(
  ingestionId: string,
  client: PrismaClient = defaultClient,
) {
  return client.ingestion.findUnique({
    where: { id: ingestionId },
    include: { errors: { orderBy: { rowNumber: "asc" } } },
  });
}

export async function countIngestionErrors(
  ingestionId: string,
  client: PrismaClient = defaultClient,
): Promise<number> {
  return client.ingestionError.count({ where: { ingestionId } });
}

export interface PageInput {
  page: number;
  pageSize: number;
}

/**
 * Erreurs paginées, triées par ligne — voir ASSUMPTIONS.md §8 : le stockage
 * est exhaustif, seule la consultation est paginée (page de 50 par défaut).
 */
export async function listIngestionErrorsPage(
  ingestionId: string,
  { page, pageSize }: PageInput,
  client: PrismaClient = defaultClient,
): Promise<IngestionError[]> {
  return client.ingestionError.findMany({
    where: { ingestionId },
    orderBy: { rowNumber: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

export async function listIngestionsForDataSource(
  dataSourceId: string,
  client: PrismaClient = defaultClient,
): Promise<Ingestion[]> {
  return client.ingestion.findMany({
    where: { dataSourceId },
    orderBy: { createdAt: "desc" },
  });
}

/** Vue d'ensemble multi-sources pour la page liste des ingestions (nom de source inclus). */
export async function listRecentIngestions(limit = 20, client: PrismaClient = defaultClient) {
  return client.ingestion.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { dataSource: { select: { name: true } } },
  });
}

const NOTIFICATION_LIMIT = 20;

/**
 * Ingestions passées à un statut terminal depuis `since` — sert de base aux
 * notifications in-app (voir NotificationBell.tsx). Pas de notion de
 * destinataire : l'app est mono-espace de travail, tous les opérateurs
 * voient les mêmes ingestions (cohérent avec le dashboard).
 */
export async function listIngestionsCompletedSince(
  since: Date,
  client: PrismaClient = defaultClient,
) {
  return client.ingestion.findMany({
    where: { processingCompletedAt: { gt: since } },
    orderBy: { processingCompletedAt: "desc" },
    take: NOTIFICATION_LIMIT,
    include: { dataSource: { select: { name: true } } },
  });
}

/**
 * Protection contre la double soumission : si un fichier au checksum
 * identique est déjà PENDING/PROCESSING pour cette source, on retourne cette
 * ingestion existante plutôt que d'en créer une deuxième (voir la route
 * POST /api/ingestions). Une fois le traitement terminé (SUCCESS/PARTIAL/
 * FAILED), un nouvel upload du même fichier est de nouveau accepté — un
 * re-upload volontaire de correction n'est pas bloqué indéfiniment.
 */
export async function findActiveIngestionByChecksum(
  dataSourceId: string,
  checksum: string,
  client: PrismaClient = defaultClient,
): Promise<Ingestion | null> {
  return client.ingestion.findFirst({
    where: { dataSourceId, checksum, status: { in: ["PENDING", "PROCESSING"] } },
    orderBy: { createdAt: "desc" },
  });
}

export type IngestionColumnStatInput = Omit<IngestionColumnStat, "id" | "ingestionId" | "createdAt">;

/**
 * Supprime puis réécrit les statistiques de colonnes d'une ingestion — même
 * pattern que `deleteIngestionErrors`/`appendIngestionErrors` : idempotent
 * face à un retry (voir ADR-038, ADR-020/021).
 */
export async function replaceIngestionColumnStats(
  ingestionId: string,
  stats: IngestionColumnStatInput[],
  client: PrismaClient = defaultClient,
): Promise<void> {
  await client.ingestionColumnStat.deleteMany({ where: { ingestionId } });
  if (stats.length > 0) {
    await client.ingestionColumnStat.createMany({
      data: stats.map((stat) => ({ ...stat, ingestionId })),
    });
  }
}

export async function listIngestionColumnStats(
  ingestionId: string,
  client: PrismaClient = defaultClient,
): Promise<IngestionColumnStat[]> {
  return client.ingestionColumnStat.findMany({ where: { ingestionId } });
}

export interface IngestionErrorSummary {
  errorCode: string;
  columnName: string | null;
  count: number;
}

/**
 * Regroupe les erreurs par (code, colonne) avec un compte — c'est cette vue
 * agrégée, jamais les `rawValue` individuelles, qui alimente le Copilot
 * qualité de données (voir ADR-036).
 */
export async function summarizeIngestionErrors(
  ingestionId: string,
  client: PrismaClient = defaultClient,
): Promise<IngestionErrorSummary[]> {
  const grouped = await client.ingestionError.groupBy({
    by: ["errorCode", "columnName"],
    where: { ingestionId },
    _count: { _all: true },
  });
  return grouped
    .map((row) => ({ errorCode: row.errorCode, columnName: row.columnName, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

export interface HistoricalColumnStatSummary {
  columnName: string;
  sampleCount: number;
  avgMean: number;
  stddevMean: number | null;
}

/**
 * Résume, colonne par colonne, la distribution des moyennes des ingestions
 * passées d'une source (hors l'ingestion en cours) — la base de comparaison
 * pour la détection d'anomalies par z-score (voir ADR-037). `STDDEV` est
 * l'agrégat natif Postgres (échantillon, pas population) ; `$queryRaw` reste
 * cohérent avec ADR-004 pour ce type d'agrégation.
 */
export async function getHistoricalColumnStatsSummary(
  dataSourceId: string,
  excludeIngestionId: string,
  client: PrismaClient = defaultClient,
): Promise<HistoricalColumnStatSummary[]> {
  return client.$queryRaw<HistoricalColumnStatSummary[]>`
    SELECT
      ics."columnName",
      COUNT(*)::int AS "sampleCount",
      AVG(ics.mean)::float AS "avgMean",
      STDDEV(ics.mean)::float AS "stddevMean"
    FROM ingestion_column_stats ics
    JOIN ingestions i ON i.id = ics."ingestionId"
    WHERE i."dataSourceId" = ${dataSourceId}::uuid
      AND ics."ingestionId" != ${excludeIngestionId}::uuid
    GROUP BY ics."columnName"
  `;
}
