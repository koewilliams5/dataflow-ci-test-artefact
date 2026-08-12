"use client";

import { updateDataSourceInputSchema } from "@dataflow-ci/domain";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

interface EditSourceFormProps {
  sourceId: string;
  initialName: string;
  initialDescription: string;
}

export function EditSourceForm({ sourceId, initialName, initialDescription }: EditSourceFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = updateDataSourceInputSchema.safeParse({
      name,
      description: description || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
      setSuccess(false);
      return;
    }

    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    const response = await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Erreur lors de la mise à jour.");
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  return (
    <div className="card card-flush">
      <div className="card-header">
        <p className="card-title">Modifier la source</p>
      </div>
      <form onSubmit={handleSubmit} className="card-body stack-3">
        <div className="field">
          <label className="label" htmlFor="edit-name">
            Nom
          </label>
          <input
            className="input"
            id="edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="edit-description">
            Description
          </label>
          <textarea
            className="textarea"
            id="edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? <p className="form-success">Enregistré.</p> : null}
        <button type="submit" className="btn btn-secondary" disabled={isSubmitting}>
          {isSubmitting ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
