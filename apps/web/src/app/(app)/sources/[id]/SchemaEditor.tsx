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
    <form onSubmit={handleSubmit} className="stack">
      <h2>Nouvelle version de schéma</h2>

      <div className="anomaly-block">
        <label htmlFor="schema-inference-file">
          Assistant IA (optionnel) : propose un premier jet à partir d&apos;un fichier échantillon —
          à relire et ajuster avant de créer la version.
        </label>
        <input
          id="schema-inference-file"
          type="file"
          accept=".csv,.xlsx"
          disabled={isInferring}
          onChange={(event) => void handleInferFromSample(event)}
        />
        {isInferring ? <p className="loading-state">Analyse de l&apos;échantillon…</p> : null}
        {inferenceNotice ? <p className="empty-state">{inferenceNotice}</p> : null}
      </div>

      <label htmlFor="schema-definition">
        Sera automatiquement la version v{nextVersionNumber} et deviendra la version active de cette
        source.
      </label>
      <textarea
        id="schema-definition"
        className="code-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={16}
        spellCheck={false}
      />
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Création..." : "Créer cette version"}
      </button>
    </form>
  );
}
