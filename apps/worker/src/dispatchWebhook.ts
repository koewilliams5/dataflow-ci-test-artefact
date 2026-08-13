import { createHmac } from "node:crypto";
import { dataSourceRepository, type Ingestion } from "@dataflow-ci/database";
import { env } from "./env";
import type { Logger } from "./logger";

const WEBHOOK_TIMEOUT_MS = 5000;

export interface WebhookPayload {
  ingestionId: string;
  status: string;
  dataSourceName: string;
  originalFilename: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  processingCompletedAt: string | null;
}

export interface DispatchWebhookInput {
  webhookUrl: string;
  payload: WebhookPayload;
  log: Logger;
}

/**
 * POST best-effort vers l'URL configurée sur la source — une seule tentative,
 * timeout court, ne lève jamais d'exception (voir DECISIONS.md ADR-040) : un
 * webhook qui échoue ne doit jamais faire échouer le traitement du fichier.
 */
export async function dispatchWebhook({ webhookUrl, payload, log }: DispatchWebhookInput): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.WEBHOOK_SIGNING_SECRET) {
    headers["X-DataFlow-Signature"] =
      `sha256=${createHmac("sha256", env.WEBHOOK_SIGNING_SECRET).update(body).digest("hex")}`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn(
        { step: "webhook", result: "http_error", status: response.status, webhookUrl },
        "Webhook livré mais rejeté par le destinataire.",
      );
      return;
    }
    log.info({ step: "webhook", result: "delivered", webhookUrl }, "Webhook livré.");
  } catch (error) {
    log.warn(
      {
        step: "webhook",
        result: "error",
        error: error instanceof Error ? error.message : String(error),
        webhookUrl,
      },
      "Échec de livraison du webhook (ignoré, best-effort).",
    );
  }
}

/**
 * Point d'entrée utilisé par le worker à chaque ingestion terminée (succès,
 * partiel, échec de validation, ou échec de traitement après épuisement des
 * tentatives) : résout la source, et n'appelle dispatchWebhook que si elle a
 * un webhookUrl configuré.
 */
export async function notifyIngestionWebhook(ingestion: Ingestion, log: Logger): Promise<void> {
  try {
    const dataSource = await dataSourceRepository.findDataSourceById(ingestion.dataSourceId);
    if (!dataSource?.webhookUrl) {
      return;
    }
    await dispatchWebhook({
      webhookUrl: dataSource.webhookUrl,
      payload: {
        ingestionId: ingestion.id,
        status: ingestion.status,
        dataSourceName: dataSource.name,
        originalFilename: ingestion.originalFilename,
        totalRows: ingestion.totalRows,
        validRows: ingestion.validRows,
        invalidRows: ingestion.invalidRows,
        processingCompletedAt: ingestion.processingCompletedAt?.toISOString() ?? null,
      },
      log,
    });
  } catch (error) {
    log.warn(
      {
        step: "webhook",
        result: "lookup_error",
        error: error instanceof Error ? error.message : String(error),
      },
      "Impossible de résoudre la source pour le webhook (ignoré).",
    );
  }
}
