import { dataSourceRepository, schemaVersionRepository } from "@dataflow-ci/database";
import Link from "next/link";
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
    <div className="page">
      <Link href="/sources" className="back-link">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Sources
      </Link>

      <div className="page-header">
        <h1 className="page-title">{source.name}</h1>
        {source.description ? <p className="page-subtitle">{source.description}</p> : null}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr" }}>
        <div className="stack-6">
          <EditSourceForm
            sourceId={source.id}
            initialName={source.name}
            initialDescription={source.description ?? ""}
            initialWebhookUrl={source.webhookUrl ?? ""}
          />
          <SchemaEditor sourceId={source.id} nextVersionNumber={nextVersionNumber} />
        </div>

        <div className="card card-flush">
          <div className="card-header">
            <p className="card-title">Historique des versions</p>
          </div>
          <div className="card-body stack-3">
            {versions.length === 0 ? (
              <p className="empty-state">Aucune version de schéma pour l&apos;instant.</p>
            ) : (
              versions.map((version) => {
                const isActive = version.id === source.currentSchemaVersionId;
                return (
                  <div key={version.id} className="code-block">
                    <div className="code-block-header">
                      <span className="row-2">
                        <span className="text-sm" style={{ fontWeight: "var(--weight-semi)" }}>
                          Version {version.versionNumber}
                        </span>
                        <VersionBadge isActive={isActive} />
                      </span>
                    </div>
                    <pre>{JSON.stringify(version.definition, null, 2)}</pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
