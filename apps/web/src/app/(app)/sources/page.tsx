import { dataSourceRepository } from "@dataflow-ci/database";
import Link from "next/link";
import { CreateSourceForm } from "./CreateSourceForm";

export default async function SourcesPage() {
  const sources = await dataSourceRepository.listDataSources();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Sources</h1>
        <p className="page-subtitle">Les flux de données déclarés et leurs schémas de validation</p>
      </div>

      <div className="stack-6">
        <CreateSourceForm />

        {sources.length === 0 ? (
          <div className="empty-state-block">
            <span className="empty-state-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <ellipse cx="12" cy="5" rx="8" ry="3" />
                <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
              </svg>
            </span>
            <p className="empty-state-title">Aucune source pour l&apos;instant</p>
            <p className="empty-state-text">Crée la première ci-dessus pour commencer à recevoir des fichiers.</p>
          </div>
        ) : (
          <>
            <p className="eyebrow">
              {sources.length} source{sources.length > 1 ? "s" : ""}
            </p>
            <div className="grid grid-cards">
              {sources.map((source) => (
                <Link key={source.id} href={`/sources/${source.id}`} className="card card-link">
                  <div className="row-between">
                    <p className="card-title">{source.name}</p>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ flexShrink: 0, color: "var(--text-tertiary)" }}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                  <p className="text-sm muted" style={{ marginTop: "var(--space-2)" }}>
                    {source.description ? (
                      source.description
                    ) : (
                      <em>Aucune description</em>
                    )}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
