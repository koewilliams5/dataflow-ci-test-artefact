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
      <p className="empty-state">
        Aucune source n&apos;a encore de schéma actif — crée d&apos;abord une source et une version
        de schéma avant de pouvoir uploader un fichier.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <h2>Uploader un fichier</h2>

      <div>
        <label htmlFor="upload-source">Source</label>
        <select
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
        className={`dropzone ${isDragging ? "dropzone-active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <p>
            {file.name} ({formatBytes(file.size)})
          </p>
        ) : (
          <p>Glisse un fichier .csv ou .xlsx ici, ou clique pour en choisir un (max 10 Mo).</p>
        )}
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => {
            setError(null);
            setFile(event.target.files?.[0] ?? null);
          }}
        />
      </div>

      {progress !== null ? (
        <div>
          <progress value={progress} max={100} />
          <span> {progress}%</span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Envoi en cours..." : "Uploader"}
      </button>
    </form>
  );
}
