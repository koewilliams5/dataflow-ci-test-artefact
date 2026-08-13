import { createDataSourceInputSchema } from "@dataflow-ci/domain";
import { dataSourceRepository } from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/api/requireSession";
import { jsonError } from "../../../lib/api/responses";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const sources = await dataSourceRepository.listDataSources();
  return NextResponse.json(sources);
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createDataSourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Payload invalide.", parsed.error.issues);
  }

  // Assignation champ par champ plutôt qu'un spread de `parsed.data` : sous
  // exactOptionalPropertyTypes, un `description?: string | undefined` (forme
  // Zod) et le `description?: string` du repository ne sont pas structurellement
  // interchangeables — voir la même remarque dans ingestionRepository.
  const source = await dataSourceRepository.createDataSource({
    name: parsed.data.name,
    createdById: session.user.id,
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.webhookUrl !== undefined ? { webhookUrl: parsed.data.webhookUrl } : {}),
  });

  return NextResponse.json(source, { status: 201 });
}
