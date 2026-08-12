import type { ValidateFileResult } from "@dataflow-ci/validation";

export interface IngestionOutcome {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  failureReason?: string;
}

/**
 * Calcule le statut final à partir du résultat du moteur de validation, selon
 * la définition des statuts figée dans ASSUMPTIONS.md §5 :
 * - FAILED : aucune ligne valide (fichier illisible, colonne obligatoire
 *   absente de l'en-tête, ou 0 ligne exploitable sur l'ensemble du fichier).
 * - SUCCESS : toutes les lignes sont valides.
 * - PARTIAL : un mélange des deux.
 * `validRows === 0` est vérifié en premier : il prime sur `invalidRows`, un
 * fichier vide (0/0) est donc bien FAILED, pas SUCCESS.
 */
export function deriveIngestionOutcome(result: ValidateFileResult): IngestionOutcome {
  if (result.validRows === 0) {
    const structuralError = result.errors.find((error) => error.rowNumber === 0);
    return {
      status: "FAILED",
      failureReason: structuralError?.message ?? "Aucune ligne valide dans le fichier.",
    };
  }
  if (result.invalidRows === 0) {
    return { status: "SUCCESS" };
  }
  return { status: "PARTIAL" };
}
