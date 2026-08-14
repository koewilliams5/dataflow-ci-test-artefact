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
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 30, 50] as const;

export function IngestionReport({
  ingestionId,
  initialData,
}: {
  ingestionId: string;
  initialData: IngestionReportData;
}) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState(initialData.errors.page);
  const [pageSize, setPageSize] = useState(initialData.errors.pageSize);

  const fetchReport = useCallback(
    async (targetPage: number, targetPageSize: number) => {
      const response = await fetch(
        `/api/ingestions/${ingestionId}?page=${targetPage}&pageSize=${targetPageSize}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        setData((await response.json()) as IngestionReportData);
      }
    },
    [ingestionId],
  );

  useEffect(() => {
    if (TERMINAL_STATUSES.has(data.status)) {
      return;
    }
    const timer = setInterval(() => void fetchReport(page, pageSize), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data.status, page, pageSize, fetchReport]);

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    void fetchReport(nextPage, pageSize);
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
    void fetchReport(1, nextPageSize);
  }

  const isTerminal = TERMINAL_STATUSES.has(data.status);

  return (
    <div className="page">
      <Link href="/ingestions" className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Ingestions
      </Link>

      <div className="page-header row-between row-wrap">
        <div>
          <div className="row-2" style={{ marginBottom: "var(--space-2)" }}>
            <IngestionStatusBadge status={data.status} />
          </div>
          <h1 className="page-title mono">{data.originalFilename}</h1>
          <p className="page-subtitle">
            {data.schemaVersionNumber !== null ? `Schéma v${data.schemaVersionNumber} · ` : ""}
            reçu le{" "}
            {new Date(data.createdAt).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })}
          </p>
        </div>
        {data.hasExport ? (
          <a href={`/api/ingestions/${ingestionId}/export`} className="btn btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 12 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Télécharger l&apos;export CSV
          </a>
        ) : null}
      </div>

      <div className="stack-6">
        {!isTerminal ? (
          <div className="processing-banner">
            <span className="spinner" />
            <span>
              Traitement en cours — cette page s&apos;actualise automatiquement toutes les 2 secondes.
            </span>
          </div>
        ) : null}

        {data.status === "FAILED" && data.failureReason ? (
          <p role="alert" className="form-error">
            {data.failureReason}
          </p>
        ) : null}

        <div className="grid grid-stats-3">
          <div className="stat-tile">
            <span className="stat-tile-label">Lignes totales</span>
            <span className="stat-tile-value">{data.totalRows.toLocaleString("fr-FR")}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-label">Lignes valides</span>
            <span className="stat-tile-value stat-valid">{data.validRows.toLocaleString("fr-FR")}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-label">Lignes invalides</span>
            <span className="stat-tile-value stat-invalid">{data.invalidRows.toLocaleString("fr-FR")}</span>
          </div>
        </div>

        {data.anomalies.length > 0 ? (
          <div className="anomaly-block">
            <h2>Écarts statistiques détectés</h2>
            <p className="text-sm" style={{ color: "var(--status-partial-fg)", opacity: 0.85 }}>
              Ces colonnes s&apos;écartent fortement de la moyenne habituelle des ingestions
              précédentes de cette source — à vérifier, ce n&apos;est pas nécessairement une erreur.
            </p>
            <ul className="anomaly-list">
              {data.anomalies.map((anomaly) => (
                <li key={anomaly.columnName} className="text-sm">
                  <strong>{anomaly.columnName}</strong> : moyenne de{" "}
                  {anomaly.fileMean.toLocaleString("fr-FR")} contre{" "}
                  {anomaly.historicalMean.toLocaleString("fr-FR")} habituellement (z-score{" "}
                  {anomaly.zScore.toFixed(1)})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isTerminal && data.errors.totalCount > 0 ? (
          <DataQualityCopilot ingestionId={ingestionId} />
        ) : null}

        <div className="card card-flush">
          <div className="card-header">
            <p className="card-title">
              Erreurs de validation {data.errors.totalCount > 0 ? `(${data.errors.totalCount})` : ""}
            </p>
          </div>
          {data.errors.totalCount === 0 ? (
            <div className="card-body">
              <p className="empty-state">Aucune erreur.</p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="col-row">Ligne</th>
                      <th className="col-column">Colonne</th>
                      <th className="col-code">Code</th>
                      <th className="col-message">Message</th>
                      <th className="col-value">Valeur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errors.items.map((error, index) => (
                      <tr key={`${error.rowNumber}-${error.columnName ?? "row"}-${index}`}>
                        <td>
                          {error.rowNumber === 0 ? (
                            <span className="row-structural">Structure</span>
                          ) : (
                            <span className="row-number">{error.rowNumber}</span>
                          )}
                        </td>
                        <td>{error.columnName ?? <span className="cell-null">—</span>}</td>
                        <td>
                          <span className="error-code">{error.errorCode}</span>
                        </td>
                        <td className="cell-clamp">{error.message}</td>
                        <td>
                          {error.rawValue !== null ? (
                            <span className="cell-value" title={error.rawValue}>
                              {error.rawValue}
                            </span>
                          ) : (
                            <span className="cell-null">vide</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span className="pagination-info row-2">
                  {data.errors.totalPages > 1 ? (
                    <span>
                      Page {data.errors.page} / {data.errors.totalPages}
                    </span>
                  ) : null}
                  <label className="row-2" htmlFor="errors-page-size">
                    <span>Lignes par page</span>
                    <select
                      id="errors-page-size"
                      className="select"
                      style={{ minHeight: 28, height: 28, paddingBlock: 0 }}
                      value={pageSize}
                      onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </span>
                {data.errors.totalPages > 1 ? (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page <= 1}
                    >
                      Précédent
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page >= data.errors.totalPages}
                    >
                      Suivant
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
