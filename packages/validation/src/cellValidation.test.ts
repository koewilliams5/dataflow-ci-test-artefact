import type { ColumnDefinition } from "@dataflow-ci/domain";
import { describe, expect, it } from "vitest";
import { validateCell } from "./cellValidation";

function col(
  overrides: Partial<ColumnDefinition> & { type: ColumnDefinition["type"]; name: string },
): ColumnDefinition {
  return { required: false, unique: false, ...overrides } as ColumnDefinition;
}

describe("validateCell — champs obligatoires", () => {
  it("REQUIRED_VALUE si une colonne obligatoire est vide", () => {
    const result = validateCell(
      col({ name: "region", type: "string", required: true }),
      "",
      1,
      true,
    );
    expect(result.error?.errorCode).toBe("REQUIRED_VALUE");
  });

  it("pas d'erreur si une colonne optionnelle est vide", () => {
    const result = validateCell(col({ name: "note", type: "string" }), "", 1, true);
    expect(result.error).toBeNull();
    expect(result.value).toBeNull();
  });
});

describe("validateCell — string", () => {
  const column = col({ name: "region", type: "string", allowedValues: ["Abidjan", "Daloa"] });

  it("accepte une valeur autorisée", () => {
    expect(validateCell(column, "Abidjan", 1, true)).toEqual({ value: "Abidjan", error: null });
  });

  it("VALUE_NOT_ALLOWED pour une valeur hors liste", () => {
    const result = validateCell(column, "Paris", 1, true);
    expect(result.error?.errorCode).toBe("VALUE_NOT_ALLOWED");
  });

  it("REGEX_MISMATCH si le pattern ne correspond pas", () => {
    const patternColumn = col({ name: "client_id", type: "string", pattern: "^CLI-\\d{6}$" });
    expect(validateCell(patternColumn, "CLI-42", 1, true).error?.errorCode).toBe("REGEX_MISMATCH");
    expect(validateCell(patternColumn, "CLI-100045", 1, true).error).toBeNull();
  });

  it("MIN_LENGTH / MAX_LENGTH", () => {
    const lengthColumn = col({ name: "code", type: "string", minLength: 3, maxLength: 5 });
    expect(validateCell(lengthColumn, "ab", 1, true).error?.errorCode).toBe("MIN_LENGTH");
    expect(validateCell(lengthColumn, "abcdef", 1, true).error?.errorCode).toBe("MAX_LENGTH");
    expect(validateCell(lengthColumn, "abcd", 1, true).error).toBeNull();
  });

  it("trimStrings retire les espaces avant validation", () => {
    const result = validateCell(col({ name: "region", type: "string" }), "  Abidjan  ", 1, true);
    expect(result.value).toBe("Abidjan");
  });
});

describe("validateCell — integer", () => {
  const column = col({ name: "montant_fcfa", type: "integer", positive: true });

  it("accepte un entier valide", () => {
    expect(validateCell(column, "1000", 1, true)).toEqual({ value: 1000, error: null });
  });

  it("INVALID_INTEGER pour une valeur non entière", () => {
    expect(validateCell(column, "abc", 1, true).error?.errorCode).toBe("INVALID_INTEGER");
    expect(validateCell(column, "12.5", 1, true).error?.errorCode).toBe("INVALID_INTEGER");
  });

  it("NOT_POSITIVE pour zéro ou négatif", () => {
    expect(validateCell(column, "0", 1, true).error?.errorCode).toBe("NOT_POSITIVE");
    expect(validateCell(column, "-5", 1, true).error?.errorCode).toBe("NOT_POSITIVE");
  });

  it("MIN_VALUE / MAX_VALUE", () => {
    const rangeColumn = col({ name: "age", type: "integer", min: 18, max: 65 });
    expect(validateCell(rangeColumn, "10", 1, true).error?.errorCode).toBe("MIN_VALUE");
    expect(validateCell(rangeColumn, "70", 1, true).error?.errorCode).toBe("MAX_VALUE");
  });
});

describe("validateCell — number", () => {
  const column = col({ name: "taux", type: "number" });

  it("accepte un nombre décimal", () => {
    expect(validateCell(column, "12.5", 1, true)).toEqual({ value: 12.5, error: null });
  });

  it("INVALID_NUMBER pour une valeur non numérique", () => {
    expect(validateCell(column, "douze", 1, true).error?.errorCode).toBe("INVALID_NUMBER");
  });
});

describe("validateCell — boolean", () => {
  const column = col({ name: "actif", type: "boolean" });

  it.each(["true", "1", "oui", "vrai", "TRUE"])("accepte %s comme vrai", (value) => {
    expect(validateCell(column, value, 1, true)).toEqual({ value: true, error: null });
  });

  it.each(["false", "0", "non", "faux"])("accepte %s comme faux", (value) => {
    expect(validateCell(column, value, 1, true)).toEqual({ value: false, error: null });
  });

  it("INVALID_BOOLEAN pour une valeur non reconnue", () => {
    expect(validateCell(column, "peut-être", 1, true).error?.errorCode).toBe("INVALID_BOOLEAN");
  });
});

describe("validateCell — date", () => {
  const column = col({ name: "date", type: "date", dateFormat: "YYYY-MM-DD" });

  it("accepte une date valide", () => {
    const result = validateCell(column, "2026-01-01", 1, true);
    expect(result.error).toBeNull();
    expect(result.value).toBeInstanceOf(Date);
  });

  it("INVALID_DATE pour une valeur qui ne correspond pas au format", () => {
    expect(validateCell(column, "01/01/2026", 1, true).error?.errorCode).toBe("INVALID_DATE");
  });

  it("MIN_VALUE / MAX_VALUE sur une plage de dates", () => {
    const rangeColumn = col({
      name: "date",
      type: "date",
      dateFormat: "YYYY-MM-DD",
      min: "2026-01-01",
      max: "2026-12-31",
    });
    expect(validateCell(rangeColumn, "2025-12-31", 1, true).error?.errorCode).toBe("MIN_VALUE");
    expect(validateCell(rangeColumn, "2027-01-01", 1, true).error?.errorCode).toBe("MAX_VALUE");
  });
});

describe("validateCell — datetime", () => {
  it("INVALID_DATETIME pour une valeur invalide", () => {
    const column = col({ name: "horodatage", type: "datetime", dateFormat: "YYYY-MM-DD HH:mm:ss" });
    expect(validateCell(column, "n'importe quoi", 1, true).error?.errorCode).toBe(
      "INVALID_DATETIME",
    );
  });
});

describe("validateCell — erreurs incluent rowNumber/columnName/rawValue", () => {
  it("remplit tous les champs attendus", () => {
    const column = col({ name: "montant_fcfa", type: "integer" });
    const result = validateCell(column, "abc", 7, true);
    expect(result.error).toMatchObject({
      rowNumber: 7,
      columnName: "montant_fcfa",
      errorCode: "INVALID_INTEGER",
      rawValue: "abc",
    });
    expect(typeof result.error?.message).toBe("string");
  });
});
