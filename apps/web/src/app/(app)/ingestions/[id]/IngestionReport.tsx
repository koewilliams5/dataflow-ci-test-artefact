"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IngestionStatusBadge, type IngestionStatus } from "../IngestionStatusBadge";
import { DataQualityCopilot } from "./DataQualityCopilot";

interface IngestionErrorItem {
  rowNumber: number;
  columnName: string | null;
  errorCode: string;
  message: string;
  rawValue: string | null;
}

interface AnomalySignal {
  columnName: string;
  fileMean: number;
  historicalMean: number;
  zScore: number;
}

interface IngestionReportData {
  id: string;
  dataSourceId: string;
  originalFilename: string;
  status: IngestionStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  failureReason: string | null;
  hasExport: boolean;
  schemaVersionNumber: number | null;
  anomalies: AnomalySignal[];
  createdAt: string;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  errors: {
    items: IngestionErrorItem[];
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

const TERMINAL_STATUSES = new Set<IngestionStatus>(["SUCCESS", "PARTIAL", "FAILED"]);
// Voir ADR-009 : polling toutes les 2 secondes, pas de SSE/WebSocket dans ce MVP.
const POLL_INTERVAL_MS = 2000;

export function IngestionReport({
  ingestionId,
  initialData,
}: {
  ingestionId: string;
  initialData: IngestionReportData;
}) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(initialData.errors.page);

  const fetchReport = useCallback(
    async (targetPage: number) => {
      const response = await fetch(
        `/api/ingestions/${ingestionId}?page=${targetPage}&pageSize=${initialData.errors.pageSize}`,
      );
      if (response.ok) {
        setData((await response.json()) as IngestionReportData);
      }
    },
    [ingestionId, initialData.errors.pageSize],
  );

  useEffect(() => {
    if (TERMINAL_STATUSES.has(data.status)) {
      return;
    }
    const timer = setInterval(() => void fetchReport(page), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data.status, page, fetchReport]);

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    void fetchReport(nextPage);
  }

  const isTerminal = TERMINAL_STATUSES.has(data.status);

  return (
    <section className="stack">
      <div>
        <Link href="/ingestions">&larr; Retour aux ingestions</Link>
      </div>

      <h1>{data.originalFilename}</h1>
      <IngestionStatusBadge status={data.status} />
      {data.schemaVersionNumber !== null ? (
        <p className="empty-state">Validé contre le schéma version {data.schemaVersionNumber}.</p>
      ) : null}

      {!isTerminal ? (
        <p className="loading-state">
          Traitement en cours — cette page s&apos;actualise automatiquement toutes les 2 secondes.
        </p>
      ) : null}

      {data.status === "FAILED" && data.failureReason ? (
        <p role="alert" className="error-text">
          {data.failureReason}
        </p>
      ) : null}

      <div className="stats-row">
        <div className="stat">
          <span className="stat-label">Lignes totales</span>
          <span className="stat-value">{data.totalRows}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Lignes valides</span>
          <span className="stat-value">{data.validRows}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Lignes invalides</span>
          <span className="stat-value">{data.invalidRows}</span>
        </div>
      </div>

      {data.anomalies.length > 0 ? (
        <div className="anomaly-block">
          <h2>Écarts statistiques détectés</h2>
          <p className="empty-state">
            Ces colonnes s&apos;écartent fortement de la moyenne habituelle des ingestions
            précédentes de cette source — à vérifier, ce n&apos;est pas nécessairement une erreur.
          </p>
          <ul className="anomaly-list">
            {data.anomalies.map((anomaly) => (
              <li key={anomaly.columnName}>
                <strong>{anomaly.columnName}</strong> : moyenne de {anomaly.fileMean.toLocaleString("fr-FR")}{" "}
                contre {anomaly.historicalMean.toLocaleString("fr-FR")} habituellement (z-score{" "}
                {anomaly.zScore.toFixed(1)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.hasExport ? (
        <div>
          <a href={`/api/ingestions/${ingestionId}/export`}>
            Télécharger l&apos;export CSV (lignes valides)
          </a>
        </div>
      ) : null}

      {isTerminal && data.errors.totalCount > 0 ? (
        <DataQualityCopilot ingestionId={ingestionId} />
      ) : null}

      <div>
        <h2>Erreurs {data.errors.totalCount > 0 ? `(${data.errors.totalCount})` : ""}</h2>
        {data.errors.totalCount === 0 ? (
          <p className="empty-state">Aucune erreur.</p>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Ligne</th>
                    <th>Colonne</th>
                    <th>Code</th>
                    <th>Message</th>
                    <th>Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {data.errors.items.map((error, index) => (
                    <tr key={`${error.rowNumber}-${error.columnName ?? "row"}-${index}`}>
                      <td>{error.rowNumber === 0 ? "En-tête" : error.rowNumber}</td>
                      <td>{error.columnName ?? "—"}</td>
                      <td>{error.errorCode}</td>
                      <td>{error.message}</td>
                      <td>{error.rawValue ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.errors.totalPages > 1 ? (
              <div className="pagination">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                >
                  Précédent
                </button>
                <span>
                  Page {data.errors.page} / {data.errors.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= data.errors.totalPages}
                >
                  Suivant
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
