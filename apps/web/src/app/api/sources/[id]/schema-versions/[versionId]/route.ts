import { schemaVersionRepository } from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../../../../lib/api/requireSession";
import { jsonError } from "../../../../../../lib/api/responses";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id, versionId } = await params;
  const version = await schemaVersionRepository.findSchemaVersionById(versionId);

  // On vérifie explicitement que la version appartient bien à la source de
  // l'URL — un versionId valide mais d'une autre source doit rester introuvable
  // ici plutôt que de fuiter des données d'une source à laquelle il n'est pas
  // rattaché dans l'URL demandée.
  if (!version || version.dataSourceId !== id) {
    return jsonError(404, "Version introuvable.");
  }

  return NextResponse.json(version);
}
