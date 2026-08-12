"use client";

import { useRouter } from "next/navigation";
import { type DragEvent, type FormEvent, useState } from "react";
import { uploadWithProgress } from "./uploadWithProgress";

interface UploadFormProps {
  sources: { id: string; name: string; hasActiveSchema: boolean }[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
}

function FileIcon({ extension }: { extension: string }) {
  const isXlsx = extension === "xlsx";
  return (
    <span className={`file-icon ${isXlsx ? "file-icon-xlsx" : "file-icon-csv"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
      </svg>
    </span>
  );
}

export function UploadForm({ sources }: UploadFormProps) {
  const router = useRouter();
  const sourcesWithSchema = sources.filter((source) => source.hasActiveSchema);
  const [dataSourceId, setDataSourceId] = useState(sourcesWithSchema[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      setError(null);
      setFile(droppedFile);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Garde anti double-soumission côté client (en plus de la déduplication
    // par checksum côté serveur, voir ingestionRepository.findActiveIngestionByChecksum).
    if (isSubmitting) {
      return;
    }
    if (!file) {
      setError("Choisis un fichier à uploader.");
      return;
    }
    if (!dataSourceId) {
      setError("Choisis une source.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setProgress(0);

    try {
      const ingestionId = await uploadWithProgress({ file, dataSourceId, onProgress: setProgress });
      router.push(`/ingestions/${ingestionId}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Erreur lors de l'upload.");
      setIsSubmitting(false);
      setProgress(null);
    }
  }

  if (sourcesWithSchema.length === 0) {
    return (
      <div className="card">
        <p className="empty-state">
          Aucune source n&apos;a encore de schéma actif — crée d&apos;abord une source et une version
          de schéma avant de pouvoir uploader un fichier.
        </p>
      </div>
    );
  }

  const extension = file?.name.split(".").pop()?.toLowerCase() ?? "csv";

  return (
    <div className="card card-flush">
      <div className="card-header">
        <div>
          <p className="card-title">Déposer un fichier</p>
          <p className="text-sm muted">CSV ou Excel, 10 Mo maximum. La validation démarre automatiquement.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="card-body stack-3">
        <div className="field">
          <label className="label" htmlFor="upload-source">
            Source de destination
          </label>
          <select
            className="select"
            id="upload-source"
            value={dataSourceId}
            onChange={(event) => setDataSourceId(event.target.value)}
          >
            {sourcesWithSchema.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>

        <div
          className="dropzone"
          data-dragging={isDragging || undefined}
          data-has-file={file ? true : undefined}
          data-error={error ? true : undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="file-preview">
              <FileIcon extension={extension} />
              <div className="grow">
                <p className="file-name">{file.name}</p>
                <p className="file-meta">{formatBytes(file.size)}</p>
              </div>
              {!isSubmitting ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label="Retirer le fichier"
                  onClick={() => setFile(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <span className="dropzone-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12" />
                  <path d="m7 8 5-5 5 5" />
                  <path d="M5 21h14" />
                </svg>
              </span>
              <p className="dropzone-title">Glisse ton fichier ici, ou parcours tes fichiers</p>
              <p className="dropzone-hint">.csv ou .xlsx · 10 Mo max</p>
            </>
          )}
          {!file ? (
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                setError(null);
                setFile(event.target.files?.[0] ?? null);
              }}
            />
          ) : null}
        </div>

        {progress !== null ? (
          <div className="progress-row">
            <div className="progress grow">
              <i style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-pct">{progress}%</span>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting || !file}>
          {isSubmitting ? (
            <span className="spinner" />
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 21h14" />
            </svg>
          )}
          {isSubmitting ? "Envoi en cours..." : "Uploader"}
        </button>
      </form>
    </div>
  );
}
