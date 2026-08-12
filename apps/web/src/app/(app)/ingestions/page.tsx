import { dataSourceRepository, ingestionRepository } from "@dataflow-ci/database";
import Link from "next/link";
import { IngestionStatusBadge } from "./IngestionStatusBadge";
import { UploadForm } from "./UploadForm";

export default async function IngestionsPage() {
  const [sources, recentIngestions] = await Promise.all([
    dataSourceRepository.listDataSources(),
    ingestionRepository.listRecentIngestions(),
  ]);
  const sourcesWithSchemaFlag = sources.map((source) => ({
    id: source.id,
    name: source.name,
    hasActiveSchema: source.currentSchemaVersionId !== null,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ingestions</h1>
        <p className="page-subtitle">Dépose un fichier et suis sa validation</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <UploadForm sources={sourcesWithSchemaFlag} />

        <div className="card card-flush">
          <div className="card-header">
            <p className="card-title">Fichiers récents</p>
          </div>
          <div className="card-body stack-2">
            {recentIngestions.length === 0 ? (
              <p className="empty-state">Aucun fichier uploadé pour l&apos;instant.</p>
            ) : (
              recentIngestions.map((ingestion) => {
                const extension = ingestion.originalFilename.split(".").pop()?.toLowerCase();
                return (
                  <Link
                    key={ingestion.id}
                    href={`/ingestions/${ingestion.id}`}
                    className="card card-link"
                    style={{ padding: "var(--space-3) var(--space-4)" }}
                  >
                    <div className="row">
                      <span className={`file-icon ${extension === "xlsx" ? "file-icon-xlsx" : "file-icon-csv"}`}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      </span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="file-name truncate">{ingestion.originalFilename}</p>
                        <p className="text-xs muted truncate">
                          {ingestion.dataSource.name} ·{" "}
                          {new Date(ingestion.createdAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <IngestionStatusBadge status={ingestion.status} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
