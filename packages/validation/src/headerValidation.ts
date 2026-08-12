import type { ColumnDefinition, SchemaDefinition } from "@dataflow-ci/domain";
import type { DetailedError } from "./types";

export interface HeaderValidationResult {
  errors: DetailedError[];
  /** Pour chaque position du header original, la colonne de schéma correspondante (ou null si extra/inconnue). */
  columnByPosition: (ColumnDefinition | null)[];
}

function normalizeHeader(value: string, caseSensitive: boolean): string {
  const trimmed = value.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

/**
 * Étapes 1 à 5 du moteur : normalise les en-têtes, détecte les doublons,
 * vérifie les colonnes obligatoires et les colonnes en trop. Toute erreur
 * retournée ici est une erreur de structure (rowNumber: 0) — le fichier n'est
 * pas exploitable ligne par ligne tant qu'elle n'est pas corrigée.
 */
export function validateHeader(header: string[], schema: SchemaDefinition): HeaderValidationResult {
  const errors: DetailedError[] = [];
  const caseSensitive = schema.caseSensitiveHeaders;

  const normalizedPositions = new Map<string, number>();
  header.forEach((rawHeader, index) => {
    const normalized = normalizeHeader(rawHeader, caseSensitive);
    if (normalizedPositions.has(normalized)) {
      errors.push({
        rowNumber: 0,
        columnName: rawHeader,
        errorCode: "DUPLICATE_HEADER",
        message: `En-tête en double : "${rawHeader}".`,
        rawValue: rawHeader,
      });
      return;
    }
    normalizedPositions.set(normalized, index);
  });

  const schemaByNormalizedName = new Map(
    schema.columns.map((column) => [normalizeHeader(column.name, caseSensitive), column]),
  );

  for (const column of schema.columns) {
    const normalized = normalizeHeader(column.name, caseSensitive);
    if (!normalizedPositions.has(normalized) && column.required) {
      errors.push({
        rowNumber: 0,
        columnName: column.name,
        errorCode: "MISSING_REQUIRED_COLUMN",
        message: `La colonne obligatoire "${column.name}" est absente de l'en-tête.`,
        rawValue: null,
      });
    }
  }

  if (!schema.allowExtraColumns) {
    for (const rawHeader of header) {
      const normalized = normalizeHeader(rawHeader, caseSensitive);
      if (!schemaByNormalizedName.has(normalized)) {
        errors.push({
          rowNumber: 0,
          columnName: rawHeader,
          errorCode: "EXTRA_COLUMN",
          message: `Colonne inattendue : "${rawHeader}" n'est pas déclarée dans le schéma.`,
          rawValue: rawHeader,
        });
      }
    }
  }

  const columnByPosition = header.map((rawHeader) => {
    const normalized = normalizeHeader(rawHeader, caseSensitive);
    return schemaByNormalizedName.get(normalized) ?? null;
  });

  return { errors, columnByPosition };
}
