import type { DataSource, PrismaClient } from "@prisma/client";
import { prisma as defaultClient } from "../client";

export interface CreateDataSourceInput {
  name: string;
  description?: string;
  createdById: string;
}

export async function createDataSource(
  input: CreateDataSourceInput,
  client: PrismaClient = defaultClient,
): Promise<DataSource> {
  return client.dataSource.create({ data: input });
}

export async function findDataSourceById(
  id: string,
  client: PrismaClient = defaultClient,
): Promise<DataSource | null> {
  return client.dataSource.findUnique({ where: { id } });
}

export async function listDataSources(client: PrismaClient = defaultClient): Promise<DataSource[]> {
  return client.dataSource.findMany({ orderBy: { createdAt: "desc" } });
}

export interface UpdateDataSourceInput {
  name?: string;
  description?: string;
}

/** Modifie uniquement le nom et/ou la description — jamais currentSchemaVersionId. */
export async function updateDataSource(
  id: string,
  input: UpdateDataSourceInput,
  client: PrismaClient = defaultClient,
): Promise<DataSource> {
  return client.dataSource.update({ where: { id }, data: input });
}

/**
 * Pointe une source vers une version différente. Ne vérifie pas que
 * `schemaVersionId` appartient bien à `dataSourceId` — les appelants passent
 * normalement par schemaVersionRepository.createSchemaVersion (makeCurrent:
 * true) pour le chemin courant ; exposé séparément pour le cas de
 * réactivation d'une ancienne version.
 */
export async function setCurrentSchemaVersion(
  dataSourceId: string,
  schemaVersionId: string,
  client: PrismaClient = defaultClient,
): Promise<DataSource> {
  return client.dataSource.update({
    where: { id: dataSourceId },
    data: { currentSchemaVersionId: schemaVersionId },
  });
}
