import { Readable } from "node:stream";
import { ingestionRepository, schemaVersionRepository } from "@dataflow-ci/database";
import { generateObjectKey } from "@dataflow-ci/storage";
import { validateFile } from "@dataflow-ci/validation";
import { deriveIngestionOutcome } from "./deriveIngestionOutcome";
import { detectFileFormat } from "./detectFileFormat";
import { notifyIngestionWebhook } from "./dispatchWebhook";
import { logger, timeStep } from "./logger";
import { readableToBuffer } from "./readableToBuffer";
import { getStorageProvider } from "./storage";

export interface ProcessIngestionJobInput {
  ingestionId: string;
  jobId: string;
}

const TERMINAL_STATUSES = new Set(["SUCCESS", "PARTIAL", "FAILED"]);

/**
 * Traite un job d'ingestion. Ne catch délibérément aucune erreur venant du
 * téléchargement/traitement : elle remonte telle quelle pour que BullMQ
 * déclenche un retry (backoff exponentiel, voir packages/queue). Le statut
 * FAILED n'est écrit qu'une fois toutes les tentatives épuisées, dans
 * handleJobFailure — pas ici — pour ne pas marquer une ingestion FAILED sur
 * une simple panne transitoire que le prochain essai va corriger. Un fichier
 * simplement invalide (0 ligne valide) n'est PAS une panne : c'est un
 * résultat de traitement normal, écrit directement ici via `completeIngestion`.
 */
export async function processIngestionJob({
  ingestionId,
  jobId,
}: ProcessIngestionJobInput): Promise<void> {
  const baseLog = logger.child({ ingestionId, jobId });

  const ingestion = await ingestionRepository.findIngestionById(ingestionId);
  if (!ingestion) {
    // Ne devrait jamais arriver (jobId = ingestionId, l'ingestion est créée
    // avant l'enqueue) — on logue et on abandonne sans lever d'exception :
    // relancer ce job ne créera pas l'ingestion manquante.
    baseLog.error({ step: "load", result: "not_found" }, "Ingestion introuvable — job abandonné.");
    return;
  }

  const log = logger.child({ ingestionId, jobId, sourceId: ingestion.dataSourceId });

  if (TERMINAL_STATUSES.has(ingestion.status)) {
    // "job exécuté deux fois" / "ingestion déjà terminée" : livraison en
    // double du même job (ou nouvelle tentative demandée par erreur) — une
    // ingestion terminée n'est jamais retraitée.
    log.info(
      { step: "claim", result: "skipped_terminal", status: ingestion.status },
      "Déjà terminée — ignoré.",
    );
    return;
  }

  if (ingestion.status === "PENDING") {
    const claimed = await ingestionRepository.claimIngestionForProcessing(ingestionId);
    if (!claimed) {
      // Fenêtre de course très étroite entre la lecture ci-dessus et la
      // tentative de verrouillage : quelqu'un d'autre a gagné entre-temps.
      log.info(
        { step: "claim", result: "lost_race" },
        "Un autre run a déjà pris cette ingestion — ignoré.",
      );
      return;
    }
    log.info({ step: "claim", result: "acquired" }, "Traitement démarré.");
  } else {
    // status === "PROCESSING" : soit c'est cette tentative qui vient de la
    // définir (impossible ici puisqu'on serait passés par la branche
    // ci-dessus), soit c'est une relance (retry BullMQ) d'une tentative
    // précédente qui a échoué en cours de route — dans ce cas on continue le
    // traitement là où on en était plutôt que de l'ignorer.
    log.info({ step: "claim", result: "resumed" }, "Reprise d'une tentative précédente (retry).");
  }

  // Idempotence des erreurs : avant toute nouvelle tentative d'écriture, on
  // repart d'une table d'erreurs vide pour cette ingestion — sinon un retry
  // dupliquerait les lignes déjà insérées par la tentative précédente.
  await ingestionRepository.deleteIngestionErrors(ingestionId);

  const schemaVersion = await schemaVersionRepository.findSchemaVersionById(
    ingestion.schemaVersionId,
  );
  if (!schemaVersion) {
    // Ne devrait jamais arriver (Restrict empêche de supprimer une version
    // référencée par une ingestion) — erreur de cohérence, pas une panne
    // transitoire, mais on laisse quand même BullMQ retenter plutôt que de
    // catcher ici : un retry ne changera rien, il finira par épuiser ses
    // tentatives et handleJobFailure écrira FAILED avec ce message.
    throw new Error(`Version de schéma introuvable pour l'ingestion ${ingestionId}.`);
  }
  const schema = schemaVersionRepository.getTypedDefinition(schemaVersion);

  const fileBuffer = await timeStep(log, "download", () =>
    getStorageProvider().download(ingestion.originalFileKey),
  );

  const validationResult = await timeStep(log, "validate", () =>
    validateFile({
      fileFormat: detectFileFormat(ingestion.originalFilename),
      fileStream: Readable.from(fileBuffer),
      schema,
    }),
  );

  const outcome = deriveIngestionOutcome(validationResult);

  const completed = await timeStep(log, "persist_result", async () => {
    let validFileKey: string | undefined;
    if (validationResult.validRows > 0) {
      const exportBuffer = await readableToBuffer(validationResult.validRowsCsv);
      validFileKey = generateObjectKey(`sources/${ingestion.dataSourceId}/exports`, ".csv");
      await getStorageProvider().upload({
        key: validFileKey,
        body: exportBuffer,
        contentType: "text/csv",
      });
    }

    await ingestionRepository.appendIngestionErrors(
      ingestionId,
      validationResult.errors.map((error) => ({
        rowNumber: error.rowNumber,
        columnName: error.columnName,
        errorCode: error.errorCode,
        message: error.message,
        rawValue: error.rawValue,
      })),
    );

    // `replaceIngestionColumnStats` supprime puis réécrit — idempotent face à
    // un retry sans étape de nettoyage séparée (voir ADR-038).
    await ingestionRepository.replaceIngestionColumnStats(
      ingestionId,
      validationResult.columnStats,
    );

    return ingestionRepository.completeIngestion(ingestionId, {
      status: outcome.status,
      totalRows: validationResult.totalRows,
      validRows: validationResult.validRows,
      invalidRows: validationResult.invalidRows,
      ...(validFileKey !== undefined ? { validFileKey } : {}),
      ...(outcome.failureReason !== undefined ? { failureReason: outcome.failureReason } : {}),
    });
  });

  await notifyIngestionWebhook(completed, log);

  log.info({ step: "complete", result: outcome.status }, "Traitement terminé.");
}
