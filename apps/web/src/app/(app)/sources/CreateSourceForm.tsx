"use client";

import { createDataSourceInputSchema } from "@dataflow-ci/domain";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export function CreateSourceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = createDataSourceInputSchema.safeParse({
      name,
      description: description || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Erreur lors de la création de la source.");
      return;
    }

    setName("");
    setDescription("");
    router.refresh();
  }

  return (
    <div className="card card-flush">
      <div className="card-header">
        <div>
          <p className="card-title">Nouvelle source</p>
          <p className="text-sm muted">Un schéma pourra être défini juste après la création.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="card-body form-inline">
        <div className="field">
          <label className="label" htmlFor="source-name">
            Nom
          </label>
          <input
            className="input"
            id="source-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Société Générale — Prélèvements"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="source-description">
            Description <span className="label-hint">(optionnel)</span>
          </label>
          <input
            className="input"
            id="source-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Origine, fréquence, format attendu..."
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="spinner" />
          ) : (
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
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
          Créer la source
        </button>
      </form>
      {error ? (
        <div className="card-footer">
          <p className="form-error" role="alert">
            {error}
          </p>
        </div>
      ) : null}
    </div>
  );
}
