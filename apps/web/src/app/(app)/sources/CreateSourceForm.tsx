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
    <form onSubmit={handleSubmit} className="stack">
      <h2>Nouvelle source</h2>
      <div>
        <label htmlFor="source-name">Nom</label>
        <input
          id="source-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ventes Orange CI - Hebdo"
          required
        />
      </div>
      <div>
        <label htmlFor="source-description">Description (optionnelle)</label>
        <textarea
          id="source-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
        />
      </div>
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Création..." : "Créer la source"}
      </button>
    </form>
  );
}
