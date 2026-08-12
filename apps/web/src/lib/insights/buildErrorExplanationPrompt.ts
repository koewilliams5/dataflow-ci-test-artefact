import type { ChatMessage } from "@dataflow-ci/ai";

export interface ErrorSummaryForPrompt {
  errorCode: string;
  columnName: string | null;
  count: number;
}

export interface ErrorExplanationContext {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errorSummaries: ErrorSummaryForPrompt[];
}

const SYSTEM_PROMPT =
  "Tu es un assistant qui aide un opérateur non technique à comprendre pourquoi un fichier de " +
  "données a été rejeté par un moteur de validation. Tu ne vois jamais les valeurs exactes des " +
  "cellules en erreur, uniquement des statistiques agrégées par type d'erreur. Réponds en " +
  "français, en 3 à 4 phrases claires et actionnables, sans jargon technique inutile.";

/**
 * Construit le prompt envoyé au LLM à partir d'une vue agrégée des erreurs
 * (voir ADR-036) : `ErrorSummaryForPrompt` n'a structurellement pas de champ
 * `rawValue`, donc aucune valeur individuelle de cellule ne peut y transiter
 * par erreur d'implémentation future.
 */
export function buildErrorExplanationPrompt(context: ErrorExplanationContext): ChatMessage[] {
  const lines = context.errorSummaries.map((summary) => {
    const column = summary.columnName !== null ? ` (colonne "${summary.columnName}")` : "";
    return `- ${summary.errorCode}${column} : ${summary.count} ligne(s) concernée(s)`;
  });

  const userContent = [
    `Fichier analysé : ${context.totalRows} ligne(s) au total, ${context.validRows} valide(s), ` +
      `${context.invalidRows} invalide(s).`,
    "Répartition des erreurs par type :",
    ...lines,
    "",
    "Explique les catégories d'erreurs les plus significatives et ce que l'opérateur devrait " +
      "vérifier dans son fichier source. N'invente aucune valeur : tu n'as accès qu'à ces comptages.",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
