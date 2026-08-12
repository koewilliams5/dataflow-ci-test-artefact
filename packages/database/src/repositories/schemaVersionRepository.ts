import type { PrismaClient, SchemaVersion } from "@prisma/client";
import { parseSchemaDefinition, type SchemaDefinition } from "@dataflow-ci/domain";
import { prisma as defaultClient } from "../client";

export class InvalidSchemaDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSchemaDefinitionError";
  }
}

export interface CreateSchemaVersionInput {
  dataSourceId: string;
  definition: unknown;
  createdById: string;
}

/**
 * Crée la prochaine version pour une source et la promeut automatiquement en
 * version courante de la source (règle métier : la dernière version créée est
 * toujours la version active — pas de brouillon intermédiaire dans le MVP).
 *
 * Le numéro de version est calculé dans la même transaction que l'insertion
 * (max existant + 1), pour éviter qu'une création concurrente sur la même
 * source ne rate sur le même numéro — la contrainte @@unique([dataSourceId,
 * versionNumber]) reste le dernier rempart si ça arrive quand même.
 *
 * Il n'existe volontairement aucune fonction `updateSchemaVersion` dans ce
 * repository : une version est immuable une fois créée (voir DECISIONS.md).
 */
export async function createSchemaVersion(
  input: CreateSchemaVersionInput,
  client: PrismaClient = defaultClient,
): Promise<SchemaVersion> {
  const parsed = parseSchemaDefinition(input.definition);
  if (!parsed.success) {
    const details = parsed.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new InvalidSchemaDefinitionError(`Invalid schema definition: ${details}`);
  }

  return client.$transaction(async (tx) => {
    const latest = await tx.schemaVersion.findFirst({
      where: { dataSourceId: input.dataSourceId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const version = await tx.schemaVersion.create({
      data: {
        dataSourceId: input.dataSourceId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        definition: parsed.data,
        createdById: input.createdById,
      },
    });

    await tx.dataSource.update({
      where: { id: input.dataSourceId },
      data: { currentSchemaVersionId: version.id },
    });

    return version;
  });
}

export async function findSchemaVersionById(
  id: string,
  client: PrismaClient = defaultClient,
): Promise<SchemaVersion | null> {
  return client.schemaVersion.findUnique({ where: { id } });
}

export async function findCurrentSchemaVersion(
  dataSourceId: string,
  client: PrismaClient = defaultClient,
): Promise<SchemaVersion | null> {
  const dataSource = await client.dataSource.findUnique({
    where: { id: dataSourceId },
    select: { currentSchemaVersion: true },
  });
  return dataSource?.currentSchemaVersion ?? null;
}

export async function listSchemaVersions(
  dataSourceId: string,
  client: PrismaClient = defaultClient,
): Promise<SchemaVersion[]> {
  return client.schemaVersion.findMany({
    where: { dataSourceId },
    orderBy: { versionNumber: "desc" },
  });
}

/** Relit `definition` typée (elle est toujours valide en base, voir createSchemaVersion). */
export function getTypedDefinition(schemaVersion: SchemaVersion): SchemaDefinition {
  const parsed = parseSchemaDefinition(schemaVersion.definition);
  if (!parsed.success) {
    throw new InvalidSchemaDefinitionError(
      `Stored schema version ${schemaVersion.id} has an invalid definition — this should never happen.`,
    );
  }
  return parsed.data;
}
