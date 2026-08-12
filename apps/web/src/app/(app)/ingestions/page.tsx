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
    <section className="stack">
      <h1>Ingestions</h1>
      <UploadForm sources={sourcesWithSchemaFlag} />

      <div>
        <h2>Fichiers récents</h2>
        {recentIngestions.length === 0 ? (
          <p className="empty-state">Aucun fichier uploadé pour l&apos;instant.</p>
        ) : (
          <ul className="card-list">
            {recentIngestions.map((ingestion) => (
              <li key={ingestion.id} className="card">
                <Link href={`/ingestions/${ingestion.id}`}>{ingestion.originalFilename}</Link>{" "}
                <IngestionStatusBadge status={ingestion.status} />
                <p className="empty-state">
                  {ingestion.dataSource.name} —{" "}
                  {new Date(ingestion.createdAt).toLocaleString("fr-FR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
