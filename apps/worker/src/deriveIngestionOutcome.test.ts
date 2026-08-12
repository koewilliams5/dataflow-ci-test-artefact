import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { ValidateFileResult } from "@dataflow-ci/validation";
import { deriveIngestionOutcome } from "./deriveIngestionOutcome";

function result(overrides: Partial<ValidateFileResult>): ValidateFileResult {
  return {
    totalRows: overrides.totalRows ?? 0,
    validRows: overrides.validRows ?? 0,
    invalidRows: overrides.invalidRows ?? 0,
    errors: overrides.errors ?? [],
    validRowsCsv: overrides.validRowsCsv ?? Readable.from([""]),
    columnStats: overrides.columnStats ?? [],
  };
}

describe("deriveIngestionOutcome", () => {
  it("SUCCESS quand toutes les lignes sont valides", () => {
    const outcome = deriveIngestionOutcome(result({ totalRows: 3, validRows: 3, invalidRows: 0 }));
    expect(outcome).toEqual({ status: "SUCCESS" });
  });

  it("PARTIAL quand au moins une ligne valide et une ligne invalide", () => {
    const outcome = deriveIngestionOutcome(result({ totalRows: 5, validRows: 2, invalidRows: 3 }));
    expect(outcome.status).toBe("PARTIAL");
    expect(outcome.failureReason).toBeUndefined();
  });

  it("FAILED quand aucune ligne valide (fichier avec des lignes toutes invalides)", () => {
    const outcome = deriveIngestionOutcome(result({ totalRows: 3, validRows: 0, invalidRows: 3 }));
    expect(outcome.status).toBe("FAILED");
    expect(outcome.failureReason).toBe("Aucune ligne valide dans le fichier.");
  });

  it("FAILED quand le fichier est vide (0 ligne au total)", () => {
    const outcome = deriveIngestionOutcome(result({ totalRows: 0, validRows: 0, invalidRows: 0 }));
    expect(outcome.status).toBe("FAILED");
  });

  it("FAILED avec le message de l'erreur structurelle quand il y en a une", () => {
    const outcome = deriveIngestionOutcome(
      result({
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [
          {
            rowNumber: 0,
            columnName: "montant_fcfa",
            errorCode: "MISSING_REQUIRED_COLUMN",
            message: 'La colonne obligatoire "montant_fcfa" est absente de l\'en-tête.',
            rawValue: null,
          },
        ],
      }),
    );
    expect(outcome.status).toBe("FAILED");
    expect(outcome.failureReason).toBe(
      'La colonne obligatoire "montant_fcfa" est absente de l\'en-tête.',
    );
  });
});
