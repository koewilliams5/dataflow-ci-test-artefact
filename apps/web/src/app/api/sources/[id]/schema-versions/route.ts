import {
  dataSourceRepository,
  schemaVersionRepository,
  InvalidSchemaDefinitionError,
} from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/api/requireSession";
import { jsonError } from "../../../../../lib/api/responses";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Vérifie juste que le corps a la forme `{ definition: ... }` — le contenu de
 * `definition` est validé par packages/domain (schemaDefinitionSchema) à
 * l'intérieur de createSchemaVersion, inutile de dupliquer cette validation
 * ici. Un simple `z.object({ definition: z.unknown() })` ne suffirait pas :
 * `unknown()` accepte aussi `undefined`, donc un corps sans la clé
 * `definition` du tout passerait quand même la validation.
 */
function hasDefinitionKey(body: unknown): body is { definition: unknown } {
  return typeof body === "object" && body !== null && "definition" in body;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const source = await dataSourceRepository.findDataSourceById(id);
  if (!source) {
    return jsonError(404, "Source introuvable.");
  }

  const versions = await schemaVersionRepository.listSchemaVersions(id);
  return NextResponse.json(versions);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const source = await dataSourceRepository.findDataSourceById(id);
  if (!source) {
    return jsonError(404, "Source introuvable.");
  }

  const body: unknown = await request.json().catch(() => null);
  if (!hasDefinitionKey(body)) {
    return jsonError(400, "Payload invalide : le corps doit contenir `definition`.");
  }

  try {
    const version = await schemaVersionRepository.createSchemaVersion({
      dataSourceId: id,
      definition: body.definition,
      createdById: session.user.id,
    });
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidSchemaDefinitionError) {
      return jsonError(400, error.message);
    }
    throw error;
  }
}
