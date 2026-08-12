import { createHash } from "node:crypto";
import { MAX_FILE_SIZE_BYTES, getFileExtension, validateUploadedFile } from "@dataflow-ci/domain";
import { dataSourceRepository, ingestionRepository } from "@dataflow-ci/database";
import { generateObjectKey } from "@dataflow-ci/storage";
import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/api/requireSession";
import { jsonError } from "../../../lib/api/responses";
import { enqueueIngestionJob } from "../../../lib/queue";
import { getStorageProvider } from "../../../lib/storage";

// Marge au-delà de MAX_FILE_SIZE_BYTES pour les métadonnées multipart
// (boundaries, en-têtes de champ, `dataSourceId`) — pas la taille du fichier
// lui-même, qui reste plafonnée par validateUploadedFile ci-dessous.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  // Rejette un corps de requête surdimensionné avant de le bufferiser en
  // mémoire : `request.formData()` charge tout le corps d'un coup, donc sans
  // cette vérification un client pourrait envoyer un fichier arbitrairement
  // gros et épuiser la mémoire du process avant même que `validateUploadedFile`
  // (qui, elle, ne s'exécute qu'après ce chargement complet) ait une chance de
  // le rejeter.
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return jsonError(413, "Le fichier dépasse la taille maximale de 10 Mo.");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonError(
      400,
      "Le corps de la requête doit être un formulaire (fichier + dataSourceId).",
    );
  }

  const dataSourceId = formData.get("dataSourceId");
  if (typeof dataSourceId !== "string" || dataSourceId.length === 0) {
    return jsonError(400, "dataSourceId est requis.");
  }

  const source = await dataSourceRepository.findDataSourceById(dataSourceId);
  if (!source) {
    return jsonError(404, "Source introuvable.");
  }
  if (!source.currentSchemaVersionId) {
    return jsonError(
      400,
      "Cette source n'a pas encore de schéma actif — impossible d'y uploader un fichier.",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "Aucun fichier fourni.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validationError = validateUploadedFile({
    filename: file.name,
    size: buffer.byteLength,
    mimeType: file.type,
    headerBytes: buffer.subarray(0, 8),
  });
  if (validationError) {
    return jsonError(400, validationError.message);
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");

  // Double soumission : un fichier identique déjà en cours de traitement pour
  // cette source renvoie l'ingestion existante plutôt que d'en recréer une.
  const existingActive = await ingestionRepository.findActiveIngestionByChecksum(
    dataSourceId,
    checksum,
  );
  if (existingActive) {
    return NextResponse.json({ ingestionId: existingActive.id }, { status: 200 });
  }

  const objectKey = generateObjectKey(
    `sources/${dataSourceId}/uploads`,
    getFileExtension(file.name),
  );

  await getStorageProvider().upload({
    key: objectKey,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const ingestion = await ingestionRepository.createIngestion({
    dataSourceId,
    schemaVersionId: source.currentSchemaVersionId,
    createdById: session.user.id,
    originalFilename: file.name,
    originalFileKey: objectKey,
    checksum,
  });

  await enqueueIngestionJob(ingestion.id);

  return NextResponse.json({ ingestionId: ingestion.id }, { status: 201 });
}
