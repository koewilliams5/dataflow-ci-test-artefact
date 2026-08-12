import type { IngestionStatus, PrismaClient } from "@prisma/client";
import { prisma as defaultClient } from "../client";

export interface DashboardSummary {
  totalIngestions: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  inProgressCount: number;
  totalRowsProcessed: number;
  activeSourceCount: number;
}

/**
 * Compteurs agrégés sur la période — via `groupBy` (portable, pas besoin de
 * SQL brut ici, contrairement aux séries temporelles ci-dessous). Voir
 * ASSUMPTIONS.md §7 pour la fenêtre par défaut (30 jours glissants).
 */
export async function getDashboardSummary(
  since: Date,
  client: PrismaClient = defaultClient,
): Promise<DashboardSummary> {
  const [byStatus, activeSources] = await Promise.all([
    client.ingestion.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalRows: true },
    }),
    client.ingestion.findMany({
      where: { createdAt: { gte: since } },
      distinct: ["dataSourceId"],
      select: { dataSourceId: true },
    }),
  ]);

  const countByStatus = new Map(byStatus.map((row) => [row.status, row._count._all]));

  return {
    totalIngestions: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    successCount: countByStatus.get("SUCCESS") ?? 0,
    partialCount: countByStatus.get("PARTIAL") ?? 0,
    failedCount: countByStatus.get("FAILED") ?? 0,
    inProgressCount: (countByStatus.get("PENDING") ?? 0) + (countByStatus.get("PROCESSING") ?? 0),
    totalRowsProcessed: byStatus.reduce((sum, row) => sum + (row._sum.totalRows ?? 0), 0),
    activeSourceCount: activeSources.length,
  };
}

export interface DailyStatusCountRow {
  day: Date;
  status: IngestionStatus;
  count: number;
}

/**
 * Décompte par jour et par statut, en SQL brut (`date_trunc`, non portable
 * proprement via l'API `groupBy` de Prisma) — cohérent avec ADR-004
 * ("agrégation complexe → `$queryRaw` plutôt que forcer l'ORM"). Les colonnes
 * sont entre guillemets doubles : ce schéma ne redéfinit pas de nom de
 * colonne via `@map`, les noms de champs Prisma (camelCase) sont donc aussi
 * les noms de colonnes réels, et Postgres les mettrait en minuscules sans
 * guillemets.
 */
export async function getDailyStatusCounts(
  since: Date,
  client: PrismaClient = defaultClient,
): Promise<DailyStatusCountRow[]> {
  return client.$queryRaw<DailyStatusCountRow[]>`
    SELECT date_trunc('day', "createdAt") AS day, status, COUNT(*)::int AS count
    FROM ingestions
    WHERE "createdAt" >= ${since}
    GROUP BY day, status
    ORDER BY day ASC
  `;
}

export interface TopSourceRow {
  id: string;
  name: string;
  ingestionCount: number;
  successCount: number;
}

/** Sources les plus actives sur la période, par nombre d'ingestions. */
export async function getTopSourcesByVolume(
  since: Date,
  limit = 5,
  client: PrismaClient = defaultClient,
): Promise<TopSourceRow[]> {
  return client.$queryRaw<TopSourceRow[]>`
    SELECT ds.id, ds.name,
      COUNT(i.id)::int AS "ingestionCount",
      COUNT(*) FILTER (WHERE i.status = 'SUCCESS')::int AS "successCount"
    FROM data_sources ds
    JOIN ingestions i ON i."dataSourceId" = ds.id
    WHERE i."createdAt" >= ${since}
    GROUP BY ds.id, ds.name
    ORDER BY "ingestionCount" DESC
    LIMIT ${limit}
  `;
}
