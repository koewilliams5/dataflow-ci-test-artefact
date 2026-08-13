import { ingestionRepository } from "@dataflow-ci/database";
import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/api/requireSession";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1h — repli si `since` absent/invalide

function parseSince(raw: string | null): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(Date.now() - DEFAULT_WINDOW_MS);
}

/**
 * Notifications in-app (voir ADR-009 : polling, pas de SSE/WebSocket dans ce
 * MVP) — retourne les ingestions passées à un statut terminal depuis `since`.
 * Pas de notion de destinataire : mono-espace de travail, tous les
 * opérateurs voient les mêmes ingestions.
 */
export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const since = parseSince(searchParams.get("since"));

  const ingestions = await ingestionRepository.listIngestionsCompletedSince(since);

  return NextResponse.json({
    items: ingestions.map((ingestion) => ({
      id: ingestion.id,
      originalFilename: ingestion.originalFilename,
      status: ingestion.status,
      dataSourceName: ingestion.dataSource.name,
      processingCompletedAt: ingestion.processingCompletedAt?.toISOString() ?? null,
    })),
  });
}
