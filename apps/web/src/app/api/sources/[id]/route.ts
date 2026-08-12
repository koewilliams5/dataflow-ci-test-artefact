import { updateDataSourceInputSchema } from "@dataflow-ci/domain";
import { dataSourceRepository } from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/api/requireSession";
import { jsonError } from "../../../../lib/api/responses";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const source = await dataSourceRepository.findDataSourceById(id);
  if (!source) {
    return jsonError(404, "Source introuvable.");
  }

  return NextResponse.json(source);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const existing = await dataSourceRepository.findDataSourceById(id);
  if (!existing) {
    return jsonError(404, "Source introuvable.");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateDataSourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Payload invalide.", parsed.error.issues);
  }

  // Voir la note dans ../route.ts sur exactOptionalPropertyTypes.
  const updated = await dataSourceRepository.updateDataSource(id, {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
  });
  return NextResponse.json(updated);
}
