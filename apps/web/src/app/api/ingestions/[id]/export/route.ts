import { ingestionRepository } from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/api/requireSession";
import { jsonError } from "../../../../../lib/api/responses";
import { getStorageProvider } from "../../../../../lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Ne sert jamais le fichier lui-même : redirige vers une URL signée S3/MinIO
 * de courte durée (voir StorageProvider.getSignedDownloadUrl), pour ne pas
 * faire transiter un fichier potentiellement volumineux par le process Next.js.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  const ingestion = await ingestionRepository.findIngestionById(id);
  if (!ingestion) {
    return jsonError(404, "Ingestion introuvable.");
  }
  if (!ingestion.validFileKey) {
    return jsonError(404, "Aucun export disponible pour cette ingestion (aucune ligne valide).");
  }

  const url = await getStorageProvider().getSignedDownloadUrl(ingestion.validFileKey);
  return NextResponse.redirect(url);
}
