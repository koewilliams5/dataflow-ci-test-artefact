import { dataSourceRepository, schemaVersionRepository } from "@dataflow-ci/database";
import { notFound } from "next/navigation";
import { EditSourceForm } from "./EditSourceForm";
import { SchemaEditor } from "./SchemaEditor";
import { VersionBadge } from "./VersionBadge";

interface SourceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SourceDetailPage({ params }: SourceDetailPageProps) {
  const { id } = await params;

  const source = await dataSourceRepository.findDataSourceById(id);
  if (!source) {
    notFound();
  }

  const versions = await schemaVersionRepository.listSchemaVersions(id);
  const nextVersionNumber = (versions[0]?.versionNumber ?? 0) + 1;

  return (
    <section className="stack">
      <h1>{source.name}</h1>

      <EditSourceForm
        sourceId={source.id}
        initialName={source.name}
        initialDescription={source.description ?? ""}
      />

      <SchemaEditor sourceId={source.id} nextVersionNumber={nextVersionNumber} />

      <div>
        <h2>Historique des versions</h2>
        {versions.length === 0 ? (
          <p className="empty-state">Aucune version de schéma pour l&apos;instant.</p>
        ) : (
          <ul className="card-list">
            {versions.map((version) => (
              <li key={version.id} className="card">
                <span>Version {version.versionNumber}</span>{" "}
                <VersionBadge isActive={version.id === source.currentSchemaVersionId} />
                <pre className="code-preview">{JSON.stringify(version.definition, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
