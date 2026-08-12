"use client";

import { schemaDefinitionSchema } from "@dataflow-ci/domain";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";

const EXAMPLE_DEFINITION = {
  columns: [
    { name: "date", type: "date", required: true, dateFormat: "YYYY-MM-DD" },
    {
      name: "region",
      type: "string",
      required: true,
      allowedValues: ["Abidjan", "Bouaké", "Daloa"],
    },
    { name: "montant_fcfa", type: "integer", required: true, positive: true },
    { name: "client_id", type: "string", required: true, pattern: "^CLI-\\d{6}$" },
  ],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
  duplicateKeyColumns: ["client_id", "date"],
};

interface SchemaEditorProps {
  sourceId: string;
  nextVersionNumber: number;
}

const INFERENCE_UNAVAILABLE_MESSAGES: Record<string, string> = {
  not_configured: "L'assistant IA n'est pas configuré sur cet environnement.",
  malformed_file: "Ce fichier n'a pas pu être lu comme échantillon (CSV/Excel valide attendu).",
  request_failed: "Le service IA est momentanément indisponible. Réessayez plus tard.",
  invalid_response: "Le schéma proposé par l'IA n'était pas exploitable. Réessayez, ou éditez manuellement.",
};

/**
 * Éditeur JSON plutôt qu'un formulaire structuré colonne par colonne : le
 * format (6 types, 10 contraintes, 4 réglages globaux — voir DESIGN.md) est
 * suffisamment riche pour qu'un éditeur structuré complet soit un chantier à
 * part entière. La validation Zod est la même ici, côté client, que côté
 * serveur (schemaDefinitionSchema de @dataflow-ci/domain) — pas de règles
 * dupliquées, juste une UI plus simple pour le MVP (voir DECISIONS.md).
 * L'assistant IA (voir ADR-039) ne fait que pré-remplir ce même textarea —
 * la soumission reste un geste explicite de l'opérateur.
 */
export function SchemaEditor({ sourceId, nextVersionNumber }: SchemaEditorProps) {
  const router = useRouter();
  const [text, setText] = useState(() => JSON.stringify(EXAMPLE_DEFINITION, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInferring, setIsInferring] = useState(false);
  const [inferenceNotice, setInferenceNotice] = useState<string | null>(null);

  async function handleInferFromSample(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permet de réuploader le même fichier deux fois de suite
    if (!file) return;

    setIsInferring(true);
    setInferenceNotice(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/schema-inference", { method: "POST", body: formData });
      const body = (await response.json()) as
        | { available: true; definition: unknown }
        | { available: false; reason: string }
        | { error: { message: string } };

      if ("available" in body && body.available) {
        setText(JSON.stringify(body.definition, null, 2));
        setInferenceNotice(
          "Schéma proposé par l'IA — relisez-le et ajustez-le avant de créer cette version.",
        );
      } else if ("available" in body) {
        setInferenceNotice(
          INFERENCE_UNAVAILABLE_MESSAGES[body.reason] ??
            "Fonctionnalité IA indisponible pour le moment.",
        );
      } else {
        setError(body.error.message);
      }
    } catch {
      setInferenceNotice("Le service IA est momentanément indisponible. Réessayez plus tard.");
    } finally {
      setIsInferring(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let definition: unknown;
    try {
      definition = JSON.parse(text);
    } catch {
      setError("JSON invalide — vérifie la syntaxe.");
      return;
    }

    const parsed = schemaDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Schéma invalide.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/sources/${sourceId}/schema-versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definition: parsed.data }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Erreur lors de la création de la version.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="card card-flush">
      <div className="card-header">
        <p className="card-title">Nouvelle version de schéma</p>
      </div>
      <form onSubmit={handleSubmit} className="card-body stack-3">
        <div className="ai-panel">
          <p className="ai-panel-header">
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
              <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Assistant IA (optionnel)
          </p>
          <p className="text-sm muted">
            Propose un premier jet de schéma à partir d&apos;un fichier échantillon — à relire et
            ajuster avant de créer la version.
          </p>
          <div className="row-2" style={{ marginTop: "var(--space-3)" }}>
            <label htmlFor="schema-inference-file" className="btn btn-secondary btn-sm">
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
                <path d="M12 3v12" />
                <path d="m7 8 5-5 5 5" />
                <path d="M5 21h14" />
              </svg>
              Choisir un fichier échantillon
            </label>
            <input
              id="schema-inference-file"
              type="file"
              accept=".csv,.xlsx"
              disabled={isInferring}
              onChange={(event) => void handleInferFromSample(event)}
              className="sr-only"
            />
            {isInferring ? (
              <span className="row-2 text-sm muted">
                <span className="spinner" />
                Analyse de l&apos;échantillon…
              </span>
            ) : null}
          </div>
          {inferenceNotice ? (
            <p className="text-sm muted" style={{ marginTop: "var(--space-2)" }}>
              {inferenceNotice}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="label" htmlFor="schema-definition">
            Définition JSON
            <span className="label-hint">
              — sera la version v{nextVersionNumber}, active dès la création
            </span>
          </label>
          <textarea
            id="schema-definition"
            className="textarea textarea-code"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={16}
            spellCheck={false}
          />
        </div>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Création..." : "Créer cette version"}
        </button>
      </form>
    </div>
  );
}
