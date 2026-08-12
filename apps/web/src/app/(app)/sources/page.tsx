import { dataSourceRepository } from "@dataflow-ci/database";
import Link from "next/link";
import { CreateSourceForm } from "./CreateSourceForm";

export default async function SourcesPage() {
  const sources = await dataSourceRepository.listDataSources();

  return (
    <section className="stack">
      <h1>Sources</h1>
      <CreateSourceForm />
      <h2>Toutes les sources</h2>
      {sources.length === 0 ? (
        <p className="empty-state">
          Aucune source pour l&apos;instant — crée la première ci-dessus.
        </p>
      ) : (
        <ul className="card-list">
          {sources.map((source) => (
            <li key={source.id} className="card">
              <Link href={`/sources/${source.id}`}>{source.name}</Link>
              {source.description ? <p>{source.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
